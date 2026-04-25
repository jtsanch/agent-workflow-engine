import { describe, expect, it } from "vitest";
import type { NodeRunnerResult } from "../../../src/runtime/node-runner.js";
import { mergeWorkingState } from "../../../src/runtime/merge-working-state.js";

type WorkingState = {
  data: Record<string, unknown>;
  diagnostics: {
    usedFallbacks: string[];
    warnings: string[];
    constraintResults: Record<string, boolean>;
    signals: Record<string, unknown>;
  };
};

describe("mergeWorkingState", () => {
  it("merges data and diagnostics deterministically and freezes the result", () => {
    const current: WorkingState = {
      data: {
        existing: true,
        overwritten: "before"
      },
      diagnostics: {
        usedFallbacks: ["fallback_a"],
        warnings: ["warning_a"],
        constraintResults: {
          constraintA: true
        },
        signals: {
          pantryCoverage: 0.5,
          preserved: "yes"
        }
      }
    };

    const patch: NodeRunnerResult = {
      output: {
        data: {},
        artifacts: []
      },
      execution: {
        id: "nodeexec_1",
        jobRunId: "run_1",
        nodeId: "node_1",
        nodeVersion: "1.0.0",
        nodeType: "transform",
        status: "succeeded",
        resolvedInput: {},
        output: {
          data: {},
          artifacts: []
        },
        latencyMs: 1,
        tokenUsage: 0,
        retryCount: 0,
        startedAt: "2026-04-10T00:00:00.000Z",
        completedAt: "2026-04-10T00:00:00.000Z"
      },
      data: {
        overwritten: "after",
        added: 123
      },
      diagnostics: {
        usedFallbacks: ["fallback_b"],
        warnings: ["warning_b"],
        constraintResults: {
          constraintB: false
        },
        signals: {
          pantryCoverage: 1,
          addedSignal: "new"
        }
      }
    };

    const merged = mergeWorkingState(current, patch);

    expect(merged).toEqual({
      data: {
        existing: true,
        overwritten: "after",
        added: 123
      },
      diagnostics: {
        usedFallbacks: ["fallback_a", "fallback_b"],
        warnings: ["warning_a", "warning_b"],
        constraintResults: {
          constraintA: true,
          constraintB: false
        },
        signals: {
          pantryCoverage: 1,
          preserved: "yes",
          addedSignal: "new"
        }
      }
    });

    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.data)).toBe(true);
    expect(Object.isFrozen(merged.diagnostics)).toBe(true);
    expect(Object.isFrozen(merged.diagnostics.usedFallbacks)).toBe(true);
    expect(Object.isFrozen(merged.diagnostics.warnings)).toBe(true);
    expect(Object.isFrozen(merged.diagnostics.constraintResults)).toBe(true);
    expect(Object.isFrozen(merged.diagnostics.signals)).toBe(true);
    expect(merged).not.toBe(current);
    expect(merged.data).not.toBe(current.data);
    expect(merged.diagnostics).not.toBe(current.diagnostics);
  });

  it("does not mutate the current state and rejects mutation of the merged result", () => {
    const current: WorkingState = {
      data: {
        existing: true
      },
      diagnostics: {
        usedFallbacks: [],
        warnings: [],
        constraintResults: {},
        signals: {}
      }
    };

    const patch: NodeRunnerResult = {
      output: {
        data: {},
        artifacts: []
      },
      execution: {
        id: "nodeexec_2",
        jobRunId: "run_1",
        nodeId: "node_2",
        nodeVersion: "1.0.0",
        nodeType: "transform",
        status: "succeeded",
        resolvedInput: {},
        output: {
          data: {},
          artifacts: []
        },
        latencyMs: 1,
        tokenUsage: 0,
        retryCount: 0,
        startedAt: "2026-04-10T00:00:00.000Z",
        completedAt: "2026-04-10T00:00:00.000Z"
      },
      data: {
        added: "value"
      }
    };

    const merged = mergeWorkingState(current, patch);

    expect(current).toEqual({
      data: {
        existing: true
      },
      diagnostics: {
        usedFallbacks: [],
        warnings: [],
        constraintResults: {},
        signals: {}
      }
    });

    expect(() => {
      (merged.data as Record<string, unknown>).added = "changed";
    }).toThrow();
  });
});
