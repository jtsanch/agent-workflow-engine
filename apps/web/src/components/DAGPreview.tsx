import type { AgentDefinition } from "@personal-agent-os/shared";

interface DAGPreviewProps {
  agentDefinition: AgentDefinition;
  activeNodeId?: string;
  nodeMeta?: Record<string, { status?: string; retryCount?: number }>;
  onSelectNode?: (nodeId: string) => void;
}

export function DAGPreview({ agentDefinition, activeNodeId, nodeMeta, onSelectNode }: DAGPreviewProps) {
  const { dag } = agentDefinition;

  const describeOutputs = (schema: AgentDefinition["dag"]["nodes"][number]["outputSchema"]) => {
    if (schema.type !== "object") {
      return schema.type;
    }

    return Object.keys(schema.properties ?? {}).join(", ") || "none";
  };

  const describeRuntime = (node: AgentDefinition["dag"]["nodes"][number]) => {
    switch (node.type) {
      case "tool":
        return node.tool;
      case "llm":
      case "evaluator":
        return node.strictJson ? "strict-json" : node.type;
      case "transform":
        return "sync transform";
    }
  };

  return (
    <section className="card dag-preview">
      <div className="card-row">
        <div>
          <p className="eyebrow">Workflow DAG</p>
          <h3>{dag.name}</h3>
        </div>
        <span className="pill">Exit: {dag.exitNodeId}</span>
      </div>

      <div className="dag-grid">
        {dag.nodes.map((node) => {
          const outgoing = dag.edges.filter((edge) => edge.from === node.id);
          const meta = nodeMeta?.[node.id];
          return (
            <button
              type="button"
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
              <p className="muted">Outputs: {describeOutputs(node.outputSchema)}</p>
              {outgoing.length > 0 ? (
                <p className="muted">Next: {outgoing.map((edge) => `${edge.to} (${edge.type})`).join(", ")}</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
