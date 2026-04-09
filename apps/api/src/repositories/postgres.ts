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
import type { PostgresDatabase } from "../db/database.js";
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
import { asRecord } from "./sql-helpers.js";

function mapJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    dagId: row.dag_id ? String(row.dag_id) : "",
    agentDefinitionKey: row.agent_definition_key ? String(row.agent_definition_key) : undefined,
    status: row.status as Job["status"],
    inputs: asRecord(row.inputs ?? row.input),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapJobSchedule(row: Record<string, unknown>): JobSchedule {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    scheduleExpression: String(row.schedule_expression),
    timezone: String(row.timezone),
    enabled: Boolean(row.enabled),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapAlertPreference(row: Record<string, unknown>): AlertPreference {
  return {
    id: String(row.id),
    jobId: row.job_id ? String(row.job_id) : undefined,
    channel: row.channel as AlertPreference["channel"],
    destination: String(row.destination),
    onSuccess: Boolean(row.on_success),
    onFailure: Boolean(row.on_failure)
  };
}

function mapJobRun(row: Record<string, unknown>): JobRun {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    status: row.status as JobRun["status"],
    triggerSource: row.trigger_source as JobRun["triggerSource"],
    startedAt: new Date(String(row.started_at)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined,
    output: row.output ? asRecord(row.output) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
}

function mapJobRunStep(row: Record<string, unknown>): JobRunStep {
  return {
    id: String(row.id),
    jobRunId: String(row.job_run_id),
    name: String(row.name),
    status: row.status as JobRunStep["status"],
    startedAt: new Date(String(row.started_at)).toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined,
    detail: row.detail ? asRecord(row.detail) : undefined
  };
}

function mapToolInvocation(row: Record<string, unknown>): ToolInvocation {
  return {
    id: String(row.id),
    jobRunStepId: String(row.job_run_step_id),
    toolName: String(row.tool_name),
    request: asRecord(row.request),
    response: row.response ? asRecord(row.response) : undefined,
    status: row.status as ToolInvocation["status"],
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapJobMemory(row: Record<string, unknown>): JobMemory {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    key: String(row.key),
    value: asRecord(row.value),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export class PostgresJobRepository implements JobRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listByUser(userId: string): Promise<Job[]> {
    const result = await this.db.pool.query("select * from jobs where user_id = $1 order by created_at desc", [userId]);
    return result.rows.map((row) => mapJob(row));
  }

  async findById(jobId: string): Promise<Job | null> {
    const result = await this.db.pool.query("select * from jobs where id = $1 limit 1", [jobId]);
    return result.rows[0] ? mapJob(result.rows[0]) : null;
  }

  async create(job: Job): Promise<Job> {
    await this.db.pool.query(
      `
        insert into jobs (id, user_id, agent_definition_key, dag_id, name, status, input, inputs, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
      `,
      [
        job.id,
        job.userId,
        job.agentDefinitionKey ?? null,
        job.dagId,
        job.name,
        job.status,
        JSON.stringify(job.inputs),
        JSON.stringify(job.inputs),
        job.createdAt,
        job.updatedAt
      ]
    );
    return job;
  }
}

export class PostgresJobScheduleRepository implements JobScheduleRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findByJobId(jobId: string): Promise<JobSchedule | null> {
    const result = await this.db.pool.query("select * from job_schedules where job_id = $1 limit 1", [jobId]);
    return result.rows[0] ? mapJobSchedule(result.rows[0]) : null;
  }

  async create(schedule: JobSchedule): Promise<JobSchedule> {
    await this.db.pool.query(
      `
        insert into job_schedules (id, job_id, schedule_expression, timezone, enabled, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [schedule.id, schedule.jobId, schedule.scheduleExpression, schedule.timezone, schedule.enabled, schedule.createdAt, schedule.updatedAt]
    );
    return schedule;
  }
}

export class PostgresAlertPreferenceRepository implements AlertPreferenceRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listByJobId(jobId: string): Promise<AlertPreference[]> {
    const result = await this.db.pool.query("select * from job_alert_preferences where job_id = $1", [jobId]);
    return result.rows.map((row) => mapAlertPreference(row));
  }

  async createMany(preferences: AlertPreference[]): Promise<AlertPreference[]> {
    for (const preference of preferences) {
      await this.db.pool.query(
        `
          insert into job_alert_preferences (id, job_id, channel, destination, on_success, on_failure)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [preference.id, preference.jobId, preference.channel, preference.destination, preference.onSuccess, preference.onFailure]
      );
    }
    return preferences;
  }
}

export class PostgresJobRunRepository implements JobRunRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listByUser(userId: string): Promise<JobRun[]> {
    const result = await this.db.pool.query(
      `
        select jr.*
        from job_runs jr
        inner join jobs j on j.id = jr.job_id
        where j.user_id = $1
        order by jr.started_at desc
      `,
      [userId]
    );
    return result.rows.map((row) => mapJobRun(row));
  }

  async findById(jobRunId: string): Promise<JobRun | null> {
    const result = await this.db.pool.query("select * from job_runs where id = $1 limit 1", [jobRunId]);
    return result.rows[0] ? mapJobRun(result.rows[0]) : null;
  }

  async create(run: JobRun): Promise<JobRun> {
    await this.db.pool.query(
      `
        insert into job_runs (id, job_id, status, trigger_source, started_at, completed_at, output, error_message)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [run.id, run.jobId, run.status, run.triggerSource, run.startedAt, run.completedAt ?? null, JSON.stringify(run.output ?? null), run.errorMessage ?? null]
    );
    return run;
  }

  async update(run: JobRun): Promise<JobRun> {
    await this.db.pool.query(
      `
        update job_runs
        set status = $2, completed_at = $3, output = $4::jsonb, error_message = $5
        where id = $1
      `,
      [run.id, run.status, run.completedAt ?? null, JSON.stringify(run.output ?? null), run.errorMessage ?? null]
    );
    return run;
  }
}

export class PostgresJobRunStepRepository implements JobRunStepRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listByRunId(jobRunId: string): Promise<JobRunStep[]> {
    const result = await this.db.pool.query(
      "select * from job_run_steps where job_run_id = $1 order by started_at asc",
      [jobRunId]
    );
    return result.rows.map((row) => mapJobRunStep(row));
  }

  async createMany(steps: JobRunStep[]): Promise<JobRunStep[]> {
    for (const step of steps) {
      await this.db.pool.query(
        `
          insert into job_run_steps (id, job_run_id, name, status, started_at, completed_at, detail)
          values ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [step.id, step.jobRunId, step.name, step.status, step.startedAt, step.completedAt ?? null, JSON.stringify(step.detail ?? null)]
      );
    }
    return steps;
  }
}

