import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("index.ts flush summarize wiring", () => {
  test("flushPending delegates summarize phase to runFlushSummarizePhase", () => {
    const src = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf-8");
    expect(src).toContain("runFlushSummarizePhase");
    expect(src).toContain("pooled: Boolean(options.onProgress)");
  });
});
