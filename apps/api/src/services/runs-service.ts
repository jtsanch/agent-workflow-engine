import { ToolRegistry, createLlmBudget, executeAgent } from "@personal-agent-os/agent-sdk";
import type { JobRun, JobRunStep, NodeExecution, NodeFeedback, ToolInvocation, UserContext } from "@personal-agent-os/shared";
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

  async listRuns(userContext: UserContext): Promise<Array<JobRun & { steps: JobRunStep[]; nodeExecutions: NodeExecution[]; nodeFeedback: NodeFeedback[] }>> {
    const runs = await this.jobRunRepository.listByUser(userContext.userId);

    return Promise.all(
      runs.map(async (run) => ({
        ...run,
        steps: await this.jobRunStepRepository.listByRunId(run.id),
        nodeExecutions: await this.nodeExecutionRepository.listByRunId(run.id),
        nodeFeedback: await this.nodeFeedbackRepository.listByRunId(run.id)
      }))
    );
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

  async simulateRun(jobId: string): Promise<JobRun> {
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
      status: "running",
      triggerSource: "manual",
      startedAt: now
    };
    await this.jobRunRepository.create(run);

    const context = {
      now: () => new Date().toISOString(),
      logger: { info: () => undefined },
      llmBudget: createLlmBudget()
    };
    const registry = createDefaultToolRegistry() as ToolRegistry;
    const result =
      job.dagId && agentDefinition.dag
        ? await executeDagCompat(agentDefinition.dag, job.inputs, registry, context)
        : await executeAgent(agentDefinition, job, context, registry);
    const nodeExecutions: NodeExecution[] =
      "nodeExecutions" in result && Array.isArray(result.nodeExecutions) ? result.nodeExecutions : [];
    const nodeFeedback: NodeFeedback[] =
      "nodeFeedback" in result && Array.isArray(result.nodeFeedback) ? result.nodeFeedback : [];

    const completedAt = new Date().toISOString();
    const steps: JobRunStep[] = result.steps.map((step) => ({
      id: createId("step"),
      jobRunId: run.id,
      name: step.name,
      status: "succeeded",
      startedAt: now,
      completedAt,
      detail: step.detail
    }));

    const invocations: ToolInvocation[] = steps.map((step) => ({
      id: createId("tool"),
      jobRunStepId: step.id,
      toolName: step.name,
      request: { generatedBy: "simulateRun" },
      response: step.detail,
      status: "succeeded",
      createdAt: now
    }));

    await this.jobRunStepRepository.createMany(steps);
    await this.toolInvocationRepository.createMany(invocations);
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
      value: result.output,
      updatedAt: completedAt
    });

    const completedRun: JobRun = {
      ...run,
      status: "succeeded",
      completedAt,
      output: result.output
    };

    await this.jobRunRepository.update(completedRun);
    return completedRun;
  }
}
