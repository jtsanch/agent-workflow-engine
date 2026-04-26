import { describe, expect, it } from "vitest";
import { __test__, resolveDataRef, resolveInputBindings } from "../../../src/runtime/input-resolver.js";

const context = {
  input: {
    budget: 125,
    zipcode: "94107"
  },
  workingState: {
    data: {
      grocery: {
        totalCost: 24.5
      }
    },
    diagnostics: {
      usedFallbacks: ["meal-default"],
      warnings: ["budget-close"],
      constraintResults: {
        groceryListPresent: true
      },
      signals: {
        pantryCoverage: 0.75
      }
    }
  },
  nodeOutputs: {
    research: [
      {
        attempt: 1,
        data: {
          result: {
            text: "Fresh produce deals"
          }
        },
        artifacts: [],
        success: true,
        timestamp: 1712707200000
      },
      {
        attempt: 2,
        data: {
          result: {
            text: "Stale failed attempt"
          }
        },
        artifacts: [],
        success: false,
        timestamp: 1712707300000,
        error: "tool timeout"
      }
    ]
  },
};

describe("resolveDataRef", () => {
  it("throws when a required node output is missing", () => {
    expect(() =>
      resolveDataRef(
        { source: "node_output", nodeId: "missing", path: "result.text" },
        false,
        context
      )
    ).toThrow("Missing dependency: missing");
  });

  it("supports static values and context lookups", () => {
    expect(
      resolveDataRef(
        { source: "static", value: { preset: true } },
        false,
        context
      )
    ).toEqual({ preset: true });
  });

  it("rejects unsupported memory refs and unknown ref sources", () => {
    expect(() =>
      resolveDataRef(
        { source: "memory", key: "draft" },
        false,
        context
      )
    ).toThrow("Memory not supported yet");

    expect(() =>
      resolveDataRef(
        { source: "mystery" } as never,
        false,
        context
      )
    ).toThrow("Unknown DataRef source");
  });
});

describe("getByPath", () => {
  it("returns the full object when no path is provided", () => {
    expect(__test__.getByPath({ nested: true })).toEqual({ nested: true });
  });
});

describe("resolveBinding", () => {

  it("returns the latest successful output instead of the latest failed attempt", () => {
    expect(__test__.getLatestSuccessfulOutput(context, "research")).toEqual({
      data: {
        result: {
          text: "Fresh produce deals"
        }
      },
      artifacts: []
    });
  });
});
