import type { ToolCallIndexer } from "./indexer.js";
import { normalizeSummaryToolCallRefs, summaryToolCallKey } from "./summary-refs.js";
import { CUSTOM_TYPE_SUMMARY, type PruneOn } from "./types.js";

/**
 * Filters the `context` event message array.
 * Other modes remove indexed ToolResultMessages as before; agentic-auto waits
 * until the covering summary's complete batch index is committed.
 */
export function pruneMessages(
  messages: any[],
  indexer: ToolCallIndexer,
  pruneOn?: PruneOn,
): any[] {
  const committedToolCallIds =
    pruneOn === "agentic-auto"
      ? new Set(indexer.getCommittedSummaries().flatMap((summary) => summary.toolCallIds))
      : undefined;

  return messages.filter((msg) => {
    if (msg.role !== "toolResult" || !indexer.isSummarized(msg.toolCallId)) {
      return true;
    }
    return committedToolCallIds ? !committedToolCallIds.has(msg.toolCallId) : false;
  });
}

function summaryKeyFromMessage(msg: any): string | null {
  if (msg?.role !== "custom" || msg.customType !== CUSTOM_TYPE_SUMMARY) return null;
  const ids = normalizeSummaryToolCallRefs(msg.details).map((r) => r.toolCallId);
  if (ids.length === 0) return null;
  return summaryToolCallKey(ids);
}

/**
 * Find where a batch summary should sit: after the first assistant toolCall
 * block it covers (and any remaining toolResults that still follow it).
 */
function findSummaryInsertIndex(messages: any[], toolCallIds: string[]): number | undefined {
  const idSet = new Set(toolCallIds);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg?.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const has = msg.content.some(
      (block: any) => block?.type === "toolCall" && typeof block.id === "string" && idSet.has(block.id),
    );
    if (!has) continue;
    let j = i + 1;
    while (
      j < messages.length &&
      (messages[j]?.role === "toolResult" ||
        (messages[j]?.role === "custom" && messages[j]?.customType === CUSTOM_TYPE_SUMMARY))
    ) {
      j++;
    }
    return j;
  }
  return undefined;
}

/**
 * agentic-auto only: normalize stored batch summaries near pruned toolCalls.
 * Pure function — no IO. Existing managed summaries are removed first, then
 * only fully committed summaries with a covered toolCall still in context return.
 *
 * Why here (not flush/steer): context_prune runs while isStreaming, so steer
 * would re-wake the agent. Injecting on every LLM context build is timing-safe.
 */
export function injectSummaries(
  messages: any[],
  indexer: ToolCallIndexer,
  pruneOn: PruneOn,
): any[] {
  if (pruneOn !== "agentic-auto") return messages;

  const storedSummaries = indexer.getSummaries();
  if (storedSummaries.length === 0) return messages;

  const storedKeys = new Set(
    storedSummaries.map((summary) => summaryToolCallKey(summary.toolCallIds)),
  );
  const existingByKey = new Map<string, any>();
  const result = messages.filter((msg) => {
    const key = summaryKeyFromMessage(msg);
    if (!key || !storedKeys.has(key)) return true;
    if (!existingByKey.has(key)) existingByKey.set(key, msg);
    return false;
  });
  const committedByKey = new Map(
    indexer
      .getCommittedSummaries()
      .map((summary) => [summaryToolCallKey(summary.toolCallIds), summary]),
  );

  for (const [key, summary] of committedByKey) {
    const insertAt = findSummaryInsertIndex(result, summary.toolCallIds);
    if (insertAt === undefined) continue;

    const existing = existingByKey.get(key);
    result.splice(
      insertAt,
      0,
      existing?.content === summary.content
        ? existing
        : {
            role: "custom",
            customType: CUSTOM_TYPE_SUMMARY,
            content: summary.content,
            display: false,
            details: summary.details,
          },
    );
  }

  const unchanged =
    result.length === messages.length && result.every((msg, index) => msg === messages[index]);
  return unchanged ? messages : result;
}
