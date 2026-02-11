type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return "info";
}

const minimumLevel = resolveLogLevel();

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (levelOrder[level] < levelOrder[minimumLevel]) {
    return;
  }

  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context) {
    payload.context = Object.fromEntries(
      Object.entries(context).map(([key, value]) => [key, serializeError(value)])
    );
  }

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    write("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    write("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    write("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    write("error", message, context);
  },
};
