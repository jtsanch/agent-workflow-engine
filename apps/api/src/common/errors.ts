export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "app_error",
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, "internal_error");
  }

  return new AppError("Unknown error", 500, "internal_error");
}

