import { describe, expect, it } from "vitest";
import type { JSONSchema } from "@personal-agent-os/shared";
import { __test__, validateSchema } from "../../../src/runtime/schema-utils.js";

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
});

describe("isCompatible", () => {
  it("returns false when the schema types do not match", () => {
    expect(
      __test__.isCompatible(
        { type: "string" },
        { type: "number" }
      )
    ).toBe(false);
  });

  it("returns false when array item schemas are not compatible", () => {
    expect(
      __test__.isCompatible(
        {
          type: "array",
          items: { type: "string" }
        },
        {
          type: "array",
          items: { type: "boolean" }
        }
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
});
