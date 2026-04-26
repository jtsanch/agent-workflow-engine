import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSearchTool } from "../../src/tools/web-search-tool.js";
import type { RunContext, WebSearchOutput } from "../../src/types.js";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(),
    isAxiosError: (error: unknown) => Boolean(error && typeof error === "object" && "isAxiosError" in error)
  }
}));

const mockedAxios = vi.mocked(axios, true);
const context: RunContext = {
  registry: {
    execute: async () => undefined
  },
  now: () => "2026-04-11T00:00:00.000Z",
  logger: {
    info: () => undefined
  }
};

describe("WebSearchTool", () => {
  afterEach(() => {
    delete process.env.WEB_SEARCH_ENABLE_LIVE_TESTS;
    vi.clearAllMocks();
  });

  it("returns normalized results from the duckduckgo payload", async () => {
    process.env.WEB_SEARCH_ENABLE_LIVE_TESTS = "true";
    mockedAxios.request.mockResolvedValueOnce({
      data: {
        AbstractText: "Grocery planning - overview",
        AbstractURL: "https://example.com/overview",
        RelatedTopics: [
          {
            Text: "Meal plan ideas - budget recipes",
            FirstURL: "https://example.com/meals"
          }
        ]
      }
    } as never);

    const result = await new WebSearchTool().run({ query: "budget groceries" }, context);
    const typedResult = result as WebSearchOutput;

    expect(typedResult.results).toEqual([
      {
        title: "Grocery planning",
        url: "https://example.com/overview",
        snippet: "Grocery planning - overview"
      },
      {
        title: "Meal plan ideas",
        url: "https://example.com/meals",
        snippet: "Meal plan ideas - budget recipes"
      }
    ]);
  });

  it("retries transient axios failures before succeeding", async () => {
    process.env.WEB_SEARCH_ENABLE_LIVE_TESTS = "true";
    mockedAxios.request
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503, data: { error: "busy" } }
      } as never)
      .mockResolvedValueOnce({
        data: {
          RelatedTopics: [
            {
              Text: "Fallback result - details",
              FirstURL: "https://example.com/fallback"
            }
          ]
        }
      } as never);

    const result = await new WebSearchTool().run({ query: "groceries" }, context);
    const typedResult = result as WebSearchOutput;

    expect(mockedAxios.request).toHaveBeenCalledTimes(2);
    expect(typedResult.results[0]?.url).toBe("https://example.com/fallback");
  });

  it("builds a store-aware query when explicit query is omitted", async () => {
    process.env.WEB_SEARCH_ENABLE_LIVE_TESTS = "true";
    mockedAxios.request.mockResolvedValueOnce({
      data: {
        RelatedTopics: []
      }
    } as never);

    const result = await new WebSearchTool().run(
      {
        zipcode: "94107",
        stores: "Trader Joe's, Costco",
        category: "daily grocery deals"
      },
      context
    );
    const typedResult = result as WebSearchOutput;

    expect(typedResult.results).toEqual([]);
  });
});
