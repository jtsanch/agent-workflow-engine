import { createToolRegistry as createSdkToolRegistry } from "@personal-agent-os/agent-sdk";
import type { ToolRegistry } from "@personal-agent-os/agent-sdk";

export function createToolRegistry(): ToolRegistry {
  return createSdkToolRegistry();
}
