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
import type { InMemoryDatabase } from "../db/database.js";
import type {
  AlertPreferenceRepository,
  FeedbackEventRepository,
  JobMemoryRepository,
  JobRepository,
  JobRunRepository,
  JobRunStepRepository,
  JobScheduleRepository,
  NodeExecutionRepository,
  NodeFeedbackRepository,
  ToolInvocationRepository,
} from "./interfaces.js";

export class InMemoryJobRepository implements JobRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByUser(userId: string): Promise<Job[]> {
    return this.db.tables.jobs.filter((job) => job.userId === userId);
  }

  async findById(jobId: string): Promise<Job | null> {
    return this.db.tables.jobs.find((job) => job.id === jobId) ?? null;
  }

  async create(job: Job): Promise<Job> {
    this.db.tables.jobs.push(job);
    return job;
  }

  async createWithRelations(job: Job, schedule: JobSchedule, alertPreferences: AlertPreference[]): Promise<Job> {
    this.db.tables.jobs.push(job);
    this.db.tables.schedules.push(schedule);
    this.db.tables.alertPreferences.push(...alertPreferences);
    return job;
  }
}

export class InMemoryJobScheduleRepository implements JobScheduleRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async findByJobId(jobId: string): Promise<JobSchedule | null> {
    return this.db.tables.schedules.find((schedule) => schedule.jobId === jobId) ?? null;
  }

  async create(schedule: JobSchedule): Promise<JobSchedule> {
    this.db.tables.schedules.push(schedule);
    return schedule;
  }
}

export class InMemoryAlertPreferenceRepository implements AlertPreferenceRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByJobId(jobId: string): Promise<AlertPreference[]> {
    return this.db.tables.alertPreferences.filter((preference) => preference.jobId === jobId);
  }

  async createMany(preferences: AlertPreference[]): Promise<AlertPreference[]> {
    this.db.tables.alertPreferences.push(...preferences);
    return preferences;
  }
}

export class InMemoryJobRunRepository implements JobRunRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByUser(userId: string): Promise<JobRun[]> {
    const userJobIds = new Set(this.db.tables.jobs.filter((job) => job.userId === userId).map((job) => job.id));
    return this.db.tables.runs.filter((run) => userJobIds.has(run.jobId));
  }

  async findById(jobRunId: string): Promise<JobRun | null> {
    return this.db.tables.runs.find((run) => run.id === jobRunId) ?? null;
  }

  async create(run: JobRun): Promise<JobRun> {
    this.db.tables.runs.push(run);
    return run;
  }

  async update(run: JobRun): Promise<JobRun> {
    const index = this.db.tables.runs.findIndex((current) => current.id === run.id);
    if (index >= 0) {
      this.db.tables.runs[index] = run;
    }
    return run;
  }
}

export class InMemoryJobRunStepRepository implements JobRunStepRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByRunId(jobRunId: string): Promise<JobRunStep[]> {
    return this.db.tables.runSteps.filter((step) => step.jobRunId === jobRunId);
  }

  async listByRunIds(jobRunIds: string[]): Promise<JobRunStep[]> {
    const runIdSet = new Set(jobRunIds);
    return this.db.tables.runSteps.filter((step) => runIdSet.has(step.jobRunId));
  }

  async createMany(steps: JobRunStep[]): Promise<JobRunStep[]> {
    this.db.tables.runSteps.push(...steps);
    return steps;
  }
}

export class InMemoryToolInvocationRepository implements ToolInvocationRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByExecutionIds(nodeExecutionIds: string[]): Promise<ToolInvocation[]> {
    const executionIdSet = new Set(nodeExecutionIds);
    return this.db.tables.toolInvocations.filter((invocation) => executionIdSet.has(invocation.nodeExecutionId));
  }

  async createMany(invocations: ToolInvocation[]): Promise<ToolInvocation[]> {
    this.db.tables.toolInvocations.push(...invocations);
    return invocations;
  }
}

export class InMemoryNodeExecutionRepository implements NodeExecutionRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByRunId(jobRunId: string): Promise<NodeExecution[]> {
    return this.db.tables.nodeExecutions.filter((execution) => execution.jobRunId === jobRunId);
  }

  async listByRunIds(jobRunIds: string[]): Promise<NodeExecution[]> {
    const runIdSet = new Set(jobRunIds);
    return this.db.tables.nodeExecutions.filter((execution) => runIdSet.has(execution.jobRunId));
  }

  async createMany(nodeExecutions: NodeExecution[]): Promise<NodeExecution[]> {
    this.db.tables.nodeExecutions.push(...nodeExecutions);
    return nodeExecutions;
  }
}

export class InMemoryNodeFeedbackRepository implements NodeFeedbackRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByRunId(jobRunId: string): Promise<NodeFeedback[]> {
    const executionIds = new Set(
      this.db.tables.nodeExecutions
        .filter((execution) => execution.jobRunId === jobRunId)
        .map((execution) => execution.id)
    );
    return this.db.tables.nodeFeedback.filter((feedback) => executionIds.has(feedback.nodeExecutionId));
  }

  async listByExecutionIds(nodeExecutionIds: string[]): Promise<NodeFeedback[]> {
    const executionIdSet = new Set(nodeExecutionIds);
    return this.db.tables.nodeFeedback.filter((feedback) => executionIdSet.has(feedback.nodeExecutionId));
  }

  async createMany(nodeFeedback: NodeFeedback[]): Promise<NodeFeedback[]> {
    this.db.tables.nodeFeedback.push(...nodeFeedback);
    return nodeFeedback;
  }
}

export class InMemoryJobMemoryRepository implements JobMemoryRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async listByJobId(jobId: string): Promise<JobMemory[]> {
    return this.db.tables.memories.filter((memory) => memory.jobId === jobId);
  }

  async upsert(memory: JobMemory): Promise<JobMemory> {
    const index = this.db.tables.memories.findIndex(
      (existing) => existing.jobId === memory.jobId && existing.key === memory.key
    );

    if (index >= 0) {
      this.db.tables.memories[index] = memory;
    } else {
      this.db.tables.memories.push(memory);
    }

    return memory;
  }
}

export class InMemoryFeedbackEventRepository implements FeedbackEventRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async create(event: FeedbackEvent): Promise<FeedbackEvent> {
    this.db.tables.feedbackEvents.push(event);
    return event;
  }
}
