import type { AgentDAG, AgentDefinition } from "@personal-agent-os/shared";

import { buildGraph } from "./build-graph.js";
import type { CompiledDAG } from "./compiled-dag.js";

const compiledDagCache = new Map<string, CompiledDAG>();

export function compileDAG(dag: AgentDAG): CompiledDAG {
  const graph = buildGraph(dag);
  const nodeMap: CompiledDAG["nodeMap"] = {};

  for (const node of dag.nodes) {
    nodeMap[node.id] = node;
  }

  return {
    nodes: dag.nodes,
    nodeMap,
    graph
  };
}

export function getOrCompileDAG(agentDefinition: AgentDefinition): CompiledDAG {
  const cacheKey = agentDefinition.id || JSON.stringify(agentDefinition.dag);
  const cached = compiledDagCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const compiledDag = compileDAG(agentDefinition.dag);
  compiledDagCache.set(cacheKey, compiledDag);
  return compiledDag;
}
