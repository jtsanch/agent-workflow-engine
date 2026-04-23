import type {
  AgentNode,
  ConditionNode,
  EvaluationResult,
  EvaluatorNode,
  JsonObject,
  JSONSchema,
  LLMNode,
  NodeOutput,
  NodeFeedback,
  NodeExecution,
  TransformNode,
  ToolNode
} from "@personal-agent-os/shared";
import type {ExecutionContext, LLMOutput} from "../../../../packages/agent-sdk/src/types.js";
import { validateSchema } from "./schema-utils.js";

export interface NodeRunnerResult {
  output: NodeOutput;
  execution: NodeExecution;
  feedback?: NodeFeedback;
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function renderTemplate(template: string, input: Record<string, unknown>): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path) => {
    const value = path.split(".").reduce((current: unknown, segment: string) => {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      return (current as Record<string, unknown>)[segment];
    }, input);

    return typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
  });
}

function schemaToExample(schema: JSONSchema | undefined): string {
  if (!schema?.type) {
    return "{}";
  }

  switch (schema.type) {
    case "string":
      return '"example"';
    case "number":
      return "0";
    case "boolean":
      return "true";
    case "null":
      return "null";
    case "array":
      return `[${schemaToExample(schema.items)}]`;
    case "object":
      return `{${Object.entries(schema.properties ?? {})
        .map(([key, childSchema]) => `"${key}": ${schemaToExample(childSchema)}`)
        .join(", ")}}`;
    default:
      return "{}";
  }
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("LLM returned an empty response");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const firstBrace = candidate.search(/[\[{]/);
  if (firstBrace <= 0) {
    return candidate;
  }

  return candidate.slice(firstBrace).trim();
}

function safeJsonParse(raw: string): unknown {
  return JSON.parse(extractJsonCandidate(raw));
}

function mockValueFromSchema(schema: JSONSchema, input: Record<string, unknown>, prompt: string): unknown {
  switch (schema.type) {
    case "string":
      return typeof input.summary === "string" ? input.summary : `Mock output for ${prompt.slice(0, 32)}`;
    case "number":
      return 1;
    case "boolean":
      return true;
    case "null":
      return null;
    case "array":
      return schema.items ? [mockValueFromSchema(schema.items, input, prompt)] : [];
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, childSchema]) => {
          if (key in input) {
            try {
              validateSchema(input[key], childSchema);
              return [key, input[key]];
            } catch {
              // Inputs can share names with outputs while using a different shape.
            }
          }

          if (key === "shouldRetry") {
            return [key, false];
          }

          if (key === "issues") {
            return [key, []];
          }

          if (key === "passed") {
            return [key, true];
          }

          return [key, mockValueFromSchema(childSchema, input, prompt)];
        })
      );
    default:
      return null;
  }
}

function normalizeOutput(result: unknown): NodeOutput {
  if (
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    "artifacts" in result
  ) {
    return result as NodeOutput;
  }

  return {
    data: result,
    artifacts: []
  };
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

async function callLLM(
  prompt: string,
  options: {
    response_format: "json";
    schema: JSONSchema;
    input: Record<string, unknown>;
    context: ExecutionContext;
    model?: string;
  }
): Promise<LLMOutput> {
  const liveOpenAiEnabled =
    process.env.OPENAI_API_KEY &&
    (process.env.NODE_ENV !== "test" || process.env.OPENAI_ENABLE_LIVE_TESTS === "true");

  if (!liveOpenAiEnabled) {
    return {
      text: JSON.stringify(mockValueFromSchema(options.schema, options.input, prompt)),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },
      metadata: {
        model: options.model ?? "mock",
        provider: "mock"
      }
    };
  }
  console.log(`llm options: ${JSON.stringify(options)}`);
  const response = await options.context.registry.execute(
    "llm.generateText",
    {
      messages: [{ role: "user", content: prompt }],
      model: options.model,
      response: {
        type: options.response_format,
        schema: options.schema
      },
      maxTokens: 1800,
      temperature: 0
    },
    options.context
  ) as LLMOutput;
  console.log(`llm response: ${JSON.stringify(response, null, 2)}`);
  if (typeof response.text !== "string") {
    throw new Error("LLM returned a non-text response");
  }

  return response;
}

