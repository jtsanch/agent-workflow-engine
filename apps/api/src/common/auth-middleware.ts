import { createClerkClient, verifyToken } from "@clerk/backend";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";
import type { AuthContext, ClerkRequestAuth } from "./types.js";
import type { AuthContextAuthenticator } from "../services/auth-context-service.js";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
    clerkAuth?: ClerkRequestAuth;
  }
}

export function registerAuthMiddleware(app: FastifyInstance, authContextService: AuthContextAuthenticator | null, secretKey: string): void {
  const clerkClient = createClerkClient({
    secretKey
  });

  app.decorateRequest("authContext", undefined);
  app.decorateRequest("clerkAuth", undefined);

  app.addHook("onRequest", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new AppError("Missing authorization", 401, "unauthorized");
    }

    const token = extractBearerToken(authorization);
    if (!token) {
      throw new AppError("Invalid authorization header", 401, "unauthorized");
    }

    if (!secretKey) {
      throw new AppError("Invalid auth configuration", 500, "internal_error");
    }

    let payload;
    try {
      payload = await verifyToken(token, {
        secretKey
      });
    } catch {
      throw new AppError("Invalid token", 401, "unauthorized");
    }

    const clerkUserId = typeof payload.sub === "string" ? payload.sub : null;
    if (!clerkUserId) {
      throw new AppError("Invalid token", 401, "unauthorized");
    }

    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(clerkUserId);
    } catch {
      throw new AppError("Invalid token", 401, "unauthorized");
    }

    const primaryEmail =
      clerkUser.emailAddresses.find((emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId) ??
      clerkUser.emailAddresses[0];

    if (!primaryEmail?.emailAddress) {
      throw new AppError("Invalid token", 401, "unauthorized");
    }

    request.clerkAuth = {
      clerkUserId,
      email: primaryEmail.emailAddress,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName
    };

    if (!authContextService) {
      throw new AppError("Invalid auth configuration", 401, "unauthorized");
    }

    request.authContext = await authContextService.authenticate(request.clerkAuth, new Date().toISOString());
  });
}

export function requireAuthContext(authContext: AuthContext | undefined): AuthContext {
  if (!authContext) {
    throw new AppError("Invalid auth context", 401, "unauthorized");
  }

  return authContext;
}

function extractBearerToken(authorization: string): string | null {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
