import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return String(port);
}

for (const [first, second] of [["pi", "omp"], ["omp", "pi"]]) {
  test(`shared viewer follows ${first} then ${second} across agent directories`, async () => {
    const home = mkdtempSync(join(tmpdir(), "pruner-shared-host-"));
    const baseEnv = { ...process.env, HOME: home, PI_CONTEXT_PRUNE_HOME: "", PI_CONTEXT_PRUNE_VIEWER_PORT: await freePort() };
    const fixture = join(import.meta.dir, "fixtures/viewer-shared-host.ts");
    const server = Bun.spawn([process.execPath, fixture, first], {
      env: { ...baseEnv, PI_CODING_AGENT_DIR: join(home, first, "agent") }, stdout: "pipe", stderr: "pipe",
    });
    try {
      const reader = server.stdout.getReader();
      let ready = "";
      while (!ready.includes("\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error(await new Response(server.stderr).text());
        ready += new TextDecoder().decode(chunk.value);
      }
      reader.releaseLock();
      const before = JSON.parse(ready.split("\n")[0]);
      const client = Bun.spawn([process.execPath, fixture, second], {
        env: { ...baseEnv, PI_CODING_AGENT_DIR: join(home, second, "agent") }, stdout: "pipe", stderr: "pipe",
      });
      const output = await new Response(client.stdout).text();
      const error = await new Response(client.stderr).text();
      expect(await client.exited, error).toBe(0);
      const after = JSON.parse(output.trim());
      console.log(JSON.stringify({ before, after }));
      expect(after.agentDir).not.toBe(before.agentDir);
      expect(after.alreadyRunning).toBe(true);
      expect(after.servedSessionId).toBe(second);
      expect(after.originalText).toBe(`${second}-original`);
      expect(after.snapshotPath).toBe(before.snapshotPath);
    } finally {
      server.kill();
      await server.exited;
      rmSync(home, { recursive: true, force: true });
    }
  }, 15_000);
}
