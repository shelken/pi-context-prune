import { ToolCallIndexer } from "../../src/indexer.ts";
import { buildViewerDocument } from "../../src/viewer-document.ts";
import { agentDir } from "../../src/paths.ts";
import { getViewerSnapshotPath, getViewerUrl, openViewer, publishViewerDocument } from "../../src/viewer-server.ts";

const sessionId = process.argv[2];
const doc = buildViewerDocument([], new ToolCallIndexer(), { sessionId, sessionLabel: sessionId, timestamp: Date.now() });
doc.rows.push({
  id: "summary", kind: "summary", roleLabel: "summary", preview: sessionId,
  body: sessionId, agentVisible: true,
  linkedTools: [{ shortId: "t1", toolCallId: "shared-call", toolName: "read", originalBody: `${sessionId}-original`, originalChars: sessionId.length + 9, isError: false }],
});
await publishViewerDocument(doc);
const opened = await openViewer({ openBrowser: false });
const latest = await fetch(getViewerUrl() + "api/latest").then(r => r.json());
const original = await fetch(getViewerUrl() + "api/original?id=shared-call").then(r => r.json());
console.log(JSON.stringify({ sessionId, agentDir: agentDir(), snapshotPath: getViewerSnapshotPath(), alreadyRunning: opened.alreadyRunning, servedSessionId: latest.sessionId, originalText: original.text }));
