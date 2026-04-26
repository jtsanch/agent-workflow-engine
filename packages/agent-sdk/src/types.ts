import type { AgentDefinition, NodeOutputEntry } from "@personal-agent-os/shared";

export type UnknownObject = { [key: string]: unknown };

export interface LlmBudget {
  maxTokens: number;
  warningThreshold: number;
  consumedTokens: number;
  warningLogged: boolean;
}

export interface ToolRegistry {
  execute: (
    name: string,
    input: Record<string, unknown>,
    context: RunContext
  ) => Promise<unknown>;
}

export interface RunContext {
  registry: ToolRegistry;
  now: () => string;
  logger: {
    info(message: string, context?: Record<string, unknown>): void;
    warn?(message: string, context?: Record<string, unknown>): void;
    error?(message: string, context?: Record<string, unknown>): void;
  };
  llmBudget?: LlmBudget;
}

export interface ToolDefinition<
  TInput extends object = object,
  TOutput extends object = object
> {
  name: string;
  description: string;
  run: (input: TInput, context: RunContext) => Promise<TOutput> | TOutput;
}

export type InputOf<T> = T extends ToolDefinition<infer I, any>
    ? I
    : never;

export type OutputOf<T> = T extends ToolDefinition<any, infer O>
    ? O
    : never;

export type NotificationsSendInput = {
  destination: string;
  channel: string;
  message: string;
};

export type NotificationsSendOutput = {
  delivered: boolean;
  destination: string;
  channel: string;
  provider: string;
  response?: UnknownObject;
};

export type ToolMap = {
  "llm.generateText": ToolDefinition<
      LLMInput<any>,
      LLMOutput<any>
  >;

  "web_search.search": ToolDefinition<
      WebSearchInput,
      WebSearchOutput
  >;

  "notifications.send": ToolDefinition<
      NotificationsSendInput,
      NotificationsSendOutput
  >;
};

export function appendNodeOutput(
  state: { nodeOutputs?: Record<string, NodeOutputEntry[]> },
  nodeInstanceId: string,
  entry: NodeOutputEntry
): void {
  state.nodeOutputs ??= {};
  state.nodeOutputs[nodeInstanceId] = [
    ...(state.nodeOutputs[nodeInstanceId] ?? []),
    entry
  ];
}

export function defineAgent(agentDefinition: AgentDefinition): AgentDefinition {
  return agentDefinition;
}

export type WebSearchInput = {
  query?: string;
  zipcode?: string;
  stores?: string | string[];
  category?: string;

  // how to search
  options?: {
    limit?: number;
    recencyDays?: number;
    domains?: string[];
    excludeDomains?: string[];
    type?: "web" | "news" | "academic";
  };

  // how results should be shaped (optional)
  select?: Array<keyof WebSearchResult>;

  // future-proofing for ranking / agents
  rerank?: {
    strategy: "relevance" | "recency" | "authority";
  };
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;

  // optional enrichments
  publishedAt?: string;
  source?: string;
  score?: number;

  // raw provider data (escape hatch)
  raw?: unknown;
};

export type WebSearchOutput = {
  results: WebSearchResult[];

  metadata?: {
    total?: number;
    provider: string;
    latencyMs: number;
  };
};

export type LLMInput<TSchema = unknown> = {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;

  temperature?: number;
  maxTokens?: number;

  // strong typing for structured outputs
  response?: {
    type: "text" | "json";
    schema?: TSchema; // zod/json schema later
  };

  model?: string;
};

export type LLMOutput<TParsed = unknown> = {
  text: string;

  // strongly typed if schema provided
  parsed?: TParsed;

  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  metadata: {
    model: string;
    provider: string;
    latencyMs?: number;
    finishReason?: "stop" | "length" | "error";
  };
};
