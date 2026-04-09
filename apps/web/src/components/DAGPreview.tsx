import type { AgentDefinition } from "@personal-agent-os/shared";

interface DAGPreviewProps {
  agentDefinition: AgentDefinition;
}

export function DAGPreview({ agentDefinition }: DAGPreviewProps) {
  const { dag } = agentDefinition;

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
          return (
            <article key={node.id} className="dag-node">
              <div className="card-row">
                <strong>{node.name}</strong>
                <span className="pill">{node.type}</span>
              </div>
              <p>{node.agentKey}</p>
              <p className="muted">Outputs: {node.outputSchema.fields.map((field) => field.name).join(", ") || "none"}</p>
              {outgoing.length > 0 ? (
                <p className="muted">Next: {outgoing.map((edge) => `${edge.to} (${edge.type})`).join(", ")}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

