import type { ExecutionContext } from "../types.js";
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
  return "Topics" in topic;
}

function isFlatTopic(topic: DuckDuckGoFlatTopic | DuckDuckGoNestedTopicGroup): topic is DuckDuckGoFlatTopic {
  return "Text" in topic || "FirstURL" in topic;
}

export class WebSearchTool extends BaseTool {
  readonly name = "web_search.search";
  readonly description = "Searches the web for public information via DuckDuckGo instant answers.";

  protected async execute(input: Record<string, unknown>, context: ExecutionContext) {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { query, results: [] };
    }

    if (process.env.NODE_ENV === "test" && process.env.WEB_SEARCH_ENABLE_LIVE_TESTS !== "true") {
      return this.stub({
        query,
        results: [
          {
            title: "Weekly produce deals",
            url: "https://example.com/deals",
            snippet: `Mock search result for ${query}`
          },
          {
            title: "Seasonal ingredients guide",
            url: "https://example.com/seasonal",
            snippet: "Mock seasonal ingredient guidance."
          }
        ]
      });
    }

    try {
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

      const results = this.extractResults(payload).slice(0, 5);
      context.logger.info("Web search completed", { query, resultCount: results.length });
      return { query, results };
    } catch (error) {
      throw this.formatAxiosError(`Web search for "${query}"`, error);
    }
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
