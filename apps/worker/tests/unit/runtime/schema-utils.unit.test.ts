import { describe, expect, it } from "vitest";
import type { JSONSchema } from "@personal-agent-os/shared";
import { __test__, validateDag, validateSchema } from "../../../src/runtime/schema-utils.js";

describe("validateSchema", () => {
  it.each([
    {
      name: "string",
      value: 123,
      schema: { type: "string" },
      message: "Expected value to be a string"
    },
    {
      name: "number",
      value: "123",
      schema: { type: "number" },
      message: "Expected value to be a number"
    },
    {
      name: "integer",
      value: "123",
      schema: { type: "integer" },
      message: "Expected value to be a number"
    },
    {
      name: "boolean",
      value: "true",
      schema: { type: "boolean" },
      message: "Expected value to be a boolean"
    },
    {
      name: "null",
      value: undefined,
      schema: { type: "null" },
      message: "Expected value to be null"
    },
    {
      name: "array",
      value: { 0: "not an array" },
      schema: { type: "array", items: { type: "string" } },
      message: "Expected value to be an array"
    }
  ] satisfies Array<{
    name: string;
    value: unknown;
    schema: JSONSchema;
    message: string;
  }>)("rejects invalid values for $name schemas", ({ value, schema, message }) => {
    expect(() => validateSchema(value, schema)).toThrow(message);
  });

  it("rejects invalid object values and unexpected fields", () => {
    expect(() =>
      validateSchema("not-an-object", { type: "object", properties: {} })
    ).toThrow("Expected value to be an object");

    expect(() =>
      validateSchema(
        { known: true, extra: false },
        {
          type: "object",
          properties: {
            known: { type: "boolean" }
          },
          additionalProperties: false
        }
      )
    ).toThrow("Unexpected field extra");
  });

  it("ignores schemas without a type", () => {
    expect(() => validateSchema("anything", {})).not.toThrow();
  });
});

describe("isCompatible", () => {
  it("returns false when the schema types do not match", () => {
    expect(__test__.isCompatible({ type: "string" }, { type: "number" })).toBe(false);
  });

  it("returns false when array item schemas are not compatible", () => {
    expect(
      __test__.isCompatible(
        { type: "array", items: { type: "string" } },
        { type: "array", items: { type: "boolean" } }
      )
    ).toBe(false);
  });

  it("returns false when object property schemas are not compatible", () => {
    expect(
      __test__.isCompatible(
        {
          type: "object",
          properties: {
            profile: {
              type: "object",
              properties: {
                age: { type: "number" }
              }
            }
          }
        },
        {
          type: "object",
          properties: {
            profile: {
              type: "object",
              properties: {
                age: { type: "string" }
              }
            }
          },
          required: ["profile"]
        }
      )
    ).toBe(false);
  });

  it("returns true when schemas or types are missing and false for missing required object fields", () => {
    expect(__test__.isCompatible(undefined, { type: "string" })).toBe(true);
    expect(__test__.isCompatible({ type: "object", properties: {} }, { type: "object", properties: { name: { type: "string" } }, required: ["name"] })).toBe(false);
  });
});

describe("schema-utils helpers", () => {
  it("gets schemas by nested object and array paths", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" }
            }
          }
        }
      }
    };

    expect(__test__.getSchemaByPath(schema, ["items", "0", "title"])).toEqual({ type: "string" });
    expect(__test__.getSchemaByPath(schema, ["items", "0", "missing"])).toBeUndefined();
  });

  it("lints generic field names recursively", () => {
    expect(
      __test__.lintSchema({
        type: "object",
        properties: {
          output: { type: "string" },
          nested: {
            type: "object",
            properties: {
              text: { type: "string" }
            }
          }
        }
      })
    ).toEqual([
      'Generic field name "output" is not allowed at output',
      'Generic field name "text" is not allowed at nested.text'
    ]);
  });

  it("rejects async and effectful transform nodes", () => {
    expect(() =>
      __test__.validateTransformNode({
        id: "async_node",
        type: "transform",
        output: { schema: { type: "object", additionalProperties: true } },
        transform: async () => ({})
      })
    ).toThrow("Transform node async_node must be synchronous");

    expect(() =>
      __test__.validateTransformNode({
        id: "network_node",
        type: "transform",
        output: { schema: { type: "object", additionalProperties: true } },
        transform: function transform() {
          return fetch("https://example.com");
        }
      })
    ).toThrow("Transform node network_node must only reshape data");
  });
});

describe("validateDag", () => {
  it("rejects schema lint failures and invalid transforms", () => {
    expect(() =>
      validateDag({
        nodes: [
          {
            id: "bad_schema",
            type: "tool",
            output: {
              schema: {
                type: "object",
                properties: {
                  output: { type: "string" }
                }
              }
            }
          }
        ],
        edges: []
      })
    ).toThrow('Schema lint failed for bad_schema: Generic field name "output" is not allowed at output');

    expect(() =>
      validateDag({
        nodes: [
          {
            id: "bad_transform",
            type: "transform",
            transform: async () => ({}),
            output: {
              schema: {
                type: "object",
                additionalProperties: true
              }
            }
          }
        ],
        edges: []
      })
    ).toThrow("Transform node bad_transform must be synchronous");
  });

  it("rejects invalid edges and incompatible bindings", () => {
    expect(() =>
      validateDag({
        nodes: [
          {
            id: "from",
            type: "tool",
            output: { schema: { type: "object", properties: { value: { type: "string" } } } }
          }
        ],
        edges: [{ from: "from", to: "missing" }]
      })
    ).toThrow("Invalid edge: from -> missing");

    expect(() =>
      validateDag({
        nodes: [
          {
            id: "from",
            type: "tool",
            output: { schema: { type: "object", properties: { value: { type: "string" } } } }
          },
          {
            id: "to",
            type: "tool",
            input: {
              schema: { type: "object", properties: { value: { type: "number" } } },
              bindings: [{ key: "value", ref: { source: "node_output", nodeId: "from", path: "value" } }]
            },
            output: { schema: { type: "object", additionalProperties: true } }
          }
        ],
        edges: [{ from: "from", to: "to", type: "data" }]
      })
    ).toThrow("Invalid edge: from -> to");
  });

  it("allows data edges without bindings and nullish edge types", () => {
    expect(() =>
      validateDag({
        nodes: [
          {
            id: "from",
            type: "tool",
            output: { schema: { type: "object", properties: { value: { type: "string" } } } }
          },
          {
            id: "to",
            type: "tool",
            input: { schema: { type: "object", properties: { value: { type: "string" } } } },
            output: { schema: { type: "object", additionalProperties: true } }
          }
        ],
        edges: [{ from: "from", to: "to" }]
      })
    ).not.toThrow();
  });
});
