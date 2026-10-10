import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Host-aware resolution of the agent config directory.
 *
 * Both hosts expose the same contract:
 *   1. `PI_CODING_AGENT_DIR` — full agent-dir override. omp also writes the
 *      resolved dir back into this variable whenever a named profile is
 *      active, so the override branch already covers profiles.
 *   2. `<home>/<configDirName>/agent` — fallback. omp reads `PI_CONFIG_DIR`
 *      verbatim (default `.omp`); pi's name is fixed `.pi`.
 *
 * Detecting omp via `process.versions.bun` is a best-effort heuristic: it is
 * wrong when pi itself runs under Bun (the extension then looks in `~/.omp`
 * instead of `~/.pi`). Setting `PI_CODING_AGENT_DIR` bypasses the heuristic.
 * Everything is resolved per call so env changes after import still land in
 * the right directory.
 */

function isOmpHost(): boolean {
  return typeof (process.versions as Record<string, unknown>).bun === "string";
}

/** Config dirname under home: omp honors `PI_CONFIG_DIR` verbatim, pi is fixed `.pi`. */
function configDirName(): string {
  if (!isOmpHost()) return ".pi";
  return process.env.PI_CONFIG_DIR || ".omp";
}

/** Active agent config directory (e.g. `~/.omp/agent`). */
export function agentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (override) return override;
  return join(homedir(), configDirName(), "agent");
}

/** This extension's own data directory under the active agent directory. */
export function contextPruneDir(): string {
  return join(agentDir(), "context-prune");
}

/** Absolute path to the persisted settings file (resolved at call time). */
export function getSettingsPath(): string {
  return join(contextPruneDir(), "settings.json");
}