export async function runLLMNode(
  node: LLMNode | EvaluatorNode,
  input: Record<string, unknown>,
  context: ExecutionContext
): Promise<LLMOutput> {
  const prompt = renderTemplate(node.promptTemplate, input);
  let activePrompt = prompt;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const output: LLMOutput = await callLLM(activePrompt, {
      response_format: "json",
      schema: node.output.schema,
      input,
      context,
      model: "model" in node ? node.model : undefined
    });

    try {
      const raw = output.text;
      const parsed = safeJsonParse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("LLM must return a JSON object");
      }
      validateSchema(parsed, node.output.schema);
      return {
        ...output,
        parsed,
      };
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Failed to parse structured LLM output for ${node.id}: ${String(error)}`);
      }

      activePrompt = `${prompt}

Your previous response was invalid JSON or incomplete and could not be parsed.
Return ONLY one complete JSON object with no markdown, no commentary, and no trailing text.
Match this shape exactly:
${schemaToExample(node.output.schema)}`;
    }
  }

  throw new Error(`Failed to generate structured output for ${node.id}`);
}

export async function runEvaluatorNode(
  node: EvaluatorNode,
  input: Record<string, unknown>,
  context: ExecutionContext
): Promise<EvaluationResult> {
  const llmOutput = await runLLMNode(node, input, context);
  const result = llmOutput.parsed as EvaluationResult;

  if (result.shouldRetry && node.execution?.retryPolicy) {
    return {
      ...result,
      signal: {
        ...(result.signal ?? {}),
        retry: true
      }
    };
  }

  return result;
}

function buildFeedback(nodeId: string, result: EvaluationResult, now: string): NodeFeedback {
  return {
    id: createId("feedback"),
    nodeExecutionId: "",
    sourceNodeId: nodeId,
    targetNodeId: "",
    score: result.score,
    shouldRetry: result.shouldRetry,
    summary: result.issues.join("; ") || (result.passed ? "Output passed evaluator review." : "Evaluator reported issues."),
    createdAt: now
  };
}

export async function runNode(
  jobRunId: string,
  node: AgentNode,
  input: Record<string, unknown>,
  retryCount: number,
  context: ExecutionContext
): Promise<NodeRunnerResult> {
  const startedAt = Date.now();
  validateSchema(input, node.input?.schema);

  let result: unknown;
  let tokenUsage = 0;
  let feedback: NodeFeedback | undefined;

  switch (node.type) {
    case "tool": {
      const toolNode = node as ToolNode;
      result = await context.registry.execute(
        toolNode.toolName,
        input,
        context
      );
      break;
    }
    case "transform": {
      const transformNode = node as TransformNode;
      result = await transformNode.run(toJsonObject(input), context);
      break;
    }
    case "llm": {
      const llmOutput = await runLLMNode(node, input, context);
      result =
        "parsed" in llmOutput && llmOutput.parsed !== undefined
          ? llmOutput.parsed
          : llmOutput.text;
      tokenUsage = Number(llmOutput.usage?.totalTokens ?? 0);
      break;
    }
    case "evaluator": {
      const evaluatorResult = await runEvaluatorNode(node, input, context);
      const { signal, ...schemaSafeResult } = evaluatorResult;
      result = schemaSafeResult;
      feedback = buildFeedback(node.id, evaluatorResult, context.now());
      break;
    }
    case "condition": {
      const conditionNode = node as ConditionNode;
      const selectedBranch =
        typeof input.selectedBranch === "string"
          ? input.selectedBranch
          : conditionNode.defaultToNodeId
            ? conditionNode.defaultToNodeId
            : conditionNode.branches?.[0]?.toNodeId ?? "";
      result = { selectedBranch };
      break;
    }
  }

  validateSchema(result, node.output.schema);
  const output = normalizeOutput(result);
  const completedAt = Date.now();
  const execution: NodeExecution = {
    id: createId("nodeexec"),
    jobRunId,
    nodeId: node.id,
    nodeVersion: node.version,
    nodeType: node.type,
    status: feedback?.shouldRetry ? "retry_scheduled" : "succeeded",
    input: toJsonObject(input),
    resolvedInput: input,
    output,
    latencyMs: completedAt - startedAt,
    tokenUsage,
    retryCount,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString()
  };

  if (feedback) {
    feedback.nodeExecutionId = execution.id;
  }

  return { output, execution, feedback };
}
