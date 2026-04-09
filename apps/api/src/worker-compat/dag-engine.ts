import type { AgentDAG, AgentNode } from "@personal-agent-os/shared";
import type { ExecutionContext, ToolRegistry } from "@personal-agent-os/agent-sdk";

function getNodeOutput(outputs: Map<string, Record<string, unknown>>, path: string): unknown {
  const [nodeId, ...rest] = path.split(".");
  const base = outputs.get(nodeId) ?? {};
  return rest.reduce<unknown>((current, segment) => {
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
}> {
  const outputs = new Map<string, Record<string, unknown>>();
  const completed = new Set<string>();
  const steps: Array<{ name: string; detail: Record<string, unknown> }> = [];

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
      const input = resolveNodeInput(node, jobInputs, outputs);
      let detail: Record<string, unknown>;

      if (node.type === "aggregator") {
        detail = { ...input };
      } else if (node.type === "evaluator") {
        const candidate = String(input.candidate ?? input.summary ?? "");
        detail = {
          score: candidate.length > 40 ? 0.88 : 0.52,
          shouldRetry: false,
          summary: "Compatibility evaluator pass"
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
    }
  }

  return {
    output: outputs.get(dag.exitNodeId) ?? {},
    steps
  };
}

