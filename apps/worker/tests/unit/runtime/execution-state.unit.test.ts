import { describe, expect, it } from "vitest";
import type { AgentDAG } from "@personal-agent-os/shared";
import { ExecutionState } from "../../../src/runtime/execution-state.js";

describe("ExecutionState", () => {
  it("tracks job inputs, node outputs, retries, and completion", () => {
    const dag: AgentDAG = {
      id: "dag-execution-state",
      version: "1.0.0",
      name: "Execution State",
      nodes: [
        {
          id: "start",
          version: "1.0.0",
          type: "transform",
          name: "Start",
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        },
        {
          id: "finish",
          version: "1.0.0",
          type: "transform",
          name: "Finish",
          input: {
            bindings: [{ key: "start", ref: { source: "node_output", nodeId: "start" } }]
          },
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        }
      ]
    };
    const state = new ExecutionState({ email: "demo@example.com" }, dag);

    expect(state.getJobInput("email")).toBe("demo@example.com");
    expect(state.isComplete(dag)).toBe(false);
    expect(state.runtime.start).toEqual({
      status: "pending",
      retryCount: 0
    });
    expect(state.runtime.finish).toEqual({
      status: "pending",
      retryCount: 0
    });
    expect(state.nodeInstances.start).toEqual({
      nodeInstanceId: "start",
      nodeId: "start",
      index: 0,
      input: {}
    });
    expect(state.nodeInstances.finish).toEqual({
      nodeInstanceId: "finish",
      nodeId: "finish",
      index: 0,
      input: {}
    });

    state.markRunning("start");
    expect(state.isRunning("start")).toBe(true);
    expect(state.runtime.start).toEqual({
      status: "running",
      retryCount: 0
    });

    state.store("start", { data: { ok: true }, artifacts: [] });
    expect(state.isCompleted("start")).toBe(true);
    const startNodeOutputs = state.getNodeOutputs("start") || [];
    expect(startNodeOutputs[0]).toEqual({ data: { ok: true }, artifacts: [] });
    expect(state.runtime.start).toEqual({
      status: "completed",
      retryCount: 0
    });
    expect(state.nodeOutputs.start).toHaveLength(1);
    expect(state.nodeOutputs.start?.[0]).toMatchObject({
      attempt: 0,
      data: { ok: true },
      artifacts: [],
      success: true
    });

    state.markForRetry("start");
    expect(state.getRetryCount("start")).toBe(1);
    expect(state.isRetryPending("start")).toBe(true);
    expect(state.runtime.start).toEqual({
      status: "pending",
      retryCount: 1
    });

    state.store("finish", { data: { done: true }, artifacts: [] });
    expect(state.runtime.finish).toEqual({
      status: "completed",
      retryCount: 0
    });
  });

  it("clears downstream node state when asked", () => {
    const state = new ExecutionState({});
    state.nodeInstances.a = {
      nodeInstanceId: "node-instance-a",
      nodeId: "a",
      index: 0,
      input: {}
    };
    state.store("a", { data: { value: 1 }, artifacts: [] });
    state.store("b", { data: { value: 2 }, artifacts: [] });

    state.clearSubgraph(["a", "b"]);

    expect(state.nodeInstances.a).toEqual({
      index: 0,
      input: {},
      nodeId: "a",
      nodeInstanceId: "node-instance-a",
    });
    expect(state.isCompleted("a")).toBe(false);
    expect(state.isCompleted("b")).toBe(false);
    expect(state.runtime["node-instance-a"]).toEqual({
      status: "pending",
      retryCount: 0
    });
    expect(state.runtime.b).toEqual({
      status: "pending",
      retryCount: 0
    });
    expect(state.nodeOutputs["node-instance-a"]).toEqual([
      expect.objectContaining({
        data: { value: 1 },
        success: true
      })
    ]);
    expect(state.nodeOutputs.b).toEqual([
      expect.objectContaining({
        data: { value: 2 },
        success: true
      })
    ]);
  });
});
