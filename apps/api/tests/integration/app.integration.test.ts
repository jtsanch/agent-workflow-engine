import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { AppError } from "../../src/common/errors.js";
import type { AuthContextAuthenticator } from "../../src/services/auth-context-service.js";
import type { UserService } from "../../src/services/user-service.js";
import type { UserUsageReader } from "../../src/services/user-usage-service.js";
import { createInMemoryAppContext } from "../../src/test-utils/in-memory-context.js";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(async (token: string) => ({ sub: token })),
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn(async (clerkUserId: string) => ({
        id: clerkUserId,
        firstName: null,
        lastName: null,
        primaryEmailAddressId: "primary",
        emailAddresses: [
          {
            id: "primary",
            emailAddress: `${clerkUserId}@example.com`
          }
        ]
      }))
    }
  }))
}));

describe("API integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(readyResponse.json()).toEqual({
      ok: true,
      checks: {
        database: "ok"
      }
    });
  });

  it("applies credentialed CORS for the configured frontend origin", async () => {
    app = await buildApp(createInMemoryAppContext({ apiCorsOrigin: "http://localhost:5173" }));

    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("rejects protected routes without valid auth", async () => {
    app = await buildApp(createInMemoryAppContext());

    const agentsResponse = await app.inject({ method: "GET", url: "/agents" });
    const jobsResponse = await app.inject({ method: "GET", url: "/jobs" });
    const runsResponse = await app.inject({ method: "GET", url: "/runs" });
    const alertsResponse = await app.inject({ method: "GET", url: "/alerts" });

    expect(agentsResponse.statusCode).toBe(401);
    expect(jobsResponse.statusCode).toBe(401);
    expect(runsResponse.statusCode).toBe(401);
    expect(alertsResponse.statusCode).toBe(401);
  });

  it("rejects search without valid auth", async () => {
    app = await buildApp(createInMemoryAppContext());

    const response = await app.inject({
      method: "GET",
      url: "/search",
      query: {
        zipcode: "94107",
        stores: "Trader Joe's,Costco",
        category: "daily grocery deals"
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects invalid payload requests before handler execution when unauthenticated", async () => {
    app = await buildApp(createInMemoryAppContext());

    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        agentDefinitionKey: "grocery-planner"
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns authenticated user and usage from /auth/me with mocked auth flow", async () => {
    const context = createInMemoryAppContext();
    context.authContextService = ({
      async authenticate() {
        return {
          clerkUserId: "clerk_user",
          localUserId: "user-id",
          role: "user",
          email: "user@example.com"
        };
      }
    } satisfies AuthContextAuthenticator) as unknown as typeof context.authContextService;
    context.userService = ({
      async getRequiredById() {
        return {
          id: "user-id",
          clerkUserId: "clerk_user",
          email: "user@example.com",
          firstName: "Demo",
          lastName: "User",
          status: "active",
          role: "user",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z"
        };
      }
    } satisfies Pick<UserService, "getRequiredById">) as unknown as typeof context.userService;
    context.userUsageService = ({
      async getSummary() {
        return {
          dailyUsed: 1200,
          dailyLimit: 60000,
          monthlyUsed: 5400,
          monthlyLimit: 300000,
          perRunLimit: 12000
        };
      },
      async listEvents() {
        return { events: [] };
      }
    } satisfies UserUsageReader) as unknown as typeof context.userUsageService;

    app = await buildApp(context);

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: "Bearer user-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: "user-id",
        email: "user@example.com",
        firstName: "Demo",
        lastName: "User",
        status: "active",
        role: "user"
      },
      usage: {
        dailyUsed: 1200,
        dailyLimit: 60000,
        monthlyUsed: 5400,
        monthlyLimit: 300000,
        perRunLimit: 12000
      }
    });
  });

  it("applies admin enable and disable effects to authenticated requests", async () => {
    const context = createInMemoryAppContext();
    const users = new Map<string, {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      status: "active" | "disabled";
      role: "admin" | "user";
    }>([
      [
        "admin-id",
        {
          id: "admin-id",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          status: "active",
          role: "admin"
        }
      ],
      [
        "user-id",
        {
          id: "user-id",
          email: "user@example.com",
          firstName: "Demo",
          lastName: "User",
          status: "active",
          role: "user"
        }
      ]
    ]);
    const tokens = new Map([
      ["admin-token", "admin-id"],
      ["user-token", "user-id"]
    ]);

    context.authContextService = ({
      async authenticate(clerkAuth) {
        const userId = tokens.get(clerkAuth.clerkUserId);
        if (!userId) {
          throw new AppError("Invalid auth token", 401, "unauthorized");
        }

        const user = users.get(userId);
        if (!user) {
          throw new AppError("Invalid auth token", 401, "unauthorized");
        }

        if (user.status !== "active") {
          throw new AppError("User is disabled", 403, "forbidden");
        }

        return {
          clerkUserId: `clerk_${user.id}`,
          localUserId: user.id,
          role: user.role,
          email: user.email
        };
      }
    } satisfies AuthContextAuthenticator) as unknown as typeof context.authContextService;
    context.userService = ({
      async getRequiredById(userId: string) {
        const user = users.get(userId);
        if (!user) {
          throw new AppError("Authenticated user not found", 500, "authenticated_user_not_found");
        }

        return {
          id: user.id,
          clerkUserId: `clerk_${user.id}`,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          role: user.role,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z"
        };
      }
    } satisfies Pick<UserService, "getRequiredById">) as unknown as typeof context.userService;
    context.userUsageService = ({
      async getSummary() {
        return {
          dailyUsed: 1200,
          dailyLimit: 60000,
          monthlyUsed: 5400,
          monthlyLimit: 300000,
          perRunLimit: 12000
        };
      },
      async listEvents() {
        return { events: [] };
      }
    } satisfies UserUsageReader) as unknown as typeof context.userUsageService;
    context.adminUsersService = {
      async listUsers() {
        return { users: [] };
      },
      async disableUser(userId: string) {
        const user = users.get(userId);
        if (user) {
          users.set(userId, { ...user, status: "disabled" });
        }
      },
      async enableUser(userId: string) {
        const user = users.get(userId);
        if (user) {
          users.set(userId, { ...user, status: "active" });
        }
      }
    } as unknown as typeof context.adminUsersService;

    app = await buildApp(context);

    const disableResponse = await app.inject({
      method: "POST",
      url: "/admin/users/user-id/disable",
      headers: {
        authorization: "Bearer admin-token"
      }
    });
    expect(disableResponse.statusCode).toBe(204);

    const disabledAuthMeResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: "Bearer user-token"
      }
    });
    expect(disabledAuthMeResponse.statusCode).toBe(403);

    const enableResponse = await app.inject({
      method: "POST",
      url: "/admin/users/user-id/enable",
      headers: {
        authorization: "Bearer admin-token"
      }
    });
    expect(enableResponse.statusCode).toBe(204);

    const enabledAuthMeResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: "Bearer user-token"
      }
    });
    expect(enabledAuthMeResponse.statusCode).toBe(200);
  });

  it("supports the mocked full flow from login to job execution to usage to admin blocking", async () => {
    const context = createInMemoryAppContext();
    const users = new Map<string, {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      status: "active" | "disabled";
      role: "admin" | "user";
    }>([
      [
        "admin-id",
        {
          id: "admin-id",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          status: "active",
          role: "admin"
        }
      ],
      [
        "user-id",
        {
          id: "user-id",
          email: "user@example.com",
          firstName: "Demo",
          lastName: "User",
          status: "active",
          role: "user"
        }
      ]
    ]);
    const tokens = new Map([
      ["admin-token", "admin-id"],
      ["user-token", "user-id"]
    ]);
    const usageState = {
      dailyUsed: 0,
      dailyLimit: 60000,
      monthlyUsed: 0,
      monthlyLimit: 300000,
      perRunLimit: 12000
    };
    const usageEvents = [
      {
        id: "event_2",
        jobId: "job_future",
        jobRunId: "run_future",
        model: "gpt-4.1-mini",
        promptTokens: 80,
        completionTokens: 20,
        totalTokens: 100,
        createdAt: "2026-05-02T01:05:00.000Z"
      },
      {
        id: "event_1",
        jobId: "job_past",
        jobRunId: "run_past",
        model: "gpt-4.1-mini",
        promptTokens: 32,
        completionTokens: 8,
        totalTokens: 40,
        createdAt: "2026-05-02T01:00:00.000Z"
      }
    ];

    context.authContextService = ({
      async authenticate(clerkAuth) {
        const userId = tokens.get(clerkAuth.clerkUserId);
        if (!userId) {
          throw new AppError("Invalid auth token", 401, "unauthorized");
        }

        const user = users.get(userId);
        if (!user) {
          throw new AppError("Invalid auth token", 401, "unauthorized");
        }

        if (user.status !== "active") {
          throw new AppError("User is disabled", 403, "forbidden");
        }

        return {
          clerkUserId: `clerk_${user.id}`,
          localUserId: user.id,
          role: user.role,
          email: user.email
        };
      }
    } satisfies AuthContextAuthenticator) as unknown as typeof context.authContextService;
    context.userService = ({
      async getRequiredById(userId: string) {
        const user = users.get(userId);
        if (!user) {
          throw new AppError("Authenticated user not found", 500, "authenticated_user_not_found");
        }

        return {
          id: user.id,
          clerkUserId: `clerk_${user.id}`,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          role: user.role,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z"
        };
      }
    } satisfies Pick<UserService, "getRequiredById">) as unknown as typeof context.userService;
    context.userUsageService = ({
      async getSummary() {
        return {
          ...usageState
        };
      },
      async listEvents(_userId, cursor, limit) {
        const pageSize = limit ?? usageEvents.length;
        const startIndex = cursor ? usageEvents.findIndex((event) => event.id === cursor) + 1 : 0;
        const pageEvents = usageEvents.slice(startIndex, startIndex + pageSize);
        const nextCursor =
          startIndex + pageSize < usageEvents.length ? pageEvents[pageEvents.length - 1]?.id : undefined;

        return {
          events: pageEvents,
          nextCursor
        };
      }
    } satisfies UserUsageReader) as unknown as typeof context.userUsageService;
    context.adminUsersService = {
      async listUsers() {
        return { users: [] };
      },
      async disableUser(userId: string) {
        const user = users.get(userId);
        if (user) {
          users.set(userId, { ...user, status: "disabled" });
        }
      },
      async enableUser(userId: string) {
        const user = users.get(userId);
        if (user) {
          users.set(userId, { ...user, status: "active" });
        }
      }
    } as unknown as typeof context.adminUsersService;

    app = await buildApp(context);

    const authMeResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: "Bearer user-token"
      }
    });
    expect(authMeResponse.statusCode).toBe(200);
    expect(authMeResponse.json().usage).toEqual({
      dailyUsed: 0,
      dailyLimit: 60000,
      monthlyUsed: 0,
      monthlyLimit: 300000,
      perRunLimit: 12000
    });

    const createJobResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      headers: {
        authorization: "Bearer user-token"
      },
      payload: {
        agentDefinitionKey: "grocery-planner",
        dagId: "dag_grocery_planner",
        name: "Daily Grocery",
        scheduleExpression: "cron(0 9 ? * SUN *)",
        timezone: "America/Los_Angeles",
        inputs: {
          preferences: {
            budgetUsd: 100,
            dietaryTags: ["balanced"]
          }
        },
        alertPreferences: [
          {
            channel: "email",
            destination: "user@example.com",
            onSuccess: true,
            onFailure: true
          }
        ]
      }
    });
    expect(createJobResponse.statusCode).toBe(201);
    const jobId = createJobResponse.json().item.id as string;

    const enqueueRunResponse = await app.inject({
      method: "POST",
      url: "/runs",
      headers: {
        authorization: "Bearer user-token"
      },
      payload: {
        jobId
      }
    });
    expect(enqueueRunResponse.statusCode).toBe(201);
    expect(enqueueRunResponse.json().item.status).toBe("queued");

    const firstEventsResponse = await app.inject({
      method: "GET",
      url: "/usage/me/events?limit=2",
      headers: {
        authorization: "Bearer user-token"
      }
    });
    expect(firstEventsResponse.statusCode).toBe(200);
    expect(firstEventsResponse.json()).toEqual({
      events: [
        {
          id: "event_2",
          jobId: "job_future",
          jobRunId: "run_future",
          model: "gpt-4.1-mini",
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
          createdAt: "2026-05-02T01:05:00.000Z"
        },
        {
          id: "event_1",
          jobId: "job_past",
          jobRunId: "run_past",
          model: "gpt-4.1-mini",
          promptTokens: 32,
          completionTokens: 8,
          totalTokens: 40,
          createdAt: "2026-05-02T01:00:00.000Z"
        }
      ]
    });

    const secondEventsResponse = await app.inject({
      method: "GET",
      url: "/usage/me/events?cursor=event_2&limit=2",
      headers: {
        authorization: "Bearer user-token"
      }
    });
    expect(secondEventsResponse.statusCode).toBe(200);
    expect(secondEventsResponse.json()).toEqual({
      events: [
        {
          id: "event_1",
          jobId: "job_past",
          jobRunId: "run_past",
          model: "gpt-4.1-mini",
          promptTokens: 32,
          completionTokens: 8,
          totalTokens: 40,
          createdAt: "2026-05-02T01:00:00.000Z"
        }
      ]
    });

    const disableUserResponse = await app.inject({
      method: "POST",
      url: "/admin/users/user-id/disable",
      headers: {
        authorization: "Bearer admin-token"
      }
    });
    expect(disableUserResponse.statusCode).toBe(204);

    const blockedAuthMeResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: "Bearer user-token"
      }
    });
    expect(blockedAuthMeResponse.statusCode).toBe(403);
  });
});
