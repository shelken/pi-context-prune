import { createServer, type Server } from "node:http";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import {
  stripOriginalsForWire,
  type ViewerDocument,
  type ViewerOriginals,
} from "./viewer-document.js";
import { VIEWER_PAGE_HTML } from "./viewer-page.js";

/** Fixed port so every pi process opens the same local viewer. Override with PI_CONTEXT_PRUNE_VIEWER_PORT (tests). */
export function getViewerPort(): number {
  const raw = process.env.PI_CONTEXT_PRUNE_VIEWER_PORT;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return 17342;
}
export const VIEWER_PORT = getViewerPort();
export function getViewerUrl(): string {
  return `http://127.0.0.1:${getViewerPort()}/`;
}
export const VIEWER_URL = getViewerUrl();
/** Bump when HTML shell changes; used to detect a stale in-memory server from an older pi process. */
export const VIEWER_UI_MARKER = 'data-pruner-viewer="3"';

// Tests must set PI_CONTEXT_PRUNE_HOME so they never clobber the live snapshot.
function viewerDir(): string {
  const override = process.env.PI_CONTEXT_PRUNE_HOME;
  if (override && override.length > 0) return override;
  return join(homedir(), ".pi", "agent", "context-prune");
}

export function getViewerSnapshotPath(): string {
  return join(viewerDir(), "viewer-latest.json");
}
export function getViewerOriginalsPath(): string {
  return join(viewerDir(), "viewer-originals.json");
}
export function getViewerPagePath(): string {
  return join(viewerDir(), "viewer.html");
}
// Back-compat exports (resolved at call time via helpers where possible).
export const VIEWER_SNAPSHOT_PATH = getViewerSnapshotPath();
export const VIEWER_PAGE_PATH = getViewerPagePath();

// Last-tab-close: page posts /api/heartbeat every 3s + sendBeacon(/api/bye) on pagehide.
// Idle must be long — short timeouts kill the server mid-load (1MB+ JSON) and leave the tab stuck on "loading…".
// Use node:http (not Bun.serve): Pi loads extensions under Node.
const IDLE_MS = 30 * 60_000;
const IDLE_CHECK_MS = 15_000;

type ServerHandle = {
  stop: () => void;
};

// Survive extension hot-reload: module locals reset, but the previous listen()
// stays bound on the same Node process. Keep the handle on globalThis so the
// next load can close it before binding again.
const GLOBAL_KEY = "__piContextPruneViewerServer";

type GlobalViewerState = {
  handle: ServerHandle | null;
  lastHeartbeat: number;
  idleTimer: ReturnType<typeof setInterval> | null;
};

function globalState(): GlobalViewerState {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: GlobalViewerState;
  };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { handle: null, lastHeartbeat: 0, idleTimer: null };
  }
  return g[GLOBAL_KEY]!;
}

function getLocalServer(): ServerHandle | null {
  return globalState().handle;
}

function setLocalServer(handle: ServerHandle | null): void {
  globalState().handle = handle;
}

async function ensureDir(): Promise<void> {
  await mkdir(viewerDir(), { recursive: true });
}

/** Always rewrite the page asset so the next GET / picks up UI changes after extension reload. */
export async function publishViewerAssets(): Promise<void> {
  await ensureDir();
  const pagePath = getViewerPagePath();
  const tmp = `${pagePath}.tmp`;
  await writeFile(tmp, VIEWER_PAGE_HTML, "utf-8");
  await rename(tmp, pagePath);
}

export async function publishViewerDocument(doc: ViewerDocument): Promise<void> {
  await ensureDir();
  // Keep UI asset in sync with every publish (covers extension upgrades).
  await publishViewerAssets();
  const { document: wire, originals } = stripOriginalsForWire(doc);
  const snapPath = getViewerSnapshotPath();
  const snapTmp = `${snapPath}.tmp`;
  await writeFile(snapTmp, JSON.stringify(wire), "utf-8");
  await rename(snapTmp, snapPath);
  const origPath = getViewerOriginalsPath();
  const origTmp = `${origPath}.tmp`;
  await writeFile(origTmp, JSON.stringify(originals), "utf-8");
  await rename(origTmp, origPath);
}

