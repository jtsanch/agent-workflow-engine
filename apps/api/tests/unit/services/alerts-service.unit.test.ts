import { describe, expect, it, vi } from "vitest";
import type {AlertChannel, UserContext} from "@personal-agent-os/shared";
import type { AlertPreferenceRepository, JobRepository } from "../../../src/repositories/interfaces.js";
import type { JobStatus } from "@personal-agent-os/shared";
import { AlertsService } from "../../../src/services/alerts-service.js";

const userContext: UserContext = {
  userId: "user_1",
  email: "user@example.com"
};

describe("AlertsService", () => {
  it("returns alert preferences only for the caller's jobs", async () => {
    const jobRepository: JobRepository = {
      listByUser: vi.fn(async () => [
        {
          id: "job_1",
          userId: "user_1",
          name: "Daily Grocery",
          dagId: "dag_grocery_planner",
          agentDefinitionKey: "grocery-planner",
          status: "active" as JobStatus,
          inputs: {},
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z"
        }
      ]),
      findById: vi.fn(),
      create: vi.fn()
    };
    const alertPreferenceRepository: AlertPreferenceRepository = {
      listByJobId: vi.fn(async () => [
        {
          id: "alert_1",
          jobId: "job_1",
          channel: "email" as AlertChannel,
          destination: "user@example.com",
          onSuccess: true,
          onFailure: true
        }
      ]),
      createMany: vi.fn()
    };
    const service = new AlertsService(jobRepository, alertPreferenceRepository);

    const alerts = await service.listAlerts(userContext);

    expect(alerts).toEqual([
      expect.objectContaining({
        id: "alert_1",
        destination: "user@example.com"
      })
    ]);
    expect(jobRepository.listByUser).toHaveBeenCalledWith("user_1");
    expect(alertPreferenceRepository.listByJobId).toHaveBeenCalledWith("job_1");
  });
});
