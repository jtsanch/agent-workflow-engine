import type {
  AlertPreference,
  FeedbackEvent,
  Job,
  JobMemory,
  JobRun,
  JobRunStep,
  JobSchedule,
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
  ToolInvocationRepository
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

  async createMany(steps: JobRunStep[]): Promise<JobRunStep[]> {
    this.db.tables.runSteps.push(...steps);
    return steps;
  }
}

export class InMemoryToolInvocationRepository implements ToolInvocationRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  async createMany(invocations: ToolInvocation[]): Promise<ToolInvocation[]> {
    this.db.tables.toolInvocations.push(...invocations);
    return invocations;
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