async function readOriginalBody(id: string): Promise<string | null> {
  if (!id) return null;
  try {
    const raw = await readFile(getViewerOriginalsPath(), "utf-8");
    const map = JSON.parse(raw) as ViewerOriginals;
    if (map && typeof map[id] === "string") return map[id];
    return null;
  } catch {
    return null;
  }
}

async function readLatestSnapshot(): Promise<string> {
  try {
    return await readFile(getViewerSnapshotPath(), "utf-8");
  } catch {
    return JSON.stringify({
      sessionId: "empty",
      sessionLabel: "empty",
      timestamp: 0,
      rows: [],
      stats: { messageCount: 0, prunedToolCount: 0, summaryCount: 0, branchEntryCount: 0 },
    });
  }
}

async function readPageHtml(): Promise<string> {
  try {
    return await readFile(getViewerPagePath(), "utf-8");
  } catch {
    return VIEWER_PAGE_HTML;
  }
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function isViewerUp(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${getViewerPort()}/api/health`, {
      signal: AbortSignal.timeout(400),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** True when the process on the viewer port is serving the current UI shell (not an old in-memory page). */
async function isViewerUiCurrent(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${getViewerPort()}/?probe=${Date.now()}`, {
      signal: AbortSignal.timeout(800),
      headers: { "cache-control": "no-store" },
    });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes(VIEWER_UI_MARKER);
  } catch {
    return false;
  }
}

/** Stop the in-process viewer server (session_shutdown / reload / idle). */
export function stopViewerServer(): void {
  const state = globalState();
  if (state.idleTimer) {
    clearInterval(state.idleTimer);
    state.idleTimer = null;
  }
  if (state.handle) {
    state.handle.stop();
    state.handle = null;
  }
}

function armIdleWatch(): void {
  const state = globalState();
  if (state.idleTimer) return;
  state.idleTimer = setInterval(() => {
    const s = globalState();
    if (!s.handle) return;
    if (Date.now() - s.lastHeartbeat > IDLE_MS) {
      stopViewerServer();
    }
  }, IDLE_CHECK_MS);
  state.idleTimer.unref?.();
}

function send(
  res: import("node:http").ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, headers);
  res.end(body);
}

function startLocalServer(): Promise<void> {
  // Hot-reload leaves the previous listen() alive; always take ownership cleanly.
  if (getLocalServer()) {
    stopViewerServer();
  }

  globalState().lastHeartbeat = Date.now();

  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", getViewerUrl());
      const method = req.method ?? "GET";

      void (async () => {
        try {
          if (url.pathname === "/api/health") {
            send(res, 200, "ok", { "cache-control": "no-store" });
            return;
          }
          if (url.pathname === "/api/heartbeat" && method === "POST") {
            globalState().lastHeartbeat = Date.now();
            send(res, 200, "ok", { "cache-control": "no-store" });
            return;
          }
          if (url.pathname === "/api/bye" && (method === "POST" || method === "GET")) {
            globalState().lastHeartbeat = Date.now() - IDLE_MS;
            send(res, 200, "ok", { "cache-control": "no-store" });
            return;
          }
          if (url.pathname === "/api/meta") {
            globalState().lastHeartbeat = Date.now();
            const raw = await readLatestSnapshot();
            let meta = {
              sessionId: "empty",
              timestamp: 0,
              messageCount: 0,
            };
            try {
              const doc = JSON.parse(raw) as {
                sessionId?: string;
                timestamp?: number;
                stats?: { messageCount?: number };
              };
              meta = {
                sessionId: doc.sessionId ?? "empty",
                timestamp: doc.timestamp ?? 0,
                messageCount: doc.stats?.messageCount ?? 0,
              };
            } catch {
              // keep empty meta
            }
            send(res, 200, JSON.stringify(meta), {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            });
            return;
          }
          if (url.pathname === "/api/original") {
            globalState().lastHeartbeat = Date.now();
            const id = url.searchParams.get("id") ?? "";
            const text = await readOriginalBody(id);
            if (text == null) {
              send(res, 404, JSON.stringify({ error: "not found", id }), {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              });
              return;
            }
            send(res, 200, JSON.stringify({ id, text }), {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            });
            return;
          }
          if (url.pathname === "/api/latest") {
            globalState().lastHeartbeat = Date.now();
            const body = await readLatestSnapshot();
            send(res, 200, body, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            });
            return;
          }
          if (url.pathname === "/" || url.pathname === "/index.html") {
            globalState().lastHeartbeat = Date.now();
            // Always read from disk so UI upgrades apply without restarting the handler body.
            const html = await readPageHtml();
            send(res, 200, html, {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store, no-cache, must-revalidate",
              pragma: "no-cache",
            });
            return;
          }
          send(res, 404, "not found");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send(res, 500, message);
        }
      })();
    });

    server.once("error", (err) => {
      reject(err);
    });

    server.listen(getViewerPort(), "127.0.0.1", () => {
      setLocalServer({
        stop: () => {
          // Drop open sockets so the port frees immediately on reload/shutdown.
          const anyServer = server as Server & { closeAllConnections?: () => void };
          anyServer.closeAllConnections?.();
          server.close();
        },
      });
      armIdleWatch();
      resolve();
    });
  });
}

