import { describe, expect, it, vi } from "vitest";
import type { AgentNode } from "@personal-agent-os/shared";
import { __test__, callLLM, runEvaluatorNode, runNode } from "../../../src/runtime/node-runner.js";

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
      version: "1.0.0",
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
      version: "1.0.0",
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
      version: "1.0.0",
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
      version: "1.0.0",
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

  it("executes a condition node using the selected branch from input", async () => {
    const node: AgentNode = {
      id: "route",
      version: "1.0.0",
      type: "condition",
      name: "Route",
      branches: [{ toNodeId: "branch_a" }, { toNodeId: "branch_b" }],
      defaultToNodeId: "fallback_branch",
      input: {
        schema: {
          type: "object",
          properties: {
            selectedBranch: { type: "string" }
          },
          additionalProperties: false
        }
      },
      output: {
        schema: {
          type: "object",
          properties: {
            selectedBranch: { type: "string" }
          },
          required: ["selectedBranch"],
          additionalProperties: false
        }
      }
    };

    const result = await runNode("run_1", node, { selectedBranch: "branch_b" }, 0, context);

    expect(result.output).toEqual({
      data: {
        selectedBranch: "branch_b"
      },
      artifacts: []
    });
    expect(result.execution.status).toBe("succeeded");
  });

  it("executes a condition node using the default branch when input is missing", async () => {
    const node: AgentNode = {
      id: "route",
      version: "1.0.0",
      type: "condition",
      name: "Route",
      branches: [{ toNodeId: "branch_a" }, { toNodeId: "branch_b" }],
      defaultToNodeId: "fallback_branch",
      input: {
        schema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      output: {
        schema: {
          type: "object",
          properties: {
            selectedBranch: { type: "string" }
          },
          required: ["selectedBranch"],
          additionalProperties: false
        }
      }
    };

    const result = await runNode("run_1", node, {}, 0, context);

    expect(result.output.data).toEqual({
      selectedBranch: "fallback_branch"
    });
  });

  it("executes a condition node using the first branch when no input or default is provided", async () => {
    const node: AgentNode = {
      id: "route",
      version: "1.0.0",
      type: "condition",
      name: "Route",
      branches: [{ toNodeId: "branch_a" }, { toNodeId: "branch_b" }],
      input: {
        schema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      output: {
        schema: {
          type: "object",
          properties: {
            selectedBranch: { type: "string" }
          },
          required: ["selectedBranch"],
          additionalProperties: false
        }
      }
    };

    const result = await runNode("run_1", node, {}, 0, context);

    expect(result.output.data).toEqual({
      selectedBranch: "branch_a"
    });
  });
});

describe("runEvaluatorNode", () => {
  it("adds a retry signal when the evaluator requests retry and a retry policy exists", async () => {
    const node: AgentNode = {
      id: "review",
      version: "1.0.0",
      type: "evaluator",
      name: "Review",
      promptTemplate: "Return evaluator output",
      input: {
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" }
          },
          required: ["summary"],
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
        }
      },
      execution: {
        retryPolicy: {
          maxRetries: 2,
          strategy: "rerun"
        }
      }
    };

    const llmContext = {
      ...context,
      registry: {
        async execute() {
          return {
            text: JSON.stringify({
              score: 0.2,
              passed: false,
              issues: ["Needs revision"],
              summary: "Not ready",
              shouldRetry: true
            }),
            usage: {
              inputTokens: 12,
              outputTokens: 8,
              totalTokens: 20
            },
            metadata: {
              model: "mock-model",
              provider: "mock-provider"
            }
          };
        }
      }
    };

    const openAiKey = process.env.OPENAI_API_KEY;
    const liveTests = process.env.OPENAI_ENABLE_LIVE_TESTS;
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";

    try {
      const result = await runEvaluatorNode(node, { summary: "draft" }, llmContext);

      expect(result).toMatchObject({
        shouldRetry: true,
        signal: {
          retry: true
        }
      });
    } finally {
      if (openAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = openAiKey;
      }

      if (liveTests === undefined) {
        delete process.env.OPENAI_ENABLE_LIVE_TESTS;
      } else {
        process.env.OPENAI_ENABLE_LIVE_TESTS = liveTests;
      }
    }
  });

  it("does not add a retry signal when no retry policy is configured", async () => {
    const node: AgentNode = {
      id: "review",
      version: "1.0.0",
      type: "evaluator",
      name: "Review",
      promptTemplate: "Return evaluator output",
      input: {
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" }
          },
          required: ["summary"],
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
        }
      }
    };

    const llmContext = {
      ...context,
      registry: {
        async execute() {
          return {
            text: JSON.stringify({
              score: 0.4,
              passed: false,
              issues: ["Still weak"],
              summary: "Needs work",
              shouldRetry: true
            }),
            usage: {
              inputTokens: 9,
              outputTokens: 7,
              totalTokens: 16
            },
            metadata: {
              model: "mock-model",
              provider: "mock-provider"
            }
          };
        }
      }
    };

    const openAiKey = process.env.OPENAI_API_KEY;
    const liveTests = process.env.OPENAI_ENABLE_LIVE_TESTS;
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";

    try {
      const result = await runEvaluatorNode(node, { summary: "draft" }, llmContext);

      expect(result.signal).toBeUndefined();
      expect(result.shouldRetry).toBe(true);
    } finally {
      if (openAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = openAiKey;
      }

      if (liveTests === undefined) {
        delete process.env.OPENAI_ENABLE_LIVE_TESTS;
      } else {
        process.env.OPENAI_ENABLE_LIVE_TESTS = liveTests;
      }
    }
  });
});

