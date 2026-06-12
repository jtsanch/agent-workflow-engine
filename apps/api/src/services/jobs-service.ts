import type {
  AlertPreference,
  CreateJobInput,
  Job,
  JobSchedule,
  UserContext
} from "@personal-agent-os/shared";
import type {
  AlertPreferenceRepository,
  JobRepository,
  JobScheduleRepository
} from "../repositories/interfaces.js";
import { createId } from "../common/ids.js";
import { AppError } from "../common/errors.js";
import { AgentCatalogService } from "./agent-catalog.js";
import { asJsonObject } from "../repositories/sql-helpers.js";

export class JobsService {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly jobScheduleRepository: JobScheduleRepository,
    private readonly alertPreferenceRepository: AlertPreferenceRepository,
    private readonly agentCatalogService: AgentCatalogService
  ) {}

  async listJobs(userContext: UserContext): Promise<Array<Job & { schedule: JobSchedule | null; alertPreferences: AlertPreference[] }>> {
    const jobs = await this.jobRepository.listByUser(userContext.userId);

    return Promise.all(
      jobs.map(async (job) => ({
        ...job,
        schedule: await this.jobScheduleRepository.findByJobId(job.id),
        alertPreferences: await this.alertPreferenceRepository.listByJobId(job.id)
      }))
    );
  }

  async createJob(input: CreateJobInput, userContext: UserContext): Promise<Job> {
    const agentDefinition = this.agentCatalogService.getByKey(input.agentDefinitionKey);
    if (!agentDefinition) {
      throw new AppError(`Unknown agent definition: ${input.agentDefinitionKey}`, 404, "agent_not_found");
    }

    const now = new Date().toISOString();
    const job: Job = {
      id: createId("job"),
      userId: userContext.userId,
      name: input.name,
      dagId: input.dagId ?? agentDefinition.dag.id,
      agentDefinitionKey: input.agentDefinitionKey,
      status: "active",
      inputs: asJsonObject(input.inputs),
      createdAt: now,
      updatedAt: now
    };

    const schedule: JobSchedule = {
      id: createId("schedule"),
      jobId: job.id,
      scheduleExpression: input.scheduleExpression,
      timezone: input.timezone,
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    const alertPreferences: AlertPreference[] = input.alertPreferences.map((preference): AlertPreference => ({
        id: createId("alert"),
        jobId: job.id,
        channel: preference.channel,
        destination: preference.destination,
        onSuccess: preference.onSuccess,
        onFailure: preference.onFailure
      }));

    await this.jobRepository.createWithRelations(job, schedule, alertPreferences);

    return job;
  }
}
