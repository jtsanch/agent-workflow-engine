import type { AgentDefinition, Job } from "../domain/types.js";

export function renderPromptTemplate(agentDefinition: AgentDefinition, job: Job): string {
  return (agentDefinition.promptTemplate ?? "Execute workflow for {{jobName}}").replace("{{jobName}}", job.name);
}

export function summarizeJobInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}
