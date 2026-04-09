export type LogContext = Record<string, unknown>;

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface Metrics {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
}

export function createLogger(service: string): Logger {
  return {
    info(message, context) {
      console.log(JSON.stringify({ level: "info", service, message, context }));
    },
    warn(message, context) {
      console.warn(JSON.stringify({ level: "warn", service, message, context }));
    },
    error(message, context) {
      console.error(JSON.stringify({ level: "error", service, message, context }));
    }
  };
}

export function createMetrics(): Metrics {
  return {
    increment(metric, value = 1, tags) {
      console.log(JSON.stringify({ type: "metric", metric, value, tags }));
    },
    gauge(metric, value, tags) {
      console.log(JSON.stringify({ type: "metric", metric, value, tags }));
    }
  };
}

