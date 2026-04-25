import type { NodeRunnerResult } from "./node-runner.js";
import { deepFreeze } from "./deep-freeze.js";

type WorkingState = {
  data: Record<string, unknown>;
  diagnostics: {
    usedFallbacks: string[];
    warnings: string[];
    constraintResults: Record<string, boolean>;
    signals: Record<string, unknown>;
  };
};

export function mergeWorkingState(current: WorkingState, patch: NodeRunnerResult): WorkingState {
  return deepFreeze({
    data: {
      ...current.data,
      ...(patch.data ?? {})
    },
    diagnostics: {
      usedFallbacks: [
        ...current.diagnostics.usedFallbacks,
        ...(patch.diagnostics?.usedFallbacks ?? [])
      ],
      warnings: [
        ...current.diagnostics.warnings,
        ...(patch.diagnostics?.warnings ?? [])
      ],
      constraintResults: {
        ...current.diagnostics.constraintResults,
        ...(patch.diagnostics?.constraintResults ?? {})
      },
      signals: {
        ...current.diagnostics.signals,
        ...(patch.diagnostics?.signals ?? {})
      }
    }
  });
}
