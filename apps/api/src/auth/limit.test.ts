import { describe, expect, it } from "vitest";
import { concurrencyLimit } from "./limit.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("concurrencyLimit", () => {
  it("never runs more than `max` tasks at once and runs the rest in order", async () => {
    const limit = concurrencyLimit(2);
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const releases: (() => void)[] = [];
    const tasks = [0, 1, 2, 3].map((i) =>
      limit(async () => {
        running++;
        peak = Math.max(peak, running);
        order.push(i);
        await new Promise<void>((resolve) => releases.push(resolve));
        running--;
        return i;
      }),
    );
    await tick();
    expect(order).toEqual([0, 1]);
    while (releases.length) {
      releases.shift()?.();
      await tick();
    }
    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3]);
    expect(order).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("frees the slot when a task fails", async () => {
    const limit = concurrencyLimit(1);
    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await limit(async () => "ok")).toBe("ok");
  });
});
