import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Must set BEFORE importing viewer-server — getters read env at call time,
// but isolation fails if we publish/listen against the live ~/.pi + :17342.
const testHome = mkdtempSync(join(tmpdir(), "pruner-viewer-"));
// High ephemeral port; avoids colliding with a live pi viewer on 17342.
const testPort = String(18000 + (process.pid % 1000));
process.env.PI_CONTEXT_PRUNE_HOME = testHome;
process.env.PI_CONTEXT_PRUNE_VIEWER_PORT = testPort;

const { ToolCallIndexer } = await import("../src/indexer.ts");
const { buildViewerDocument } = await import("../src/viewer-document.ts");
const {
  getViewerUrl,
  __stopViewerServerForTests,
  openViewer,
  publishViewerDocument,
} = await import("../src/viewer-server.ts");

afterEach(() => {
  __stopViewerServerForTests();
});

describe("viewer server (no browser)", () => {
  test("starts HTTP server without opening a browser and serves latest", async () => {
    const base = getViewerUrl();
    const doc = buildViewerDocument([], new ToolCallIndexer(), {
      sessionId: "t1",
      sessionLabel: "t1",
      timestamp: 42,
    });
    await publishViewerDocument(doc);

    const first = await openViewer({ openBrowser: false });
    expect(first.url.startsWith(base)).toBe(true);
    expect(first.openedBrowser).toBe(false);

    const health = await fetch(`${base}api/health`).then((r) => r.text());
    expect(health).toBe("ok");

    const latest = await fetch(`${base}api/latest`).then((r) => r.json());
    expect(latest.sessionId).toBe("t1");
    expect(latest.timestamp).toBe(42);

    const second = await openViewer({ openBrowser: false });
    expect(second.openedBrowser).toBe(false);
  });

  test("last publish wins for /api/latest", async () => {
    const base = getViewerUrl();
    await publishViewerDocument(
      buildViewerDocument([], new ToolCallIndexer(), {
        sessionId: "old",
        sessionLabel: "old",
        timestamp: 1,
      }),
    );
    await openViewer({ openBrowser: false });

    await publishViewerDocument(
      buildViewerDocument([], new ToolCallIndexer(), {
        sessionId: "new",
        sessionLabel: "new",
        timestamp: 99,
      }),
    );

    const latest = await fetch(`${base}api/latest`).then((r) => r.json());
    expect(latest.sessionId).toBe("new");
    expect(latest.timestamp).toBe(99);
  });

  test("does not write into ~/.pi/agent/context-prune", async () => {
    const { join: j } = await import("node:path");
    const { homedir } = await import("node:os");
    const { existsSync, readFileSync } = await import("node:fs");
    const live = j(homedir(), ".pi", "agent", "context-prune", "viewer-latest.json");
    const before = existsSync(live) ? readFileSync(live, "utf-8") : null;

    await publishViewerDocument(
      buildViewerDocument([], new ToolCallIndexer(), {
        sessionId: "isolate-check",
        sessionLabel: "isolate-check",
        timestamp: 123,
      }),
    );

    const after = existsSync(live) ? readFileSync(live, "utf-8") : null;
    expect(after).toBe(before);
    // And the isolated home got the publish:
    const isolated = readFileSync(j(testHome, "viewer-latest.json"), "utf-8");
    expect(JSON.parse(isolated).sessionId).toBe("isolate-check");
  });

  test("publish strips originalBody; /api/original serves it", async () => {
    const base = getViewerUrl();
    const doc = buildViewerDocument([], new ToolCallIndexer(), {
      sessionId: "orig",
      sessionLabel: "orig",
      timestamp: 7,
    });
    // Inject a summary-like row with original body as publish would receive from builder.
    doc.rows.push({
      id: "row-s",
      kind: "summary",
      roleLabel: "summary",
      preview: "s",
      body: "summary text",
      agentVisible: true,
      summaryChars: 12,
      linkedTools: [
        {
          shortId: "t1",
          toolCallId: "call-xyz",
          toolName: "bash",
          originalBody: "FULL ORIGINAL OUTPUT",
          originalChars: 20,
          isError: false,
        },
        {
          shortId: "t2",
          toolCallId: "call-empty",
          toolName: "bash",
          originalBody: "",
          originalChars: 0,
          isError: false,
        },
      ],
    });
    await publishViewerDocument(doc);
    await openViewer({ openBrowser: false });

    const latest = await fetch(`${base}api/latest`).then((r) => r.json());
    expect(latest.rows[0].linkedTools[0].originalBody).toBe("");
    expect(latest.rows[0].linkedTools[0].originalChars).toBe(20);

    const orig = await fetch(`${base}api/original?id=call-xyz`).then((r) => r.json());
    expect(orig.text).toBe("FULL ORIGINAL OUTPUT");

    // Empty string is a valid original (not missing).
    const empty = await fetch(`${base}api/original?id=call-empty`).then((r) => r.json());
    expect(empty.text).toBe("");

    // Second expand still hits (mtime cache must not break after publish).
    const again = await fetch(`${base}api/original?id=call-xyz`).then((r) => r.json());
    expect(again.text).toBe("FULL ORIGINAL OUTPUT");
  });

  test("already-running openViewer with forceOpen still reports alreadyRunning", async () => {
    await publishViewerDocument(
      buildViewerDocument([], new ToolCallIndexer(), {
        sessionId: "force",
        sessionLabel: "force",
        timestamp: 1,
      }),
    );
    const first = await openViewer({ openBrowser: false });
    expect(first.alreadyRunning).toBe(false);
    const second = await openViewer({ openBrowser: false, forceOpen: true });
    expect(second.alreadyRunning).toBe(true);
    // openBrowser:false always wins over forceOpen for tests.
    expect(second.openedBrowser).toBe(false);
  });
});
