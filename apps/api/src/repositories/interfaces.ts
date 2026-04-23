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

export interface JobRepository {
  listByUser(userId: string): Promise<Job[]>;
  findById(jobId: string): Promise<Job | null>;
  create(job: Job): Promise<Job>;
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
