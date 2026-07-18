import type { CapturedBatch } from "./types.js";

/** Sum of tool-result text lengths for a batch (same basis as oversized check). */
export function batchRawCharCount(batch: CapturedBatch): number {
  return batch.toolCalls.reduce((sum, tc) => sum + tc.resultText.length, 0);
}

/**
 * True when the batch should not call the summarizer.
 * `minRawChars === 0` disables the gate.
 */
export function shouldPreSkipBatch(batch: CapturedBatch, minRawChars: number): boolean {
  if (minRawChars <= 0) return false;
  return batchRawCharCount(batch) < minRawChars;
}
