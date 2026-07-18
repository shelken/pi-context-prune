import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { ContextPruneConfig, PruneOn, SummarizerThinking, BatchingMode } from "./types.js";
import {
  DEFAULT_CONFIG,
  PRUNE_ON_MODES,
  SUMMARIZER_THINKING_LEVELS,
  BATCHING_MODES,
  FLUSH_CONCURRENCY_MIN,
  FLUSH_CONCURRENCY_MAX,
} from "./types.js";

/** Path to the extension's own settings file, independent of any project. */
export const SETTINGS_PATH = join(homedir(), ".pi", "agent", "context-prune", "settings.json");

function isPruneOn(value: unknown): value is PruneOn {
  return typeof value === "string" && PRUNE_ON_MODES.some((mode) => mode.value === value);
}

function isSummarizerThinking(value: unknown): value is SummarizerThinking {
  return typeof value === "string" && SUMMARIZER_THINKING_LEVELS.some((level) => level.value === value);
}

function isBatchingMode(value: unknown): value is BatchingMode {
  return typeof value === "string" && BATCHING_MODES.some((mode) => mode.value === value);
}

/** Parse flushConcurrency: integer clamped to [1,16], else default. */
export function normalizeFlushConcurrency(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONFIG.flushConcurrency;
  }
  const n = Math.trunc(value);
  // Reject fractional input (same rule as min-chars) — only whole numbers.
  if (value !== n) return DEFAULT_CONFIG.flushConcurrency;
  if (n < FLUSH_CONCURRENCY_MIN) return FLUSH_CONCURRENCY_MIN;
  if (n > FLUSH_CONCURRENCY_MAX) return FLUSH_CONCURRENCY_MAX;
  return n;
}

/** Parse minRawCharsToSummarize: integer >= 0, else default. */
export function normalizeMinRawCharsToSummarize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONFIG.minRawCharsToSummarize;
  }
  const n = Math.trunc(value);
  // Spec: non-integer (after we only accept whole numbers via trunc of non-int)
  // Reject fractional input by requiring value === trunc(value) for numbers that aren't ints.
  if (value !== n || n < 0) {
    return DEFAULT_CONFIG.minRawCharsToSummarize;
  }
  return n;
}

/**
 * Merge partial/unknown JSON into a full ContextPruneConfig with field validation.
 * Pure — used by loadConfig and tests.
 */
export function normalizeConfig(existing: Record<string, unknown> | object): ContextPruneConfig {
  const merged = { ...DEFAULT_CONFIG, ...existing } as Record<string, unknown>;
  return {
    enabled: typeof merged.enabled === "boolean" ? merged.enabled : DEFAULT_CONFIG.enabled,
    showPruneStatusLine:
      typeof merged.showPruneStatusLine === "boolean"
        ? merged.showPruneStatusLine
        : DEFAULT_CONFIG.showPruneStatusLine,
    summarizerModel:
      typeof merged.summarizerModel === "string" ? merged.summarizerModel : DEFAULT_CONFIG.summarizerModel,
    summarizerThinking: isSummarizerThinking(merged.summarizerThinking)
      ? merged.summarizerThinking
      : DEFAULT_CONFIG.summarizerThinking,
    pruneOn: isPruneOn(merged.pruneOn) ? merged.pruneOn : DEFAULT_CONFIG.pruneOn,
    remindUnprunedCount:
      typeof merged.remindUnprunedCount === "boolean"
        ? merged.remindUnprunedCount
        : DEFAULT_CONFIG.remindUnprunedCount,
    batchingMode: isBatchingMode(merged.batchingMode) ? merged.batchingMode : DEFAULT_CONFIG.batchingMode,
    flushConcurrency: normalizeFlushConcurrency(merged.flushConcurrency),
    minRawCharsToSummarize: normalizeMinRawCharsToSummarize(merged.minRawCharsToSummarize),
  };
}

/** Reads ~/.pi/agent/context-prune/settings.json and returns the config (or defaults). */
export async function loadConfig(): Promise<ContextPruneConfig> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const existing = JSON.parse(raw);
    if (existing == null || typeof existing !== "object" || Array.isArray(existing)) {
      return { ...DEFAULT_CONFIG };
    }
    return normalizeConfig(existing as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Writes the full config to ~/.pi/agent/context-prune/settings.json. */
export async function saveConfig(config: ContextPruneConfig): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(config, null, 2));
}
