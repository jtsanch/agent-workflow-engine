import { pgTable } from "drizzle-orm/pg-core";
import { agentDags, agentNodes, jobDagVersions } from "./agents.js";
import { jobAlertPreferences, jobs, jobSchedules } from "./jobs.js";
import {
  feedbackEvents,
  jobMemories,
  jobRuns,
  jobRunSteps,
  nodeExecutions,
  nodeFeedback,
  toolInvocations
} from "./runs.js";

export const jobsTable = pgTable("jobs", jobs);
export const jobSchedulesTable = pgTable("job_schedules", jobSchedules);
export const jobAlertPreferencesTable = pgTable("job_alert_preferences", jobAlertPreferences);
export const jobRunsTable = pgTable("job_runs", jobRuns);
export const jobRunStepsTable = pgTable("job_run_steps", jobRunSteps);
export const toolInvocationsTable = pgTable("tool_invocations", toolInvocations);
export const jobMemoriesTable = pgTable("job_memories", jobMemories);
export const feedbackEventsTable = pgTable("feedback_events", feedbackEvents);
export const agentDagsTable = pgTable("agent_dags", agentDags);
export const agentNodesTable = pgTable("agent_nodes", agentNodes);
export const jobDagVersionsTable = pgTable("job_dag_versions", jobDagVersions);
export const nodeExecutionsTable = pgTable("node_executions", nodeExecutions);
export const nodeFeedbackTable = pgTable("node_feedback", nodeFeedback);

export const schema = {
  jobsTable,
  jobSchedulesTable,
  jobAlertPreferencesTable,
  jobRunsTable,
  jobRunStepsTable,
  toolInvocationsTable,
  jobMemoriesTable,
  feedbackEventsTable,
  agentDagsTable,
  agentNodesTable,
  jobDagVersionsTable,
  nodeExecutionsTable,
  nodeFeedbackTable
};
