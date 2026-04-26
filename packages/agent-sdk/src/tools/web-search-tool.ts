import type {RunContext, WebSearchInput, WebSearchOutput} from "../types.js";
import { BaseTool } from "./base-tool.js";

interface DuckDuckGoResponse {
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<DuckDuckGoFlatTopic | DuckDuckGoNestedTopicGroup>;
}

interface DuckDuckGoFlatTopic {
  Text?: string;
  FirstURL?: string;
}

interface DuckDuckGoNestedTopicGroup {
  Name?: string;
  Topics?: DuckDuckGoFlatTopic[];
}

function isNestedTopicGroup(topic: DuckDuckGoFlatTopic | DuckDuckGoNestedTopicGroup): topic is DuckDuckGoNestedTopicGroup {
  return Boolean(topic) && typeof topic === "object" && "Topics" in topic;
}

function isFlatTopic(topic: DuckDuckGoFlatTopic | DuckDuckGoNestedTopicGroup): topic is DuckDuckGoFlatTopic {
  return Boolean(topic) && typeof topic === "object" && ("Text" in topic || "FirstURL" in topic);
}

export class WebSearchTool extends BaseTool<"web_search.search", WebSearchInput, WebSearchOutput> {
  readonly name = "web_search.search";
  readonly description = "Searches the web for public information via DuckDuckGo instant answers.";

  protected async execute(input: WebSearchInput, context: RunContext): Promise<WebSearchOutput> {
    const query = this.buildQuery(input);
    if (!query) {
      return { results: [], metadata: { total: 0, provider: "none", latencyMs: 0 } };
    }

    if (process.env.NODE_ENV === "test" && process.env.WEB_SEARCH_ENABLE_LIVE_TESTS !== "true") {
      return this.stub({
        results: [
          {
            title: "Daily produce deals",
            url: "https://example.com/deals",
            snippet: `Mock search result for ${query}`
          },
          {
            title: "Seasonal ingredients guide",
            url: "https://example.com/seasonal",
            snippet: "Mock seasonal ingredient guidance."
          }
        ],
        metadata: {
          total: 2,
          provider: "duckduckgo",
          latencyMs: 250
        }
      });
    }

    try {
      const startTime = new Date().getTime();
      const payload = await this.request<DuckDuckGoResponse>(
        {
          method: "GET",
          url: "https://api.duckduckgo.com/",
          timeout: 5000,
          params: {
            q: query,
            format: "json",
            no_html: 1,
            no_redirect: 1,
            skip_disambig: 1
          }
        },
        { maxAttempts: 3 }
      );
      const endTime = new Date().getTime();

      const results = this.extractResults(payload).slice(0, 5);
      context.logger.info("Web search completed", { query, resultCount: results.length });
      return {
        results,
        metadata: {
          total: results.length,
          provider: "duckduckgo",
          latencyMs: endTime - startTime,
        }
      };
    } catch (error) {
      throw this.formatAxiosError(`Web search for "${query}"`, error);
    }
  }

  private buildQuery(input: WebSearchInput): string {
    const explicitQuery = typeof input.query === "string" ? input.query.trim() : "";
    if (explicitQuery) {
      return explicitQuery;
    }

    const zipcode = typeof input.zipcode === "string" ? input.zipcode.trim() : "";
    const category = typeof input.category === "string" && input.category.trim() ? input.category.trim() : "grocery deals";
    const stores = this.normalizeStores(input.stores);

    return [category, stores.join(" "), zipcode ? `near ${zipcode}` : ""].filter(Boolean).join(" ").trim();
  }

  private normalizeStores(value: WebSearchInput["stores"]): string[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
    }

    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    return [];
  }

  private extractResults(payload: DuckDuckGoResponse): Array<{ title: string; url: string; snippet: string }> {
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    if (payload.AbstractText && payload.AbstractURL) {
      results.push({
        title: this.extractTitle(payload.AbstractText),
        url: payload.AbstractURL,
        snippet: payload.AbstractText
      });
    }

    for (const topic of payload.RelatedTopics ?? []) {
      if (isNestedTopicGroup(topic) && Array.isArray(topic.Topics)) {
        for (const nestedTopic of topic.Topics) {
          if (nestedTopic.Text && nestedTopic.FirstURL) {
            results.push({
              title: this.extractTitle(nestedTopic.Text),
              url: nestedTopic.FirstURL,
              snippet: nestedTopic.Text
            });
          }
        }
        continue;
      }

      if (isFlatTopic(topic) && topic.Text && topic.FirstURL) {
        results.push({
          title: this.extractTitle(topic.Text),
          url: topic.FirstURL,
          snippet: topic.Text
        });
      }
    }

    return results;
  }

  private extractTitle(text: string): string {
    return text.split(" - ")[0]?.trim() || text;
  }
}
