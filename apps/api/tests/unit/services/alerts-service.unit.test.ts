import { describe, expect, it } from "vitest";
import type { UserContext } from "@personal-agent-os/shared";
import { createSeedTables } from "../../../src/db/seed.js";
import { InMemoryDatabase } from "../../../src/db/database.js";
import { InMemoryAlertPreferenceRepository, InMemoryJobRepository } from "../../../src/repositories/memory.js";
import { AlertsService } from "../../../src/services/alerts-service.js";

const userContext: UserContext = {
  userId: "user_1",
  email: "user@example.com"
};

describe("AlertsService", () => {
  it("returns alert preferences only for the caller's jobs", async () => {
    const database = new InMemoryDatabase(createSeedTables());
    database.tables.jobs.push(
      {
        id: "job_1",
        userId: "user_1",
        name: "Weekly Grocery",
        dagId: "dag_grocery_planner",
        agentDefinitionKey: "grocery-planner",
        status: "active",
        inputs: {},
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z"
      },
      {
        id: "job_2",
        userId: "user_2",
        name: "Other Job",
        dagId: "dag_grocery_planner",
        agentDefinitionKey: "grocery-planner",
        status: "active",
        inputs: {},
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z"
      }
    );
    database.tables.alertPreferences.push(
      {
        id: "alert_1",
        jobId: "job_1",
        channel: "email",
        destination: "user@example.com",
        onSuccess: true,
        onFailure: true
      },
      {
        id: "alert_2",
        jobId: "job_2",
        channel: "slack",
        destination: "#ops",
        onSuccess: false,
        onFailure: true
      }
    );

    const service = new AlertsService(
      new InMemoryJobRepository(database),
      new InMemoryAlertPreferenceRepository(database)
    );

    const alerts = await service.listAlerts(userContext);

    expect(alerts).toEqual([
      expect.objectContaining({
        id: "alert_1",
        destination: "user@example.com"
      })
    ]);
  });
});
