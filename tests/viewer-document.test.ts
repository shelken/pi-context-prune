import { describe, expect, test } from "bun:test";
import { ToolCallIndexer } from "../src/indexer.ts";
import { buildViewerDocument, resolveViewerEntries } from "../src/viewer-document.ts";
import type { ToolCallRecord } from "../src/types.ts";
import { CUSTOM_TYPE_SUMMARY } from "../src/types.ts";

function indexerWith(records: ToolCallRecord[]): ToolCallIndexer {
  const indexer = new ToolCallIndexer();
  for (const record of records) {
    indexer.getIndex().set(record.toolCallId, record);
  }
  return indexer;
}

function userMsg(text: string) {
  return {
    type: "message",
    message: {
      role: "user",
      content: text,
      timestamp: 1,
    },
  };
}

function assistantWithTool(toolCallId: string, toolName: string, args: unknown, text?: string) {
  const content: unknown[] = [];
  if (text) content.push({ type: "text", text });
  content.push({ type: "toolCall", id: toolCallId, name: toolName, arguments: args });
  return {
    type: "message",
    message: {
      role: "assistant",
      content,
      stopReason: "toolUse",
      timestamp: 2,
    },
  };
}

function toolResult(toolCallId: string, toolName: string, text: string, isError = false) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text }],
      isError,
      timestamp: 3,
    },
  };
}

function summaryEntry(
  content: string,
  details: {
    toolCallRefs: { shortId: string; toolCallId: string }[];
    toolNames: string[];
    turnIndex: number;
    timestamp: number;
  },
) {
  return {
    type: "custom_message",
    customType: CUSTOM_TYPE_SUMMARY,
    content,
    details,
  };
}

