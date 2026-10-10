import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("first-context hydration through the extension", () => {
  for (const enabled of [true, false]) {
    test(`saved enabled=${enabled} before session_start`, () => {
      const dir = mkdtempSync(join(tmpdir(), "pruner-hydration-"));
      try {
        const configDir = join(dir, ".pi", "agent", "context-prune");
        mkdirSync(configDir, { recursive: true });
        writeFileSync(join(configDir, "settings.json"), JSON.stringify({
          enabled, pruneOn: "agent-message", showPruneStatusLine: true,
        }));
        const child = spawnSync(process.execPath, [
          join(import.meta.dir, "fixtures/context-hydration-runner.ts"),
          enabled ? "enabled" : "disabled",
        ], { env: { ...process.env, HOME: dir, PI_CODING_AGENT_DIR: dir }, encoding: "utf8", timeout: 15000 });
        expect(child.status, child.stderr).toBe(0);
        const artifact = JSON.parse(child.stdout.trim());
        if (enabled) {
          expect(artifact).toEqual({
            mode: "enabled", firstContextPruned: true, summaryVisible: true,
            originalRecoverable: true, repeatedContextReads: 0, frontierRespected: true,
            sessionStartRestored: true, sessionChangeRestored: true, branchIsolation: true,
          });
        } else {
          expect(artifact).toEqual({ mode: "disabled", unchanged: true });
        }
        console.log(child.stdout.trim());
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
