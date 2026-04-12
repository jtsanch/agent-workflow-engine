import type { AgentDAG, AgentNode, NodeExecution, NodeFeedback } from "@personal-agent-os/shared";
import type { ExecutionContext, ToolRegistry } from "@personal-agent-os/agent-sdk";

function getNodeOutput(outputs: Map<string, Record<string, unknown>>, path: string): unknown {
  const [nodeId, ...rest] = path.split(".");
  const base = outputs.get(nodeId) ?? {};
  return rest.reduce((current: unknown, segment: string) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, base);
}

function resolveNodeInput(
  node: AgentNode,
  jobInputs: Record<string, unknown>,
  outputs: Map<string, Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node.inputMapping).map(([key, source]) => {
      if (source.startsWith("$job.")) {
        return [key, jobInputs[source.slice(5)]];
      }

      return [key, getNodeOutput(outputs, source)];
    })
  );
}

export async function executeDagCompat(
  dag: AgentDAG,
  jobInputs: Record<string, unknown>,
  registry: ToolRegistry,
  context: ExecutionContext
): Promise<{
  output: Record<string, unknown>;
  steps: Array<{ name: string; detail: Record<string, unknown> }>;
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
}> {
  const outputs = new Map<string, Record<string, unknown>>();
  const completed = new Set<string>();
  const steps: Array<{ name: string; detail: Record<string, unknown> }> = [];
  const nodeExecutions: NodeExecution[] = [];
  const nodeFeedback: NodeFeedback[] = [];

  while (!completed.has(dag.exitNodeId)) {
    const runnable = dag.nodes.filter((node) => {
      if (completed.has(node.id)) {
        return false;
      }

      const incoming = dag.edges.filter((edge) => edge.type === "data" && edge.to === node.id);
      return incoming.every((edge) => completed.has(edge.from));
    });

    if (runnable.length === 0) {
      break;
    }

    for (const node of runnable) {
      const startedAt = Date.now();
      const input = resolveNodeInput(node, jobInputs, outputs);
      let detail: Record<string, unknown> = {};
      let feedback: NodeFeedback | undefined;

      if (node.type === "aggregator") {
        detail = { ...input };
      } else if (node.type === "evaluator") {
        const candidate = String(input.candidate ?? input.summary ?? "");
        const score = candidate.length > 40 ? 0.88 : 0.52;
        const shouldRetry = score < 0.7;
        detail = {
          score,
          shouldRetry,
          summary: shouldRetry ? "Output needs one more refinement pass." : "Compatibility evaluator pass"
        };
        feedback = {
          id: `feedback_${Math.random().toString(36).slice(2, 10)}`,
          nodeExecutionId: "",
          sourceNodeId: node.id,
          targetNodeId: "",
          score,
          shouldRetry,
          summary: String(detail.summary),
          createdAt: context.now()
        };
      } else {
        detail = await registry.execute(
          node.agentKey,
          node.type === "llm"
            ? {
                ...input,
                prompt:
                  typeof input.prompt === "string"
                    ? input.prompt
                    : `Generate output for ${node.name} using ${JSON.stringify(input)}`
              }
            : input,
          context
        );
      }

      outputs.set(node.id, detail);
      completed.add(node.id);
      steps.push({ name: node.id, detail });
      const completedAt = Date.now();
      const execution: NodeExecution = {
        id: `nodeexec_${Math.random().toString(36).slice(2, 10)}`,
        jobRunId: "",
        nodeId: node.id,
        nodeType: node.type,
        status: feedback?.shouldRetry ? "retry_scheduled" : "succeeded",
        input,
        output: detail,
        latencyMs: completedAt - startedAt,
        tokenUsage: Number(detail.tokensUsed ?? 0),
        retryCount: 0,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString()
      };
      nodeExecutions.push(execution);
      if (feedback) {
        feedback.nodeExecutionId = execution.id;
        nodeFeedback.push(feedback);
      }
    }
  }

  return {
    output: outputs.get(dag.exitNodeId) ?? {},
    steps,
    nodeExecutions,
    nodeFeedback
  };
}
