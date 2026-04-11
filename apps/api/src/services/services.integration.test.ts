import { describe, expect, it } from "vitest";
import type { CreateJobInput, UserContext } from "@personal-agent-os/shared";
import { createInMemoryAppContext } from "../test-utils/in-memory-context.js";

const userContext: UserContext = {
  userId: "user_test",
  email: "test@example.com"
};

const createJobInput: CreateJobInput = {
  agentDefinitionKey: "daily-briefing",
  dagId: "dag-daily-briefing",
  name: "Founder Daily Briefing",
  scheduleExpression: "cron(0 7 ? * MON-FRI *)",
  timezone: "America/Los_Angeles",
  inputs: {
    email: "test@example.com",
    tone: "concise",
    includeTodos: true
  },
  alertPreferences: [
    {
      channel: "email",
      destination: "test@example.com",
      onSuccess: true,
      onFailure: true
    }
  ]
};

describe("service integration", () => {
  it("connects the catalog, jobs, runs, alerts, and health services through one app context", async () => {
    const context = createInMemoryAppContext();

    const agents = context.agentCatalogService.list();
    expect(agents.some((agent) => agent.key === createJobInput.agentDefinitionKey)).toBe(true);

    const job = await context.jobsService.createJob(createJobInput, userContext);
    const alerts = await context.alertsService.listAlerts(userContext);
    const queuedRun = await context.runsService.enqueueRun(job.id);
    const completedRun = await context.runsService.simulateRun(job.id);
    const runs = await context.runsService.listRuns(userContext);
    const readiness = await context.healthService.getReadiness();

    expect(alerts).toHaveLength(1);
    expect(queuedRun.status).toBe("queued");
    expect(completedRun.status).toBe("succeeded");
    expect(runs).toHaveLength(2);
    expect(runs.some((run) => run.steps.length > 0)).toBe(true);
    expect(readiness).toEqual({
      ok: true,
      checks: {
        database: "ok"
      }
    });

    await context.close();
  });
});
