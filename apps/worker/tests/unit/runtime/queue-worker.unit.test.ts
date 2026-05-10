import { describe, expect, it } from "vitest";
import { __test__ } from "../../../src/runtime/queue-worker.js";

describe("queue-worker usage helpers", () => {
  it("resets both counters when the UTC day and month have changed", () => {
    expect(
      __test__.getResetUsageState(
        {
          dailyUsed: 1200,
          dailyLimit: 60000,
          monthlyUsed: 5400,
          monthlyLimit: 300000,
          lastDailyReset: "2026-04-30T23:59:59.000Z",
          lastMonthlyReset: "2026-04-30T23:59:59.000Z"
        },
        "2026-05-01T00:00:00.000Z"
      )
    ).toEqual({
      dailyUsed: 0,
      dailyLimit: 60000,
      monthlyUsed: 0,
      monthlyLimit: 300000,
      lastDailyReset: "2026-05-01T00:00:00.000Z",
      lastMonthlyReset: "2026-05-01T00:00:00.000Z"
    });
  });

  it("detects quota exhaustion when daily or monthly usage reaches the limit", () => {
    expect(
      __test__.isQuotaExceeded({
        dailyUsed: 60000,
        dailyLimit: 60000,
        monthlyUsed: 1000,
        monthlyLimit: 300000,
        lastDailyReset: "2026-05-01T00:00:00.000Z",
        lastMonthlyReset: "2026-05-01T00:00:00.000Z"
      })
    ).toBe(true);

    expect(
      __test__.isQuotaExceeded({
        dailyUsed: 1000,
        dailyLimit: 60000,
        monthlyUsed: 300000,
        monthlyLimit: 300000,
        lastDailyReset: "2026-05-01T00:00:00.000Z",
        lastMonthlyReset: "2026-05-01T00:00:00.000Z"
      })
    ).toBe(true);
  });

  it("allows execution when both daily and monthly usage remain below the limit", () => {
    expect(
      __test__.isQuotaExceeded({
        dailyUsed: 59999,
        dailyLimit: 60000,
        monthlyUsed: 299999,
        monthlyLimit: 300000,
        lastDailyReset: "2026-05-01T00:00:00.000Z",
        lastMonthlyReset: "2026-05-01T00:00:00.000Z"
      })
    ).toBe(false);
  });
});
