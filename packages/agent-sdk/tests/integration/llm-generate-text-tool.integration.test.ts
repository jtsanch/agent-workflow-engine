import { describe, expect, it } from "vitest";
import { LlmGenerateTextTool } from "../../src/tools/llm-generate-text-tool.js";
import type { ExecutionContext } from "../../src/types.js";

const context: ExecutionContext = {
  registry: {
    execute: async () => undefined
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
    info: () => undefined
  }
};

describe("LlmGenerateTextTool integration", () => {
  it("uses a mock response unless local live OpenAI integration is explicitly enabled", async () => {
    const result = await new LlmGenerateTextTool().run(
      {
        messages: [{ role: "user", content: 'Reply with a short grocery planning sentence and include the word "parsley".' }],
        maxTokens: 60
      },
      context
    );

    const liveOpenAiEnabled =
      process.env.OPENAI_API_KEY && process.env.OPENAI_ENABLE_LIVE_TESTS === "true";

    if (!liveOpenAiEnabled) {
      expect(result).toMatchObject({
        metadata: { provider: "mock" },
        usage: { totalTokens: 0 }
      });
      return;
    }

    expect(result.metadata.provider).toBe("openai");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
  });
});
