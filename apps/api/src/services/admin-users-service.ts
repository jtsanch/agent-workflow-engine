import { AppError } from "../common/errors.js";
import type { UserRecord } from "../db/database.js";
import type { UserRepository } from "../repositories/interfaces.js";
import type { UserUsageReader } from "./user-usage-service.js";

type UserDto = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: "active" | "disabled";
  role: "admin" | "user";
};

type UsageSummaryDto = {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  perRunLimit: number;
};

export class AdminUsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userUsageService: UserUsageReader
  ) {}

  async listUsers(cursor?: string, limit?: number): Promise<{
    users: Array<UserDto & { usage: UsageSummaryDto }>;
    nextCursor?: string;
  }> {
    const users = await this.userRepository.listAll();
    const startIndex = cursor ? users.findIndex((user) => user.id === cursor) + 1 : 0;
    const pageSize = limit ?? users.length;
    const pageUsers = users.slice(startIndex, startIndex + pageSize);
    const nextCursor = startIndex + pageSize < users.length ? pageUsers[pageUsers.length - 1]?.id : undefined;

    return {
      users: await Promise.all(
        pageUsers.map(async (user) => ({
          ...this.toUserDto(user),
          usage: await this.userUsageService.getSummary(user.id)
        }))
      ),
      nextCursor
    };
  }

  async disableUser(userId: string): Promise<void> {
    await this.updateUserStatus(userId, "disabled");
  }

  async enableUser(userId: string): Promise<void> {
    await this.updateUserStatus(userId, "active");
  }

  private async updateUserStatus(userId: string, status: UserRecord["status"]): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError(`Unknown user: ${userId}`, 404, "user_not_found");
    }

    await this.userRepository.updateStatus(userId, status);
  }

  private toUserDto(user: UserRecord): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      role: user.role
    };
  }
}
