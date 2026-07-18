import { describe, expect, test } from "bun:test";
import { batchRawCharCount, shouldPreSkipBatch } from "../src/pre-skip.js";
import type { CapturedBatch } from "../src/types.js";

function batch(rawParts: string[]): CapturedBatch {
  return {
    turnIndex: 1,
    timestamp: 0,
    assistantText: "",
    toolCalls: rawParts.map((resultText, i) => ({
      toolCallId: `id-${i}`,
      toolName: "read",
      args: {},
      resultText,
      isError: false,
      turnIndex: 1,
      timestamp: 0,
    })),
  };
}

describe("shouldPreSkipBatch", () => {
  test("min 0 never skips", () => {
    expect(shouldPreSkipBatch(batch(["x"]), 0)).toBe(false);
  });

  test("raw below threshold skips", () => {
    expect(shouldPreSkipBatch(batch(["12345"]), 800)).toBe(true);
  });

  test("raw at/above threshold does not skip", () => {
    const text = "a".repeat(800);
    expect(shouldPreSkipBatch(batch([text]), 800)).toBe(false);
    expect(shouldPreSkipBatch(batch([text + "b"]), 800)).toBe(false);
  });

  test("raw is sum of tool results", () => {
    expect(batchRawCharCount(batch(["ab", "cd"]))).toBe(4);
    expect(shouldPreSkipBatch(batch(["aaa", "bbb"]), 7)).toBe(true);
    expect(shouldPreSkipBatch(batch(["aaa", "bbb"]), 6)).toBe(false);
  });
});
