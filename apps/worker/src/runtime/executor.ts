import { executeAgent, type ExecutionContext, type ToolRegistry } from "@personal-agent-os/agent-sdk";
import type { AgentDefinition, Job } from "@personal-agent-os/shared";

export async function executePlan(
  agentDefinition: AgentDefinition,
  job: Job,
  registry: ToolRegistry,
  context: ExecutionContext
) {
  return executeAgent(agentDefinition, job, context, registry);
}
