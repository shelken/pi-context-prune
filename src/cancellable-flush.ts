/**
 * Run a flush that owns its own AbortController for manual commands.
 * Esc/q should call controller.abort(); this helper waits until flush settles
 * (including pending restoration) before returning so no work stays in background.
 */

export type CancellableFlushResult<T> = {
  result: T;
  aborted: boolean;
};

/**
 * Wire an independent abort controller to a flush function.
 * `bindAbort` receives the abort function so UI can map Esc/q to it.
 * The returned promise only resolves after `flush` finishes cleanup.
 */
export async function runCancellableFlush<T extends { ok: boolean; reason: string }>(args: {
  flush: (signal: AbortSignal) => Promise<T>;
  bindAbort: (abort: () => void) => void;
}): Promise<CancellableFlushResult<T>> {
  const controller = new AbortController();
  args.bindAbort(() => controller.abort());
  const result = await args.flush(controller.signal);
  return {
    result,
    aborted: result.ok === false && result.reason === "aborted",
  };
}
