import { describe, expect, it } from "vitest";
import { __test__, resolveDataRef, resolveInputBindings } from "../../../src/runtime/input-resolver.js";

const context = {
  jobInput: {
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
};

describe("resolveInputBindings", () => {
  it("resolves new workingState/input bindings", () => {
    const resolved = resolveInputBindings(
      [
        { key: "zip", ref: { source: "context", path: "$input.zipcode" } },
        { key: "totalCost", ref: { source: "context", path: "$state.grocery.totalCost" } },
        { key: "pantryCoverage", ref: { source: "context", path: "$diagnostics.signals.pantryCoverage" } }
      ],
      context
    );

    expect(resolved).toEqual({
      zip: "94107",
      totalCost: 24.5,
      pantryCoverage: 0.75
    });
  });

  it("still resolves nested upstream outputs through legacy node_output refs", () => {
    const resolved = resolveInputBindings(
      [
        { key: "summary", ref: { source: "node_output", nodeId: "research", path: "result.text" } }
      ],
      context
    );

    expect(resolved).toEqual({
      summary: "Fresh produce deals"
    });
  });

  it("returns an empty object when bindings are undefined", () => {
    expect(resolveInputBindings(undefined, context)).toEqual({});
  });

  it("skips optional bindings that resolve to undefined", () => {
    const resolved = resolveInputBindings(
      [
        {
          key: "optionalSummary",
          ref: { source: "node_output", nodeId: "missing", path: "result.text" },
          optional: true
        }
      ],
      context
    );

    expect(resolved).toEqual({});
  });
});

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

    expect(
      resolveDataRef(
        { source: "context", path: "jobInput.zipcode" },
        false,
        context
      )
    ).toBe("94107");

    expect(
      resolveDataRef(
        { source: "context", path: "$input.zipcode" },
        false,
        context
      )
    ).toBe("94107");

    expect(
      resolveDataRef(
        { source: "context", path: "$state.grocery.totalCost" },
        false,
        context
      )
    ).toBe(24.5);

    expect(
      resolveDataRef(
        { source: "context", path: "$diagnostics.signals.pantryCoverage" },
        false,
        context
      )
    ).toBe(0.75);

    expect(
      resolveDataRef(
        { source: "context", path: "$.nodeOutputs.research.data.result.text" },
        false,
        context
      )
    ).toBe("Fresh produce deals");
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
  it("supports workingState, diagnostics, input, and legacy nodeOutputs paths", () => {
    expect(__test__.resolveBinding("$state.grocery.totalCost", context)).toBe(24.5);
    expect(__test__.resolveBinding("$diagnostics.usedFallbacks", context)).toEqual(["meal-default"]);
    expect(__test__.resolveBinding("$input.budget", context)).toBe(125);
    expect(__test__.resolveBinding("$.nodeOutputs.research.data.result.text", context)).toBe("Fresh produce deals");
  });
});
