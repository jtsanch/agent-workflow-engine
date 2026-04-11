import { describe, expect, it } from "vitest";
import type { AgentNode } from "@personal-agent-os/shared";
import { ExecutionState } from "./execution-state.js";
import { resolveInputs } from "./input-resolver.js";

describe("resolveInputs", () => {
  it("resolves job inputs and nested upstream outputs", () => {
    const state = new ExecutionState({
      budget: 125,
      zipcode: "94107"
    });
    state.store("research", {
      result: {
        text: "Fresh produce deals"
      }
    });

    const node: AgentNode = {
      id: "planner",
      type: "llm",
      agentKey: "llm.generateText",
      name: "Planner",
      inputMapping: {
        zip: "$job.zipcode",
        summary: "research.result.text"
      },
      outputSchema: {
        title: "Planner Output",
        fields: [{ name: "text", type: "string", required: true }]
      }
    };

    expect(resolveInputs(node, state)).toEqual({
      zip: "94107",
      summary: "Fresh produce deals"
    });
  });
});
