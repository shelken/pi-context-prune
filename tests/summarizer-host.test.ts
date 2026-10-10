import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const cli = process.env.PRUNER_HOST_CLI;
const modes = cli === "omp" ? ["compatible"] : ["compatible", "native"];

describe.skipIf(!cli)("real host summarizer streaming", () => {
  for (const mode of modes) {
    test(`${cli} / ${mode}: returns streamed text and usage`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "pruner-host-"));
      let requests = 0;
      const server = createServer(async (req, res) => {
        if (!req.url?.endsWith("/chat/completions")) {
          res.writeHead(404).end();
          return;
        }
        requests++;
        for await (const _chunk of req) {}
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const chunk = (choices: unknown[], usage?: unknown) => res.write("data: " + JSON.stringify({
          id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices, usage,
        }) + "\n\n");
        chunk([{ index: 0, delta: { role: "assistant", content: "PROBE_" }, finish_reason: null }]);
        chunk([{ index: 0, delta: { content: "SUMMARY" }, finish_reason: null }]);
        chunk([{ index: 0, delta: {}, finish_reason: "stop" }]);
        chunk([], { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 });
        res.end("data: [DONE]\n\n");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;
      const resultPath = join(dir, "result.json");
      try {
        const flags = cli === "omp" ? ["--no-rules", "--no-title", "--no-lsp"] : ["--no-mcp", "--no-context-files", "--offline"];
        const child = spawn(cli!, [
          "--no-extensions", "-e", join(import.meta.dir, "fixtures/summarizer-host-extension.ts"),
          "--no-skills", "--no-tools", "--no-session", "--model", "pruner-probe/fixture",
          ...flags, "-p", "Reply with the fixture token.",
        ], {
          cwd: dir,
          env: {
            ...process.env, HOME: dir, PI_CODING_AGENT_DIR: dir, OMP_PROFILE: "", PI_PROFILE: "",
            XDG_CONFIG_HOME: join(dir, "config"), XDG_CACHE_HOME: join(dir, "cache"),
            XDG_DATA_HOME: join(dir, "data"), XDG_STATE_HOME: join(dir, "state"),
            PRUNER_PROBE_MODE: mode,
            PRUNER_PROBE_URL: `http://127.0.0.1:${port}/v1`, PRUNER_PROBE_RESULT: resultPath,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (data) => { output += data; });
        child.stderr.on("data", (data) => { output += data; });
        const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
        try {
          const code = await new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", resolve);
          });
          expect(code, output).toBe(0);
          expect(output).toContain("PROBE_SUMMARY");
          const evidence = JSON.parse(readFileSync(resultPath, "utf8"));
          expect(evidence.notifications).toEqual([]);
          expect(evidence.result?.summaryText).toBe("PROBE_SUMMARY");
          expect(evidence.result?.usage.input).toBe(7);
          expect(evidence.result?.usage.output).toBe(3);
          expect(evidence.progress.some((chars: number) => chars > 0)).toBe(true);
          expect(requests).toBeGreaterThanOrEqual(2);
          if (mode === "native") {
            expect(evidence.streamCalls).toEqual([{ baseUrl: `http://127.0.0.1:${port}/v1`, marker: "resolved-auth" }]);
          }
          console.log(JSON.stringify({ host: cli, mode, requests, ...evidence }));
        } finally {
          clearTimeout(timer);
          if (child.exitCode === null) child.kill("SIGKILL");
        }
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(dir, { recursive: true, force: true });
      }
    }, 40000);
  }
});
