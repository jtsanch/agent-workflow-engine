import type { AgentDAG, AgentNode, JsonObject, NodeExecution, NodeFeedback, NodeOutput, ToolInvocation } from "@personal-agent-os/shared";
import type { ExecutionContext, ToolRegistry } from "@personal-agent-os/agent-sdk";

function getByPath(source: unknown, path?: string): unknown {
  if (!path) {
    return source;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function resolveNodeInput(
  node: AgentNode,
  jobInputs: Record<string, unknown>,
  outputs: Map<string, NodeOutput>,
  context: ExecutionContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const binding of node.input?.bindings ?? []) {
    const ref = binding.ref;

    if (ref.source === "job_input") {
      result[binding.key] = getByPath(jobInputs, ref.path);
    } else if (ref.source === "node_output") {
      result[binding.key] = getByPath(outputs.get(ref.nodeId)?.data, ref.path);
    } else if (ref.source === "static") {
      result[binding.key] = ref.value;
    } else if (ref.source === "context") {
      result[binding.key] = getByPath(context, ref.path);
    }
  }

  return result;
}

function normalizeOutput(result: unknown): NodeOutput {
  if (
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    "artifacts" in result
  ) {
    return result as NodeOutput;
  }

  return {
    data: result,
    artifacts: []
  };
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

function buildEvaluatorFeedback(node: AgentNode, output: Record<string, unknown>, now: string): NodeFeedback {
  return {
    id: `feedback_${Math.random().toString(36).slice(2, 10)}`,
    nodeExecutionId: "",
    sourceNodeId: node.id,
    targetNodeId: "",
    score: typeof output.score === "number" ? output.score : 0,
    shouldRetry: Boolean(output.shouldRetry),
    summary: typeof output.summary === "string" ? output.summary : "Evaluator finished",
    createdAt: now
  };
}

function buildNodeExecution(
  node: AgentNode,
  input: Record<string, unknown>,
  output: NodeOutput,
  startedAt: number,
  completedAt: number,
  feedback?: NodeFeedback
): NodeExecution {
  return {
    id: `nodeexec_${Math.random().toString(36).slice(2, 10)}`,
    jobRunId: "",
    nodeId: node.id,
    nodeVersion: node.version,
    nodeType: node.type,
    status: feedback?.shouldRetry ? "retry_scheduled" : "succeeded",
    input: toJsonObject(input),
    resolvedInput: input,
    output,
    latencyMs: completedAt - startedAt,
    tokenUsage: 0,
    retryCount: 0,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString()
  };
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

export async function executeDagCompat(
  dag: AgentDAG,
  jobInputs: Record<string, unknown>,
  registry: ToolRegistry,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const outputs = new Map<string, NodeOutput>();
  const completed = new Set<string>();
  const nodeExecutions: NodeExecution[] = [];
  const toolInvocations: ToolInvocation[] = [];
  const nodeFeedback: NodeFeedback[] = [];

  while (!dag.exitNodeIds.every((nodeId) => completed.has(nodeId))) {
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
      const input = resolveNodeInput(node, jobInputs, outputs, context);
      let result: unknown;
      let feedback: NodeFeedback | undefined;

      switch (node.type) {
        case "tool":
          result = await registry.execute(node.toolName, input, context);
          break;
        case "transform":
          result = await node.run(toJsonObject(input), context);
          break;
        case "llm":
          result = {
            summary: `Compat output for ${node.name}`,
            input
          };
          break;
        case "evaluator":
          result = {
            score: 0.8,
            passed: true,
            issues: [],
            summary: "Compat evaluator pass",
            shouldRetry: false
          };
          feedback = buildEvaluatorFeedback(node, result as Record<string, unknown>, context.now());
          break;
        case "condition":
          result = {
            selectedBranch: node.defaultToNodeId ?? node.branches?.[0]?.toNodeId ?? ""
          };
          break;
      }

      const output = normalizeOutput(result);
      outputs.set(node.id, output);
      completed.add(node.id);

      const completedAt = Date.now();
      const execution = buildNodeExecution(node, input, output, startedAt, completedAt, feedback);
      nodeExecutions.push(execution);

      if (node.type === "tool") {
        toolInvocations.push({
          id: `tool_${Math.random().toString(36).slice(2, 10)}`,
          nodeExecutionId: execution.id,
          toolName: node.toolName,
          request: toJsonObject(input),
          response:
            output.data && typeof output.data === "object" && !Array.isArray(output.data)
              ? toJsonObject(output.data as Record<string, unknown>)
              : toJsonObject({ value: output.data }),
          status: "succeeded",
          createdAt: new Date(completedAt).toISOString()
        });
      }

      if (feedback) {
        feedback.nodeExecutionId = execution.id;
        nodeFeedback.push(feedback);
      }
    }
  }

  if (dag.exitNodeIds.length === 1) {
    return {
      finalOutput: outputs.get(dag.exitNodeIds[0])?.data,
      nodeExecutions,
      toolInvocations,
      nodeFeedback,
      memoryWrites: []
    };
  }

  return {
    finalOutput: Object.fromEntries(
      dag.exitNodeIds.map((nodeId) => [nodeId, outputs.get(nodeId)?.data])
    ),
    nodeExecutions,
    toolInvocations,
    nodeFeedback,
    memoryWrites: []
  };
}
