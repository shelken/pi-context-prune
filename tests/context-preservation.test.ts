import { describe, expect, test } from "bun:test";
import { injectSummaries, pruneMessages } from "../src/pruner.ts";
import { ToolCallIndexer } from "../src/indexer.ts";
import { CUSTOM_TYPE_SUMMARY } from "../src/types.ts";

function toolResult(id: string, text: string) {
  return {
    role: "toolResult" as const,
    toolCallId: id,
    toolName: "bash",
    content: [{ type: "text" as const, text }],
    isError: false,
    timestamp: 1,
  };
}

function assistantWithCalls(...ids: string[]) {
  return {
    role: "assistant" as const,
    content: ids.map((id) => ({ type: "toolCall" as const, id, name: "bash", arguments: {} })),
  };
}

function indexTool(indexer: ToolCallIndexer, id: string, resultText = "full original output") {
  indexer.getIndex().set(id, {
    toolCallId: id,
    toolName: "bash",
    args: {},
    resultText,
    isError: false,
    turnIndex: 0,
    timestamp: 1,
  });
}

function recordSummary(
  indexer: ToolCallIndexer,
  content: string,
  toolCallIds: string[],
) {
  indexer.recordSummary(content, {
    toolCallRefs: toolCallIds.map((toolCallId, i) => ({
      shortId: `t${i + 1}`,
      toolCallId,
    })),
    toolNames: toolCallIds.map(() => "bash"),
    turnIndex: 0,
    timestamp: 1,
  });
}

describe("context seam after cancel or success", () => {
  test("unindexed tool results remain in context before commit", () => {
    const indexer = new ToolCallIndexer();
    const messages = [
      assistantWithCalls("tc1"),
      toolResult("tc1", "full original output"),
    ] as any[];

    const pruned = pruneMessages(messages, indexer);
    expect(pruned).toHaveLength(2);
    expect(pruned[1]).toMatchObject({ role: "toolResult", toolCallId: "tc1" });
  });

  test("indexed tool results are omitted after successful persistence", () => {
    const indexer = new ToolCallIndexer();
    indexTool(indexer, "tc1");

    const messages = [
      assistantWithCalls("tc1"),
      toolResult("tc1", "full original output"),
      {
        role: "custom",
        customType: CUSTOM_TYPE_SUMMARY,
        content: "summary",
        display: false,
      },
    ] as any[];

    const pruned = pruneMessages(messages, indexer);
    expect(pruned.map((m: any) => m.role)).toEqual(["assistant", "custom"]);
  });
});

describe("injectSummaries for agentic-auto", () => {
  test("agentic-auto: summarized toolResult is removed and summary appears near the toolCall", () => {
    const indexer = new ToolCallIndexer();
    indexTool(indexer, "tc1");
    recordSummary(indexer, "batch-1 summary", ["tc1"]);

    const messages = [
      { role: "user", content: "go" },
      assistantWithCalls("tc1"),
      toolResult("tc1", "full original output"),
      { role: "user", content: "continue" },
    ] as any[];

    const pruned = pruneMessages(messages, indexer);
    const injected = injectSummaries(pruned, indexer, "agentic-auto");

    expect(injected.map((m: any) => m.role)).toEqual([
      "user",
      "assistant",
      "custom",
      "user",
    ]);
    expect(injected[2]).toMatchObject({
      role: "custom",
      customType: CUSTOM_TYPE_SUMMARY,
      content: "batch-1 summary",
      display: false,
    });
    // Near toolCall, not at the tail after the final user message
    expect(injected[injected.length - 1].role).toBe("user");
  });

  test("agentic-auto: second inject is idempotent (no duplicate summary)", () => {
    const indexer = new ToolCallIndexer();
    indexTool(indexer, "tc1");
    recordSummary(indexer, "batch-1 summary", ["tc1"]);

    const messages = [
      assistantWithCalls("tc1"),
      toolResult("tc1", "full original output"),
    ] as any[];

    const once = injectSummaries(pruneMessages(messages, indexer), indexer, "agentic-auto");
    const twice = injectSummaries(once, indexer, "agentic-auto");

    expect(twice.filter((m: any) => m.role === "custom" && m.customType === CUSTOM_TYPE_SUMMARY)).toHaveLength(1);
    expect(twice).toEqual(once);
  });

  test("non-agentic-auto modes only drop toolResults and do not inject summaries", () => {
    const indexer = new ToolCallIndexer();
    indexTool(indexer, "tc1");
    recordSummary(indexer, "batch-1 summary", ["tc1"]);

    const messages = [
      assistantWithCalls("tc1"),
      toolResult("tc1", "full original output"),
      { role: "user", content: "later" },
    ] as any[];

    for (const mode of ["every-turn", "on-context-tag", "on-demand", "agent-message"] as const) {
      const pruned = pruneMessages(messages, indexer);
      const result = injectSummaries(pruned, indexer, mode);
      expect(result.map((m: any) => m.role)).toEqual(["assistant", "user"]);
      expect(result.some((m: any) => m.customType === CUSTOM_TYPE_SUMMARY)).toBe(false);
    }
  });

  test("multi-batch: each batch summary appears once, near its own toolCalls", () => {
    const indexer = new ToolCallIndexer();
    indexTool(indexer, "tc1");
    indexTool(indexer, "tc2");
    recordSummary(indexer, "summary-A", ["tc1"]);
    recordSummary(indexer, "summary-B", ["tc2"]);

    const messages = [
      assistantWithCalls("tc1"),
      toolResult("tc1", "out-1"),
      { role: "user", content: "next" },
      assistantWithCalls("tc2"),
      toolResult("tc2", "out-2"),
      { role: "user", content: "tail" },
    ] as any[];

    const result = injectSummaries(pruneMessages(messages, indexer), indexer, "agentic-auto");
    const roles = result.map((m: any) => (m.role === "custom" ? `custom:${m.content}` : m.role));

    expect(roles).toEqual([
      "assistant",
      "custom:summary-A",
      "user",
      "assistant",
      "custom:summary-B",
      "user",
    ]);

    // Second pass must not stack duplicates
    const again = injectSummaries(result, indexer, "agentic-auto");
    expect(again.filter((m: any) => m.customType === CUSTOM_TYPE_SUMMARY)).toHaveLength(2);
  });

  test("summary already present in messages is not re-inserted", () => {
    const indexer = new ToolCallIndexer();
    indexTool(indexer, "tc1");
    recordSummary(indexer, "batch-1 summary", ["tc1"]);

    const existing = {
      role: "custom" as const,
      customType: CUSTOM_TYPE_SUMMARY,
      content: "batch-1 summary",
      display: false,
      details: {
        toolCallRefs: [{ shortId: "t1", toolCallId: "tc1" }],
      },
    };

    const messages = [
      assistantWithCalls("tc1"),
      existing,
      { role: "user", content: "tail" },
    ] as any[];

    const result = injectSummaries(messages, indexer, "agentic-auto");
    expect(result.filter((m: any) => m.customType === CUSTOM_TYPE_SUMMARY)).toHaveLength(1);
    expect(result[1]).toBe(existing);
  });
});