export class PostgresToolInvocationRepository implements ToolInvocationRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async createMany(invocations: ToolInvocation[]): Promise<ToolInvocation[]> {
    for (const invocation of invocations) {
      await this.db.pool.query(
        `
          insert into tool_invocations (id, job_run_step_id, tool_name, request, response, status, created_at)
          values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
        `,
        [
          invocation.id,
          invocation.jobRunStepId,
          invocation.toolName,
          JSON.stringify(invocation.request),
          JSON.stringify(invocation.response ?? null),
          invocation.status,
          invocation.createdAt
        ]
      );
    }
    return invocations.map((row) => mapToolInvocation({ ...row, created_at: row.createdAt, job_run_step_id: row.jobRunStepId, tool_name: row.toolName }));
  }
}

export class PostgresJobMemoryRepository implements JobMemoryRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listByJobId(jobId: string): Promise<JobMemory[]> {
    const result = await this.db.pool.query("select * from job_memories where job_id = $1 order by updated_at desc", [jobId]);
    return result.rows.map((row) => mapJobMemory(row));
  }

  async upsert(memory: JobMemory): Promise<JobMemory> {
    await this.db.pool.query(
      `
        insert into job_memories (id, job_id, key, value, updated_at)
        values ($1, $2, $3, $4::jsonb, $5)
        on conflict (job_id, key)
        do update set value = excluded.value, updated_at = excluded.updated_at
      `,
      [memory.id, memory.jobId, memory.key, JSON.stringify(memory.value), memory.updatedAt]
    );
    return memory;
  }
}

export class PostgresFeedbackEventRepository implements FeedbackEventRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async create(event: FeedbackEvent): Promise<FeedbackEvent> {
    await this.db.pool.query(
      `
        insert into feedback_events (id, job_id, job_run_id, score, comment, created_at)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [event.id, event.jobId, event.jobRunId ?? null, event.score, event.comment ?? null, event.createdAt]
    );
    return event;
  }
}
