import type { ExecutionContext, ToolDefinition } from "./types.js";

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

  registry.register(
    defineTool({
      name: "web_search.search",
      description: "Searches the web for public information. Stubbed for MVP.",
      async run(input) {
        return {
          query: String(input.query ?? ""),
          results: [
            { title: "Weekly produce deals", url: "https://example.com/deals", snippet: "Discounts on produce and pantry staples." },
            { title: "Seasonal ingredients guide", url: "https://example.com/seasonal", snippet: "Best ingredients for the week." },
            { title: "Family meal plan ideas", url: "https://example.com/meals", snippet: "Affordable dinner rotation ideas." }
          ]
        };
      }
    })
  );

  registry.register(
    defineTool({
      name: "llm.generateText",
      description: "Generates structured or freeform text. Stubbed for MVP.",
      async run(input) {
        return {
          text: `Generated response for prompt: ${String(input.prompt ?? "")}`,
          tokensUsed: 180
        };
      }
    })
  );

  registry.register(
    defineTool({
      name: "notifications.send",
      description: "Sends a notification. Stubbed for MVP.",
      async run(input) {
        return {
          delivered: true,
          destination: input.destination ?? "demo@example.com",
          channel: input.channel ?? "email"
        };
      }
    })
  );

  registry.register(
    defineTool({
      name: "calendar.read",
      description: "Stub future calendar integration.",
      async run() {
        return { items: [], status: "stub" };
      }
    })
  );

  registry.register(
    defineTool({
      name: "email.read",
      description: "Stub future email integration.",
      async run() {
        return { threads: [], status: "stub" };
      }
    })
  );

  registry.register(
    defineTool({
      name: "iot.trigger",
      description: "Stub future IoT integration.",
      async run() {
        return { triggered: false, status: "stub" };
      }
    })
  );

  return registry;
}

export function defineTool<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  definition: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return definition;
}

