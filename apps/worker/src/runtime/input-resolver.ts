import type { DataRef, InputBinding, NodeOutput } from "@personal-agent-os/shared";
import type { ExecutionContext as BaseExecutionContext } from "../../../../packages/agent-sdk/src/types.js";

type WorkingState = {
    data: Record<string, unknown>;
    diagnostics: {
        usedFallbacks: string[];
        warnings: string[];
        constraintResults: Record<string, boolean>;
        signals: Record<string, unknown>;
    };
};

type ExecutionContext = BaseExecutionContext & { workingState: WorkingState };

export function resolveInputBindings(
    bindings: InputBinding[] | undefined,
    context: ExecutionContext
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (bindings === undefined) {
        return result;
    }
    for (const binding of bindings) {
        const { key, ref, optional } = binding;
        const val = resolveDataRef(ref, !!optional, context);
        if (val !== undefined) {
            result[key] = val;
        }
    }
    return result;
}

export function resolveDataRef(ref: DataRef, optional: boolean, context: ExecutionContext): unknown {
    switch (ref.source) {
        case "job_input":
            return getByPath(context.jobInput, ref.path);

        case "node_output": {
            const nodeOutput = context.nodeOutputs?.[ref.nodeId] as NodeOutput | undefined;
            if (!nodeOutput) {
                if (!optional) {
                    throw new Error(`Missing dependency: ${ref.nodeId}`);
                }
                return undefined;
            }
            return getByPath(nodeOutput.data, ref.path);
        }

        case "memory":
            throw new Error('Memory not supported yet');

        case "static":
            return ref.value;

        case "context":
            return resolveBinding(ref.path, context);

        default:
            throw new Error(`Unknown DataRef source`);
    }
}

export function resolveBinding(path: string | undefined, context: ExecutionContext): unknown {
    if (!path) {
        return context;
    }

    if (path === "$state") {
        return context.workingState.data;
    }
    if (path.startsWith("$state.")) {
        return getByPath(context.workingState.data, path.slice("$state.".length));
    }

    if (path === "$diagnostics") {
        return context.workingState.diagnostics;
    }
    if (path.startsWith("$diagnostics.")) {
        return getByPath(context.workingState.diagnostics, path.slice("$diagnostics.".length));
    }

    if (path === "$input") {
        return context.jobInput;
    }
    if (path.startsWith("$input.")) {
        return getByPath(context.jobInput, path.slice("$input.".length));
    }

    if (path === "$.nodeOutputs") {
        return context.nodeOutputs;
    }
    if (path.startsWith("$.nodeOutputs.")) {
        return getByPath(context.nodeOutputs, path.slice("$.nodeOutputs.".length));
    }

    return getByPath(context, path);
}

function getByPath(obj: any, path?: string) {
    if (!path) return obj;
    return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export const __test__ = {
    getByPath,
    resolveBinding
};
