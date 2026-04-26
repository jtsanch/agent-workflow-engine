import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsSendTool } from "../../src/tools/notifications-send-tool.js";
import type { RunContext } from "../../src/types.js";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(),
    isAxiosError: (error: unknown) => Boolean(error && typeof error === "object" && "isAxiosError" in error)
  }
}));

const mockedAxios = vi.mocked(axios, true);
const context: RunContext = {
  registry: {
    execute: async () => undefined
  },
  now: () => "2026-04-11T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("NotificationsSendTool", () => {
  afterEach(() => {
    delete process.env.NOTIFICATIONS_WEBHOOK_URL;
    vi.clearAllMocks();
  });

  it("returns a mock delivery when no webhook is configured", async () => {
    const result = await new NotificationsSendTool().run(
      {
        destination: "demo@example.com",
        channel: "email",
        message: "hello"
      },
      context
    );

    expect(result).toMatchObject({
      delivered: true,
      provider: "mock",
      destination: "demo@example.com",
      channel: "email"
    });
    expect(mockedAxios.request).not.toHaveBeenCalled();
  });

  it("posts to the configured webhook and retries transient failures", async () => {
    process.env.NOTIFICATIONS_WEBHOOK_URL = "https://hooks.example.com/notify";
    mockedAxios.request
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 429, data: { error: "slow down" } }
      } as never)
      .mockResolvedValueOnce({
        data: { ok: true, id: "delivery_1" }
      } as never);

    const result = await new NotificationsSendTool().run(
      {
        destination: "demo@example.com",
        channel: "email",
        message: "hello"
      },
      context
    );

    expect(mockedAxios.request).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      delivered: true,
      provider: "webhook"
    });
  });
});
