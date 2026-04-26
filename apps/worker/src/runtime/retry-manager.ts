import type {
  AgentDAG,
  AgentNode,
  CompiledDAG,
  EvaluationResult,
  EvaluatorNode,
  NodeFeedback
} from "@personal-agent-os/shared";
import { compileDAG } from "./compile-dag.js";
import { ExecutionState } from "./execution-state.js";

export function getDownstreamNodes(
  nodeId: string,
  graph: CompiledDAG["graph"],
  visited = new Set<string>()
): string[] {
  const outgoing = graph.forward[nodeId] ?? new Set<string>();

  for (const next of outgoing) {
    if (!visited.has(next)) {
      visited.add(next);
      getDownstreamNodes(next, graph, visited);
    }
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
  if (node.type !== "evaluator" || !node.execution?.retryPolicy) {
    return false;
  }

  const critique = getEvaluationResult(output);
  return critique?.shouldRetry === true;
}

function resolveRetryTargetNodeId(
  dag: AgentDAG | CompiledDAG,
  evaluatorNode: EvaluatorNode,
  result: EvaluationResult
): string {
  const compiledDAG = "graph" in dag ? dag : compileDAG(dag);
  const targetNodeId =
    typeof result.retryTargetNodeId === "string" && result.retryTargetNodeId.trim().length > 0
      ? result.retryTargetNodeId
      : evaluatorNode.id;

  if (!compiledDAG.nodeMap.has(targetNodeId)) {
    throw new Error(
      `Retry target node "${targetNodeId}" requested by evaluator "${evaluatorNode.id}" was not found`
    );
  }

  return targetNodeId;
}

export function applyEvaluatorRetry(
  dag: AgentDAG | CompiledDAG,
  evaluatorNode: EvaluatorNode,
  output: { data: unknown },
  feedback: NodeFeedback,
  state: ExecutionState
) : string[] {
  if (!evaluatorNode.execution?.retryPolicy) {
    return [];
  }

  const result = getEvaluationResult(output);
  if (!result?.shouldRetry) {
    return [];
  }

  const compiledDAG = "graph" in dag ? dag : compileDAG(dag);
  const maxRetries = evaluatorNode.execution.retryPolicy.maxRetries;
  const targetNodeId = resolveRetryTargetNodeId(compiledDAG, evaluatorNode, result);

  if (state.getRetryCount(targetNodeId) >= maxRetries) {
    return [];
  }

  const downstreamNodeIds = getDownstreamNodes(targetNodeId, compiledDAG.graph);
  state.clearSubgraph([targetNodeId, ...downstreamNodeIds]);
  state.markForRetry(targetNodeId);
  feedback.targetNodeId = targetNodeId;

  return [targetNodeId, ...downstreamNodeIds];
}

export const __test__ = {
  getDownstreamNodes: (nodeId: string, dag: AgentDAG | CompiledDAG) => {
    const compiledDAG = "graph" in dag ? dag : compileDAG(dag);
    return getDownstreamNodes(nodeId, compiledDAG.graph);
  }
};
