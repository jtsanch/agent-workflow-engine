import type { AgentNode } from "@personal-agent-os/shared";

export type CompiledDAG = {
  nodes: AgentNode[];
  nodeMap: Record<string, AgentNode>;
  graph: {
    forward: Record<string, string[]>;
    reverse: Record<string, string[]>;
  };
};
