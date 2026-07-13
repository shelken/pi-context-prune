import { describe, expect, test } from "bun:test";
import { pruneMessages } from "../src/pruner.ts";
import { ToolCallIndexer } from "../src/indexer.ts";

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

describe("context seam after cancel or success", () => {
  test("unindexed tool results remain in context before commit", () => {
    const indexer = new ToolCallIndexer();
    const messages = [
      { role: "assistant", content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }] },
      toolResult("tc1", "full original output"),
    ] as any[];

    const pruned = pruneMessages(messages, indexer);
    expect(pruned).toHaveLength(2);
    expect(pruned[1]).toMatchObject({ role: "toolResult", toolCallId: "tc1" });
  });

  test("indexed tool results are omitted after successful persistence", () => {
    const indexer = new ToolCallIndexer();
    // Simulate successful index commit without session IO.
    indexer.getIndex().set("tc1", {
      toolCallId: "tc1",
      toolName: "bash",
      args: {},
      resultText: "full original output",
      isError: false,
      turnIndex: 0,
      timestamp: 1,
    });

    const messages = [
      { role: "assistant", content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }] },
      toolResult("tc1", "full original output"),
      {
        role: "custom",
        customType: "context-prune-summary",
        content: "summary",
        display: false,
      },
    ] as any[];

    const pruned = pruneMessages(messages, indexer);
    expect(pruned.map((m: any) => m.role)).toEqual(["assistant", "custom"]);
  });
});
