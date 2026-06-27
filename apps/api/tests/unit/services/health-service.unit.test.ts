import { describe, expect, it } from "vitest";
import { HealthService } from "../../../src/services/health-service.js";

describe("HealthService", () => {
  it("reports readiness as healthy", async () => {
    const service = new HealthService();

    expect(service.getReadiness()).toEqual({ ok: true });
  });
});
