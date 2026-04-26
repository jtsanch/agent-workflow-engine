import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type {LLMInput, LLMOutput, RunContext} from "../types.js";
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

export class LlmGenerateTextTool extends BaseTool<"llm.generateText", LLMInput, LLMOutput> {
  readonly name = "llm.generateText";
  readonly description = "Generates structured or freeform text with OpenAI chat completions.";

  protected async execute(input: LLMInput, context: RunContext): Promise<LLMOutput> {
    const prompt = input.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n\n")
      .trim();
    const temperature = normalizeTemperature(input.temperature);
    const maxTokens = normalizeMaxTokens(input.maxTokens);
    const responseFormat = input.response?.type === "json" ? "json" : "text";
    const model = input.model ?? getLlmModel();

    const liveOpenAiEnabled =
      process.env.OPENAI_API_KEY &&
      (process.env.NODE_ENV !== "test" || process.env.OPENAI_ENABLE_LIVE_TESTS === "true");

    if (!liveOpenAiEnabled) {
      context.logger.info("OPENAI_API_KEY not configured, returning mock LLM response", {
        toolName: this.name
      });
      return this.stub({
        text:
          responseFormat === "json"
            ? JSON.stringify({
                summary: `Mock JSON response for prompt: ${prompt}`,
                passed: true,
                shouldRetry: false,
                issues: [],
                score: 1
              })
            : `Mock response for prompt: ${prompt}`,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        },
        metadata: {
          model,
          provider: "mock"
        }
      });
    }

    const request: ChatCompletionCreateParamsNonStreaming = {
      model,
      temperature,
      messages: input.messages
    };

    request.max_completion_tokens = maxTokens;
    if (responseFormat === "json") {
      request.response_format = { type: "json_object" };
    }

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
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: tokensUsed
      },
      metadata: {
        model: response.model,
        provider: "openai",
        finishReason: response.choices[0]?.finish_reason === "length" ? "length" : "stop"
      }
    };
  }
}
