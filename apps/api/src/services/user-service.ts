import type { UserRecord } from "../db/database.js";
import { AppError } from "../common/errors.js";
import type { UserRepository } from "../repositories/interfaces.js";

export interface ResolveLocalUserInput {
  clerkUserId: string;
}

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getRequiredById(userId: string): Promise<UserRecord> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError("Authenticated user not found", 500, "authenticated_user_not_found");
    }

    return user;
  }

  async resolveLocalUser(
    input: ResolveLocalUserInput,
    bootstrapUser: () => Promise<UserRecord>
  ): Promise<UserRecord> {
    const existingUser = await this.userRepository.findByClerkUserId(input.clerkUserId);
    if (existingUser) {
      return existingUser;
    }

    return bootstrapUser();
  }
}
