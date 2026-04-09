import { executeAgent, type ToolRegistry } from "@personal-agent-os/agent-sdk";
import type { AgentDefinition, Job } from "@personal-agent-os/shared";

export async function executePlan(
  agentDefinition: AgentDefinition,
  job: Job,
  registry: ToolRegistry
) {
  return executeAgent(
    agentDefinition,
    job,
    {
      now: () => new Date().toISOString(),
      logger: { info: () => undefined }
    },
    registry
  );
}
