import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("index.ts /pruner now concurrency wiring", () => {
  test("onProgress path uses mapPool with flushConcurrency", () => {
    const src = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf-8");
    expect(src).toContain('from "./src/async-pool.js"');
    expect(src).toContain("mapPool");
    expect(src).toContain("flushConcurrency");
    expect(src).toContain("formatFlushStatusProgress");
  });
});
