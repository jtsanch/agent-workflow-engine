import type { AppConfig } from "./config/config.js";
import { createPostgresClient } from "./db/client.js";
import { createSeedTables } from "./db/seed.js";
import { InMemoryDatabase, PostgresDatabase } from "./db/database.js";
import {
  InMemoryAlertPreferenceRepository,
  InMemoryFeedbackEventRepository,
  InMemoryJobMemoryRepository,
  InMemoryJobRepository,
  InMemoryJobRunRepository,
  InMemoryJobRunStepRepository,
  InMemoryJobScheduleRepository,
  InMemoryNodeExecutionRepository,
  InMemoryNodeFeedbackRepository,
  InMemoryToolInvocationRepository
} from "./repositories/memory.js";
import {
  PostgresAlertPreferenceRepository,
  PostgresFeedbackEventRepository,
  PostgresJobMemoryRepository,
  PostgresJobRepository,
  PostgresJobRunRepository,
  PostgresJobRunStepRepository,
  PostgresJobScheduleRepository,
  PostgresNodeExecutionRepository,
  PostgresNodeFeedbackRepository,
  PostgresToolInvocationRepository
} from "./repositories/postgres/index.js";
import { AgentCatalogService } from "./services/agent-catalog.js";
import { AlertsService } from "./services/alerts-service.js";
import { HealthService } from "./services/health-service.js";
import { JobsService } from "./services/jobs-service.js";
import { RunsService } from "./services/runs-service.js";
import { SearchService } from "./services/search-service.js";

export interface AppContext {
  config: AppConfig;
  healthService: HealthService;
  agentCatalogService: AgentCatalogService;
  jobsService: JobsService;
  runsService: RunsService;
  alertsService: AlertsService;
  searchService: SearchService;
  close(): Promise<void>;
}

export function createAppContext(config: AppConfig): AppContext {
  const agentCatalogService = new AgentCatalogService();

  const database =
    config.dbDriver === "postgres"
      ? (() => {
          const { pool, db } = createPostgresClient(config.databaseUrl);
          return new PostgresDatabase(pool, db);
        })()
      : new InMemoryDatabase(createSeedTables());

  const jobRepository =
    database.kind === "postgres" ? new PostgresJobRepository(database) : new InMemoryJobRepository(database);
  const jobScheduleRepository =
    database.kind === "postgres"
      ? new PostgresJobScheduleRepository(database)
      : new InMemoryJobScheduleRepository(database);
  const alertPreferenceRepository =
    database.kind === "postgres"
      ? new PostgresAlertPreferenceRepository(database)
      : new InMemoryAlertPreferenceRepository(database);
  const jobRunRepository =
    database.kind === "postgres" ? new PostgresJobRunRepository(database) : new InMemoryJobRunRepository(database);
  const jobRunStepRepository =
    database.kind === "postgres"
      ? new PostgresJobRunStepRepository(database)
      : new InMemoryJobRunStepRepository(database);
  const toolInvocationRepository =
    database.kind === "postgres"
      ? new PostgresToolInvocationRepository(database)
      : new InMemoryToolInvocationRepository(database);
  const nodeExecutionRepository =
    database.kind === "postgres"
      ? new PostgresNodeExecutionRepository(database)
      : new InMemoryNodeExecutionRepository(database);
  const nodeFeedbackRepository =
    database.kind === "postgres"
      ? new PostgresNodeFeedbackRepository(database)
      : new InMemoryNodeFeedbackRepository(database);
  const jobMemoryRepository =
    database.kind === "postgres"
      ? new PostgresJobMemoryRepository(database)
      : new InMemoryJobMemoryRepository(database);
  const feedbackEventRepository =
    database.kind === "postgres"
      ? new PostgresFeedbackEventRepository(database)
      : new InMemoryFeedbackEventRepository(database);
  void feedbackEventRepository;

  const jobsService = new JobsService(
    jobRepository,
    jobScheduleRepository,
    alertPreferenceRepository,
    agentCatalogService
  );
  const runsService = new RunsService(
    jobRepository,
    jobRunRepository,
    jobRunStepRepository,
    toolInvocationRepository,
    nodeExecutionRepository,
    nodeFeedbackRepository,
    jobMemoryRepository,
    agentCatalogService
  );
  const alertsService = new AlertsService(jobRepository, alertPreferenceRepository);
  const healthService = new HealthService(database);
  const searchService = new SearchService();

  return {
    config,
    healthService,
    agentCatalogService,
    jobsService,
    runsService,
    alertsService,
    searchService,
    async close() {
      if (database.kind === "postgres") {
        await database.pool.end();
      }
    }
  };
}
