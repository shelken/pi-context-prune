/**
 * Run async work over indices with a fixed concurrency ceiling.
 * Results preserve input order. Workers pull the next index until drained.
 */
export async function mapPool<T>(
  length: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  if (length === 0) return [];
  const results = new Array<T>(length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency, length));

  async function runWorker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= length) return;
      results[i] = await worker(i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
