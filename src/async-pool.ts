/**
 * Run async work over indices with a fixed concurrency ceiling.
 * Results preserve input order. Workers pull the next index until drained.
 * On the first worker error: stop scheduling new indices and rethrow after
 * in-flight workers settle (allSettled). Callers should gate side-effects
 * (UI callbacks) on a live flag or abort signal.
 */
export async function mapPool<T>(
  length: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
  options?: { signal?: AbortSignal },
): Promise<T[]> {
  if (length === 0) return [];
  const results = new Array<T>(length);
  let next = 0;
  let stop = false;
  let firstError: unknown;
  const limit = Math.max(1, Math.min(concurrency, length));

  async function runWorker(): Promise<void> {
    while (!stop && !options?.signal?.aborted) {
      const i = next++;
      if (i >= length) return;
      try {
        results[i] = await worker(i);
      } catch (err) {
        stop = true;
        if (firstError === undefined) firstError = err;
        // Don't rethrow here — let siblings finish/settle, then throw once.
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  if (firstError !== undefined) throw firstError;
  if (options?.signal?.aborted) {
    const err = new Error("mapPool aborted");
    err.name = "AbortError";
    throw err;
  }
  return results;
}
