import { seedAgentDefinitions } from "../../../../packages/agent-sdk/src/definitions.js";
import { createLlmBudget } from "../../../../packages/agent-sdk/src/tools/llm-budget.js";
import type { ExecutionContext as BaseExecutionContext } from "../../../../packages/agent-sdk/src/types.js";
import { createToolRegistry } from "../tools/registry.js";
import type { Job } from "@personal-agent-os/shared";
import { executeDAG } from "./dag-engine.js";

type WorkingState = {
  data: Record<string, unknown>;
  diagnostics: {
    usedFallbacks: string[];
    warnings: string[];
    constraintResults: Record<string, boolean>;
    signals: Record<string, unknown>;
  };
};

type ExecutionContext = BaseExecutionContext & { workingState: WorkingState };

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
    workingState: {
      data: {},
      diagnostics: {
        usedFallbacks: [],
        warnings: [],
        constraintResults: {},
        signals: {}
      }
    },
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
