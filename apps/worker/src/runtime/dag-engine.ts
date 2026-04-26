import type {
  AgentDAG,
  AgentNode,
  JsonObject,
  NodeExecution,
  NodeFeedback,
  NodeOutput,
  ToolInvocation,
} from "@personal-agent-os/shared";
import type { RunContext } from "@personal-agent-os/agent-sdk";
import { ExecutionState } from "./execution-state.js";
import { resolveInputBindings } from "./input-resolver.js";
import { runNode } from "./node-runner.js";
import { applyEvaluatorRetry, shouldRetry } from "./retry-manager.js";
import { validateDag } from "./schema-utils.js";

function createInitialWorkingState() {
  return Object.freeze({
    data: Object.freeze({}),
    diagnostics: Object.freeze({
      usedFallbacks: Object.freeze([]),
      warnings: Object.freeze([]),
      constraintResults: Object.freeze({}),
      signals: Object.freeze({})
    })
  });
}

export class DAGExecutionError extends Error {
  constructor(
    message: string,
    public readonly nodeExecutions: NodeExecution[],
    public readonly nodeFeedback: NodeFeedback[]
  ) {
    super(message);
    this.name = "DAGExecutionError";
  }
}

function getExitNodeIds(dag: AgentDAG): string[] {
  return dag.nodes
    .filter((node) => !dag.edges.some((edge) => edge.from === node.id))
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right));
}

