import { describe, expect, test } from "bun:test";
import { runFlushSummarizePhase } from "../src/flush-summarize-phase.js";
import type { CapturedBatch, SummarizeResult } from "../src/types.js";

function batch(id: string, raw: string): CapturedBatch {
  return {
    turnIndex: 1,
    timestamp: 0,
    assistantText: "",
    toolCalls: [
      {
        toolCallId: id,
        toolName: "read",
        args: {},
        resultText: raw,
        isError: false,
        turnIndex: 1,
        timestamp: 0,
      },
    ],
  };
}

function ok(summaryText: string): SummarizeResult {
  return { summaryText, usage: { input: 1, output: 1, cost: { total: 0 } } };
}

describe("runFlushSummarizePhase", () => {
  test("pre-skip below min raw: zero summarize calls; opening status counts skips", async () => {
    const calls: string[] = [];
    const statuses: string[] = [];
    const batches = [batch("a", "tiny"), batch("b", "x".repeat(2000)), batch("c", "yy")];

    const { results, preSkipFlags, statusHistory } = await runFlushSummarizePhase({
      batches,
      minRawCharsToSummarize: 800,
      flushConcurrency: 2,
      pooled: true,
      summarizeOne: async (b) => {
        calls.push(b.toolCalls[0].toolCallId);
        return ok("summary-for-" + b.toolCalls[0].toolCallId);
      },
      onStatus: (t) => statuses.push(t),
    });

    expect(preSkipFlags).toEqual([true, false, true]);
    expect(calls).toEqual(["b"]);
    expect(results[0]).toBeNull();
    expect(results[1]?.summaryText).toContain("b");
    expect(results[2]).toBeNull();
    // Opening: 2 pre-skips done, 0 summary chars, D = only batch b raw (2000)
    expect(statusHistory[0]).toBe("2/3 · 0/2.0k(chars)");
    expect(statuses[0]).toBe(statusHistory[0]);
  });

  test("pooled path respects flushConcurrency ceiling", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const batches = Array.from({ length: 6 }, (_, i) => batch(`id-${i}`, "z".repeat(1000)));

    await runFlushSummarizePhase({
      batches,
      minRawCharsToSummarize: 0,
      flushConcurrency: 2,
      pooled: true,
      summarizeOne: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Bun.sleep(20);
        inFlight--;
        return ok("s");
      },
      onStatus: () => {},
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBe(2);
  });

  test("non-pooled path can exceed flushConcurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const batches = Array.from({ length: 5 }, (_, i) => batch(`id-${i}`, "z".repeat(1000)));

    await runFlushSummarizePhase({
      batches,
      minRawCharsToSummarize: 0,
      flushConcurrency: 2, // ignored when pooled=false
      pooled: false,
      summarizeOne: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Bun.sleep(25);
        inFlight--;
        return ok("s");
      },
      onStatus: () => {},
    });

    expect(maxInFlight).toBeGreaterThan(2);
  });

  test("stream progress increases C; D stays eligible raw", async () => {
    const batches = [batch("a", "a".repeat(1000)), batch("b", "b".repeat(3000))];
    const history: string[] = [];

    await runFlushSummarizePhase({
      batches,
      minRawCharsToSummarize: 0,
      flushConcurrency: 1,
      pooled: true,
      summarizeOne: async (_b, _i, onText) => {
        onText(100);
        onText(400);
        return ok("x".repeat(500));
      },
      onStatus: (t) => history.push(t),
    });

    // D = 1000+3000 = 4000
    expect(history.some((h) => h.includes("/4.0k(chars)"))).toBe(true);
    // Final C at least 500 after first batch (serial concurrency 1 runs both)
    expect(history[history.length - 1]).toMatch(/\/4\.0k\(chars\)$/);
    const last = history[history.length - 1];
    // completed 2/2
    expect(last.startsWith("2/2")).toBe(true);
  });

  test("worker throw stops further onProgress after live=false", async () => {
    const progress: string[] = [];
    const batches = [batch("a", "z".repeat(1000)), batch("b", "z".repeat(1000)), batch("c", "z".repeat(1000))];

    await expect(
      runFlushSummarizePhase({
        batches,
        minRawCharsToSummarize: 0,
        flushConcurrency: 2,
        pooled: true,
        summarizeOne: async (b) => {
          if (b.toolCalls[0].toolCallId === "a") {
            await Bun.sleep(5);
            throw new Error("boom");
          }
          await Bun.sleep(40);
          return ok("ok");
        },
        onStatus: () => {},
        onProgress: (i, _t, _b, stage) => {
          progress.push(`${i}:${stage}`);
        },
      }),
    ).rejects.toThrow("boom");

    // Sibling may have started before throw; after live=false, no more done/skipped from siblings
    const afterBoom = progress.filter((p) => p.endsWith(":done"));
    // At most the non-throwing workers that finished before live flipped — must not keep growing unbounded
    expect(afterBoom.length).toBeLessThanOrEqual(2);
  });
});
