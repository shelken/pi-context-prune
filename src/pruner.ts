import type { ToolCallIndexer } from "./indexer.js";
import { normalizeSummaryToolCallRefs } from "./summary-refs.js";
import { CUSTOM_TYPE_SUMMARY, type PruneOn } from "./types.js";

/**
 * Filters the `context` event message array.
 * Removes ToolResultMessage entries where toolCallId is in the index.
 * Keeps ALL other messages including AssistantMessages with tool-call blocks.
 */
export function pruneMessages(messages: any[], indexer: ToolCallIndexer): any[] {
  return messages.filter((msg) => {
    // Only remove toolResult messages that have been summarized
    if (msg.role === "toolResult" && indexer.isSummarized(msg.toolCallId)) {
      return false;
    }
    return true;
  });
}

function summaryKeyFromIds(toolCallIds: string[]): string {
  return toolCallIds.slice().sort().join("\0");
}

function summaryKeyFromMessage(msg: any): string | null {
  if (msg?.role !== "custom" || msg.customType !== CUSTOM_TYPE_SUMMARY) return null;
  const ids = normalizeSummaryToolCallRefs(msg.details).map((r) => r.toolCallId);
  if (ids.length === 0) return null;
  return summaryKeyFromIds(ids);
}

/**
 * Find where a batch summary should sit: after the first assistant toolCall
 * block it covers (and any remaining toolResults that still follow it).
 * Falls back to end-of-list when the toolCall blocks are gone.
 */
function findSummaryInsertIndex(messages: any[], toolCallIds: string[]): number {
  const idSet = new Set(toolCallIds);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg?.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const has = msg.content.some(
      (block: any) => block?.type === "toolCall" && typeof block.id === "string" && idSet.has(block.id),
    );
    if (!has) continue;
    let j = i + 1;
    while (j < messages.length && messages[j]?.role === "toolResult") j++;
    return j;
  }
  return messages.length;
}

/**
 * agentic-auto only: inject stored batch summaries near the pruned toolCalls.
 * Pure function — no IO. Idempotent: skips any summary whose toolCallId set is
 * already present as a context-prune-summary custom message.
 *
 * Why here (not flush/steer): context_prune runs while isStreaming, so steer
 * would re-wake the agent. Injecting on every LLM context build is timing-safe.
 */
export function injectSummaries(
  messages: any[],
  indexer: ToolCallIndexer,
  pruneOn: PruneOn | string,
): any[] {
  if (pruneOn !== "agentic-auto") return messages;

  const summaries = indexer.getSummaries();
  if (summaries.length === 0) return messages;

  const existing = new Set<string>();
  for (const msg of messages) {
    const key = summaryKeyFromMessage(msg);
    if (key) existing.add(key);
  }

  let result = messages;
  let copied = false;

  for (const summary of summaries) {
    const key = summaryKeyFromIds(summary.toolCallIds);
    if (existing.has(key)) continue;

    if (!copied) {
      result = messages.slice();
      copied = true;
    }

    const insertAt = findSummaryInsertIndex(result, summary.toolCallIds);
    result.splice(insertAt, 0, {
      role: "custom",
      customType: CUSTOM_TYPE_SUMMARY,
      content: summary.content,
      display: false,
      details: summary.details,
    });
    existing.add(key);
  }

  return result;
}
