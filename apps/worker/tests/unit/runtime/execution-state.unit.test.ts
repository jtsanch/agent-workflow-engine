import { describe, expect, it } from "vitest";
import type { AgentDAG } from "@personal-agent-os/shared";
import { ExecutionState } from "../../../src/runtime/execution-state.js";

describe("ExecutionState", () => {
  it("tracks job inputs, node outputs, retries, and completion", () => {
    const dag: AgentDAG = {
      id: "dag-execution-state",
      version: "1.0.0",
      name: "Execution State",
      entryNodeIds: ["start"],
      exitNodeIds: ["finish"],
      nodes: [],
      edges: []
    };
    const state = new ExecutionState({ email: "demo@example.com" });

    expect(state.getJobInput("email")).toBe("demo@example.com");
    expect(state.isComplete(dag)).toBe(false);

    state.markRunning("start");
    expect(state.isRunning("start")).toBe(true);

    state.store("start", { data: { ok: true }, artifacts: [] });
    expect(state.isCompleted("start")).toBe(true);
    expect(state.getNodeOutput("start")).toEqual({ data: { ok: true }, artifacts: [] });

    state.markForRetry("start");
    expect(state.getRetryCount("start")).toBe(1);
    expect(state.isRetryPending("start")).toBe(true);

    state.store("finish", { data: { done: true }, artifacts: [] });
    expect(state.isComplete(dag)).toBe(true);
  });

  it("clears downstream node state when asked", () => {
    const state = new ExecutionState({});
    state.store("a", { data: { value: 1 }, artifacts: [] });
    state.store("b", { data: { value: 2 }, artifacts: [] });

    state.clearSubgraph(["a", "b"]);

    expect(state.getNodeOutput("a")).toBeUndefined();
    expect(state.getNodeOutput("b")).toBeUndefined();
    expect(state.isCompleted("a")).toBe(false);
    expect(state.isCompleted("b")).toBe(false);
  });
});
