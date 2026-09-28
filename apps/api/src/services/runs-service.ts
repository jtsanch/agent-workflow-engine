import type { JobRun, NodeExecution, NodeFeedback, ToolInvocation, UserContext } from "@personal-agent-os/shared";
import type {
  JobRepository,
  JobRunRepository,
  NodeExecutionRepository,
  NodeFeedbackRepository,
  ToolInvocationRepository
} from "../repositories/interfaces.js";
import { createId } from "../common/ids.js";
import { AppError } from "../common/errors.js";
import type { RunQueuePublisher } from "./run-queue-service.js";

export type HydratedRun = JobRun & {
  toolInvocations: ToolInvocation[];
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
};

type LeaseAwareJobRun = JobRun & {
  queuedAt?: string;
};

export class RunsService {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly jobRunRepository: JobRunRepository,
    private readonly toolInvocationRepository: ToolInvocationRepository,
    private readonly nodeExecutionRepository: NodeExecutionRepository,
    private readonly nodeFeedbackRepository: NodeFeedbackRepository,
    private readonly runQueuePublisher: RunQueuePublisher
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

  async enqueueRun(userContext: UserContext, jobId: string): Promise<JobRun> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new AppError(`Unknown job: ${jobId}`, 404, "job_not_found");
    }
    if (job.userId !== userContext.userId) {
      throw new AppError(`Unknown job: ${jobId}`, 404, "job_not_found");
    }

    const run: LeaseAwareJobRun = {
      id: createId("run"),
      jobId: job.id,
      status: "queued",
      triggerSource: "manual",
      queuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString()
    };

    const queuedRun = await this.jobRunRepository.create(run);

    try {
      await this.runQueuePublisher.enqueue(queuedRun.id);
      return queuedRun;
    } catch (error) {
      await this.jobRunRepository.update({
        ...queuedRun,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: "Failed to enqueue run for background execution"
      });

      throw new AppError(
        `Failed to enqueue run ${queuedRun.id}: ${error instanceof Error ? error.message : String(error)}`,
        500,
        "run_enqueue_failed"
      );
    }
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
