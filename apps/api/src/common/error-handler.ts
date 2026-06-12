import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, toAppError } from "./errors.js";

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler(async (_request: FastifyRequest, reply: FastifyReply) => {
    await reply.status(404).send({
      error: "Not Found"
    });
  });

  app.setErrorHandler(async (error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      await reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          issues: error.flatten()
        }
      });
      return;
    }

    const appError = toAppError(error);

    if (appError.statusCode >= 500) {
      if (error instanceof Error) {
        console.error(error.stack ?? error.message);
      } else {
        console.error("Unhandled API error", error);
      }
    }

    await reply.status(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details
      }
    });
  });
}
