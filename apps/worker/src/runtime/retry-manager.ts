import type { AgentDAG, AgentNode, EvaluationResult, EvaluatorNode, NodeFeedback } from "@personal-agent-os/shared";
import { ExecutionState } from "./execution-state.js";

const DEFAULT_MAX_RETRY_ATTEMPTS = 2;

export function getDownstreamNodes(nodeId: string, dag: AgentDAG, visited = new Set<string>()): string[] {
  const outgoing = dag.edges.filter((edge) => (edge.type ?? "data") === "data" && edge.from === nodeId).map((edge) => edge.to);
  for (const nodeId of outgoing) {
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    getDownstreamNodes(nodeId, dag, visited);
  }

  return Array.from(visited);
}

function getEvaluationResult(output: { data: unknown }): EvaluationResult | null {
  if (!output.data || typeof output.data !== "object" || Array.isArray(output.data)) {
    return null;
  }

  return output.data as EvaluationResult;
}

export function shouldRetry(node: AgentNode, output: { data: unknown }): boolean {
  if (node.type !== "evaluator") {
    return false;
  }

  const critique = getEvaluationResult(output);
  return critique?.shouldRetry === true;
}

function resolveRetryTargetNodeId(
  dag: AgentDAG,
  evaluatorNode: EvaluatorNode,
  result: EvaluationResult
): string {
  const targetNodeId =
    typeof result.retryTargetNodeId === "string" && result.retryTargetNodeId.trim().length > 0
      ? result.retryTargetNodeId
      : evaluatorNode.id;

  if (!dag.nodes.some((node) => node.id === targetNodeId)) {
    throw new Error(`Retry target node "${targetNodeId}" requested by evaluator "${evaluatorNode.id}" was not found in DAG "${dag.id}"`);
  }

  return targetNodeId;
}

export function applyEvaluatorRetry(
  dag: AgentDAG,
  evaluatorNode: EvaluatorNode,
  output: { data: unknown },
  feedback: NodeFeedback,
  state: ExecutionState
) : string[] {
  const result = getEvaluationResult(output);
  if (!result?.shouldRetry) {
    return [];
  }

  const maxRetries = evaluatorNode.execution?.retryPolicy?.maxRetries ?? DEFAULT_MAX_RETRY_ATTEMPTS;
  const targetNodeId = resolveRetryTargetNodeId(dag, evaluatorNode, result);

  if (state.getRetryCount(targetNodeId) >= maxRetries) {
    return [];
  }

  const downstreamNodeIds = getDownstreamNodes(targetNodeId, dag);
  state.clearSubgraph([targetNodeId, ...downstreamNodeIds]);
  state.markForRetry(targetNodeId);
  feedback.targetNodeId = targetNodeId;

  return [targetNodeId, ...downstreamNodeIds];
}

export const __test__ = {
  getDownstreamNodes
};
