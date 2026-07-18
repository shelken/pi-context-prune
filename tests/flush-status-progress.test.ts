import { describe, expect, test } from "bun:test";
import { formatFlushStatusProgress } from "../src/progress-text.js";

describe("formatFlushStatusProgress", () => {
  test("formats A/B · C/D(chars)", () => {
    expect(formatFlushStatusProgress(3, 15, 1200, 100_000)).toBe("3/15 · 1.2k/100.0k(chars)");
  });

  test("small numbers stay plain", () => {
    expect(formatFlushStatusProgress(0, 4, 0, 800)).toBe("0/4 · 0/800(chars)");
  });

  test("pre-skip opening state", () => {
    expect(formatFlushStatusProgress(3, 15, 0, 80_000)).toBe("3/15 · 0/80.0k(chars)");
  });
});