export type OpenViewerOptions = {
  /** Open the system browser. Default true. Tests must pass false. */
  openBrowser?: boolean;
  /** Open even when the shared server is already up. */
  forceOpen?: boolean;
};

export type OpenViewerResult = {
  url: string;
  openedBrowser: boolean;
  alreadyRunning: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ensure the shared localhost viewer is up with the *current* UI.
 * Publish the snapshot before calling this.
 *
 * Never kill other OS processes. Auto-kill previously took down live pi sessions
 * (and their chats) that happened to own the port.
 */
export async function openViewer(options: OpenViewerOptions = {}): Promise<OpenViewerResult> {
  await publishViewerAssets();

  let alreadyRunning = false;

  if (await isViewerUp()) {
    if (await isViewerUiCurrent()) {
      // Healthy shared server (ours or another process with current UI) — reuse.
      alreadyRunning = true;
    } else if (getLocalServer()) {
      // We own a stale handler (hot-reload left old routes). Rebind this process only.
      stopViewerServer();
      await sleep(50);
    } else {
      throw new Error(
        `port ${getViewerPort()} still serves an old viewer UI from another/stuck process. ` +
          `Close that pi session, or free the port manually:\n` +
          `  kill $(lsof -t -iTCP:${getViewerPort()} -sTCP:LISTEN)`,
      );
    }
  }

  if (!alreadyRunning) {
    try {
      await startLocalServer();
    } catch (err) {
      if (await isViewerUp() && (await isViewerUiCurrent())) {
        alreadyRunning = true;
      } else {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to start pruner viewer on ${getViewerUrl()}: ${message}. ` +
            `If the port is busy: kill $(lsof -t -iTCP:${getViewerPort()} -sTCP:LISTEN)`,
        );
      }
    }
  }

  if (!(await isViewerUiCurrent())) {
    throw new Error(
      `pruner viewer UI marker missing after start — check ${getViewerPagePath()}`,
    );
  }

  globalState().lastHeartbeat = Date.now();
  const url = `${getViewerUrl()}?v=${Date.now()}`;
  // Only auto-open when we had to start the server, unless caller forceOpen.
  const shouldOpen =
    options.openBrowser !== false && (options.forceOpen === true || !alreadyRunning);
  if (shouldOpen) {
    openBrowser(url);
  }
  return { url, openedBrowser: shouldOpen, alreadyRunning };
}

/** Test/smoke helper: stop any in-process server. */
export function __stopViewerServerForTests(): void {
  stopViewerServer();
}

// Extension hot-reload re-evaluates this module: close any prior handle immediately.
stopViewerServer();
