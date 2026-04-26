import type {
  AgentDAG,
  NodeInstance,
  NodeOutput,
  NodeOutputEntry,
  NodeRuntime
} from "@personal-agent-os/shared";
import { appendNodeOutput } from "@personal-agent-os/agent-sdk";

export class ExecutionState {
  readonly input: Record<string, unknown>;
  readonly runtime: Record<string, NodeRuntime> = {};
  readonly nodeOutputs: Record<string, NodeOutputEntry[]> = {};
  readonly nodeInstances: Record<string, NodeInstance> = {};

  constructor(initialInputs: Record<string, unknown>, dag?: AgentDAG) {
    this.input = initialInputs;
    for (const node of dag?.nodes ?? []) {
      this.nodeInstances[node.id] = {
        nodeInstanceId: node.id,
        nodeId: node.id,
        index: 0,
        input: {}
      };
      this.runtime[node.id] = {
        status: "pending",
        retryCount: 0
      };
    }
  }

  getJobInput(key: string): unknown {
    return this.input[key];
  }

  getNodeInstanceId(nodeId: string): string {
    return this.ensureNodeInstance(nodeId).nodeInstanceId;
  }

  getInstanceIdsForNode(nodeId: string): string[] {
    return Object.values(this.nodeInstances)
        .filter(nodeInstance => nodeInstance.nodeId === nodeId)
        .map((nodeInstance: NodeInstance) => nodeInstance.nodeInstanceId);
  }

  getNodeOutputs(nodeId: string): NodeOutput[] | undefined {
    const nodeInstanceIds = this.getInstanceIdsForNode(nodeId);
    if (!nodeInstanceIds || nodeInstanceIds.length === 0) {
      return undefined;
    }
    if (nodeInstanceIds.length > 1) {
      throw new Error("Fan out not supported");
    }
    const entries = this.nodeOutputs[nodeInstanceIds[0]] || [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.success) {
        return [{
          data: entry.data,
          artifacts: entry.artifacts ?? []
        }];
      }
    }
    return undefined;
  }

  setNodeInput(nodeId: string, input: Record<string, unknown>): void {
    this.ensureNodeInstance(nodeId).input = input;
  }

  store(nodeId: string, output: NodeOutput): void {
    this.completeExecution(nodeId, output);
  }

  markRunning(nodeId: string): void {
    const nodeInstanceId = this.getNodeInstanceId(nodeId);
    const runtime = this.ensureRuntime(nodeId);
    this.runtime[nodeInstanceId] = {
      ...runtime,
      status: "running",
      retryCount: runtime.retryCount
    };
  }

  completeExecution(nodeId: string, output: NodeOutput): void {
    const nodeInstanceId = this.getNodeInstanceId(nodeId);
    const runtime = this.ensureRuntime(nodeId);
    appendNodeOutput(this, nodeInstanceId, {
      attempt: runtime.retryCount,
      data: output.data,
      artifacts: output.artifacts,
      success: true,
      timestamp: Date.now()
    });
    this.runtime[nodeInstanceId] = {
      status: "completed",
      retryCount: runtime.retryCount
    };
  }

  recordFailure(nodeId: string, error: unknown, maxRetries: number): boolean {
    const nodeInstanceId = this.getNodeInstanceId(nodeId);
    const runtime = this.ensureRuntime(nodeId);
    const errorMessage = error instanceof Error ? error.message : "Node execution failed";

    appendNodeOutput(this, nodeInstanceId, {
      attempt: runtime.retryCount,
      data: {
        errorMessage
      },
      artifacts: [],
      success: false,
      timestamp: Date.now(),
      error: errorMessage
    });

    if (runtime.retryCount < maxRetries) {
      this.runtime[nodeInstanceId] = {
        status: "pending",
        retryCount: runtime.retryCount + 1
      };
      return true;
    }

    this.runtime[nodeInstanceId] = {
      status: "failed",
      retryCount: runtime.retryCount
    };
    return false;
  }

  isCompleted(nodeId: string): boolean {
    return this.ensureRuntime(nodeId).status === "completed";
  }

  isRunning(nodeId: string): boolean {
    return this.ensureRuntime(nodeId).status === "running";
  }

  getRetryCount(nodeId: string): number {
    return this.ensureRuntime(nodeId).retryCount;
  }

  markForRetry(nodeId: string): void {
    const nodeInstanceId = this.getNodeInstanceId(nodeId);
    const runtime = this.ensureRuntime(nodeId);
    const retryCount = runtime.retryCount + 1;
    this.runtime[nodeInstanceId] = {
      ...runtime,
      status: "pending",
      retryCount
    };
    delete this.nodeOutputs[nodeInstanceId];
  }

  clearSubgraph(nodeIds: string[]): void {
    for (const nodeId of nodeIds) {
      const nodeInstanceId = this.getNodeInstanceId(nodeId);
      this.runtime[nodeInstanceId] = {
        status: "pending",
        retryCount: this.runtime[nodeInstanceId]?.retryCount ?? 0
      };
      delete this.nodeOutputs[nodeInstanceId];
    }
  }

  isRetryPending(nodeId: string): boolean {
    const runtime = this.ensureRuntime(nodeId);
    return runtime.status === "pending" && runtime.retryCount > 0;
  }

  isComplete(dag: AgentDAG): boolean {
    const exitNodeIds = dag.nodes
      .filter((node) => !dag.edges.some((edge) => edge.from === node.id))
      .map((node) => node.id);
    return exitNodeIds.every((nodeId) => this.ensureRuntime(nodeId).status === "completed");
  }

  private ensureRuntime(nodeId: string): NodeRuntime {
    const nodeInstanceId = this.getNodeInstanceId(nodeId);
    this.runtime[nodeInstanceId] ??= {
      status: "pending",
      retryCount: 0
    };
    return this.runtime[nodeInstanceId];
  }

  private ensureNodeInstance(nodeId: string): NodeInstance {
    this.nodeInstances[nodeId] ??= {
      nodeInstanceId: nodeId,
      nodeId,
      index: 0,
      input: {}
    };
    return this.nodeInstances[nodeId];
  }
}
