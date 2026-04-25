import { createToolRegistry } from "../../../../packages/agent-sdk/src/tool-registry.js";
import type {
  ExecutionContext as BaseExecutionContext,
  WebSearchInput
} from "../../../../packages/agent-sdk/src/types.js";

type WorkingState = {
  data: Record<string, unknown>;
  diagnostics: {
    usedFallbacks: string[];
    warnings: string[];
    constraintResults: Record<string, boolean>;
    signals: Record<string, unknown>;
  };
};

type ExecutionContext = BaseExecutionContext & { workingState: WorkingState };

export type SearchInput = Pick<WebSearchInput, "query" | "zipcode" | "stores" | "category">;

export class SearchService {
  async search(input: SearchInput) {
    const registry = createToolRegistry();
    const context: ExecutionContext = {
      registry,
      workingState: {
        data: {},
        diagnostics: {
          usedFallbacks: [],
          warnings: [],
          constraintResults: {},
          signals: {}
        }
      },
      now: () => new Date().toISOString(),
      logger: { info: () => undefined }
    };

    return registry.execute("web_search.search", input, context);
  }
}
