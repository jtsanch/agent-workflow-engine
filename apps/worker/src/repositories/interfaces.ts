import type { Job, NodeExecution, ToolInvocation } from "@personal-agent-os/shared";
import type { UsageTelemetry } from "../runtime/node-runner.js";

export interface ClaimedRunRecord {
  runId: string;
  job: Job;
}

export interface UsageStateRecord {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
}

export interface JobMemoryWriteRecord {
  key: string;
  value: unknown;
  nodeId?: string;
}

export interface FinalizeRunRecord {
  runId: string;
  userId: string;
  jobId: string;
  jobStatus: "succeeded" | "failed";
  completedAt: string;
  finalOutput: unknown;
  errorMessage: string | null;
  usageEvents: UsageTelemetry[];
}

export interface WorkerPersistenceRepository {
  claimNextQueuedRun(): Promise<ClaimedRunRecord | null>;
  failRun(runId: string, errorMessage: string, completedAt?: string): Promise<void>;
  loadUsageState(userId: string): Promise<UsageStateRecord>;
  updateUsageState(userId: string, state: UsageStateRecord): Promise<void>;
  persistNodeExecutions(nodeExecutions: NodeExecution[]): Promise<void>;
  persistToolInvocations(toolInvocations: ToolInvocation[], defaultCreatedAt: string): Promise<void>;
  upsertJobMemories(jobId: string, memoryWrites: JobMemoryWriteRecord[], updatedAt: string): Promise<void>;
  finalizeRun(record: FinalizeRunRecord): Promise<void>;
}
