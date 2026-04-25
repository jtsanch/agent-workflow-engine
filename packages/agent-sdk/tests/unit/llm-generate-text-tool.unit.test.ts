import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLlmBudget } from "../../src/tools/llm-budget.js";
import { LlmGenerateTextTool } from "../../src/tools/llm-generate-text-tool.js";
import { resetOpenAiClientForTests } from "../../src/tools/llm-client.js";
import type { ExecutionContext } from "../../src/types.js";

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

function createContext(): ExecutionContext {
  return {
    registry: {
      execute: vi.fn()
    },
    workingState: {
      data: {},
      diagnostics: {
        usedFallbacks: [],
        warnings: [],
        constraintResults: {},
        signals: {}
      }
    },
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
    const result = await new LlmGenerateTextTool().run({ messages: [{ role: "user", content: "Hello world" }] }, context);

    expect(result).toMatchObject({
      metadata: { provider: "mock" },
      usage: { totalTokens: 0 }
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

    const result = await new LlmGenerateTextTool().run({ messages: [{ role: "user", content: "Say hi" }] }, context);

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "Generated answer",
      usage: { totalTokens: 42 },
      metadata: { provider: "openai", model: "gpt-4.1-mini" }
    });
    expect(context.llmBudget!.consumedTokens).toBe(42);
  });

  it("logs when the budget warning threshold is crossed and throws when the cap is exceeded", async () => {
    const context = createContext();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";
    context.llmBudget!.warningThreshold = 50;
    context.llmBudget!.maxTokens = 60;

    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "Large answer" } }],
      usage: { total_tokens: 55 },
      model: "gpt-4.1-mini"
    });

    await new LlmGenerateTextTool().run({ messages: [{ role: "user", content: "first" }] }, context);
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

    await expect(new LlmGenerateTextTool().run({ messages: [{ role: "user", content: "second" }] }, context)).rejects.toThrow(
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

  it("sanitizes invalid numeric inputs before calling OpenAI", async () => {
    const context = createContext();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";

    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "Normalized answer" } }],
      usage: { total_tokens: 12 },
      model: "gpt-4.1-mini"
    });

    await new LlmGenerateTextTool().run(
      {
        messages: [{ role: "user", content: "normalize values" }],
        temperature: Number.NaN,
        maxTokens: Number.POSITIVE_INFINITY
      },
      context
    );

    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        max_completion_tokens: 2000
      })
    );
  });

  it("clamps temperature and maxTokens into valid OpenAI request ranges", async () => {
    const context = createContext();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";

    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "Clamped answer" } }],
      usage: { total_tokens: 18 },
      model: "gpt-4.1-mini"
    });

    await new LlmGenerateTextTool().run(
      {
        messages: [{ role: "user", content: "clamp values" }],
        temperature: -4,
        maxTokens: -20
      },
      context
    );

    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0,
        max_completion_tokens: 1
      })
    );
  });
});
