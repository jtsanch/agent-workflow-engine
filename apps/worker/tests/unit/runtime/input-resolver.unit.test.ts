import { describe, expect, it } from "vitest";
import { __test__, resolveDataRef, resolveInputBindings } from "../../../src/runtime/input-resolver.js";
import { ExecutionState } from "../../../src/runtime/execution-state.js";

function createState() {
  return new ExecutionState({
    budget: 125,
    zipcode: "94107"
  });
}

describe("resolveDataRef", () => {
  it("throws when a required node output is missing", () => {
    const state = createState();

    expect(() =>
      resolveDataRef(
        { source: "node_output", nodeId: "missing", path: "result.text" },
        false,
        state
      )
    ).toThrow("Missing dependency: missing");
  });

  it("returns undefined when an optional node output is missing", () => {
    const state = createState();

    expect(
      resolveDataRef(
        { source: "node_output", nodeId: "missing", path: "result.text" },
        true,
        state
      )
    ).toBeUndefined();
  });

  it("supports static values and job input lookups", () => {
    const state = createState();

    expect(
      resolveDataRef(
        { source: "static", value: { preset: true } },
        false,
        state
      )
    ).toEqual({ preset: true });

    expect(
      resolveDataRef(
        { source: "job_input", path: "zipcode" },
        false,
        state
      )
    ).toBe("94107");
  });

  it("rejects unsupported memory refs and unknown ref sources", () => {
    const state = createState();

    expect(() =>
      resolveDataRef(
        { source: "memory", key: "draft" },
        false,
        state
      )
    ).toThrow("Memory not supported yet");

    expect(() =>
      resolveDataRef(
        { source: "mystery" } as never,
        false,
        state
      )
    ).toThrow("Unknown DataRef source");
  });
});

describe("resolveInputBindings", () => {
  it("returns an empty object when no bindings are provided", () => {
    const state = createState();

    expect(resolveInputBindings(undefined, state)).toEqual({});
  });

  it("resolves refs and omits undefined optional values", () => {
    const state = createState();

    expect(
      resolveInputBindings(
        [
          {
            key: "zip",
            ref: { source: "job_input", path: "zipcode" }
          },
          {
            key: "preset",
            ref: { source: "static", value: "fallback" }
          },
          {
            key: "missingOptional",
            ref: { source: "node_output", nodeId: "unknown" },
            optional: true
          }
        ],
        state
      )
    ).toEqual({
      zip: "94107",
      preset: "fallback"
    });
  });

  it("throws when a required dependency binding is missing", () => {
    const state = createState();

    expect(() =>
      resolveInputBindings(
        [
          {
            key: "requiredOutput",
            ref: { source: "node_output", nodeId: "unknown" }
          }
        ],
        state
      )
    ).toThrow("Missing dependency: unknown");
  });
});

describe("getByPath", () => {
  it("returns the full object when no path is provided", () => {
    expect(__test__.getByPath({ nested: true })).toEqual({ nested: true });
  });
});

