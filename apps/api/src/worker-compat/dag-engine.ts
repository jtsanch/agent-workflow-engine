import type { AgentDAG, EvaluationResult, NodeExecution, NodeFeedback } from "@personal-agent-os/shared";
import type { ExecutionContext, ToolRegistry } from "@personal-agent-os/agent-sdk";

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

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
  inputMapping: Record<string, string>,
  jobInputs: Record<string, unknown>,
  outputs: Map<string, Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(inputMapping).map(([key, source]) => {
      if (source.startsWith("$job.")) {
        return [key, jobInputs[source.slice(5)]];
      }

      return [key, getNodeOutput(outputs, source)];
    })
  );
}

function renderTemplate(template: string, input: Record<string, unknown>): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path) => {
    const value = path.split(".").reduce((current: unknown, segment: string) => {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, input);

    return typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
  });
}

function createFeedback(nodeId: string, result: EvaluationResult, context: ExecutionContext): NodeFeedback {
  return {
    id: createId("feedback"),
    nodeExecutionId: "",
    sourceNodeId: nodeId,
    targetNodeId: "",
    score: result.score,
    shouldRetry: result.shouldRetry,
    summary: result.issues.join("; ") || (result.passed ? "Output passed evaluator review." : "Evaluator reported issues."),
    createdAt: context.now()
  };
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

      const incoming = dag.edges.filter((edge) => (edge.type ?? "data") === "data" && edge.to === node.id);
      return incoming.every((edge) => completed.has(edge.from));
    });

    if (runnable.length === 0) {
      break;
    }

    for (const node of runnable) {
      const startedAt = Date.now();
      const input = resolveNodeInput(node.inputMapping, jobInputs, outputs);
      let detail: Record<string, unknown>;
      let feedback: NodeFeedback | undefined;

      switch (node.type) {
        case "tool":
          detail = node.execute ? await node.execute(input) : await registry.execute(node.tool, input, context);
          break;
        case "transform":
          detail = node.transform(input) as Record<string, unknown>;
          break;
        case "llm": {
          const llmResult = await registry.execute(
            "llm.generateText",
            {
              prompt: renderTemplate(node.promptTemplate, input),
              responseFormat: "json"
            },
            context
          );
          detail = typeof llmResult.text === "string" ? (JSON.parse(llmResult.text) as Record<string, unknown>) : {};
          break;
        }
        case "evaluator": {
          const llmResult = await registry.execute(
            "llm.generateText",
            {
              prompt: renderTemplate(node.promptTemplate, input),
              responseFormat: "json"
            },
            context
          );
          detail = typeof llmResult.text === "string" ? (JSON.parse(llmResult.text) as Record<string, unknown>) : {};
          feedback = createFeedback(node.id, detail as unknown as EvaluationResult, context);
          break;
        }
      }

      outputs.set(node.id, detail);
      completed.add(node.id);
      steps.push({ name: node.id, detail });

      const completedAt = Date.now();
      const execution: NodeExecution = {
        id: createId("nodeexec"),
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
