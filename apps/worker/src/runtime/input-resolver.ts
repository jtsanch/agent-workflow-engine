import type { DataRef, InputBinding, NodeOutput, NodeOutputEntry } from "@personal-agent-os/shared";
import {ExecutionState} from './execution-state.js';

export function resolveInputBindings(
    bindings: InputBinding[] | undefined,
    state: ExecutionState
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

export function resolveDataRef(ref: DataRef, optional: boolean, state: ExecutionState): unknown {
    switch (ref.source) {
        case "job_input":
            return getByPath(state.input, ref.path);

        case "node_output": {
            const nodeOutputs = state.getNodeOutputs(ref.nodeId);
            if (!nodeOutputs || nodeOutputs.length === 0) {
                if (!optional) {
                    throw new Error(`Missing dependency: ${ref.nodeId}`);
                }
                return undefined;
            }
            if (nodeOutputs.length > 1) {
                throw new Error("Fanout is not supported");
            }
            return getByPath(nodeOutputs[0].data, ref.path);
        }

        case "memory":
            throw new Error('Memory not supported yet');

        case "static":
            return ref.value;

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
