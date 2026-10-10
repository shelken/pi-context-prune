import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 宿主式扩展测试也会发布快照，必须隔离用户正在使用的共享 Viewer。
const viewerHome = mkdtempSync(join(tmpdir(), "pruner-test-viewer-"));
process.env.PI_CONTEXT_PRUNE_HOME = viewerHome;
process.on("exit", () => rmSync(viewerHome, { recursive: true, force: true }));
