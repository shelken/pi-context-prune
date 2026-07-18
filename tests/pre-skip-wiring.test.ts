import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("pre-skip wiring through flush summarize phase", () => {
  test("phase module is used from index and encodes pre-skip", () => {
    const indexSrc = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf-8");
    const phaseSrc = readFileSync(join(import.meta.dir, "..", "src/flush-summarize-phase.ts"), "utf-8");
    expect(indexSrc).toContain("runFlushSummarizePhase");
    expect(phaseSrc).toContain("shouldPreSkipBatch");
    expect(phaseSrc).toContain("minRawCharsToSummarize");
  });
});
