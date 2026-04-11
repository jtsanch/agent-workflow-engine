import { describe, expect, it } from "vitest";
import { AgentCatalogService } from "./agent-catalog.js";

describe("AgentCatalogService", () => {
  it("lists the seeded agent definitions", () => {
    const service = new AgentCatalogService();

    const agents = service.list();

    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.some((agent) => agent.key === "daily-briefing")).toBe(true);
    expect(agents.some((agent) => agent.key === "weekly-grocery-planner")).toBe(true);
  });

  it("returns agents by key and dag id", () => {
    const service = new AgentCatalogService();

    expect(service.getByKey("daily-briefing")?.dag.id).toBe("dag-daily-briefing");
    expect(service.getByDagId("dag-weekly-grocery-planner")?.key).toBe("weekly-grocery-planner");
  });

  it("returns null for unknown agents", () => {
    const service = new AgentCatalogService();

    expect(service.getByKey("missing")).toBeNull();
    expect(service.getByDagId("missing")).toBeNull();
  });
});
