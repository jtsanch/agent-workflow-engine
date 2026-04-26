import type {AgentDAG, CompiledDAG} from "@personal-agent-os/shared";

export function buildGraph(dag: AgentDAG): CompiledDAG["graph"] {
  const forward: CompiledDAG["graph"]["forward"] = {};
  const reverse: CompiledDAG["graph"]["reverse"] = {};

  for (const node of dag.nodes) {
    forward[node.id] = new Set<string>();
    reverse[node.id] = new Set<string>();
  }

  for (const node of dag.nodes) {
    for (const binding of node.input?.bindings ?? []) {
      const ref = binding.ref;
      if (ref.source !== "node_output") {
        continue;
      }

      if (!(ref.nodeId in forward)) {
        throw new Error(
          `Invalid DAG: node "${node.id}" has an input binding that references missing node "${ref.nodeId}".`
        );
      }

      forward[ref.nodeId].add(node.id);
      reverse[node.id].add(ref.nodeId);
    }
  }

  return { forward, reverse };
}
