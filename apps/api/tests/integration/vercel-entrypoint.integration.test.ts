import { afterAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

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

const originalEnv = { ...process.env };
const servers: Server[] = [];

async function startHandlerServer(): Promise<{
  server: Server;
  baseUrl: string;
}> {
  process.env.NODE_ENV = "test";
  process.env.DB_DRIVER = "memory";
  process.env.API_CORS_ORIGIN = "http://localhost:5173,https://app.example.com";
  process.env.CLERK_SECRET_KEY = "sk_test_example";
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_example";

  const module = await import("../../api/index.js");
  const server = createServer((request, response) => {
    void module.default(request, response);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  servers.push(server);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected HTTP server to bind to a TCP port");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );

  process.env = originalEnv;
});

describe("Vercel API entrypoint", () => {
  it("serves Fastify routes through the default export handler", async () => {
    const { baseUrl } = await startHandlerServer();

    const healthResponse = await fetch(`${baseUrl}/health`);
    const rootResponse = await fetch(`${baseUrl}/`);
    const faviconResponse = await fetch(`${baseUrl}/favicon.ico`);

    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ ok: true, service: "api" });

    expect(rootResponse.status).toBe(200);
    expect(await rootResponse.json()).toEqual({
      service: "agent-workflow-engine-api",
      status: "ok"
    });

    expect(faviconResponse.status).toBe(204);
  });
});
