import { seedAgentDefinitions, createLlmBudget } from "@personal-agent-os/agent-sdk";
import type { RunContext } from "@personal-agent-os/agent-sdk";
import { createToolRegistry } from "../tools/registry.js";
import type { Job } from "@personal-agent-os/shared";
import { getOrCompileDAG } from "./compile-dag.js";
import { executeDAG } from "./dag-engine.js";

export async function runJob(job: Job) {
  const agentDefinition = seedAgentDefinitions.find(
    (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );
  if (!agentDefinition) {
    throw new Error(`Unknown agent definition for dag: ${job.dagId}`);
  }

  const context: RunContext = {
    registry: createToolRegistry(),
    now: () => new Date().toISOString(),
    logger: { info: () => undefined },
    llmBudget: createLlmBudget()
  };
  const compiled = getOrCompileDAG(agentDefinition);

  const result = await executeDAG(
    compiled,
    job.inputs,
    `run_${job.id}`,
    context
  );

  return result;
}
