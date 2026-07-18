import { describe, expect, test } from "bun:test";
import { mapPool } from "../src/async-pool.js";

describe("mapPool", () => {
  test("preserves order with concurrency 2", async () => {
    const started: number[] = [];
    const results = await mapPool(5, 2, async (i) => {
      started.push(i);
      await Bun.sleep(10 - i); // later indices finish first
      return i * 10;
    });
    expect(results).toEqual([0, 10, 20, 30, 40]);
  });

  test("never exceeds concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapPool(8, 3, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Bun.sleep(15);
      inFlight--;
      return 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBe(3);
  });

  test("concurrency 1 is serial", async () => {
    const order: number[] = [];
    await mapPool(3, 1, async (i) => {
      order.push(i);
      await Bun.sleep(5);
      return i;
    });
    expect(order).toEqual([0, 1, 2]);
  });
});
