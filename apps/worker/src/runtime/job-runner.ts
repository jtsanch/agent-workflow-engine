import { seedAgentDefinitions } from "../../../../packages/agent-sdk/src/definitions.js";
import { createLlmBudget } from "../../../../packages/agent-sdk/src/tools/llm-budget.js";
import type { ExecutionContext } from "../../../../packages/agent-sdk/src/types.js";
import { createToolRegistry } from "../tools/registry.js";
import type { Job } from "@personal-agent-os/shared";
import { executeDAG } from "./dag-engine.js";

export async function runJob(job: Job) {
  const agentDefinition = seedAgentDefinitions.find(
    (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );
  if (!agentDefinition) {
    throw new Error(`Unknown agent definition for dag: ${job.dagId}`);
  }

  const context: ExecutionContext = {
    jobInput: job.inputs,
    registry: createToolRegistry(),
    nodeOutputs: {},
    memoryStore: {},
    now: () => new Date().toISOString(),
    logger: { info: () => undefined },
    llmBudget: createLlmBudget()
  };

  const result = await executeDAG(
    agentDefinition.dag,
    job.inputs,
    `run_${job.id}`,
    context
  );

  return result;
}
