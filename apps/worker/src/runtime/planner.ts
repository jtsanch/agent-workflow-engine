import type { AgentDefinition, Job, ExecutionPlan } from "@personal-agent-os/shared";

export function planJob(agentDefinition: AgentDefinition, job: Job): ExecutionPlan {
  return {
    prompt: `Execute workflow "${agentDefinition.name}" for job "${job.name}"`,
    toolHints: agentDefinition.dag.nodes
      .map((node) => (node.type === "tool" ? node.toolName : node.type))
  };
}
