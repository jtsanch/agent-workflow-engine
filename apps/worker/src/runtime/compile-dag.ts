import type {AgentDAG, AgentDefinition, CompiledDAG} from "@personal-agent-os/shared";
import {buildGraph} from './build-graph.js';
const compiledDagCache = new Map<string, CompiledDAG>();

export function compileDAG(dag: AgentDAG): CompiledDAG {
  const graph = buildGraph(dag);
  const nodeMap: CompiledDAG["nodeMap"] = new Map<string, AgentDAG["nodes"][number]>();

  for (const node of dag.nodes) {
    nodeMap.set(node.id, node);
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
