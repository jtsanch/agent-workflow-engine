export interface ReadinessStatus {
  ok: boolean;
}

export class HealthService {
  async getReadiness(): Promise<ReadinessStatus> {
    return { ok: true };
  }
}
