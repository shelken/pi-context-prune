import assert from "node:assert/strict";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import register from "../../index.ts";
import {
  CUSTOM_TYPE_INDEX, CUSTOM_TYPE_SUMMARY, CUSTOM_TYPE_STATS, CUSTOM_TYPE_FRONTIER,
} from "../../src/types.ts";

const handlers = new Map<string, any>();
const tools = new Map<string, any>();
const commands = new Map<string, any>();
const notices: string[] = [];
let activeTools: string[] = [];
const pi = {
  on: (event: string, handler: any) => handlers.set(event, handler),
  registerTool: (tool: any) => tools.set(tool.name, tool),
  registerCommand: (name: string, command: any) => commands.set(name, command),
  registerMessageRenderer() {},
  appendEntry() {},
  getActiveTools: () => activeTools,
  setActiveTools: (next: string[]) => { activeTools = next; },
};
register(pi as never);

function makeBranch(id: string, sm = SessionManager.inMemory()) {
  const original = "ORIGINAL_" + id;
  const summary = "SUMMARY_" + id;
  const skippedId = "skipped-" + id;
  const assistant = {
    role: "assistant", api: "openai-completions", provider: "fixture", model: "fixture",
    content: [
      { type: "toolCall", id, name: "read", arguments: { path: "fixture.txt" } },
      { type: "toolCall", id: skippedId, name: "read", arguments: { path: "skipped.txt" } },
    ],
    stopReason: "toolUse", timestamp: 1,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  const result = {
    role: "toolResult", toolCallId: id, toolName: "read",
    content: [{ type: "text", text: original }], isError: false, timestamp: 2,
  };
  sm.appendMessage(assistant as never);
  sm.appendMessage(result as never);
  const skipped = { ...result, toolCallId: skippedId, content: [{ type: "text", text: "SKIPPED" }] };
  sm.appendMessage(skipped as never);
  sm.appendCustomEntry(CUSTOM_TYPE_INDEX, {
    turnIndex: 0, timestamp: 1, toolCalls: [{
      toolCallId: id, toolName: "read", args: { path: "fixture.txt" },
      resultText: original, isError: false, turnIndex: 0, timestamp: 1,
    }],
  });
  sm.appendCustomMessageEntry(CUSTOM_TYPE_SUMMARY, summary, false, {
    toolCallRefs: [{ shortId: "t1", toolCallId: id }], turnIndex: 0, timestamp: 1, toolNames: ["read"],
  });
  sm.appendCustomEntry(CUSTOM_TYPE_STATS, {
    totalInputTokens: 7, totalOutputTokens: 3, totalCost: 0, callCount: 1,
  });
  sm.appendCustomEntry(CUSTOM_TYPE_FRONTIER, {
    lastAttemptedToolCallId: skippedId, lastAttemptedToolName: "read", lastAttemptedTurnIndex: 0,
    lastAttemptedTimestamp: 1, attemptedBatchCount: 1, attemptedToolCallCount: 1,
    rawCharCount: 100, summaryCharCount: 0, outcome: "skipped-oversized",
  });
  let branchReads = 0;
  const getBranch = sm.getBranch.bind(sm);
  sm.getBranch = (...args: Parameters<typeof sm.getBranch>) => { branchReads++; return getBranch(...args); };
  // This fixture has no compaction: its complete branch is its active context.
  const sessionManager = Object.assign(sm, { buildContextEntries: () => sm.getBranch() });
  const ctx = { sessionManager, ui: {
    setStatus() {}, notify: (text: string) => notices.push(text),
  } };
  return { sm, ctx, messages: [assistant, result, skipped], original, summary, reads: () => branchReads };
}

const first = makeBranch("call-a");
const mode = process.argv[2];
const event = { messages: first.messages };
const output = await handlers.get("context")(event, first.ctx);
if (mode === "disabled") {
  assert.equal(output, undefined);
  assert.equal(event.messages[1].content[0].text, first.original);
  console.log(JSON.stringify({ mode, unchanged: true }));
} else {
  assert.ok(output, "first context must load the enabled setting and hydrate before session_start");
  assert.ok(!output.messages.some((m: any) => m.role === "toolResult" && m.toolCallId === "call-a"), "indexed raw result must be pruned");
  assert.ok(output.messages.some((m: any) => m.toolCallId === "skipped-call-a"), "unindexed skipped result must stay visible");
  assert.ok(JSON.stringify(output.messages).includes(first.summary), "committed summary must be injected");
  assert.ok(!JSON.stringify(output.messages).includes(first.original));
  const queried = await tools.get("context_tree_query").execute("query", { toolCallIds: ["t1"] });
  assert.equal(queried.details.results.t1.resultText, first.original);

  await commands.get("pruner").handler("stats", first.ctx);
  assert.ok(notices.some((text) => /calls:\s+1/.test(text) && /input:\s+7/.test(text) && /output:\s+3/.test(text)), "persisted stats must be available");

  const reads = first.reads();
  const again = await handlers.get("context")(event, first.ctx);
  assert.equal(first.reads(), reads, "repeated context must not reread the branch");
  assert.deepEqual(again, output);

  await commands.get("pruner").handler("now", first.ctx);
  assert.equal(notices.at(-1), "pruner: nothing pending — no batches to summarize", "persisted frontier must exclude previously attempted unindexed work");

  const beforeStart = first.reads();
  await handlers.get("session_start")({}, first.ctx);
  assert.ok(first.reads() > beforeStart, "session_start must still rebuild from persistence");
  const afterStart = await handlers.get("context")(event, first.ctx);
  assert.deepEqual(afterStart, output);

  const secondSession = makeBranch("session-b");
  const earlySecond = await handlers.get("context")({ messages: secondSession.messages }, secondSession.ctx);
  assert.ok(JSON.stringify(earlySecond).includes(secondSession.summary), "a new session must hydrate even before its session_start");
  const previousQuery = await tools.get("context_tree_query").execute("query", { toolCallIds: ["call-a"] });
  assert.deepEqual(previousQuery.details.results, {}, "new-session context must not keep old indexes");

  secondSession.sm.resetLeaf();
  const second = makeBranch("call-b", secondSession.sm);
  await handlers.get("session_tree")({}, second.ctx);
  const secondOutput = await handlers.get("context")({ messages: second.messages }, second.ctx);
  assert.ok(JSON.stringify(secondOutput).includes(second.summary));
  assert.ok(!JSON.stringify(secondOutput).includes(first.summary));
  const oldQuery = await tools.get("context_tree_query").execute("query", { toolCallIds: ["call-a"] });
  assert.deepEqual(oldQuery.details.results, {});
  const branchQuery = await tools.get("context_tree_query").execute("query", { toolCallIds: ["t1"] });
  assert.equal(branchQuery.details.results.t1.resultText, second.original);
  console.log(JSON.stringify({
    mode, firstContextPruned: true, summaryVisible: true, originalRecoverable: true,
    repeatedContextReads: 0, frontierRespected: true, sessionStartRestored: true,
    sessionChangeRestored: true, branchIsolation: true,
  }));
}