function getRunnableNodes(dag: AgentDAG, state: ExecutionState): AgentNode[] {
  return dag.nodes
    .filter((node) => {
      if ((state.runtime[state.getNodeInstanceId(node.id)]?.status ?? "pending") !== "pending") {
        return false;
      }

      const incomingDataEdges = dag.edges.filter((edge) => {
        return (edge.type ?? "data") === "data" && edge.to === node.id;
      });

      return incomingDataEdges.every(
        (edge) => state.runtime[state.getNodeInstanceId(edge.from)]?.status === "completed"
      );
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveNodeInput(node: AgentNode, state: ExecutionState): Record<string, unknown> {
  return resolveInputBindings(node.input?.bindings, state);
}

function createFailureExecution(
  jobRunId: string,
  node: AgentNode,
  input: Record<string, unknown>,
  retryCount: number,
  error: unknown,
  status: NodeExecution["status"] = "failed"
): NodeExecution {
  const now = new Date().toISOString();

  return {
    id: `nodeexec_${Math.random().toString(36).slice(2, 10)}`,
    jobRunId,
    nodeId: node.id,
    nodeVersion: node.version,
    nodeType: node.type,
    status,
    resolvedInput: input,
    output: {
      data: {
        errorMessage: error instanceof Error ? error.message : "Node execution failed"
      },
      artifacts: []
    },
    errorMessage: error instanceof Error ? error.message : "Node execution failed",
    latencyMs: 0,
    tokenUsage: 0,
    retryCount,
    startedAt: now,
    completedAt: now
  };
}

function assertSupportedNodeType(node: AgentNode): void {
  switch (node.type) {
    case "tool":
    case "llm":
    case "evaluator":
    case "transform":
    case "condition":
      return;
  }
}

type ExecutedNodeResult = {
  node: AgentNode;
  input: Record<string, unknown>;
  result: Awaited<ReturnType<typeof runNode>>;
};

function assertNoWriteConflicts(nodes: AgentNode[]): void {
  const writesByField = new Map<string, string[]>();

  for (const node of nodes) {
    const writes = (node as AgentNode & { writes?: string[] }).writes ?? [];
    for (const field of writes) {
      const nodeIds = writesByField.get(field) ?? [];
      nodeIds.push(node.id);
      writesByField.set(field, nodeIds);
    }
  }

  for (const [field, nodeIds] of writesByField.entries()) {
    if (nodeIds.length > 1) {
      throw new Error(`Write conflict on field "${field}" between nodes: ${nodeIds.join(", ")}`);
    }
  }
}

async function executeNodesBatch(
  runnableNodes: AgentNode[],
  jobRunId: string,
  state: ExecutionState,
  context: RunContext,
  nodeExecutions: NodeExecution[],
  nodeFeedback: NodeFeedback[]
): Promise<ExecutedNodeResult[]> {
  assertNoWriteConflicts(runnableNodes);
  const executedNodes: ExecutedNodeResult[] = [];

  for (const node of runnableNodes) {
    const retryCount = state.getRetryCount(node.id);
    state.markRunning(node.id);
    let input: Record<string, unknown> = {};

    try {
      input = resolveNodeInput(node, state);
      state.setNodeInput(node.id, input);
      assertSupportedNodeType(node);
      const result = await runNode(jobRunId, node, input, retryCount, context);
      state.completeExecution(node.id, result.output);
      executedNodes.push({ node, input, result });
    } catch (error) {
      const maxRetries = node.execution?.retryPolicy?.maxRetries ?? 0;
      const shouldRetry = state.recordFailure(node.id, error, maxRetries);
      nodeExecutions.push(
        createFailureExecution(
          jobRunId,
          node,
          input,
          retryCount,
          error,
          shouldRetry ? "retry_scheduled" : "failed"
        )
      );
      if (shouldRetry) {
        continue;
      }
      throw new DAGExecutionError(
        error instanceof Error ? error.message : "DAG execution failed",
        nodeExecutions,
        nodeFeedback
      );
    }
  }

  return executedNodes;
}

function collectOutputs(
  executedNodes: ExecutedNodeResult[],
  nodeExecutions: NodeExecution[],
  nodeFeedback: NodeFeedback[]
): void {
  for (const { result } of executedNodes) {
    nodeExecutions.push(result.execution);
    if (result.feedback) {
      nodeFeedback.push(result.feedback);
    }
  }
}

function collectOutputsForTests(
  executedNodes: ExecutedNodeResult[],
  _state: ExecutionState,
  _context: RunContext,
  nodeExecutions: NodeExecution[],
  nodeFeedback: NodeFeedback[]
): void {
  collectOutputs(executedNodes, nodeExecutions, nodeFeedback);
}

function scheduleRetries(
  dag: AgentDAG,
  executedNodes: ExecutedNodeResult[],
  state: ExecutionState,
): void {
  for (const { node, result } of executedNodes) {
    if (node.type !== "evaluator" || !result.feedback) {
      continue;
    }

    if (!shouldRetry(node, result.output)) {
      continue;
    }

    applyEvaluatorRetry(dag, node, result.output, result.feedback, state);
  }
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

function toToolInvocationStatus(status: NodeExecution["status"]): ToolInvocation["status"] {
  if (status === "failed") {
    return "failed";
  }

  if (status === "pending" || status === "running") {
    return "pending";
  }

  return "succeeded";
}

function toToolInvocationResponse(output: NodeOutput | undefined): JsonObject | undefined {
  if (!output) {
    return undefined;
  }

  if (output.data && typeof output.data === "object" && !Array.isArray(output.data)) {
    return toJsonObject(output.data as Record<string, unknown>);
  }

  return toJsonObject({ value: output.data ?? null });
}

function collectToolInvocations(dag: AgentDAG, nodeExecutions: NodeExecution[]): ToolInvocation[] {
  const toolNodesById = new Map(
    dag.nodes
      .filter((node): node is Extract<AgentNode, { type: "tool" }> => node.type === "tool")
      .map((node) => [node.id, node])
  );

  return nodeExecutions.flatMap((execution) => {
    if (execution.nodeType !== "tool") {
      return [];
    }

    const toolNode = toolNodesById.get(execution.nodeId);
    if (!toolNode) {
      return [];
    }

    return [{
      id: `tool_${Math.random().toString(36).slice(2, 10)}`,
      nodeExecutionId: execution.id,
      toolName: toolNode.toolName,
      request: toJsonObject(execution.input ?? execution.resolvedInput),
      response: toToolInvocationResponse(execution.output),
      status: toToolInvocationStatus(execution.status),
      createdAt: execution.completedAt ?? execution.startedAt
    }];
  });
}

export type ExecutionResult = {
  finalOutput: unknown;
  nodeExecutions: NodeExecution[];
  toolInvocations: ToolInvocation[];
  nodeFeedback: NodeFeedback[];
  memoryWrites: Array<{
    key: string;
    value: unknown;
    nodeId?: string;
  }>;
};

export type DAGExecutionResult = ExecutionResult;

export async function executeDAG(
  dag: AgentDAG,
  initialInputs: Record<string, unknown>,
  jobRunId: string,
  context: RunContext
): Promise<DAGExecutionResult> {

  validateDag(dag);

  const state = new ExecutionState(initialInputs, dag);
  const nodeExecutions: NodeExecution[] = [];
  const nodeFeedback: NodeFeedback[] = [];
  const exitNodeIds = getExitNodeIds(dag);

  while (!exitNodeIds.every((nodeId) => state.runtime[state.getNodeInstanceId(nodeId)]?.status === "completed")) {
    const runnableNodes = getRunnableNodes(dag, state);
    if (runnableNodes.length === 0) {
      break;
    }

    const executedNodes = await executeNodesBatch(
      runnableNodes,
      jobRunId,
      state,
      context,
      nodeExecutions,
      nodeFeedback
    );

    collectOutputs(executedNodes, nodeExecutions, nodeFeedback);
    scheduleRetries(dag, executedNodes, state);
  }

  return {
    finalOutput: collectFinalOutputs(dag, state),
    nodeExecutions,
    toolInvocations: collectToolInvocations(dag, nodeExecutions),
    nodeFeedback,
    memoryWrites: []
  };
}

function collectFinalOutputs(
    dag: AgentDAG,
    state: ExecutionState
): unknown {
  const exitNodeIds = dag.nodes
    .filter((node) => !dag.edges.some((edge) => edge.from === node.id))
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right));

  if (exitNodeIds.length === 1) {
    const exitNodeOutputs = state.getNodeOutputs(exitNodeIds[0]) || [];
    return exitNodeOutputs.length === 1 ? exitNodeOutputs[0].data : undefined;
  }

  return Object.fromEntries(
    exitNodeIds.map((nodeId) => {
      const exitNodeOutputs = state.getNodeOutputs(nodeId) || [];
      const data = exitNodeOutputs.length === 1 ? exitNodeOutputs[0].data : undefined;
      return [nodeId, data];
    })
  );
}

export const __test__ = {
  createFailureExecution,
  assertNoWriteConflicts,
  executeNodesBatch,
  scheduleRetries,
  getRunnableNodes,
  collectOutputs: collectOutputsForTests,
  collectToolInvocations,
  collectFinalOutputs,
  createInitialWorkingState,
};
