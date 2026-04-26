import type {
  InputOf,
  OutputOf,
  RunContext,
  ToolDefinition,
  ToolMap,
  ToolRegistry as ToolRegistryContract
} from "./types.js";
import { createDefaultTools } from "./tools/index.js";

type AnyToolDefinition = ToolDefinition<any, any>;

export class DefaultToolRegistry<TTools extends Record<string, AnyToolDefinition> = ToolMap>
implements ToolRegistryContract {
  private readonly tools = new Map<keyof TTools, TTools[keyof TTools]>();

  register<K extends keyof TTools & string>(tool: TTools[K] & { name: K }): void {
    this.tools.set(tool.name, tool as TTools[keyof TTools]);
  }

  get<K extends keyof TTools>(toolName: K): TTools[K] {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Unknown tool: ${String(toolName)}`);
    }

    return tool as TTools[K];
  }

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: RunContext
  ): Promise<unknown> {
    const tool = this.get(toolName as keyof TTools);
    return tool.run(input as InputOf<typeof tool>, context) as Promise<OutputOf<typeof tool>>;
  }

  list(): Array<TTools[keyof TTools]> {
    return Array.from(this.tools.values());
  }
}

export function createToolRegistry(): DefaultToolRegistry<ToolMap> {
  const registry = new DefaultToolRegistry<ToolMap>();
  for (const tool of createDefaultTools()) {
    registry.register(tool as ToolMap[keyof ToolMap] & { name: keyof ToolMap & string });
  }

  return registry;
}

export function defineTool<TInput extends object, TOutput extends object>(
  definition: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return definition;
}
