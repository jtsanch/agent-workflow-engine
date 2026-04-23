import { describe, expect, it } from "vitest";
import type { AgentNode } from "@personal-agent-os/shared";
import { runNode } from "../../../src/runtime/node-runner.js";

const context = {
  now: () => "2026-04-10T00:00:00.000Z",
  registry: {
    async execute(name: string, input: Record<string, unknown>) {
      if (name === "web_search.search") {
        return {
          results: [{ title: String(input.query ?? "demo"), url: "https://example.com", snippet: "demo" }]
        };
      }

      if (name === "llm.generateText") {
        return {
          text: JSON.stringify({
            summaryText: "Mock summary",
            score: 0.8,
            passed: true,
            issues: [],
            summary: "Looks good",
            shouldRetry: false
          }),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0
          },
          metadata: {
            model: "mock",
            provider: "mock"
          }
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    }
  },
  logger: {
    info: () => undefined
  }
};

describe("runNode", () => {
  it("executes a tool node", async () => {
    const node: AgentNode = {
      id: "deals",
      version: 1,
      type: "tool",
      toolName: "web_search.search",
      name: "Deals",
      input: {
        schema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"],
          additionalProperties: false
        }
      },
      output: {
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: true
              }
            }
          },
          required: ["results"],
          additionalProperties: true
        }
      }
    };

    const result = await runNode("run_1", node, { query: "94107" }, 0, context);

    expect(result.output).toMatchObject({
      data: {
        results: expect.any(Array)
      },
      artifacts: []
    });
    expect(result.execution.status).toBe("succeeded");
  });

  it("executes an llm node", async () => {
    const node: AgentNode = {
      id: "draft",
      version: 1,
      type: "llm",
      name: "Draft",
      promptTemplate: 'Return JSON: { "summaryText": string }',
      input: {
        schema: {
          type: "object",
          properties: {
            instructions: { type: "string" }
          },
          required: ["instructions"],
          additionalProperties: false
        }
      },
      output: {
        schema: {
          type: "object",
          properties: {
            summaryText: { type: "string" }
          },
          required: ["summaryText"],
          additionalProperties: false
        }
      },
      outputConfig: {
        schema: {
          type: "object",
          properties: {
            summaryText: { type: "string" }
          },
          required: ["summaryText"]
        },
        enforcement: "strict"
      }
    };

    const result = await runNode("run_1", node, { instructions: "Write summary" }, 0, context);

    expect(result.output).toMatchObject({
      data: {
        summaryText: expect.any(String)
      },
      artifacts: []
    });
    expect(result.execution.tokenUsage).toBe(0);
  });

  it("executes a transform node", async () => {
    const node: AgentNode = {
      id: "aggregate",
      version: 1,
      type: "transform",
      name: "Aggregate",
      input: {
        schema: {
          type: "object",
          properties: {
            summaryText: { type: "string" }
          },
          required: ["summaryText"],
          additionalProperties: false
        }
      },
      run: async (input) => ({
        planSummary: String(input.summaryText).toUpperCase()
      }),
      output: {
        schema: {
          type: "object",
          properties: {
            planSummary: { type: "string" }
          },
          required: ["planSummary"],
          additionalProperties: false
        }
      }
    };

    const result = await runNode("run_1", node, { summaryText: "hello" }, 0, context);

    expect(result.output).toEqual({
      data: {
        planSummary: "HELLO"
      },
      artifacts: []
    });
  });

  it("executes an evaluator node and emits retry feedback when needed", async () => {
    const node: AgentNode = {
      id: "review",
      version: 1,
      type: "evaluator",
      name: "Review",
      promptTemplate: `
Return JSON:
{
  "score": number,
  "passed": boolean,
  "issues": string[],
  "summary": string,
  "shouldRetry": boolean
}
`,
      input: {
        schema: {
          type: "object",
          properties: {
            planSummary: { type: "string" }
          },
          required: ["planSummary"],
          additionalProperties: false
        }
      },
      output: {
        schema: {
          type: "object",
          properties: {
            score: { type: "number" },
            passed: { type: "boolean" },
            issues: {
              type: "array",
              items: { type: "string" }
            },
            summary: { type: "string" },
            shouldRetry: { type: "boolean" }
          },
          required: ["score", "passed", "issues", "summary", "shouldRetry"],
          additionalProperties: false
        },
        outputKind: "critique"
      },
      execution: {
        retryPolicy: {
          maxRetries: 1,
          strategy: "rerun"
        }
      }
    };

    const result = await runNode("run_1", node, { planSummary: "short" }, 0, context);

    expect(result.output).toMatchObject({
      data: {
        shouldRetry: expect.any(Boolean)
      },
      artifacts: []
    });
    expect(result.feedback).toMatchObject({
      sourceNodeId: "review",
      shouldRetry: expect.any(Boolean)
    });
    expect(["retry_scheduled", "succeeded"]).toContain(result.execution.status);
  });
});
