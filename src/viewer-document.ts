import type { ToolCallIndexer } from "./indexer.js";
import {
  normalizeSummaryToolCallRefs,
  unwrapSummaryForDisplay,
  type SummaryToolCallRef,
} from "./summary-refs.js";
import { CUSTOM_TYPE_SUMMARY } from "./types.js";

export type ViewerRowKind = "user" | "assistant" | "toolResult" | "summary" | "other";

export interface ViewerLinkedTool {
  shortId: string;
  toolCallId: string;
  toolName: string;
  /** Full original may be empty on the wire; use /api/original?id= when needed. */
  originalBody: string;
  originalChars: number;
  isError: boolean;
}

export interface ViewerRow {
  id: string;
  kind: ViewerRowKind;
  roleLabel: string;
  preview: string;
  body: string;
  agentVisible: boolean;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  pruned?: boolean;
  summaryChars?: number;
  summarizerModel?: string;
  toolCallRefs?: SummaryToolCallRef[];
  linkedTools?: ViewerLinkedTool[];
}

export interface ViewerDocumentMeta {
  sessionId: string;
  sessionLabel: string;
  timestamp: number;
}

export interface ViewerDocument {
  sessionId: string;
  sessionLabel: string;
  timestamp: number;
  rows: ViewerRow[];
  stats: {
    messageCount: number;
    prunedToolCount: number;
    summaryCount: number;
    /** Raw session branch entries fed into the builder (for empty-state diagnosis). */
    branchEntryCount: number;
  };
}

/** toolCallId → full original tool result text (sidecar for the web viewer). */
export type ViewerOriginals = Record<string, string>;

const PREVIEW_MAX = 140;
/** Cap row body in the snapshot so /api/latest stays browser-friendly. */
const BODY_MAX = 48_000;

function previewOf(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.length <= PREVIEW_MAX) return firstLine;
  return firstLine.slice(0, PREVIEW_MAX - 1) + "…";
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
      continue;
    }
    if (b.type === "toolCall") {
      const id = typeof b.id === "string" ? b.id : "?";
      const name = typeof b.name === "string" ? b.name : "tool";
      const args = b.arguments !== undefined ? JSON.stringify(b.arguments) : "";
      parts.push(`[toolCall ${name} ${id}] ${args}`.trim());
    }
  }
  return parts.join("\n");
}

function capBody(body: string): string {
  if (body.length <= BODY_MAX) return body;
  return (
    body.slice(0, BODY_MAX) +
    `\n…[truncated ${body.length - BODY_MAX} chars in viewer; full text still in session]`
  );
}

function makeRow(
  id: string,
  kind: ViewerRowKind,
  roleLabel: string,
  body: string,
  extra: Partial<ViewerRow> = {},
): ViewerRow {
  const capped = capBody(body);
  return {
    id,
    kind,
    roleLabel,
    body: capped,
    preview: previewOf(body),
    agentVisible: true,
    ...extra,
  };
}

/**
 * Pure transform: session branch entries + indexer → ViewerDocument for the web UI.
 * Timeline matches agent-visible context (pruned toolResults omitted); originals hang off summary rows.
 */
export function buildViewerDocument(
  branch: unknown[],
  indexer: ToolCallIndexer,
  meta: ViewerDocumentMeta,
): ViewerDocument {
  const rows: ViewerRow[] = [];
  let prunedToolCount = 0;
  let summaryCount = 0;
  let seq = 0;

  for (const raw of branch) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;

    if (entry.type === "custom_message" && entry.customType === CUSTOM_TYPE_SUMMARY) {
      const stored = typeof entry.content === "string" ? entry.content : "";
      const summaryText = unwrapSummaryForDisplay(stored);
      const refs = normalizeSummaryToolCallRefs(entry.details);
      const linkedTools: ViewerLinkedTool[] = [];
      for (const ref of refs) {
        const record = indexer.getRecord(ref.toolCallId);
        const originalBody = record?.resultText ?? "";
        linkedTools.push({
          shortId: ref.shortId,
          toolCallId: ref.toolCallId,
          toolName: record?.toolName ?? "?",
          originalBody,
          originalChars: originalBody.length,
          isError: record?.isError ?? false,
        });
      }
      prunedToolCount += linkedTools.length;
      summaryCount += 1;
      const detailsObj =
        entry.details && typeof entry.details === "object"
          ? (entry.details as Record<string, unknown>)
          : {};
      const summarizerModel =
        typeof detailsObj.summarizerModel === "string" && detailsObj.summarizerModel.length > 0
          ? detailsObj.summarizerModel
          : undefined;
      rows.push(
        makeRow(`row-${seq++}`, "summary", "summary", summaryText, {
          summaryChars: summaryText.length,
          summarizerModel,
          toolCallRefs: refs,
          linkedTools,
        }),
      );
      continue;
    }

    if (entry.type !== "message") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object") continue;
    const role = message.role;

    if (role === "user") {
      const body = textFromContent(message.content);
      rows.push(makeRow(`row-${seq++}`, "user", "user", body));
      continue;
    }

    if (role === "assistant") {
      const body = textFromContent(message.content);
      rows.push(makeRow(`row-${seq++}`, "assistant", "assistant", body));
      continue;
    }

    if (role === "toolResult") {
      const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
      if (toolCallId && indexer.isSummarized(toolCallId)) {
        // Agent-visible timeline omits pruned toolResults (same as pruneMessages).
        continue;
      }
      const body = textFromContent(message.content);
      const toolName = typeof message.toolName === "string" ? message.toolName : "tool";
      rows.push(
        makeRow(`row-${seq++}`, "toolResult", "toolResult", body, {
          toolName,
          toolCallId: toolCallId || undefined,
          isError: message.isError === true,
        }),
      );
      continue;
    }
  }

  return {
    sessionId: meta.sessionId,
    sessionLabel: meta.sessionLabel,
    timestamp: meta.timestamp,
    rows,
    stats: {
      messageCount: rows.length,
      prunedToolCount,
      summaryCount,
      branchEntryCount: branch.length,
    },
  };
}

/**
 * Move full originalBodies into a sidecar map and leave empty strings on the wire document.
 * Keeps /api/latest small; page fetches /api/original?id= on expand.
 */
export function stripOriginalsForWire(doc: ViewerDocument): {
  document: ViewerDocument;
  originals: ViewerOriginals;
} {
  const originals: ViewerOriginals = {};
  const rows = doc.rows.map((row) => {
    if (!row.linkedTools || row.linkedTools.length === 0) return row;
    const linkedTools = row.linkedTools.map((t) => {
      if (t.originalBody) originals[t.toolCallId] = t.originalBody;
      return { ...t, originalBody: "" };
    });
    return { ...row, linkedTools };
  });
  return { document: { ...doc, rows }, originals };
}
