import type { PostgresDatabase } from "../db/database.js";

export class BaseRepository {
  constructor(protected readonly database: PostgresDatabase) {}

  protected get db() {
    return this.database.db;
  }

  protected get pool() {
    return this.database.pool;
  }

  protected async exec<T>(operation: string, run: () => Promise<T>): Promise<T> {
    void operation;
    return run();
  }
}
