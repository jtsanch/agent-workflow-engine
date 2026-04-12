import axios, { type AxiosRequestConfig } from "axios";
import type { ExecutionContext, ToolDefinition } from "../types.js";

export interface RetryOptions {
  maxAttempts?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export abstract class BaseTool<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>
> implements ToolDefinition<TInput, TOutput>
{
  abstract readonly name: string;
  abstract readonly description: string;

  async run(input: TInput, context: ExecutionContext): Promise<TOutput> {
    context.logger.info("Running tool", { toolName: this.name });
    return this.execute(input, context);
  }

  protected abstract execute(input: TInput, context: ExecutionContext): Promise<TOutput>;

  protected async stub(output: TOutput): Promise<TOutput> {
    return output;
  }

  protected async request<TResponse>(config: AxiosRequestConfig, options: RetryOptions = {}): Promise<TResponse> {
    const response = await this.withRetries(() => axios.request<TResponse>(config), options);
    return response.data;
  }

  protected async withRetries<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 3;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const shouldRetry = options.shouldRetry ?? this.isRetryableError;
        if (attempt === maxAttempts || !shouldRetry(error)) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error(`Tool ${this.name} failed`);
  }

  protected isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    return !status || status === 408 || status === 429 || status >= 500;
  }

  protected formatAxiosError(action: string, error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error : new Error(`${action} failed`);
    }

    const status = error.response?.status;
    const detail =
      typeof error.response?.data === "string"
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {});

    return new Error(`${action} failed${status ? ` with status ${status}` : ""}: ${detail}`);
  }
}
