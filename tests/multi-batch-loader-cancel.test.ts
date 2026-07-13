import { describe, expect, test } from "bun:test";
import { MultiBatchLoaderOverlay } from "../src/multi-batch-loader.ts";
import type { CapturedBatch } from "../src/types.ts";

const batch: CapturedBatch = {
  turnIndex: 0,
  timestamp: 1,
  assistantText: "",
  toolCalls: [
    {
      toolCallId: "tc1",
      toolName: "bash",
      args: {},
      resultText: "ok",
      isError: false,
    },
  ],
};

function fakeTui() {
  return {
    requestRender() {},
  };
}

function fakeTheme() {
  return {
    fg(_name: string, text: string) {
      return text;
    },
  };
}

describe("MultiBatchLoaderOverlay cancellation", () => {
  test("Esc and q invoke onAbort so the command can abort its local controller", () => {
    const overlay = new MultiBatchLoaderOverlay(fakeTui(), fakeTheme(), [batch]);
    let aborts = 0;
    overlay.onAbort = () => {
      aborts += 1;
    };

    expect(overlay.handleInput("\x1b")).toBe(true);
    expect(overlay.handleInput("q")).toBe(true);
    expect(overlay.handleInput("x")).toBe(false);
    expect(aborts).toBe(2);
  });

  test("progress rows still represent running, done, and skipped states", () => {
    const overlay = new MultiBatchLoaderOverlay(fakeTui(), fakeTheme(), [batch, batch]);
    expect(() => {
      overlay.markRunning(0);
      overlay.markReceivedChars(0, 12);
      overlay.markDone(0);
      overlay.markSkipped(1);
    }).not.toThrow();
  });
});
