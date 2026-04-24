import { createToolRegistry } from "@personal-agent-os/agent-sdk";
import type { ToolRegistry } from "@personal-agent-os/agent-sdk";

export function createDefaultToolRegistry(): ToolRegistry {
  return createToolRegistry();
}
