import type { AgentDAG } from "@personal-agent-os/shared";

export class ExecutionState {
  private readonly initialInputs: Record<string, unknown>;
  private readonly outputs = new Map<string, Record<string, unknown>>();
  private readonly completed = new Set<string>();
  private readonly running = new Set<string>();
  private readonly retryCounts = new Map<string, number>();
  private readonly retryQueue = new Set<string>();

  constructor(initialInputs: Record<string, unknown>) {
    this.initialInputs = initialInputs;
  }

  getJobInput(key: string): unknown {
    return this.initialInputs[key];
  }

  getNodeOutput(nodeId: string): Record<string, unknown> | undefined {
    return this.outputs.get(nodeId);
  }

  store(nodeId: string, output: Record<string, unknown>): void {
    this.outputs.set(nodeId, output);
    this.completed.add(nodeId);
    this.running.delete(nodeId);
    this.retryQueue.delete(nodeId);
  }

  markRunning(nodeId: string): void {
    this.running.add(nodeId);
  }

  isCompleted(nodeId: string): boolean {
    return this.completed.has(nodeId);
  }

  isRunning(nodeId: string): boolean {
    return this.running.has(nodeId);
  }

  getRetryCount(nodeId: string): number {
    return this.retryCounts.get(nodeId) ?? 0;
  }

  markForRetry(nodeId: string): void {
    this.retryCounts.set(nodeId, this.getRetryCount(nodeId) + 1);
    this.retryQueue.add(nodeId);
    this.completed.delete(nodeId);
    this.outputs.delete(nodeId);
  }

  clearSubgraph(nodeIds: string[]): void {
    for (const nodeId of nodeIds) {
      this.completed.delete(nodeId);
      this.outputs.delete(nodeId);
      this.running.delete(nodeId);
    }
  }

  isRetryPending(nodeId: string): boolean {
    return this.retryQueue.has(nodeId);
  }

  isComplete(dag: AgentDAG): boolean {
    return this.completed.has(dag.exitNodeId);
  }
}

