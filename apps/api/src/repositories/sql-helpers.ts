import type { JsonObject, JsonValue, NodeOutput } from "@personal-agent-os/shared";

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function asJsonObject(value: unknown): JsonObject {
  return asRecord(value) as JsonObject;
}

export function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

export function asNodeOutput(value: unknown): NodeOutput | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "artifacts" in value
  ) {
    return value as NodeOutput;
  }

  if (value === undefined) {
    return undefined;
  }

  return {
    data: value,
    artifacts: []
  };
}
