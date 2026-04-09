import type { AgentNode, NodeFeedback, NodeExecution } from "@personal-agent-os/shared";
import type { ExecutionContext } from "@personal-agent-os/agent-sdk";
import { createToolRegistry } from "@personal-agent-os/agent-sdk";

export interface NodeRunnerResult {
  output: Record<string, unknown>;
  execution: NodeExecution;
  feedback?: NodeFeedback;
}

export async function runNode(
  jobRunId: string,
  node: AgentNode,
  input: Record<string, unknown>,
  retryCount: number,
  context: ExecutionContext
): Promise<NodeRunnerResult> {
  const startedAt = Date.now();
  const registry = createToolRegistry();
  let output: Record<string, unknown>;
  let feedback: NodeFeedback | undefined;

  if (node.type === "tool") {
    output = await registry.execute(node.agentKey, input, context);
  } else if (node.type === "llm") {
    const prompt =
      typeof input.prompt === "string"
        ? input.prompt
        : `Generate workflow content for ${node.name} using ${JSON.stringify(input)}`;
    output = await registry.execute(node.agentKey, { ...input, prompt }, context);
  } else if (node.type === "aggregator") {
    output = {
      ...input,
      aggregatedAt: context.now()
    };
  } else {
    const candidate = String(input.candidate ?? "");
    const score = candidate.length > 40 ? 0.88 : 0.52;
    const shouldRetry = score < 0.7;
    output = {
      score,
      shouldRetry,
      summary: shouldRetry ? "Output needs one more refinement pass." : "Output passed evaluator review."
    };
    feedback = {
      id: `feedback_${Math.random().toString(36).slice(2, 10)}`,
      nodeExecutionId: "",
      sourceNodeId: node.id,
      targetNodeId: "",
      score,
      shouldRetry,
      summary: String(output.summary),
      createdAt: context.now()
    };
  }

  const completedAt = Date.now();
  const execution: NodeExecution = {
    id: `nodeexec_${Math.random().toString(36).slice(2, 10)}`,
    jobRunId,
    nodeId: node.id,
    nodeType: node.type,
    status: feedback?.shouldRetry ? "retry_scheduled" : "succeeded",
    input,
    output,
    latencyMs: completedAt - startedAt,
    tokenUsage: Number(output.tokensUsed ?? 0),
    retryCount,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString()
  };

  if (feedback) {
    feedback.nodeExecutionId = execution.id;
  }

  return { output, execution, feedback };
}

