import { describe, expect, test } from "bun:test";
import { runCancellableFlush } from "../src/cancellable-flush.ts";

describe("runCancellableFlush", () => {
  test("passes an independent signal and waits for restore before returning on abort", async () => {
    const events: string[] = [];
    let abortFn: (() => void) | undefined;
    let seenSignal: AbortSignal | undefined;

    const done = runCancellableFlush({
      bindAbort: (abort) => {
        abortFn = abort;
      },
      flush: async (signal) => {
        seenSignal = signal;
        events.push("flush-start");
        // Simulate Esc while the summarizer is running.
        abortFn?.();
        expect(signal.aborted).toBe(true);
        // Simulate pending-batch restoration that must finish before return.
        await Promise.resolve();
        events.push("pending-restored");
        return { ok: false as const, reason: "aborted" };
      },
    });

    // Command must not resolve before restore completes.
    events.push("command-waiting");
    const { result, aborted } = await done;
    events.push("command-returned");

    expect(aborted).toBe(true);
    expect(result).toEqual({ ok: false, reason: "aborted" });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(events).toEqual([
      "flush-start",
      "command-waiting",
      "pending-restored",
      "command-returned",
    ]);
  });

  test("a later invocation can run after a cancelled one without already-flushing", async () => {
    let isFlushing = false;
    const flush = async (signal: AbortSignal) => {
      if (isFlushing) return { ok: false as const, reason: "already-flushing" };
      isFlushing = true;
      try {
        if (signal.aborted) return { ok: false as const, reason: "aborted" };
        return { ok: true as const, reason: "flushed" };
      } finally {
        isFlushing = false;
      }
    };

    let abortFirst: (() => void) | undefined;
    const first = runCancellableFlush({
      bindAbort: (abort) => {
        abortFirst = abort;
      },
      flush: async (signal) => {
        abortFirst?.();
        await Promise.resolve();
        return flush(signal);
      },
    });
    const firstResult = await first;
    expect(firstResult.aborted).toBe(true);

    const second = await runCancellableFlush({
      bindAbort: () => {},
      flush,
    });
    expect(second.result).toEqual({ ok: true, reason: "flushed" });
    expect(second.aborted).toBe(false);
  });
});
