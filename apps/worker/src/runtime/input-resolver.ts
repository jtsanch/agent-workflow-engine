import type { DataRef, InputBinding, NodeOutput, NodeOutputEntry } from "@personal-agent-os/shared";

export interface InputResolverState {
    input?: Record<string, unknown>;
    nodeOutputs?: Record<string, NodeOutputEntry[]>;
}

export function resolveInputBindings(
    bindings: InputBinding[] | undefined,
    state: InputResolverState
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (bindings === undefined) {
        return result;
    }
    for (const binding of bindings) {
        const { key, ref, optional } = binding;
        const val = resolveDataRef(ref, !!optional, state);
        if (val !== undefined) {
            result[key] = val;
        }
    }
    return result;
}

export function resolveDataRef(ref: DataRef, optional: boolean, state: InputResolverState): unknown {
    switch (ref.source) {
        case "job_input":
            return getByPath(state.input, ref.path);

        case "node_output": {
            const nodeOutput = getLatestSuccessfulOutput(state, ref.nodeId);
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

        default:
            throw new Error(`Unknown DataRef source`);
    }
}

export function getLatestSuccessfulOutput(
    state: Pick<InputResolverState, "nodeOutputs">,
    nodeId: string
): NodeOutput | undefined {
    const entries = state.nodeOutputs?.[nodeId];
    if (!entries) {
        return undefined;
    }

    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.success === true) {
            return {
                data: entry.data,
                artifacts: entry.artifacts ?? []
            };
        }
    }

    return undefined;
}

function getByPath(obj: any, path?: string) {
    if (!path) return obj;
    return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export const __test__ = {
    getByPath,
    getLatestSuccessfulOutput,
};
