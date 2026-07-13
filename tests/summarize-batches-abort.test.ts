import { describe, expect, test } from "bun:test";
import { settleParallelSummaries } from "../src/summarizer.ts";

describe("settleParallelSummaries", () => {
  test("waits for every in-flight task before surfacing abort", async () => {
    const controller = new AbortController();
    let stillRunning = true;
    let finishedSlow = false;

    const run = settleParallelSummaries(
      [
        async () => {
          controller.abort();
          throw new Error("fast aborted");
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          finishedSlow = true;
          stillRunning = false;
          throw new Error("slow aborted");
        },
      ],
      controller.signal,
    );

    await expect(run).rejects.toThrow("summarizeBatches: aborted");
    expect(finishedSlow).toBe(true);
    expect(stillRunning).toBe(false);
  });
});
