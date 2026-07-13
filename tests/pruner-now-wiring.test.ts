import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("commands.ts /pruner now wiring", () => {
  const source = readFileSync(join(import.meta.dir, "..", "src", "commands.ts"), "utf8");

  test("uses MultiBatchLoaderOverlay with runCancellableFlush and signal", () => {
    expect(source).toContain("MultiBatchLoaderOverlay");
    expect(source).toContain("runCancellableFlush");
    expect(source).toContain("bindAbort");
    expect(source).toMatch(/flushPending\(ctx, \{[\s\S]*signal,/);
    expect(source).toContain("overlay.onAbort = abort");
    // Must wait for flush to settle before done(); abort alone must not call done.
    expect(source).toContain(".then(({ result }) => {");
    expect(source).toContain("done(undefined)");
  });
});
