import { describe, expect, it } from "vitest";
import { AgentCatalogService } from "../../../src/services/agent-catalog.js";

describe("AgentCatalogService", () => {
  it("lists the seeded agent definitions", () => {
    const service = new AgentCatalogService();

    const agents = service.list();

    expect(agents).toHaveLength(1);
    expect(agents[0]?.key).toBe("grocery-planner");
  });

  it("returns agents by key and dag id", () => {
    const service = new AgentCatalogService();

    expect(service.getByDagId("dag_grocery_planner")?.key).toBe("grocery-planner");
    expect(service.getByKey("grocery-planner")?.dag.id).toBe("dag_grocery_planner");
  });

  it("returns null for unknown agents", () => {
    const service = new AgentCatalogService();

    expect(service.getByKey("missing")).toBeNull();
    expect(service.getByDagId("missing")).toBeNull();
  });
});
