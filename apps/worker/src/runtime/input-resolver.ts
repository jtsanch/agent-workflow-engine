import type { AgentNode } from "@personal-agent-os/shared";
import { ExecutionState } from "./execution-state.js";

function getByPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

export function resolveInputs(node: AgentNode, state: ExecutionState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node.inputMapping).map(([targetKey, sourcePath]) => {
      if (sourcePath.startsWith("$job.")) {
        return [targetKey, state.getJobInput(sourcePath.slice(5))];
      }

      const [nodeId, ...rest] = sourcePath.split(".");
      const output = state.getNodeOutput(nodeId) ?? {};
      const value = rest.length === 0 ? output : getByPath(output, rest.join("."));
      return [targetKey, value];
    })
  );
}

