import { describe, expect, it } from "vitest";
import { LlmGenerateTextTool } from "../../src/tools/llm-generate-text-tool.js";

const context = {
  now: () => "2026-04-11T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("LlmGenerateTextTool integration", () => {
  it("uses a mock response without OPENAI_API_KEY and a live response when the key is present", async () => {
    const result = await new LlmGenerateTextTool().run(
      {
        prompt: 'Reply with a short grocery planning sentence and include the word "parsley".',
        maxTokens: 60
      },
      context
    );

    if (!process.env.OPENAI_API_KEY) {
      expect(result).toMatchObject({
        provider: "mock",
        tokensUsed: 0
      });
      return;
    }

    expect(result.provider).toBe("openai");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
  });
});
