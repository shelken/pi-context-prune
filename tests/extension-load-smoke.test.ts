import { describe, expect, test } from "bun:test";

describe("extension load smoke", () => {
  test("default export is an extension factory and stream import resolves", async () => {
    const mod = await import("../index.ts");
    expect(typeof mod.default).toBe("function");

    // Ensure the summarizer's runtime stream import is loadable under Pi 0.80.x
    const { stream } = await import("@earendil-works/pi-ai/compat");
    expect(typeof stream).toBe("function");
  });
});
