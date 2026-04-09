import type { AgentDefinition } from "@personal-agent-os/shared";

export interface ExecutionContext {
  now: () => string;
  logger: {
    info(message: string, context?: Record<string, unknown>): void;
  };
}

export interface ToolDefinition<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>
> {
  name: string;
  description: string;
  run: (input: TInput, context: ExecutionContext) => Promise<TOutput>;
}

export function defineAgent(agentDefinition: AgentDefinition): AgentDefinition {
  return agentDefinition;
}

