import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentDir, contextPruneDir, getSettingsPath } from "../src/paths.ts";

const ORIGINAL = {
  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  PI_CONFIG_DIR: process.env.PI_CONFIG_DIR,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function clearEnv(): void {
  delete process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CONFIG_DIR;
}

describe("agentDir resolution", () => {
  test("PI_CODING_AGENT_DIR wins verbatim for both hosts", () => {
    clearEnv();
    process.env.PI_CODING_AGENT_DIR = "/tmp/custom-agent-dir";
    expect(agentDir()).toBe("/tmp/custom-agent-dir");
    expect(getSettingsPath()).toBe("/tmp/custom-agent-dir/context-prune/settings.json");
  });

  test("falls back to <home>/<configDir>/agent", () => {
    clearEnv();
    // Assert shape, not an absolute path: homedir() differs between CI and a dev box.
    const baseParts = agentDir().split("/");
    expect(baseParts.at(-1)).toBe("agent");
    expect(baseParts.at(-2)).toBe(".omp");

    process.env.PI_CONFIG_DIR = "custom-root";
    expect(agentDir()).toBe(join(homedir(), "custom-root", "agent"));
  });

  test("PI_CONFIG_DIR is joined verbatim, matching omp's getConfigDirName", () => {
    // omp uses `process.env.PI_CONFIG_DIR || ".omp"` with no normalization;
    // a multi-segment value must land in the same directory omp itself uses.
    clearEnv();
    process.env.PI_CONFIG_DIR = "foo/bar";
    expect(agentDir()).toBe(join(homedir(), "foo", "bar", "agent"));
  });

  test("settings path is resolved per call, not frozen at import", () => {
    clearEnv();
    process.env.PI_CODING_AGENT_DIR = "/tmp/first";
    const first = getSettingsPath();
    process.env.PI_CODING_AGENT_DIR = "/tmp/second";
    const second = getSettingsPath();
    expect(first).not.toBe(second);
    expect(second).toBe("/tmp/second/context-prune/settings.json");
    expect(contextPruneDir()).toBe("/tmp/second/context-prune");
  });
});
