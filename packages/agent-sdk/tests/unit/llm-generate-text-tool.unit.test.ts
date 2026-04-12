import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLlmBudget } from "../../src/tools/llm-budget.js";
import { LlmGenerateTextTool } from "../../src/tools/llm-generate-text-tool.js";
import { resetOpenAiClientForTests } from "../../src/tools/llm-client.js";

const createCompletion = vi.fn();

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: createCompletion
        }
      };
    }
  };
});

function createContext() {
  return {
    now: () => "2026-04-11T00:00:00.000Z",
    logger: {
      info: vi.fn(),
      warn: vi.fn()
    },
    llmBudget: createLlmBudget()
  };
}

describe("LlmGenerateTextTool", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ENABLE_LIVE_TESTS;
    resetOpenAiClientForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ENABLE_LIVE_TESTS;
  });

  it("returns a mock response when OPENAI_API_KEY is not configured", async () => {
    const context = createContext();
    const result = await new LlmGenerateTextTool().run({ prompt: "Hello world" }, context);

    expect(result).toMatchObject({
      provider: "mock",
      tokensUsed: 0
    });
    expect(createCompletion).not.toHaveBeenCalled();
  });

  it("calls OpenAI and retries transient failures when a key is configured", async () => {
    const context = createContext();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";
    createCompletion
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Generated answer"
            }
          }
        ],
        usage: {
          total_tokens: 42
        },
        model: "gpt-4.1-mini"
      });

    const result = await new LlmGenerateTextTool().run({ prompt: "Say hi" }, context);

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "Generated answer",
      tokensUsed: 42,
      provider: "openai",
      model: "gpt-4.1-mini"
    });
    expect(context.llmBudget.consumedTokens).toBe(42);
  });

  it("logs when the budget warning threshold is crossed and throws when the cap is exceeded", async () => {
    const context = createContext();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";
    context.llmBudget.warningThreshold = 50;
    context.llmBudget.maxTokens = 60;

    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "Large answer" } }],
      usage: { total_tokens: 55 },
      model: "gpt-4.1-mini"
    });

    await new LlmGenerateTextTool().run({ prompt: "first" }, context);
    expect(context.logger.warn).toHaveBeenCalledWith(
      "LLM token usage is nearing the run budget",
      expect.objectContaining({
        consumedTokens: 55,
        warningThreshold: 50,
        maxTokens: 60
      })
    );

    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "Another answer" } }],
      usage: { total_tokens: 10 },
      model: "gpt-4.1-mini"
    });

    await expect(new LlmGenerateTextTool().run({ prompt: "second" }, context)).rejects.toThrow(
      "LLM token budget exceeded"
    );
    expect(context.logger.warn).toHaveBeenCalledWith(
      "LLM token usage exceeded the run budget",
      expect.objectContaining({
        consumedTokens: 65,
        maxTokens: 60
      })
    );
  });
});
