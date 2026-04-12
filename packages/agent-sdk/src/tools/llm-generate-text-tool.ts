import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ExecutionContext } from "../types.js";
import { BaseTool } from "./base-tool.js";
import { extractTextContent, getLlmModel, getOpenAiClient } from "./llm-client.js";
import { DEFAULT_LLM_MAX_TOKENS_PER_CALL, trackLlmTokens } from "./llm-budget.js";

function normalizeTemperature(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.2;
  }

  return Math.min(2, Math.max(0, value));
}

function normalizeMaxTokens(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LLM_MAX_TOKENS_PER_CALL;
  }

  return Math.max(1, Math.floor(value));
}

export class LlmGenerateTextTool extends BaseTool {
  readonly name = "llm.generateText";
  readonly description = "Generates structured or freeform text with OpenAI chat completions.";

  protected async execute(input: Record<string, unknown>, context: ExecutionContext) {
    const prompt =
      typeof input.prompt === "string" && input.prompt.trim()
        ? input.prompt
        : `Generate workflow content using ${JSON.stringify(input)}`;
    const system = typeof input.system === "string" ? input.system : undefined;
    const temperature = normalizeTemperature(input.temperature);
    const maxTokens = normalizeMaxTokens(input.maxTokens);

    const liveOpenAiEnabled =
      process.env.OPENAI_API_KEY &&
      (process.env.NODE_ENV !== "test" || process.env.OPENAI_ENABLE_LIVE_TESTS === "true");

    if (!liveOpenAiEnabled) {
      context.logger.info("OPENAI_API_KEY not configured, returning mock LLM response", {
        toolName: this.name
      });
      return this.stub({
        text: `Mock response for prompt: ${prompt}`,
        tokensUsed: 0,
        provider: "mock"
      });
    }

    const request: ChatCompletionCreateParamsNonStreaming = {
      model: getLlmModel(),
      temperature,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: prompt }
      ]
    };

    request.max_tokens = maxTokens;

    const response = await this.withRetries(
      async () => getOpenAiClient().chat.completions.create(request),
      {
        maxAttempts: 3,
        shouldRetry: (error) => {
          const status = error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
          return !status || status === 408 || status === 429 || status >= 500;
        }
      }
    );

    const tokensUsed = response.usage?.total_tokens ?? 0;
    trackLlmTokens(context, tokensUsed);

    return {
      text: extractTextContent(response.choices[0]?.message.content ?? "").trim(),
      tokensUsed,
      provider: "openai",
      model: response.model
    };
  }
}
