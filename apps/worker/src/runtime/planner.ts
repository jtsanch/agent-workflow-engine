import type { AgentDefinition, Job } from "@personal-agent-os/shared";

export interface ExecutionPlan {
  prompt: string;
  toolHints: string[];
}

export function planJob(agentDefinition: AgentDefinition, job: Job): ExecutionPlan {
  return {
    prompt: (agentDefinition.promptTemplate ?? "Execute workflow for {{jobName}}").replace("{{jobName}}", job.name),
    toolHints: agentDefinition.dag.nodes.map((node) => node.agentKey)
  };
}
