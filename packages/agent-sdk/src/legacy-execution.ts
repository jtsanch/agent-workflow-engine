import type { AgentDefinition, Job } from "@personal-agent-os/shared";
import type { ExecutionContext } from "./types.js";
import type { ToolRegistry } from "./tool-registry.js";

export interface AgentExecutionResult {
  steps: Array<{
    name: string;
    detail: Record<string, unknown>;
  }>;
  output: Record<string, unknown>;
}

export async function executeAgent(
  agentDefinition: AgentDefinition,
  job: Job,
  context: ExecutionContext,
  registry: ToolRegistry
): Promise<AgentExecutionResult> {
  context.logger.info("Executing legacy single-agent path", {
    agentDefinitionKey: agentDefinition.key,
    jobId: job.id
  });

  const llmTool = registry.get("llm.generateText");
  const notificationTool = registry.get("notifications.send");
  const generated = await llmTool.run(
    {
      prompt: (agentDefinition.promptTemplate ?? "Execute agent for {{jobName}}").replace("{{jobName}}", job.name),
      ...job.inputs
    },
    context
  );

  const notified = await notificationTool.run(
    {
      channel: "email",
      destination: String(job.inputs.email ?? "demo@example.com"),
      message: `Workflow output ready for ${job.name}`
    },
    context
  );

  return {
    steps: [
      { name: "generate", detail: generated },
      { name: "notify", detail: notified }
    ],
    output: {
      summary: generated.text ?? "Completed legacy execution",
      notification: notified
    }
  };
}

