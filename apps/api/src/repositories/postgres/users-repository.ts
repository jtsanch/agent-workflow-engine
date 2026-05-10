import { desc, eq } from "drizzle-orm";
import type { PostgresDatabase, UserRecord } from "../../db/database.js";
import { usersTable } from "../../db/schema/index.js";
import { BaseRepository } from "../base-repository.js";
import type { UserRepository } from "../interfaces.js";

function mapUser(row: typeof usersTable.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    clerkUserId: row.clerkUserId,
    status: row.status as UserRecord["status"],
    role: row.role as UserRecord["role"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString()
  };
}

export class PostgresUserRepository extends BaseRepository implements UserRepository {
  constructor(db: PostgresDatabase) {
    super(db);
  }

  async create(user: UserRecord): Promise<UserRecord> {
    return this.exec("users.create", async () => {
      await this.db.insert(usersTable).values({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        clerkUserId: user.clerkUserId,
        status: user.status,
        role: user.role,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null
      });

      return user;
    });
  }

  async findById(userId: string): Promise<UserRecord | null> {
    return this.exec("users.find_by_id", async () => {
      const [row] = await this.db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return row ? mapUser(row) : null;
    });
  }

  async findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
    return this.exec("users.find_by_clerk_user_id", async () => {
      const [row] = await this.db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId)).limit(1);
      return row ? mapUser(row) : null;
    });
  }

  async listAll(): Promise<UserRecord[]> {
    return this.exec("users.list_all", async () => {
      const rows = await this.db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
      return rows.map(mapUser);
    });
  }

  async updateStatus(userId: string, status: UserRecord["status"]): Promise<void> {
    await this.exec("users.update_status", async () => {
      await this.db.update(usersTable).set({ status }).where(eq(usersTable.id, userId));
    });
  }
}
