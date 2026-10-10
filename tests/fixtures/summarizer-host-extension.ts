import { writeFileSync } from "node:fs";
import { stream } from "@earendil-works/pi-ai/compat";
import { summarizeBatch } from "../../src/summarizer.ts";
import { DEFAULT_CONFIG } from "../../src/types.ts";

export default function (pi: any) {
  const native = process.env.PRUNER_PROBE_MODE === "native";
  const baseUrl = process.env.PRUNER_PROBE_URL!;
  const model = {
    id: "fixture",
    name: "Fixture",
    provider: "pruner-probe",
    api: native ? "pruner-probe-api" : "openai-completions",
    baseUrl: native ? "http://127.0.0.1:1/invalid" : baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32000,
    maxTokens: 128,
  };
  const streamCalls: { baseUrl: string; marker?: string }[] = [];
  const localStream = (m: any, context: any, options: any) => {
    streamCalls.push({ baseUrl: m.baseUrl, marker: options?.env?.FIXTURE_MARKER });
    return stream({ ...m, api: "openai-completions" }, context, options);
  };
  if (native) {
    pi.registerProvider({
      id: model.provider,
      name: "Fixture",
      baseUrl,
      auth: {
        apiKey: {
          name: "Fixture key",
          resolve: async () => ({
            auth: { apiKey: "fixture-only", baseUrl }, env: { FIXTURE_MARKER: "resolved-auth" }, source: "fixture",
          }),
        },
      },
      getModels: () => [model],
      stream: localStream,
      streamSimple: localStream,
    });
  } else {
    pi.registerProvider(model.provider, {
      api: model.api, baseUrl, apiKey: "fixture-only", models: [model],
    });
  }
  pi.on("before_agent_start", async (_event: any, ctx: any) => {
    const notifications: { text: string; type: string }[] = [];
    const progress: number[] = [];
    const result = await summarizeBatch({
      turnIndex: 0, timestamp: 1, assistantText: "",
      toolCalls: [{
        toolCallId: "fixture-call", toolName: "read", args: { path: "fixture.txt" },
        resultText: "Fixed fixture output.", isError: false,
      }],
    }, { ...DEFAULT_CONFIG, summarizerThinking: "off" }, {
      model: ctx.model, modelRegistry: ctx.modelRegistry,
      ui: { notify: (text: string, type: string) => notifications.push({ text, type }) },
    }, { onTextProgress: (chars) => progress.push(chars) });
    writeFileSync(process.env.PRUNER_PROBE_RESULT!, JSON.stringify({ result, progress, notifications, streamCalls }));
  });
}
