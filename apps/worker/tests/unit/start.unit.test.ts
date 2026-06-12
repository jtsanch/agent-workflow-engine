import { describe, expect, it, vi } from "vitest";
import { waitForActiveRun } from "../../src/runtime/shutdown.js";

describe("worker start helpers", () => {
  it("waits for the active run to finish within the shutdown grace period", async () => {
    vi.useFakeTimers();

    const activeRun = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 20);
    });

    const waiting = waitForActiveRun(activeRun, 50);
    await vi.advanceTimersByTimeAsync(25);

    await expect(waiting).resolves.toBe(true);
    vi.useRealTimers();
  });

  it("times out when the active run exceeds the shutdown grace period", async () => {
    vi.useFakeTimers();

    const activeRun = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 100);
    });

    const waiting = waitForActiveRun(activeRun, 30);
    await vi.advanceTimersByTimeAsync(35);

    await expect(waiting).resolves.toBe(false);
    vi.useRealTimers();
  });
});
