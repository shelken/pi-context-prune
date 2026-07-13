/**
 * Decide whether automatic agent-message pruning should commit on agent_end.
 *
 * Only a normal completed final assistant message (stopReason === "stop",
 * no tool calls) is treated as a successful agent run boundary.
 */

export function assistantMessageHasToolCalls(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const role = (message as { role?: unknown }).role;
  const content = (message as { content?: unknown }).content;
  if (role !== "assistant" || !Array.isArray(content)) return false;
  return content.some((block) => {
    return !!block && typeof block === "object" && (block as { type?: unknown }).type === "toolCall";
  });
}

/**
 * True only when the message is a successful final assistant reply.
 * Strict allow-list: stopReason must be exactly "stop".
 */
export function isSuccessfulFinalAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const m = message as { role?: unknown; stopReason?: unknown };
  if (m.role !== "assistant") return false;
  if (m.stopReason !== "stop") return false;
  return !assistantMessageHasToolCalls(message);
}

/** Last assistant message in an agent_end payload, if any. */
export function getLastAssistantMessage(messages: unknown[]): unknown | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && typeof message === "object" && (message as { role?: unknown }).role === "assistant") {
      return message;
    }
  }
  return undefined;
}

/**
 * agent-message mode should summarize only after a successful, non-tool final reply.
 */
export function shouldSummarizeAgentMessageOnAgentEnd(messages: unknown[]): boolean {
  return isSuccessfulFinalAssistantMessage(getLastAssistantMessage(messages));
}
