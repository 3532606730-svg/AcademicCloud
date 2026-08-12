const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
const APP_ENVIRONMENTS = ["development", "test", "production"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export interface AppConfig {
  host: string;
  port: number;
  logLevel: LogLevel;
  environment: AppEnvironment;
  appOrigin: string;
}

function readEnum<const T extends readonly string[]>(
  name: string,
  value: string | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  const candidate = value ?? fallback;

  if (!allowed.includes(candidate)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }

  return candidate;
}

function readPort(value: string | undefined): number {
  const candidate = value ?? "3000";

  if (!/^\d+$/.test(candidate)) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const port = Number(candidate);

  if (port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function readAppOrigin(value: string | undefined, environment: AppEnvironment): string {
  const candidate = value?.trim() || (environment === "production" ? "" : "http://127.0.0.1:5173");

  if (!candidate) {
    throw new Error("APP_ORIGIN is required in production");
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error("APP_ORIGIN must be an exact HTTP(S) origin");
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== candidate) {
    throw new Error("APP_ORIGIN must be an exact HTTP(S) origin without a path or trailing slash");
  }

  if (environment === "production" && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }

  return candidate;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = environment.HOST?.trim() || "127.0.0.1";
  const appEnvironment = readEnum("NODE_ENV", environment.NODE_ENV, APP_ENVIRONMENTS, "development");

  return {
    host,
    port: readPort(environment.PORT),
    logLevel: readEnum("LOG_LEVEL", environment.LOG_LEVEL, LOG_LEVELS, "info"),
    environment: appEnvironment,
    appOrigin: readAppOrigin(environment.APP_ORIGIN, appEnvironment),
  };
}
