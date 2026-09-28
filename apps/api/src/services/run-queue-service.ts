import { createLogger } from "@personal-agent-os/observability";
import { PgBoss } from "pg-boss";
import { RUN_EXECUTION_QUEUE, type RunExecutionJobData } from "../run-queue.js";

const logger = createLogger("api.run-queue");

export interface RunQueuePublisher {
  enqueue(runId: string): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryRunQueuePublisher implements RunQueuePublisher {
  async enqueue(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }
}

export class PostgresRunQueuePublisher implements RunQueuePublisher {
  private bossPromise: Promise<PgBoss> | null = null;

  constructor(private readonly databaseUrl: string) {}

  async enqueue(runId: string): Promise<void> {
    const boss = await this.getBoss();
    const jobId = await boss.send(RUN_EXECUTION_QUEUE, { runId } satisfies RunExecutionJobData, {
      id: runId
    });

    if (!jobId) {
      throw new Error(`Failed to enqueue run ${runId}`);
    }
  }

  async close(): Promise<void> {
    if (!this.bossPromise) {
      return;
    }

    const bossPromise = this.bossPromise;
    this.bossPromise = null;

    const boss = await bossPromise.catch(() => null);
    if (boss) {
      await boss.stop({
        close: true,
        graceful: true,
        timeout: 5000
      });
    }
  }

  private async getBoss(): Promise<PgBoss> {
    if (!this.bossPromise) {
      this.bossPromise = this.startBoss();
    }

    return this.bossPromise;
  }

  private async startBoss(): Promise<PgBoss> {
    const boss = new PgBoss({
      connectionString: this.databaseUrl
    });

    boss.on("error", (error) => {
      logger.error("Run queue error", {
        error: error instanceof Error ? error.message : String(error)
      });
    });

    boss.on("warning", (warning) => {
      logger.warn("Run queue warning", {
        message: warning.message,
        data: warning.data
      });
    });

    try {
      await boss.start();
      await boss.createQueue(RUN_EXECUTION_QUEUE, {
        notify: true,
        retryLimit: 2,
        retryDelay: 5,
        retryBackoff: true
      });
      return boss;
    } catch (error) {
      this.bossPromise = null;
      await boss.stop({ close: true }).catch(() => undefined);
      throw error;
    }
  }
}
