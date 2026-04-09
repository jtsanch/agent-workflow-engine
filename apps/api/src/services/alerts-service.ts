import type { AlertPreference, UserContext } from "@personal-agent-os/shared";
import type { AlertPreferenceRepository, JobRepository } from "../repositories/interfaces.js";

export class AlertsService {
  constructor(
    private readonly jobRepository: JobRepository,
    private readonly alertPreferenceRepository: AlertPreferenceRepository
  ) {}

  async listAlerts(userContext: UserContext): Promise<AlertPreference[]> {
    const jobs = await this.jobRepository.listByUser(userContext.userId);
    const preferenceGroups = await Promise.all(jobs.map((job) => this.alertPreferenceRepository.listByJobId(job.id)));
    return preferenceGroups.flat();
  }
}

