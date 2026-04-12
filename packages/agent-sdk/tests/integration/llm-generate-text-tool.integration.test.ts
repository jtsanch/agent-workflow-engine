import { describe, expect, it } from "vitest";
import { LlmGenerateTextTool } from "../../src/tools/llm-generate-text-tool.js";

const context = {
  now: () => "2026-04-11T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("LlmGenerateTextTool integration", () => {
  it("uses a mock response unless local live OpenAI integration is explicitly enabled", async () => {
    const result = await new LlmGenerateTextTool().run(
      {
        prompt: 'Reply with a short grocery planning sentence and include the word "parsley".',
        maxTokens: 60
      },
      context
    );
    const typedResult = result as {
      provider: string;
      tokensUsed: number;
      text: string;
    };

    const liveOpenAiEnabled =
      process.env.OPENAI_API_KEY && process.env.OPENAI_ENABLE_LIVE_TESTS === "true";

    if (!liveOpenAiEnabled) {
      expect(typedResult).toMatchObject({
        provider: "mock",
        tokensUsed: 0
      });
      return;
    }

    expect(typedResult.provider).toBe("openai");
    expect(typeof typedResult.text).toBe("string");
    expect(typedResult.text.length).toBeGreaterThan(0);
  });
});
