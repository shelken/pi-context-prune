import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../src/types.js";
import { normalizeConfig } from "../src/config.js";

describe("normalizeConfig flushConcurrency + minRawCharsToSummarize", () => {
  test("defaults include concurrency 4 and min raw 800", () => {
    expect(DEFAULT_CONFIG.flushConcurrency).toBe(4);
    expect(DEFAULT_CONFIG.minRawCharsToSummarize).toBe(800);
  });

  test("empty input yields defaults for both fields", () => {
    const cfg = normalizeConfig({});
    expect(cfg.flushConcurrency).toBe(4);
    expect(cfg.minRawCharsToSummarize).toBe(800);
  });

  test("accepts valid integers", () => {
    const cfg = normalizeConfig({ flushConcurrency: 2, minRawCharsToSummarize: 0 });
    expect(cfg.flushConcurrency).toBe(2);
    expect(cfg.minRawCharsToSummarize).toBe(0);
  });

  test("clamps concurrency to [1, 16]; rejects fractions", () => {
    expect(normalizeConfig({ flushConcurrency: 0 }).flushConcurrency).toBe(1);
    expect(normalizeConfig({ flushConcurrency: 99 }).flushConcurrency).toBe(16);
    expect(normalizeConfig({ flushConcurrency: 1.7 }).flushConcurrency).toBe(4);
  });

  test("bad concurrency falls back to default", () => {
    expect(normalizeConfig({ flushConcurrency: "nope" }).flushConcurrency).toBe(4);
    expect(normalizeConfig({ flushConcurrency: NaN }).flushConcurrency).toBe(4);
  });

  test("min raw chars: integer >= 0 kept; negative/non-finite fall back to default", () => {
    expect(normalizeConfig({ minRawCharsToSummarize: 500 }).minRawCharsToSummarize).toBe(500);
    expect(normalizeConfig({ minRawCharsToSummarize: -1 }).minRawCharsToSummarize).toBe(800);
    expect(normalizeConfig({ minRawCharsToSummarize: 1.5 }).minRawCharsToSummarize).toBe(800);
    expect(normalizeConfig({ minRawCharsToSummarize: "x" }).minRawCharsToSummarize).toBe(800);
  });
});
