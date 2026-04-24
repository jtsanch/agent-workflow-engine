import { createToolRegistry } from "../../../../packages/agent-sdk/src/tool-registry.js";
import type { ExecutionContext, WebSearchInput } from "../../../../packages/agent-sdk/src/types.js";

export type SearchInput = Pick<WebSearchInput, "query" | "zipcode" | "stores" | "category">;

export class SearchService {
  async search(input: SearchInput) {
    const registry = createToolRegistry();
    const context: ExecutionContext = {
      registry,
      now: () => new Date().toISOString(),
      logger: { info: () => undefined }
    };

    return registry.execute("web_search.search", input, context);
  }
}
