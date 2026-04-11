import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { createInMemoryAppContext } from "../../src/test-utils/in-memory-context.js";

describe("API integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("serves health and readiness endpoints", async () => {
    app = await buildApp(createInMemoryAppContext());

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    const readyResponse = await app.inject({ method: "GET", url: "/ready" });

    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true, service: "api" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({ ok: true, checks: { database: "ok" } });
  });

  it("supports the job creation and run simulation vertical slice", async () => {
    app = await buildApp(createInMemoryAppContext());

    const agentsResponse = await app.inject({ method: "GET", url: "/agents" });
    expect(agentsResponse.statusCode).toBe(200);
    expect(agentsResponse.json().items).toHaveLength(1);

    const createJobResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        agentDefinitionKey: "weekly-grocery-planner",
        dagId: "dag-weekly-grocery-planner",
        name: "Weekly Grocery",
        scheduleExpression: "cron(0 9 ? * SUN *)",
        timezone: "America/Los_Angeles",
        inputs: {
          zipcode: "94107",
          householdSize: 2,
          budget: 100,
          email: "demo@example.com",
          dietStyle: "balanced"
        },
        alertPreferences: [
          {
            channel: "email",
            destination: "demo@example.com",
            onSuccess: true,
            onFailure: true
          }
        ]
      }
    });

    expect(createJobResponse.statusCode).toBe(201);
    const createdJob = createJobResponse.json().item;

    const jobsResponse = await app.inject({ method: "GET", url: "/jobs" });
    expect(jobsResponse.statusCode).toBe(200);
    expect(jobsResponse.json().items).toHaveLength(1);

    const simulateRunResponse = await app.inject({
      method: "POST",
      url: "/runs/simulate",
      payload: { jobId: createdJob.id }
    });

    expect(simulateRunResponse.statusCode).toBe(201);
    expect(simulateRunResponse.json().item.status).toBe("succeeded");

    const runsResponse = await app.inject({ method: "GET", url: "/runs" });
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json().items).toHaveLength(1);
    expect(runsResponse.json().items[0].steps.length).toBeGreaterThan(0);
  });

  it("returns a structured validation error for invalid payloads", async () => {
    app = await buildApp(createInMemoryAppContext());

    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        agentDefinitionKey: "weekly-grocery-planner"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_error");
  });
});
