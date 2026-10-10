import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENTIC_AUTO_SYSTEM_PROMPT } from "../src/types.ts";

// Isolate settings BEFORE importing the extension so nothing touches a real home.
const testAgentDir = mkdtempSync(join(tmpdir(), "pruner-omp-agent-"));
const originalAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = testAgentDir;

type Handler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

function makeFakePi() {
  const handlers = new Map<string, Handler[]>();
  const statusCalls: { id: string; text?: string }[] = [];
  let activeTools: string[] = [];
  const fake = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool() {},
    registerCommand() {},
    registerMessageRenderer() {},
    appendEntry() {},
    getActiveTools: () => activeTools,
    setActiveTools: (next: string[]) => {
      activeTools = next;
    },
  };
  return {
    fake,
    statusCalls,
    async fire(event: string, payload: unknown) {
      const list = handlers.get(event) ?? [];
      let result: unknown;
      const ctx = {
        signal: new AbortController().signal,
        sessionManager: { getBranch: () => [] },
        ui: {
          setStatus: (id: string, text?: string) => statusCalls.push({ id, text }),
          notify() {},
        },
      };
      for (const handler of list) result = await handler(payload, ctx);
      return result;
    },
  };
}

const { default: register } = await import("../index.ts");

afterAll(() => {
  rmSync(testAgentDir, { recursive: true, force: true });
  if (originalAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDirEnv;
});

function writeSettings(config: Record<string, unknown>): void {
  const settingsDir = join(testAgentDir, "context-prune");
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(settingsDir, "settings.json"), JSON.stringify(config));
}

function turnEndEvent(): unknown {
  return {
    turnIndex: 0,
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "call_1", name: "bash", arguments: {} }],
    },
    toolResults: [{ toolCallId: "call_1", content: [{ type: "text", text: "ls output" }] }],
  };
}

describe("omp host adaptation", () => {
  test("before_agent_start returns string[] for omp and keeps Markdown sections", async () => {
    writeSettings({ enabled: true, pruneOn: "agentic-auto" });
    const { fake, fire } = makeFakePi();
    register(fake as never);
    await fire("session_start", {});

    const result = await fire("before_agent_start", {
      prompt: "hi",
      systemPrompt: ["# Section A", "text, with commas"],
    });

    expect(result).toEqual({
      systemPrompt: ["# Section A", "text, with commas", AGENTIC_AUTO_SYSTEM_PROMPT],
    });
  });

  test("agent_end with willContinue keeps pending work uncommitted", async () => {
    writeSettings({ enabled: true, pruneOn: "agent-message" });
    const { fake, fire, statusCalls } = makeFakePi();
    register(fake as never);
    await fire("session_start", {});

    // Queue one real batch so a flush would have work to commit.
    await fire("turn_end", turnEndEvent());

    // Without the willContinue guard this event flushes: the summarizer path
    // then dereferences model-registry fields the fake host does not provide
    // and the handler rejects. With the guard the batch stays pending.
    await fire("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] }],
      willContinue: true,
    });

    const pending = statusCalls.filter((call) => typeof call.text === "string" && call.text.includes("pending"));
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.at(-1)?.text).toContain("prune: 1 pending");

    // The guard must skip the flush entirely: a flush would first paint a
    // progress status like "0/1 · 0/0(chars)" before any summarizer failure
    // restores the batch to pending. No progress text means no flush attempt.
    const progressTexts = statusCalls.filter((call) => typeof call.text === "string" && call.text.includes("(chars)"));
    expect(progressTexts).toEqual([]);
  });
});