describe("schemaToExample", () => {
  it("renders nested object and array schemas into example JSON", () => {
    expect(
      __test__.schemaToExample({
        type: "object",
        properties: {
          title: { type: "string" },
          score: { type: "number" },
          flags: {
            type: "array",
            items: { type: "boolean" }
          },
          details: {
            type: "object",
            properties: {
              count: { type: "integer" },
              notes: { type: "null" }
            }
          }
        }
      })
    ).toBe('{"title": "example", "score": 0, "flags": [true], "details": {"count": 0, "notes": null}}');
  });

  it("falls back to an empty object when schema type is missing", () => {
    expect(__test__.schemaToExample(undefined)).toBe("{}");
  });
});

describe("callLLM", () => {
  it("returns the mock response shape when live OpenAI execution is disabled", async () => {
    const openAiKey = process.env.OPENAI_API_KEY;
    const liveTests = process.env.OPENAI_ENABLE_LIVE_TESTS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ENABLE_LIVE_TESTS;

    try {
      const result = await callLLM("Return a summary", {
        response_format: "json",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            passed: { type: "boolean" }
          },
          required: ["summary", "passed"],
          additionalProperties: false
        },
        input: {
          summary: "Carry input through"
        },
        context
      });

      expect(result).toMatchObject({
        text: expect.any(String),
        usage: {
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
          totalTokens: expect.any(Number)
        },
        metadata: {
          model: expect.any(String),
          provider: expect.any(String)
        }
      });
    } finally {
      if (openAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = openAiKey;
      }

      if (liveTests === undefined) {
        delete process.env.OPENAI_ENABLE_LIVE_TESTS;
      } else {
        process.env.OPENAI_ENABLE_LIVE_TESTS = liveTests;
      }
    }
  });

  it("rejects non-text responses from the llm tool", async () => {
    const openAiKey = process.env.OPENAI_API_KEY;
    const liveTests = process.env.OPENAI_ENABLE_LIVE_TESTS;
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_ENABLE_LIVE_TESTS = "true";

    const liveContext = {
      ...context,
      registry: {
        execute: vi.fn(async () => ({
          text: { invalid: true },
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2
          },
          metadata: {
            model: "mock-model",
            provider: "mock-provider"
          }
        }))
      }
    };

    try {
      await expect(
        callLLM("Return JSON", {
          response_format: "json",
          schema: {
            type: "object",
            properties: {
              value: { type: "string" }
            },
            required: ["value"],
            additionalProperties: false
          },
          input: {},
          context: liveContext
        })
      ).rejects.toThrow("LLM returned a non-text response");
    } finally {
      if (openAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = openAiKey;
      }

      if (liveTests === undefined) {
        delete process.env.OPENAI_ENABLE_LIVE_TESTS;
      } else {
        process.env.OPENAI_ENABLE_LIVE_TESTS = liveTests;
      }
    }
  });
});
