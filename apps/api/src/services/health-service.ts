import { PostgresDatabase, type DatabaseAdapter } from "../db/database.js";
import { pquery } from "../db/pquery.js";

export interface ReadinessStatus {
  ok: boolean;
  checks: {
    database: "ok" | "degraded";
  };
}

export class HealthService {
  constructor(private readonly database: DatabaseAdapter) {}

  async getReadiness(): Promise<ReadinessStatus> {
    if (this.database.kind === "memory") {
      return {
        ok: true,
        checks: {
          database: "ok"
        }
      };
    }

    try {
      await pquery((this.database as PostgresDatabase).pool, "select 1");
      return {
        ok: true,
        checks: {
          database: "ok"
        }
      };
    } catch {
      return {
        ok: false,
        checks: {
          database: "degraded"
        }
      };
    }
  }
}
