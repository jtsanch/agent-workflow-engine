import type { ExecutionContext, ToolDefinition } from "./types.js";
import { createDefaultTools } from "./tools/index.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(toolName: string): ToolDefinition {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return tool;
  }

  async execute(toolName: string, input: Record<string, unknown>, context: ExecutionContext): Promise<Record<string, unknown>> {
    const tool = this.get(toolName);
    return tool.run(input, context);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of createDefaultTools()) {
    registry.register(tool);
  }

  return registry;
}

export function defineTool<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  definition: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return definition;
}
