import { describe, expect, it } from "vitest";
import { InMemoryDatabase, PostgresDatabase } from "../db/database.js";
import { createSeedTables } from "../db/seed.js";
import { HealthService } from "./health-service.js";

describe("HealthService", () => {
  it("reports memory-backed readiness as healthy", async () => {
    const service = new HealthService(new InMemoryDatabase(createSeedTables()));

    await expect(service.getReadiness()).resolves.toEqual({
      ok: true,
      checks: {
        database: "ok"
      }
    });
  });

  it("reports postgres readiness as healthy when the query succeeds", async () => {
    const service = new HealthService(
      new PostgresDatabase({
        query: async () => ({ rows: [] })
      } as unknown as PostgresDatabase["pool"])
    );

    await expect(service.getReadiness()).resolves.toEqual({
      ok: true,
      checks: {
        database: "ok"
      }
    });
  });

  it("reports postgres readiness as degraded when the query fails", async () => {
    const service = new HealthService(
      new PostgresDatabase({
        query: async () => {
          throw new Error("db unavailable");
        }
      } as unknown as PostgresDatabase["pool"])
    );

    await expect(service.getReadiness()).resolves.toEqual({
      ok: false,
      checks: {
        database: "degraded"
      }
    });
  });
});
