import { createToolRegistry as createSdkToolRegistry } from "../../../../packages/agent-sdk/src/tool-registry.js";
import type { ToolRegistry } from "../../../../packages/agent-sdk/src/types.js";

export function createToolRegistry(): ToolRegistry {
  return createSdkToolRegistry();
}
