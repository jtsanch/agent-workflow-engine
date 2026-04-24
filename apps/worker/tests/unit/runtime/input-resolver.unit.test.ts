import { describe, expect, it } from "vitest";
import { __test__, resolveDataRef, resolveInputBindings } from "../../../src/runtime/input-resolver.js";

const context = {
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
};

describe("resolveInputBindings", () => {
  it("resolves job inputs and nested upstream outputs", () => {
    const resolved = resolveInputBindings(
      [
        { key: "zip", ref: { source: "job_input", path: "zipcode" } },
        { key: "summary", ref: { source: "node_output", nodeId: "research", path: "result.text" } }
      ],
      context
    );

    expect(resolved).toEqual({
      zip: "94107",
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
