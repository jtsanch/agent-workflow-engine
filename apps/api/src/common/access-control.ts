import { AppError } from "./errors.js";
import type { AuthContext } from "./types.js";

export function requireAdminRole(authContext: AuthContext): AuthContext {
  if (authContext.role !== "admin") {
    throw new AppError("Forbidden", 403, "forbidden");
  }

  return authContext;
}
