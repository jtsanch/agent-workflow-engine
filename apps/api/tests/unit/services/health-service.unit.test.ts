import { describe, expect, it, vi } from "vitest";
import type { DatabaseAdapter } from "../../../src/db/database.js";
import { HealthService } from "../../../src/services/health-service.js";

describe("HealthService", () => {
  it("reports memory-backed readiness as healthy", async () => {
    const service = new HealthService({ kind: "memory" });

    await expect(service.getReadiness()).resolves.toEqual({
      ok: true,
      checks: {
        database: "ok"
      }
    });
  });

  it("reports postgres readiness as healthy when the query succeeds", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const postgresDatabase = {
      kind: "postgres",
      pool: { query }
    } as unknown as DatabaseAdapter;
    const service = new HealthService(postgresDatabase);

    await expect(service.getReadiness()).resolves.toEqual({
      ok: true,
      checks: {
        database: "ok"
      }
    });
    expect(query).toHaveBeenCalledWith("select 1");
  });

  it("reports postgres readiness as degraded when the query fails", async () => {
    const postgresDatabase = {
      kind: "postgres",
      pool: {
        query: async () => {
          throw new Error("db unavailable");
        }
      }
    } as unknown as DatabaseAdapter;
    const service = new HealthService(postgresDatabase);

    await expect(service.getReadiness()).resolves.toEqual({
      ok: false,
      checks: {
        database: "degraded"
      }
    });
  });
});
