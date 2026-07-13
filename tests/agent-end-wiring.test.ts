import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("index.ts agent-message wiring", () => {
  const source = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf8");

  test("flushes agent-message on agent_end via handleAgentEndLifecycle, not message_end", () => {
    expect(source).toContain('pi.on("agent_end"');
    expect(source).toContain("handleAgentEndLifecycle");
    expect(source).toContain("signal: ctx.signal");
    // Old buggy trigger must stay gone.
    expect(source).not.toMatch(/pi\.on\("message_end"/);
  });
});
