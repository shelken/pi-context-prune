import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("index.ts pre-skip wiring", () => {
  test("flushPending classifies batches with shouldPreSkipBatch before summarize", () => {
    const src = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf-8");
    expect(src).toContain('from "./src/pre-skip.js"');
    expect(src).toContain("shouldPreSkipBatch");
    expect(src).toContain("preSkipFlags");
    expect(src).toContain("skip ${preSkipCount} small");
  });
});
