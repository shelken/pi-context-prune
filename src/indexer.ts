import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CapturedBatch, IndexEntryData, ToolCallRecord } from "./types.js";
import { CUSTOM_TYPE_INDEX, CUSTOM_TYPE_SUMMARY } from "./types.js";
import {
  buildShortToolCallRefs,
  normalizeSummaryToolCallRefs,
  type SummaryToolCallRef,
} from "./summary-refs.js";

/** One prune-batch summary stored for agentic-auto context injection. */
export interface StoredSummary {
  content: string;
  toolCallIds: string[];
  details: unknown;
}

function summaryKey(toolCallIds: string[]): string {
  return toolCallIds.slice().sort().join("\0");
}

export class ToolCallIndexer {
  private index = new Map<string, ToolCallRecord>();
  private aliasToToolCallId = new Map<string, string>();
  private nextShortAliasNumber = 1;
  /** Batch summaries keyed by sorted toolCallId set — source for agentic-auto inject. */
  private summaries = new Map<string, StoredSummary>();

  /**
   * Rebuilds the in-memory index from session history by scanning all
   * custom entries with customType === CUSTOM_TYPE_INDEX.
   */
  reconstructFromSession(ctx: ExtensionContext): void {
    this.index.clear();
    this.aliasToToolCallId.clear();
    this.nextShortAliasNumber = 1;
    this.summaries.clear();

    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (entry.type === "custom" && (entry as any).customType === CUSTOM_TYPE_INDEX) {
        const data = (entry as any).data as IndexEntryData;
        if (data && Array.isArray(data.toolCalls)) {
          for (const toolCall of data.toolCalls) {
            this.index.set(toolCall.toolCallId, toolCall);
          }
        }
        continue;
      }

      if (entry.type === "custom_message" && (entry as any).customType === CUSTOM_TYPE_SUMMARY) {
        // 恢复 summary 文本供 agentic-auto 的 context 注入（不依赖 steer 投递）
        const content = typeof (entry as any).content === "string" ? (entry as any).content : "";
        this.recordSummary(content, (entry as any).details);
      }
    }
  }

  /**
   * Returns true if the given toolCallId has been summarized (exists in index).
   */
  isSummarized(toolCallId: string): boolean {
    return this.index.has(toolCallId);
  }

  /**
   * Returns the full runtime index map.
   */
  getIndex(): Map<string, ToolCallRecord> {
    return this.index;
  }

  /**
   * Register short aliases for a summary message so future recovery queries can
   * resolve the short ids back to the persisted toolCallIds.
   */
  registerSummaryRefs(refs: SummaryToolCallRef[]): void {
    for (const ref of refs) {
      if (!ref.shortId || !ref.toolCallId) continue;
      if (ref.shortId !== ref.toolCallId) {
        this.aliasToToolCallId.set(ref.shortId, ref.toolCallId);
      }
      const match = /^t(\d+)$/.exec(ref.shortId);
      if (match) {
        this.nextShortAliasNumber = Math.max(this.nextShortAliasNumber, Number(match[1]) + 1);
      }
    }
  }

  /**
   * Store a batch summary for later context injection (agentic-auto).
   * Also registers short-id aliases from details. Dedupes by toolCallId set.
   */
  recordSummary(content: string, details: unknown): void {
    const refs = normalizeSummaryToolCallRefs(details);
    this.registerSummaryRefs(refs);
    const toolCallIds = refs.map((r) => r.toolCallId);
    if (toolCallIds.length === 0 || !content) return;
    const key = summaryKey(toolCallIds);
    if (this.summaries.has(key)) return;
    this.summaries.set(key, { content, toolCallIds, details });
  }

  /** All stored batch summaries (order of first insertion). */
  getSummaries(): StoredSummary[] {
    return [...this.summaries.values()];
  }

  /**
   * Allocates short aliases for a batch's tool calls and registers them in the
   * runtime alias map.
   */
  allocateSummaryRefs(batch: CapturedBatch): SummaryToolCallRef[] {
    const toolCallIds = batch.toolCalls.map((tc) => tc.toolCallId);
    const { refs, nextIndex } = buildShortToolCallRefs(toolCallIds, this.nextShortAliasNumber);
    this.nextShortAliasNumber = nextIndex;
    return refs;
  }

  /**
   * Resolve a short alias or a full toolCallId to the canonical toolCallId.
   */
  resolveToolCallId(toolCallIdOrAlias: string): string | undefined {
    if (this.index.has(toolCallIdOrAlias)) return toolCallIdOrAlias;
    return this.aliasToToolCallId.get(toolCallIdOrAlias);
  }

  /**
   * Look up a single record by toolCallId or short alias (used by query tool).
   */
  getRecord(toolCallIdOrAlias: string): ToolCallRecord | undefined {
    const resolved = this.resolveToolCallId(toolCallIdOrAlias);
    if (!resolved) return undefined;
    return this.index.get(resolved);
  }

  /**
   * Looks up multiple tool call records by ID. Skips any IDs not found.
   */
  lookupToolCalls(toolCallIds: string[]): ToolCallRecord[] {
    const results: ToolCallRecord[] = [];
    for (const id of toolCallIds) {
      const record = this.getRecord(id);
      if (record !== undefined) {
        results.push(record);
      }
    }
    return results;
  }

  /**
   * Adds all tool calls from a captured batch to the runtime index and
   * persists an IndexEntryData entry to the session via pi.appendEntry.
   */
  addBatch(batch: CapturedBatch, pi: ExtensionAPI): void {
    const records: ToolCallRecord[] = [];

    for (const tc of batch.toolCalls) {
      const record: ToolCallRecord = {
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
        resultText: tc.resultText,
        isError: tc.isError,
        turnIndex: batch.turnIndex,
        timestamp: batch.timestamp,
      };
      this.index.set(record.toolCallId, record);
      records.push(record);
    }

    pi.appendEntry(CUSTOM_TYPE_INDEX, { toolCalls: records } as IndexEntryData);
  }
}
