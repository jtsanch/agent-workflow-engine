import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import type { Job } from "@personal-agent-os/shared";
import { evaluateRun } from "./evaluator.js";
import { updateMemory } from "./memory.js";
import { executeDAG } from "./dag-engine.js";
import { createToolRegistry } from "../tools/registry.js";
import { executePlan } from "./executor.js";
import { planJob } from "./planner.js";

export async function runJob(job: Job) {
  const agentDefinition = seedAgentDefinitions.find(
    (agent) => agent.dag.id === job.dagId || agent.key === job.agentDefinitionKey
  );
  if (!agentDefinition) {
    throw new Error(`Unknown agent definition for dag: ${job.dagId}`);
  }

  if (!job.dagId) {
    const plan = planJob(agentDefinition, job);
    const result = await executePlan(agentDefinition, job, createToolRegistry());
    const evaluation = evaluateRun(result.output);
    const memory = updateMemory(job.id, result.output);

    return {
      plan,
      result,
      evaluation,
      memory,
      nodeExecutions: [],
      nodeFeedback: []
    };
  }

  const result = await executeDAG(
    agentDefinition.dag,
    job.inputs,
    `run_${job.id}`,
    {
      now: () => new Date().toISOString(),
      logger: { info: () => undefined }
    }
  );
  const evaluation = evaluateRun(result.output);
  const memory = updateMemory(job.id, result.output);

  return {
    result,
    evaluation,
    memory,
    nodeExecutions: result.nodeExecutions,
    nodeFeedback: result.nodeFeedback
  };
}
