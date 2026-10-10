import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENTIC_AUTO_SYSTEM_PROMPT } from "../src/types.ts";
import { captureBatch } from "../src/batch-capture.ts";

// Isolate settings BEFORE importing the extension so nothing touches a real home.
const testAgentDir = mkdtempSync(join(tmpdir(), "pruner-omp-agent-"));
const originalAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = testAgentDir;

type Handler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

function makeFakePi(sessionManager: Record<string, unknown> = {}) {
  const tools = new Map<string, any>();
  const handlers = new Map<string, Handler[]>();
  const statusCalls: { id: string; text?: string }[] = [];
  let activeTools: string[] = [];
  const fake = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool(tool: any) { tools.set(tool.name, tool); },
    registerCommand() {},
    registerMessageRenderer() {},
    appendEntry() {},
    getActiveTools: () => activeTools,
    setActiveTools: (next: string[]) => {
      activeTools = next;
    },
  };
  const ctx = {
    signal: new AbortController().signal,
    model: { provider: "fixture", id: "fixture-model" },
    sessionManager: { getBranch: () => [], getSessionId: () => "fixture-session", ...sessionManager },
    ui: {
      setStatus: (id: string, text?: string) => statusCalls.push({ id, text }),
      notify() {},
    },
  };
  return {
    fake,
    ctx,
    tools,
    statusCalls,
    async fire(event: string, payload: unknown) {
      const list = handlers.get(event) ?? [];
      let result: unknown;
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

function toolTurn(id: string, name = "read", details?: unknown) {
  return {
    turnIndex: 0,
    message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: { path: "fixture.txt" } }] },
    toolResults: [{ role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "fixture result" }], details }],
  };
}

function branchForTurns(turns: ReturnType<typeof toolTurn>[]) {
  return [
    { type: "message", message: { role: "user", content: [{ type: "text", text: "review fixtures" }] } },
    ...turns.flatMap(turn => [
      { type: "message", message: turn.message },
      ...turn.toolResults.map(message => ({ type: "message", message })),
    ]),
  ];
}

async function startPruner(sessionManager: Record<string, unknown>, config: Record<string, unknown> = {}) {
  writeSettings({ enabled: true, pruneOn: "agentic-auto", minRawCharsToSummarize: 100_000, ...config });
  const host = makeFakePi(sessionManager);
  register(host.fake as never);
  await host.fire("session_start", {});
  return host;
}

async function prune(host: Awaited<ReturnType<typeof startPruner>>) {
  return host.tools.get("context_prune").execute("prune-fixture", {}, host.ctx.signal, undefined, host.ctx);
}

describe("omp host adaptation", () => {
  test("reopened omp sessions capture only results in buildSessionContext", async () => {
    const oldTurn = toolTurn("compacted-away");
    const activeTurn = toolTurn("still-active");
    const branch = branchForTurns([oldTurn, activeTurn]);
    const host = await startPruner({
      getBranch: () => branch,
      buildSessionContext: () => ({ messages: [activeTurn.message, ...activeTurn.toolResults] }),
    });

    const result = await prune(host);
    expect(result.details).toMatchObject({ ok: true, toolCallCount: 1, rawCharCount: 14 });
  });

  test("empty or unreadable omp context never scans old branch results", async () => {
    const branch = branchForTurns([toolTurn("old-result")]);
    for (const buildSessionContext of [
      () => ({ messages: [] }),
      () => { throw new Error("context unavailable"); },
    ]) {
      const host = await startPruner({ getBranch: () => branch, buildSessionContext });
      expect((await prune(host)).details).toMatchObject({ ok: false, reason: "empty" });
    }
  });

  test.each([
    ["agent-message", 1, 3, 1],
    ["agent-message", 2, 2, 2],
    ["turn", 1, 3, 3],
  ] as const)("live %s queue groups %i user spans with %i turns into %i batches", async (batchingMode, users, turnsPerUser, expectedBatches) => {
    const branch: any[] = [];
    const host = await startPruner({
      getBranch: () => branch,
      buildSessionContext: () => { throw new Error("context unavailable"); },
    }, { batchingMode });
    let turnIndex = 0;
    for (let user = 0; user < users; user++) {
      branch.push({ type: "message", message: { role: "user", content: [{ type: "text", text: `task ${user}` }] } });
      for (let i = 0; i < turnsPerUser; i++) {
        const turn = { ...toolTurn(`call-${turnIndex}`), turnIndex: turnIndex++ };
        branch.push({ type: "message", message: turn.message });
        branch.push(...turn.toolResults.map(message => ({ type: "message", message })));
        await host.fire("turn_end", turn);
      }
    }
    expect((await prune(host)).details).toMatchObject({
      ok: true, batchCount: expectedBatches, toolCallCount: users * turnsPerUser,
    });
  });

  test.each(["live", "reopened"] as const)("xdev housekeeping is excluded from %s capture", async (mode) => {
    const turn = toolTurn("wrapped-prune", "write", { xdev: { tool: "context_prune", mode: "execute", args: {} } });
    const branch = branchForTurns([turn]);
    const host = await startPruner({
      getBranch: () => branch,
      ...(mode === "reopened" ? { buildSessionContext: () => ({ messages: [turn.message, ...turn.toolResults] }) } : {}),
    });
    if (mode === "live") await host.fire("turn_end", turn);
    expect((await prune(host)).details).toMatchObject({ ok: false, reason: "empty" });
  });

  test("ordinary writes remain eligible for pruning", async () => {
    const turn = toolTurn("ordinary-write", "write");
    const host = await startPruner({ getBranch: () => branchForTurns([turn]) });
    await host.fire("turn_end", turn);
    expect((await prune(host)).details).toMatchObject({ ok: true, toolCallCount: 1 });
  });

  test("xdev capture preserves original call id and inner arguments", () => {
    const args = { toolCallIds: ["t1"] };
    const turn = toolTurn("wrapped-query", "write", { xdev: { tool: "context_tree_query", mode: "execute", args } });
    expect(captureBatch(turn.message, turn.toolResults, 0, 0).toolCalls[0]).toMatchObject({
      toolCallId: "wrapped-query", toolName: "context_tree_query", args,
    });
  });

  test("xdev help reads keep their original tool identity", () => {
    const turn = toolTurn("read-help", "read", { xdev: { tool: "context_prune", mode: "help" } });
    expect(captureBatch(turn.message, turn.toolResults, 0, 0).toolCalls[0]?.toolName).toBe("read");
  });

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
