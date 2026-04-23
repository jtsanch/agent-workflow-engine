import { describe, expect, it } from "vitest";
import type { JSONSchema } from "@personal-agent-os/shared";
import { validateSchema } from "../../../src/runtime/schema-utils.js";

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
