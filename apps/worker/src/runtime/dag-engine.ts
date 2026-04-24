import type { AgentDAG, AgentNode, JsonObject, NodeExecution, NodeFeedback, NodeOutput, ToolInvocation } from "@personal-agent-os/shared";
import type { ExecutionContext } from "@personal-agent-os/agent-sdk";
import { ExecutionState } from "./execution-state.js";
import { resolveInputBindings } from "./input-resolver.js";
import { runNode } from "./node-runner.js";
import { applyFeedbackRetry, shouldRetry } from "./retry-manager.js";
import { validateDag } from "./schema-utils.js";

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

function getRunnableNodes(dag: AgentDAG, state: ExecutionState): AgentNode[] {
  return dag.nodes
    .filter((node) => {
      if (state.isCompleted(node.id) || state.isRunning(node.id)) {
        return false;
      }

      const incomingDataEdges = dag.edges.filter((edge) => {
        return (edge.type ?? "data") === "data" && edge.to === node.id;
      });
      if (incomingDataEdges.length === 0) {
        return dag.entryNodeIds.includes(node.id) || state.isRetryPending(node.id);
      }

      return incomingDataEdges.every((edge) => state.isCompleted(edge.from));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveNodeInput(node: AgentNode, state: ExecutionState, context: ExecutionContext): Record<string, unknown> {
  return resolveInputBindings(node.input?.bindings, {
    ...context,
    jobInput: context.jobInput,
    nodeOutputs: context.nodeOutputs
  });
}

function createFailureExecution(
  jobRunId: string,
  node: AgentNode,
  input: Record<string, unknown>,
  retryCount: number,
  error: unknown
): NodeExecution {
  const now = new Date().toISOString();

  return {
    id: `nodeexec_${Math.random().toString(36).slice(2, 10)}`,
    jobRunId,
    nodeId: node.id,
    nodeVersion: node.version,
    nodeType: node.type,
    status: "failed",
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

async function executeNodesBatch(
  runnableNodes: AgentNode[],
  jobRunId: string,
  state: ExecutionState,
  context: ExecutionContext,
  nodeExecutions: NodeExecution[],
  nodeFeedback: NodeFeedback[]
): Promise<ExecutedNodeResult[]> {
  const executedNodes: ExecutedNodeResult[] = [];

  for (const node of runnableNodes) {
    state.markRunning(node.id);
    const input = resolveNodeInput(node, state, context);

    try {
      assertSupportedNodeType(node);
      const result = await runNode(jobRunId, node, input, state.getRetryCount(node.id), context);
      executedNodes.push({ node, input, result });
    } catch (error) {
      nodeExecutions.push(
        createFailureExecution(jobRunId, node, input, state.getRetryCount(node.id), error)
      );
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
  state: ExecutionState,
  context: ExecutionContext,
  nodeExecutions: NodeExecution[],
  nodeFeedback: NodeFeedback[]
): void {
  for (const { node, result } of executedNodes) {
    nodeExecutions.push(result.execution);
    state.store(node.id, result.output);
    context.nodeOutputs = context.nodeOutputs ?? {};
    context.nodeOutputs[node.id] = result.output;

    if (result.feedback) {
      nodeFeedback.push(result.feedback);
    }
  }
}

function scheduleRetries(
  dag: AgentDAG,
  executedNodes: ExecutedNodeResult[],
  state: ExecutionState
): void {
  for (const { node, result } of executedNodes) {
    if (node.type !== "evaluator" || !result.feedback) {
      continue;
    }

    if (!shouldRetry(node, result.output, state)) {
      continue;
    }

    const feedbackTargets = applyFeedbackRetry(dag, node, result.feedback, state);
    if (feedbackTargets[0]) {
      result.feedback.targetNodeId = feedbackTargets[0];
    }
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
  context: ExecutionContext
): Promise<DAGExecutionResult> {

  validateDag(dag);

  const state = new ExecutionState(initialInputs);
  const nodeExecutions: NodeExecution[] = [];
  const nodeFeedback: NodeFeedback[] = [];
  context.jobInput = initialInputs;
  context.nodeOutputs = {};

  while (!state.isComplete(dag)) {
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

    collectOutputs(executedNodes, state, context, nodeExecutions, nodeFeedback);
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
  if (dag.exitNodeIds.length === 1) {
    return state.getNodeOutput(dag.exitNodeIds[0])?.data;
  }

  return Object.fromEntries(
    dag.exitNodeIds.map((nodeId) => [nodeId, state.getNodeOutput(nodeId)?.data])
  );
}

export const __test__ = {
  createFailureExecution,
  executeNodesBatch,
  scheduleRetries
};
