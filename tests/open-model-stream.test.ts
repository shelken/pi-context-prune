import { describe, expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openModelStream } from "../src/summarizer.ts";

const model = { provider: "codebuddy" };
const context = { messages: [] };
const options = {};

function ctxWith(
  registry: Record<string, unknown>,
): ExtensionContext {
  return { modelRegistry: registry } as ExtensionContext;
}

describe("openModelStream", () => {
  test("uses the native host provider without entering the legacy API registry", () => {
    const expected = { source: "native" } as any;
    const calls: unknown[] = [];
    const provider = {
      stream(this: unknown, ...args: unknown[]) {
        expect(this).toBe(provider);
        calls.push(args);
        return expected;
      },
    };
    const ctx = { modelRegistry: {
      getProvider: (name: string) => {
        expect(name).toBe("codebuddy");
        return provider;
      },
      getRegisteredProviderConfig: () => { throw new Error("legacy route must not run"); },
    } } as any;

    expect(openModelStream(model, context, options, ctx, { stream: (() => {
      throw new Error("compat route must not run");
    }) as never })).toBe(expected);
    expect(calls).toEqual([[model, context, options]]);
  });

  test("uses registry streamSimple when present", () => {
    const calls: unknown[] = [];
    const streamSimple = (m: unknown, c: unknown, o: unknown) => {
      calls.push([m, c, o]);
      return { via: "custom" };
    };

    const out = openModelStream(
      model,
      context as never,
      options as never,
      ctxWith({
        getRegisteredProviderConfig: (name: string) =>
          name === "codebuddy" ? { streamSimple } : undefined,
      }),
    );

    expect(out).toEqual({ via: "custom" });
    expect(calls).toEqual([[model, context, options]]);
  });

  test("falls back to deps.stream when streamSimple is missing", () => {
    const calls: unknown[] = [];
    const fallback = (m: unknown, c: unknown, o: unknown) => {
      calls.push([m, c, o]);
      return { via: "compat" };
    };

    const out = openModelStream(
      model,
      context as never,
      options as never,
      ctxWith({
        getRegisteredProviderConfig: () => ({}),
      }),
      { stream: fallback as never },
    );

    expect(out).toEqual({ via: "compat" });
    expect(calls).toEqual([[model, context, options]]);
  });

  test("falls back when getRegisteredProviderConfig is absent", () => {
    const fallback = () => ({ via: "compat" });

    const out = openModelStream(
      model,
      context as never,
      options as never,
      ctxWith({}),
      { stream: fallback as never },
    );

    expect(out).toEqual({ via: "compat" });
  });
});
