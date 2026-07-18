import type { CapturedBatch, ProgressCallback, BatchTextProgressCallback, SummarizeResult } from "./types.js";
import { batchRawCharCount, shouldPreSkipBatch } from "./pre-skip.js";
import { formatFlushStatusProgress } from "./progress-text.js";
import { mapPool } from "./async-pool.js";

export type SummarizeOneFn = (
  batch: CapturedBatch,
  index: number,
  onTextProgress: (receivedChars: number) => void,
) => Promise<SummarizeResult | null>;

export interface FlushSummarizePhaseInput {
  batches: CapturedBatch[];
  minRawCharsToSummarize: number;
  /** Only used when `pooled` is true (`/pruner now`). */
  flushConcurrency: number;
  /**
   * true  → worker pool capped by flushConcurrency (manual /pruner now)
   * false → all eligible batches in flight (auto flush)
   */
  pooled: boolean;
  signal?: AbortSignal;
  summarizeOne: SummarizeOneFn;
  onStatus: (text: string) => void;
  onProgress?: ProgressCallback;
  onBatchTextProgress?: BatchTextProgressCallback;
}

export interface FlushSummarizePhaseResult {
  results: (SummarizeResult | null)[];
  preSkipFlags: boolean[];
  /** Status strings pushed in order (for tests). */
  statusHistory: string[];
}

/**
 * Pre-skip classification + summarizer calls + live A/B · C/D(chars) status.
 * Persistence / frontier are intentionally outside this seam.
 */
export async function runFlushSummarizePhase(
  input: FlushSummarizePhaseInput,
): Promise<FlushSummarizePhaseResult> {
  const {
    batches,
    minRawCharsToSummarize,
    flushConcurrency,
    pooled,
    signal,
    summarizeOne,
    onStatus,
    onProgress,
    onBatchTextProgress,
  } = input;

  const preSkipFlags = batches.map((b) => shouldPreSkipBatch(b, minRawCharsToSummarize));
  const preSkipCountAtStart = preSkipFlags.filter(Boolean).length;
  const eligibleRawTotal = batches.reduce(
    (sum, b, i) => (preSkipFlags[i] ? sum : sum + batchRawCharCount(b)),
    0,
  );
  const receivedByBatch = batches.map(() => 0);
  let llmFinishedCount = 0;
  const statusHistory: string[] = [];
  // Gates UI callbacks after a hard failure so sibling workers don't paint a closed overlay.
  let live = true;

  const pushFlushStatus = () => {
    const summaryChars = receivedByBatch.reduce((a, b) => a + b, 0);
    const text = formatFlushStatusProgress(
      preSkipCountAtStart + llmFinishedCount,
      batches.length,
      summaryChars,
      eligibleRawTotal,
    );
    statusHistory.push(text);
    if (live) onStatus(text);
  };

  pushFlushStatus();

  const reportBatchTextProgress = (index: number, total: number, batch: CapturedBatch, receivedChars: number) => {
    if (!live) return;
    receivedByBatch[index] = receivedChars;
    pushFlushStatus();
    onBatchTextProgress?.(index, total, batch, receivedChars);
  };

  const results: (SummarizeResult | null)[] = batches.map(() => null);

  const runOne = async (i: number): Promise<SummarizeResult | null> => {
    if (!live || signal?.aborted) return null;
    onProgress?.(i, batches.length, batches[i], "start");
    let r: SummarizeResult | null = null;
    try {
      r = await summarizeOne(batches[i], i, (receivedChars) => {
        reportBatchTextProgress(i, batches.length, batches[i], receivedChars);
      });
    } catch (err) {
      live = false;
      throw err;
    }
    if (!live) return r;
    if (r) receivedByBatch[i] = Math.max(receivedByBatch[i], r.summaryText.length);
    llmFinishedCount++;
    pushFlushStatus();
    onProgress?.(i, batches.length, batches[i], r ? "done" : "skipped");
    return r;
  };

  try {
    if (pooled) {
      for (let i = 0; i < batches.length; i++) {
        if (preSkipFlags[i]) onProgress?.(i, batches.length, batches[i], "skipped");
      }
      const workIndices = batches.map((_, i) => i).filter((i) => !preSkipFlags[i]);
      const workResults = await mapPool(
        workIndices.length,
        flushConcurrency,
        async (workPos) => runOne(workIndices[workPos]),
        { signal },
      );
      for (let w = 0; w < workIndices.length; w++) {
        results[workIndices[w]] = workResults[w] ?? null;
      }
    } else {
      const summarizeIndices: number[] = [];
      for (let i = 0; i < batches.length; i++) {
        if (!preSkipFlags[i]) summarizeIndices.push(i);
      }
      if (summarizeIndices.length > 0) {
        // Unbounded parallel for auto paths: concurrency = work count.
        const workResults = await mapPool(
          summarizeIndices.length,
          summarizeIndices.length,
          async (workPos) => runOne(summarizeIndices[workPos]),
          { signal },
        );
        for (let w = 0; w < summarizeIndices.length; w++) {
          results[summarizeIndices[w]] = workResults[w] ?? null;
        }
      }
    }
  } catch (err) {
    live = false;
    throw err;
  }

  return { results, preSkipFlags, statusHistory };
}
