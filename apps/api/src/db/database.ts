import type { ApiDatabase } from "./client.js";
import { Pool } from "pg";
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

export interface DatabaseTables {
  jobs: Job[];
  schedules: JobSchedule[];
  alertPreferences: AlertPreference[];
  runs: JobRun[];
  runSteps: JobRunStep[];
  toolInvocations: ToolInvocation[];
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
  memories: JobMemory[];
  feedbackEvents: FeedbackEvent[];
}

export interface DatabaseAdapter {
  kind: "memory" | "postgres";
}

export class InMemoryDatabase implements DatabaseAdapter {
  readonly kind = "memory" as const;

  constructor(readonly tables: DatabaseTables) {}
}

export class PostgresDatabase implements DatabaseAdapter {
  readonly kind = "postgres" as const;

  constructor(
    readonly pool: Pool,
    readonly db: ApiDatabase
  ) {}
}
