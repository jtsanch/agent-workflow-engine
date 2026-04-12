import OpenAI from "openai";

const MODEL = "gpt-4.1-mini";

let cachedClient: OpenAI | undefined;

export function getLlmModel(): string {
  return process.env.OPENAI_MODEL ?? MODEL;
}

export function getOpenAiClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return cachedClient;
}

export function resetOpenAiClientForTests(): void {
  cachedClient = undefined;
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("");
  }

  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }

  throw new Error("Unsupported message content format");
}
