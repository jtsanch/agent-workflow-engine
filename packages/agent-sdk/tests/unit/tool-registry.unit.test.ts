import { describe, expect, it } from "vitest";
import { createDefaultTools } from "../../src/tools/index.js";
import { createToolRegistry } from "../../src/tool-registry.js";

describe("tool registry", () => {
  it("registers only the three MVP tools", () => {
    const tools = createDefaultTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "web_search.search",
      "llm.generateText",
      "notifications.send"
    ]);
  });

  it("creates a registry with the same three tools", () => {
    const registry = createToolRegistry();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "web_search.search",
      "llm.generateText",
      "notifications.send"
    ]);
  });
});
