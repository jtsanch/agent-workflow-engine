import { createToolRegistry } from "@personal-agent-os/agent-sdk";
import type { RunContext, WebSearchInput } from "@personal-agent-os/agent-sdk";

export type SearchInput = Pick<WebSearchInput, "query" | "zipcode" | "stores" | "category">;

export class SearchService {
  async search(input: SearchInput) {
    const registry = createToolRegistry();
    const context: RunContext = {
      registry,
      now: () => new Date().toISOString(),
      logger: { info: () => undefined }
    };

    return registry.execute("web_search.search", input, context);
  }
}
