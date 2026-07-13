import { describe, expect, test } from "bun:test";
import {
  assistantMessageHasToolCalls,
  isSuccessfulFinalAssistantMessage,
  shouldSummarizeAgentMessageOnAgentEnd,
} from "../src/agent-end-guard.ts";

function assistant(partial: {
  stopReason: string;
  content?: unknown[];
}) {
  return {
    role: "assistant",
    stopReason: partial.stopReason,
    content: partial.content ?? [{ type: "text", text: "done" }],
  };
}

describe("isSuccessfulFinalAssistantMessage", () => {
  test("allows only stop without tool calls", () => {
    expect(isSuccessfulFinalAssistantMessage(assistant({ stopReason: "stop" }))).toBe(true);
  });

  test("rejects error, aborted, length, and toolUse endings", () => {
    for (const stopReason of ["error", "aborted", "length", "toolUse"] as const) {
      expect(isSuccessfulFinalAssistantMessage(assistant({ stopReason }))).toBe(false);
    }
  });

  test("rejects stop that still contains tool calls", () => {
    expect(
      isSuccessfulFinalAssistantMessage(
        assistant({
          stopReason: "stop",
          content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }],
        }),
      ),
    ).toBe(false);
    expect(
      assistantMessageHasToolCalls(
        assistant({
          stopReason: "stop",
          content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }],
        }),
      ),
    ).toBe(true);
  });
});

describe("shouldSummarizeAgentMessageOnAgentEnd", () => {
  test("summarizes once on successful final assistant message", () => {
    const messages = [
      { role: "user", content: "hi" },
      assistant({
        stopReason: "toolUse",
        content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: {} }],
      }),
      { role: "toolResult", toolCallId: "tc1", toolName: "bash", content: [], isError: false },
      assistant({ stopReason: "stop", content: [{ type: "text", text: "all done" }] }),
    ];
    expect(shouldSummarizeAgentMessageOnAgentEnd(messages)).toBe(true);
  });

  test("does not summarize error or aborted agent_end payloads", () => {
    expect(
      shouldSummarizeAgentMessageOnAgentEnd([
        assistant({ stopReason: "error", content: [{ type: "text", text: "network failed" }] }),
      ]),
    ).toBe(false);
    expect(
      shouldSummarizeAgentMessageOnAgentEnd([
        assistant({ stopReason: "aborted", content: [{ type: "text", text: "cancelled" }] }),
      ]),
    ).toBe(false);
  });

  test("error attempt then successful retry summarizes on the successful attempt only", () => {
    const failed = [assistant({ stopReason: "error", content: [{ type: "text", text: "fail" }] })];
    const retried = [
      assistant({ stopReason: "error", content: [{ type: "text", text: "fail" }] }),
      assistant({ stopReason: "stop", content: [{ type: "text", text: "ok" }] }),
    ];
    expect(shouldSummarizeAgentMessageOnAgentEnd(failed)).toBe(false);
    expect(shouldSummarizeAgentMessageOnAgentEnd(retried)).toBe(true);
  });
});
