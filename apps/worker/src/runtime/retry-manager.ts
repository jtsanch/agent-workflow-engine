import type { AgentDAG, AgentNode, EvaluatorNode, NodeFeedback } from "@personal-agent-os/shared";
import { ExecutionState } from "./execution-state.js";

function collectDownstreamNodeIds(dag: AgentDAG, startNodeId: string, visited = new Set<string>()): string[] {
  const outgoing = dag.edges.filter((edge) => (edge.type ?? "data") === "data" && edge.from === startNodeId).map((edge) => edge.to);
  for (const nodeId of outgoing) {
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    collectDownstreamNodeIds(dag, nodeId, visited);
  }

  return Array.from(visited);
}

export function shouldRetry(node: AgentNode, output: { data: unknown }, state: ExecutionState): boolean {
  if (node.type !== "evaluator" || !node.execution?.retryPolicy) {
    return false;
  }

  const critique =
    output.data && typeof output.data === "object" && !Array.isArray(output.data)
      ? output.data as Record<string, unknown>
      : {};

  if (!critique.shouldRetry) {
    return false;
  }

  return state.getRetryCount(node.id) < node.execution.retryPolicy.maxRetries;
}

export function applyFeedbackRetry(
  dag: AgentDAG,
  evaluatorNode: EvaluatorNode,
  feedback: NodeFeedback,
  state: ExecutionState
): string[] {
  const feedbackTargets = dag.edges
    .filter((edge) => (edge.type ?? "data") === "feedback" && edge.from === evaluatorNode.id)
    .map((edge) => edge.to);

  for (const targetNodeId of feedbackTargets) {
    state.markForRetry(targetNodeId);
    const downstream = collectDownstreamNodeIds(dag, targetNodeId);
    state.clearSubgraph(downstream);
  }

  return feedbackTargets;
}
