import type { AgentDAG, AgentNode, NodeExecution, NodeFeedback } from "@personal-agent-os/shared";
import type { ExecutionContext } from "@personal-agent-os/agent-sdk";
import { ExecutionState } from "./execution-state.js";
import { resolveInputs } from "./input-resolver.js";
import { runNode } from "./node-runner.js";
import { applyFeedbackRetry, shouldRetry } from "./retry-manager.js";

function getNode(dag: AgentDAG, nodeId: string): AgentNode {
  const node = dag.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Unknown DAG node: ${nodeId}`);
  }

  return node;
}

function getRunnableNodes(dag: AgentDAG, state: ExecutionState): AgentNode[] {
  return dag.nodes.filter((node) => {
    if (state.isCompleted(node.id) || state.isRunning(node.id)) {
      return false;
    }

    const incomingDataEdges = dag.edges.filter((edge) => edge.type === "data" && edge.to === node.id);
    if (incomingDataEdges.length === 0) {
      return dag.entryNodeIds.includes(node.id) || state.isRetryPending(node.id);
    }

    return incomingDataEdges.every((edge) => state.isCompleted(edge.from));
  });
}

export interface DAGExecutionResult {
  output: Record<string, unknown>;
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
}

export async function executeDAG(
  dag: AgentDAG,
  initialInputs: Record<string, unknown>,
  jobRunId: string,
  context: ExecutionContext
): Promise<DAGExecutionResult> {
  const state = new ExecutionState(initialInputs);
  const nodeExecutions: NodeExecution[] = [];
  const nodeFeedback: NodeFeedback[] = [];

  while (!state.isComplete(dag)) {
    const runnableNodes = getRunnableNodes(dag, state);
    if (runnableNodes.length === 0) {
      break;
    }

    for (const node of runnableNodes) {
      state.markRunning(node.id);
      const input = resolveInputs(node, state);
      const result = await runNode(jobRunId, node, input, state.getRetryCount(node.id), context);

      nodeExecutions.push(result.execution);
      state.store(node.id, result.output);

      if (result.feedback) {
        nodeFeedback.push(result.feedback);
      }

      if (shouldRetry(node, result.output, state) && result.feedback) {
        const feedbackTargets = applyFeedbackRetry(dag, node, result.feedback, state);
        if (feedbackTargets[0]) {
          result.feedback.targetNodeId = feedbackTargets[0];
        }
      }
    }
  }

  return {
    output: state.getNodeOutput(dag.exitNodeId) ?? {},
    nodeExecutions,
    nodeFeedback
  };
}

