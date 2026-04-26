import type { AgentDAG } from "@personal-agent-os/shared";

import type { CompiledDAG } from "./compiled-dag.js";

export function buildGraph(dag: AgentDAG): CompiledDAG["graph"] {
  const forward: CompiledDAG["graph"]["forward"] = {};
  const reverse: CompiledDAG["graph"]["reverse"] = {};

  for (const node of dag.nodes) {
    forward[node.id] = [];
    reverse[node.id] = [];
  }

  for (const node of dag.nodes) {
    for (const binding of node.input?.bindings ?? []) {
      const ref = binding.ref;
      if (ref.source !== "node_output") {
        continue;
      }

      forward[ref.nodeId].push(node.id);
      reverse[node.id].push(ref.nodeId);
    }
  }

  return { forward, reverse };
}
