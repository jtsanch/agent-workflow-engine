export interface ReadinessStatus {
  ok: boolean;
}

export class HealthService {
  getReadiness(): ReadinessStatus {
    return { ok: true };
  }
}
