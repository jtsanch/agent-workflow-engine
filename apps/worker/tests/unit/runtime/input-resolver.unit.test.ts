import { describe, expect, it } from "vitest";
import { resolveInputBindings } from "../../../src/runtime/input-resolver.js";

describe("resolveInputBindings", () => {
  it("resolves job inputs and nested upstream outputs", () => {
    const resolved = resolveInputBindings(
      [
        { key: "zip", ref: { source: "job_input", path: "zipcode" } },
        { key: "summary", ref: { source: "node_output", nodeId: "research", path: "result.text" } }
      ],
      {
        jobInput: {
          budget: 125,
          zipcode: "94107"
        },
        nodeOutputs: {
          research: {
            data: {
              result: {
                text: "Fresh produce deals"
              }
            },
            artifacts: []
          }
        },
        registry: {
          async execute() {
            return {};
          }
        },
        now: () => "2026-04-10T00:00:00.000Z",
        logger: {
          info: () => undefined
        }
      }
    );

    expect(resolved).toEqual({
      zip: "94107",
      summary: "Fresh produce deals"
    });
  });
});
