import type {
  AlertPreference,
  FeedbackEvent,
  Job,
  JobMemory,
  JobRun,
  JobRunStep,
  JobSchedule,
  NodeExecution,
  NodeFeedback,
  ToolInvocation
} from "@personal-agent-os/shared";
import type { UserRecord } from "../db/database.js";

export interface UserRepository {
  create(user: UserRecord): Promise<UserRecord>;
  findById(userId: string): Promise<UserRecord | null>;
  findByClerkUserId(clerkUserId: string): Promise<UserRecord | null>;
  listAll(): Promise<UserRecord[]>;
  updateStatus(userId: string, status: UserRecord["status"]): Promise<void>;
}

export interface UsageSummaryRecord {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  perRunLimit: number;
}

export interface UsageCounterRecord {
  dailyTokens: number;
  monthlyTokens: number;
  lastDailyReset: string;
  lastMonthlyReset: string;
}

export interface UsageEventRecord {
  id: string;
  userId: string;
  jobId?: string;
  jobRunId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

export interface UsageEventPageRecord {
  events: UsageEventRecord[];
  nextCursor?: string;
}

export interface UserUsageRepository {
  findSummaryByUserId(userId: string): Promise<UsageSummaryRecord | null>;
  findCountersByUserId(userId: string): Promise<UsageCounterRecord | null>;
  updateCounters(userId: string, counters: UsageCounterRecord): Promise<void>;
  createEvent(event: UsageEventRecord): Promise<UsageEventRecord>;
  listEventsByUserId(userId: string, cursor?: string, limit?: number): Promise<UsageEventPageRecord>;
}

export interface JobRepository {
  listByUser(userId: string): Promise<Job[]>;
  findById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
  createWithRelations(job: Job, schedule: JobSchedule, alertPreferences: AlertPreference[]): Promise<Job>;
}

export interface JobScheduleRepository {
  findByJobId(jobId: string): Promise<JobSchedule | null>;
  create(schedule: JobSchedule): Promise<JobSchedule>;
}

export interface AlertPreferenceRepository {
  listByJobId(jobId: string): Promise<AlertPreference[]>;
  createMany(preferences: AlertPreference[]): Promise<AlertPreference[]>;
}

export interface JobRunRepository {
  listByUser(userId: string): Promise<JobRun[]>;
  findById(jobRunId: string): Promise<JobRun | null>;
  create(run: JobRun): Promise<JobRun>;
  update(run: JobRun): Promise<JobRun>;
}

export interface JobRunStepRepository {
  listByRunId(jobRunId: string): Promise<JobRunStep[]>;
  listByRunIds(jobRunIds: string[]): Promise<JobRunStep[]>;
  createMany(steps: JobRunStep[]): Promise<JobRunStep[]>;
}

export interface ToolInvocationRepository {
  listByExecutionIds(nodeExecutionIds: string[]): Promise<ToolInvocation[]>;
  createMany(invocations: ToolInvocation[]): Promise<ToolInvocation[]>;
}

export interface NodeExecutionRepository {
  listByRunId(jobRunId: string): Promise<NodeExecution[]>;
  listByRunIds(jobRunIds: string[]): Promise<NodeExecution[]>;
  createMany(nodeExecutions: NodeExecution[]): Promise<NodeExecution[]>;
}

export interface NodeFeedbackRepository {
  listByRunId(jobRunId: string): Promise<NodeFeedback[]>;
  listByExecutionIds(nodeExecutionIds: string[]): Promise<NodeFeedback[]>;
  createMany(nodeFeedback: NodeFeedback[]): Promise<NodeFeedback[]>;
}

export interface JobMemoryRepository {
  listByJobId(jobId: string): Promise<JobMemory[]>;
  upsert(memory: JobMemory): Promise<JobMemory>;
}

export interface FeedbackEventRepository {
  create(event: FeedbackEvent): Promise<FeedbackEvent>;
}
