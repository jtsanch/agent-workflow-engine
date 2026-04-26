import type { AgentDefinition } from "@personal-agent-os/shared";
import { Button } from "./Button.js";

interface DAGPreviewProps {
  agentDefinition: AgentDefinition;
  activeNodeId?: string;
  nodeMeta?: Record<string, { status?: string; retryCount?: number }>;
  onSelectNode?: (nodeId: string) => void;
}

export function DAGPreview({ agentDefinition, activeNodeId, nodeMeta, onSelectNode }: DAGPreviewProps) {
  const { dag } = agentDefinition;
  const downstreamNodeIdsByNodeId = Object.fromEntries(
    dag.nodes.map((node) => [node.id, [] as string[]])
  );

  for (const node of dag.nodes) {
    for (const binding of node.input?.bindings ?? []) {
      if (binding.ref.source !== "node_output") {
        continue;
      }

      downstreamNodeIdsByNodeId[binding.ref.nodeId] ??= [];
      downstreamNodeIdsByNodeId[binding.ref.nodeId].push(node.id);
    }
  }

  const terminalNodeIds = dag.nodes
    .filter((node) => (downstreamNodeIdsByNodeId[node.id] ?? []).length === 0)
    .map((node) => node.id);

  const describeOutputs = (schema: unknown) => {
    if (!schema || typeof schema !== "object") {
      return "none";
    }

    const candidate = schema as {
      type?: string;
      properties?: Record<string, unknown>;
    };

    if (candidate.type && candidate.type !== "object") {
      return candidate.type;
    }

    if (candidate.properties && typeof candidate.properties === "object") {
      return Object.keys(candidate.properties).join(", ") || "none";
    }

    return "none";
  };

  const describeRuntime = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return "workflow node";
    }

    const candidate = node as {
      toolName?: string;
      output?: { outputKind?: string };
      type?: string;
    };

    if (typeof candidate.toolName === "string") {
      return candidate.toolName;
    }

    if (candidate.output?.outputKind) {
      return candidate.output.outputKind;
    }

    return candidate.type ?? "workflow node";
  };

  return (
    <section className="card dag-preview">
      <div className="card-row">
        <div>
          <p className="eyebrow">Workflow DAG</p>
          <h3>{dag.name}</h3>
        </div>
        <span className="pill">Exit: {terminalNodeIds.join(", ") || "n/a"}</span>
      </div>

      <div className="dag-grid">
        {dag.nodes.map((node) => {
          const outgoing = downstreamNodeIdsByNodeId[node.id] ?? [];
          const meta = nodeMeta?.[node.id];
          return (
            <Button
              variant="subtle"
              key={node.id}
              className={`dag-node${activeNodeId === node.id ? " dag-node-active" : ""}`}
              onClick={() => onSelectNode?.(node.id)}
            >
              <div className="card-row">
                <strong>{node.name}</strong>
                <span className="pill">{node.type}</span>
              </div>
              <p>{describeRuntime(node)}</p>
              {meta?.status ? <p className="muted">Run status: {meta.status}{typeof meta.retryCount === "number" ? ` · Retries: ${meta.retryCount}` : ""}</p> : null}
              <p className="muted">Outputs: {describeOutputs(node.output?.schema)}</p>
              {outgoing.length > 0 ? (
                <p className="muted">Next: {outgoing.join(", ")}</p>
              ) : null}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
