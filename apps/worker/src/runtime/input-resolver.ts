import type { DataRef, InputBinding, NodeOutput } from "@personal-agent-os/shared";
import type { ExecutionContext } from "@personal-agent-os/agent-sdk";

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
            return getByPath(context, ref.path);

        default:
            throw new Error(`Unknown DataRef source`);
    }
}

function getByPath(obj: any, path?: string) {
    if (!path) return obj;
    return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export const __test__ = {
    getByPath
};