describe("buildViewerDocument", () => {
  test("empty branch yields empty document without throwing", () => {
    const doc = buildViewerDocument([], indexerWith([]), {
      sessionId: "s1",
      sessionLabel: "session-1",
      timestamp: 100,
    });
    expect(doc.sessionId).toBe("s1");
    expect(doc.sessionLabel).toBe("session-1");
    expect(doc.timestamp).toBe(100);
    expect(doc.rows).toEqual([]);
    expect(doc.stats).toEqual({
      messageCount: 0,
      totalMessageCount: 0,
      prunedToolCount: 0,
      summaryCount: 0,
      branchEntryCount: 0,
      truncated: false,
    });
  });

  test("chronological agent-visible rows: user, assistant, unpruned toolResult", () => {
    const branch = [
      userMsg("list files"),
      assistantWithTool("call-1", "bash", { command: "ls" }, "running ls"),
      toolResult("call-1", "bash", "a.txt\nb.txt"),
    ];
    const doc = buildViewerDocument(branch, indexerWith([]), {
      sessionId: "s1",
      sessionLabel: "s1",
      timestamp: 1,
    });

    expect(doc.rows.map((r) => r.kind)).toEqual(["user", "assistant", "toolResult"]);
    expect(doc.rows[0].body).toContain("list files");
    expect(doc.rows[1].body).toContain("running ls");
    expect(doc.rows[1].body).toContain("call-1");
    expect(doc.rows[2].toolCallId).toBe("call-1");
    expect(doc.rows[2].body).toContain("a.txt");
    expect(doc.rows[2].pruned).toBeFalsy();
    expect(doc.rows.every((r) => r.agentVisible)).toBe(true);
  });

  test("summarized toolResult is omitted from agent-visible timeline; original recoverable on summary", () => {
    const original = "huge original tool output ".repeat(20);
    const indexer = indexerWith([
      {
        toolCallId: "call-9",
        toolName: "bash",
        args: { command: "cat big" },
        resultText: original,
        isError: false,
        turnIndex: 1,
        timestamp: 9,
      },
    ]);
    indexer.registerSummaryRefs([{ shortId: "t1", toolCallId: "call-9" }]);

    const branch = [
      userMsg("read big"),
      assistantWithTool("call-9", "bash", { command: "cat big" }),
      toolResult("call-9", "bash", original),
      summaryEntry("<context-prune-summary>\nfiles were listed\n</context-prune-summary>", {
        toolCallRefs: [{ shortId: "t1", toolCallId: "call-9" }],
        toolNames: ["bash"],
        turnIndex: 1,
        timestamp: 99,
        summarizerModel: "openai/gpt-test",
      }),
    ];

    const doc = buildViewerDocument(branch, indexer, {
      sessionId: "s2",
      sessionLabel: "s2",
      timestamp: 2,
    });

    expect(doc.rows.map((r) => r.kind)).toEqual(["user", "assistant", "summary"]);
    expect(doc.rows.some((r) => r.kind === "toolResult")).toBe(false);

    const summary = doc.rows.find((r) => r.kind === "summary")!;
    expect(summary.body).toContain("files were listed");
    expect(summary.toolCallRefs).toEqual([{ shortId: "t1", toolCallId: "call-9" }]);
    expect(summary.linkedTools?.[0].toolCallId).toBe("call-9");
    expect(summary.linkedTools?.[0].shortId).toBe("t1");
    expect(summary.linkedTools?.[0].originalBody).toBe(original);
    expect(summary.linkedTools?.[0].originalChars).toBe(original.length);
    expect(summary.summaryChars).toBeGreaterThan(0);
    expect(summary.summarizerModel).toBe("openai/gpt-test");
    expect(doc.stats.prunedToolCount).toBe(1);
    expect(doc.stats.summaryCount).toBe(1);
  });

  test("error flag is preserved on linked original tools", () => {
    const indexer = indexerWith([
      {
        toolCallId: "err-1",
        toolName: "bash",
        args: {},
        resultText: "boom",
        isError: true,
        turnIndex: 1,
        timestamp: 1,
      },
    ]);
    const branch = [
      summaryEntry("failed ops", {
        toolCallRefs: [{ shortId: "t1", toolCallId: "err-1" }],
        toolNames: ["bash"],
        turnIndex: 1,
        timestamp: 1,
      }),
    ];
    const doc = buildViewerDocument(branch, indexer, {
      sessionId: "s3",
      sessionLabel: "s3",
      timestamp: 3,
    });
    expect(doc.rows[0].linkedTools?.[0].isError).toBe(true);
    expect(doc.rows[0].linkedTools?.[0].originalBody).toBe("boom");
  });

  test("only uses the branch array provided (no hidden session)", () => {
    const branchA = [userMsg("A")];
    const branchB = [userMsg("B"), userMsg("C")];
    const idx = indexerWith([]);
    const a = buildViewerDocument(branchA, idx, { sessionId: "a", sessionLabel: "a", timestamp: 1 });
    const b = buildViewerDocument(branchB, idx, { sessionId: "b", sessionLabel: "b", timestamp: 2 });
    expect(a.rows).toHaveLength(1);
    expect(b.rows).toHaveLength(2);
    expect(a.rows[0].body).toContain("A");
    expect(b.rows[1].body).toContain("C");
  });

  test("rows carry collapsed previews", () => {
    const long = "line1\nline2\n" + "x".repeat(200);
    const doc = buildViewerDocument([userMsg(long)], indexerWith([]), {
      sessionId: "s",
      sessionLabel: "s",
      timestamp: 1,
    });
    expect(doc.rows[0].preview.length).toBeLessThan(long.length);
    expect(doc.rows[0].preview).toContain("line1");
    expect(doc.rows[0].body).toBe(long);
  });

  test("keeps only the latest VIEWER_ROW_WINDOW rows", () => {
    const branch: unknown[] = [];
    for (let i = 0; i < 120; i++) {
      branch.push(userMsg("msg-" + i));
    }
    const doc = buildViewerDocument(branch, indexerWith([]), {
      sessionId: "big",
      sessionLabel: "big",
      timestamp: 1,
    });
    expect(doc.stats.totalMessageCount).toBe(120);
    expect(doc.stats.messageCount).toBe(80);
    expect(doc.stats.truncated).toBe(true);
    expect(doc.rows).toHaveLength(80);
    expect(doc.rows[0]?.preview).toContain("msg-40");
    expect(doc.rows[79]?.preview).toContain("msg-119");
  });

  test("includes compaction and branch_summary entries from context path", () => {
    const branch = [
      { type: "compaction", summary: "Earlier turns compacted away." },
      userMsg("continue"),
      { type: "branch_summary", summary: "Switched from other branch." },
    ];
    const doc = buildViewerDocument(branch, indexerWith([]), {
      sessionId: "c",
      sessionLabel: "c",
      timestamp: 1,
    });
    expect(doc.rows.map((r) => r.roleLabel)).toEqual([
      "compaction",
      "user",
      "branch_summary",
    ]);
    expect(doc.rows[0]?.body).toContain("compacted away");
    expect(doc.rows[2]?.body).toContain("other branch");
  });
});

describe("resolveViewerEntries", () => {
  test("prefers buildContextEntries over getBranch", () => {
    const entries = resolveViewerEntries({
      buildContextEntries: () => [userMsg("from-context")],
      getBranch: () => [userMsg("from-branch"), userMsg("extra")],
      getEntries: () => [userMsg("from-all-entries")],
    });
    expect(entries).toHaveLength(1);
    expect((entries[0] as { message: { content: string } }).message.content).toBe(
      "from-context",
    );
  });

  test("never uses getEntries even when context and branch are empty", () => {
    const entries = resolveViewerEntries({
      buildContextEntries: () => [],
      getBranch: () => [],
      getEntries: () => [userMsg("sibling-branch-pollution")],
    });
    expect(entries).toEqual([]);
  });

  test("falls back to getBranch only when buildContextEntries is missing", () => {
    const entries = resolveViewerEntries({
      getBranch: () => [userMsg("branch-only")],
      getEntries: () => [userMsg("all")],
    });
    expect(entries).toHaveLength(1);
    expect((entries[0] as { message: { content: string } }).message.content).toBe(
      "branch-only",
    );
  });
});
