import { createLlmBudget } from "../../../../packages/agent-sdk/src/tools/llm-budget.js";
import type { ExecutionContext } from "../../../../packages/agent-sdk/src/types.js";
import type { JobRun, NodeExecution, NodeFeedback, ToolInvocation, UserContext } from "@personal-agent-os/shared";
import type {
  JobMemoryRepository,
  JobRepository,
  JobRunRepository,
  JobRunStepRepository,
  NodeExecutionRepository,
  NodeFeedbackRepository,
  ToolInvocationRepository
} from "../repositories/interfaces.js";
import { createId } from "../common/ids.js";
import { AppError } from "../common/errors.js";
import { AgentCatalogService } from "./agent-catalog.js";
import { createDefaultToolRegistry } from "../worker-compat/tool-registry.js";
import { executeDagCompat } from "../worker-compat/dag-engine.js";
import { asJsonValue } from "../repositories/sql-helpers.js";

export type HydratedRun = JobRun & {
  toolInvocations: ToolInvocation[];
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
};

export class RunsService {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly jobRunRepository: JobRunRepository,
    private readonly jobRunStepRepository: JobRunStepRepository,
    private readonly toolInvocationRepository: ToolInvocationRepository,
    private readonly nodeExecutionRepository: NodeExecutionRepository,
    private readonly nodeFeedbackRepository: NodeFeedbackRepository,
    private readonly jobMemoryRepository: JobMemoryRepository,
    private readonly agentCatalogService: AgentCatalogService
  ) {}

  async listRuns(userContext: UserContext): Promise<HydratedRun[]> {
    const runs = await this.jobRunRepository.listByUser(userContext.userId);
    return this.hydrateRuns(runs);
  }

  async getRun(
    userContext: UserContext,
    runId: string
  ): Promise<HydratedRun> {
    const runs = await this.jobRunRepository.listByUser(userContext.userId);
    const run = runs.find((candidate) => candidate.id === runId);
    if (!run) {
      throw new AppError(`Unknown run: ${runId}`, 404, "run_not_found");
    }

    const [hydratedRun] = await this.hydrateRuns([run]);
    return hydratedRun;
  }

  private async hydrateRuns(
    runs: JobRun[]
  ): Promise<HydratedRun[]> {
    const runIds = runs.map((run) => run.id);

    const nodeExecutions = await this.nodeExecutionRepository.listByRunIds(runIds);
    const nodeFeedback = await this.nodeFeedbackRepository.listByExecutionIds(
      nodeExecutions.map((execution) => execution.id)
    );
    const toolInvocations = await this.toolInvocationRepository.listByExecutionIds(
      nodeExecutions.map((execution) => execution.id)
    );

    const nodeExecutionsByRunId = groupBy(nodeExecutions, (execution) => execution.jobRunId);
    const runIdByExecutionId = new Map(nodeExecutions.map((execution) => [execution.id, execution.jobRunId] as const));
    const nodeFeedbackByRunId = groupBy(nodeFeedback, (feedback) => runIdByExecutionId.get(feedback.nodeExecutionId) ?? "");
    const toolInvocationsByRunId = groupBy(
      toolInvocations,
      (invocation) => runIdByExecutionId.get(invocation.nodeExecutionId) ?? ""
    );

    return runs.map((run) => ({
      ...run,
      toolInvocations: toolInvocationsByRunId.get(run.id) ?? [],
      nodeExecutions: nodeExecutionsByRunId.get(run.id) ?? [],
      nodeFeedback: nodeFeedbackByRunId.get(run.id) ?? []
    }));
  }

  async enqueueRun(jobId: string): Promise<JobRun> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new AppError(`Unknown job: ${jobId}`, 404, "job_not_found");
    }

    const run: JobRun = {
      id: createId("run"),
      jobId: job.id,
      status: "queued",
      triggerSource: "manual",
      startedAt: new Date().toISOString()
    };

    return this.jobRunRepository.create(run);
  }

  async executeRun(jobId: string): Promise<JobRun> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new AppError(`Unknown job: ${jobId}`, 404, "job_not_found");
    }

    const agentDefinition = this.agentCatalogService.getByDagId(job.dagId) ??
      (job.agentDefinitionKey ? this.agentCatalogService.getByKey(job.agentDefinitionKey) : null);
    if (!agentDefinition) {
      throw new AppError(`Unknown workflow definition for dag: ${job.dagId}`, 404, "agent_not_found");
    }

    const now = new Date().toISOString();
    const run: JobRun = {
      id: createId("run"),
      jobId: job.id,
      status: "queued",
      triggerSource: "manual",
      startedAt: now
    };
    await this.jobRunRepository.create(run);

    const context: ExecutionContext = {
      registry: createDefaultToolRegistry(),
      jobInput: job.inputs,
      nodeOutputs: {},
      now: () => new Date().toISOString(),
      logger: { info: () => undefined },
      llmBudget: createLlmBudget()
    };
    const result = await executeDagCompat(
      agentDefinition.dag,
      job.inputs,
      createDefaultToolRegistry(),
      context
    );
    const nodeExecutions: NodeExecution[] =
      "nodeExecutions" in result && Array.isArray(result.nodeExecutions) ? result.nodeExecutions : [];
    const nodeFeedback: NodeFeedback[] =
      "nodeFeedback" in result && Array.isArray(result.nodeFeedback) ? result.nodeFeedback : [];
    const toolInvocations: ToolInvocation[] =
      "toolInvocations" in result && Array.isArray(result.toolInvocations) ? result.toolInvocations : [];

    const completedAt = new Date().toISOString();
    await this.toolInvocationRepository.createMany(toolInvocations);
    await this.nodeExecutionRepository.createMany(
      nodeExecutions.map((execution: NodeExecution) => ({
        ...execution,
        jobRunId: run.id
      }))
    );
    await this.nodeFeedbackRepository.createMany(nodeFeedback);
    await this.jobMemoryRepository.upsert({
      id: createId("memory"),
      jobId: job.id,
      key: "latest-output",
      value: asJsonValue(result.finalOutput),
      updatedAt: completedAt
    });

    const completedRun: JobRun = {
      ...run,
      status: "succeeded",
      completedAt,
      output:
        result.finalOutput && typeof result.finalOutput === "object" && "data" in (result.finalOutput as Record<string, unknown>)
          ? result.finalOutput as JobRun["output"]
          : { data: result.finalOutput, artifacts: [] }
    };

    await this.jobRunRepository.update(completedRun);
    return completedRun;
  }
}

function groupBy<T>(items: T[], keySelector: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    if (!key) {
      continue;
    }

    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return grouped;
}
