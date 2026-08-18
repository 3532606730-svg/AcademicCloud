const maximumStreamBytes = 8 * 1024;

const safeDiagnosticLine = /(?:^\s*(?:AggregateError|Error|RangeError|ReferenceError|SyntaxError|TypeError|Warning|Caused by:|Require stack:|at\s|node:)|ERR_[A-Z_]+|MODULE_NOT_FOUND|ERR_DLOPEN_FAILED|Cannot find|cannot open shared object|native binding|\.node\b|pdfjs-dist|@napi-rs[\\/]canvas|node_modules[\\/])/iu;

export interface StartupProcessState {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

export interface BoundedStartupDiagnostics {
  append(stream: "stdout" | "stderr", chunk: Buffer | string): void;
  format(reason: string): string;
}

export function createBoundedStartupDiagnostics(
  environment: NodeJS.ProcessEnv,
  maximumBytes = maximumStreamBytes,
): BoundedStartupDiagnostics {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 256 || maximumBytes > maximumStreamBytes) {
    throw new Error("startup diagnostic byte limit is invalid");
  }

  const environmentValues = [...new Set(Object.values(environment)
    .filter((value): value is string => typeof value === "string" && value.length >= 4))]
    .sort((left, right) => right.length - left.length);
  const streams: { stdout: Buffer; stderr: Buffer } = {
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
  };

  return {
    append(stream, chunk) {
      streams[stream] = appendBounded(streams[stream], chunk, maximumBytes);
    },
    format(reason) {
      const sections = (["stderr", "stdout"] as const)
        .map((stream) => {
          const content = sanitizeDiagnosticText(streams[stream].toString("utf8"), environmentValues);
          return content ? `${stream}:\n${content}` : null;
        })
        .filter((section): section is string => section !== null);
      return [reason, ...sections].join("\n");
    },
  };
}

export function describeStartupExit(processState: StartupProcessState): string | null {
  if (processState.exitCode !== null) return `compiled API exited with code ${processState.exitCode}`;
  if (processState.signalCode !== null) return `compiled API exited after signal ${processState.signalCode}`;
  return null;
}

function appendBounded(existing: Buffer, chunk: Buffer | string, maximumBytes: number): Buffer {
  const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
  if (incoming.length >= maximumBytes) {
    return Buffer.from(incoming.subarray(incoming.length - maximumBytes));
  }

  const combined = Buffer.concat([existing, incoming]);
  if (combined.length <= maximumBytes) return combined;
  return Buffer.from(combined.subarray(combined.length - maximumBytes));
}

function sanitizeDiagnosticText(value: string, environmentValues: string[]): string {
  let sanitized = value
    .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "")
    .replaceAll(/[^\t\n\r\x20-\x7E\u0080-\u{10FFFF}]/gu, "");

  sanitized = sanitized
    .replaceAll(/https?:\/\/[^\s"'<>]+/giu, "[REDACTED_URL]")
    .replaceAll(/((?:password|secret|token|authorization|cookie|credential|access[_-]?key(?:[_-]?(?:id|secret))?|signature)\s*[:=]\s*)[^\s,;]+/giu, "$1[REDACTED]")
    .replaceAll(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, "[REDACTED_AUTH]");

  for (const environmentValue of environmentValues) {
    sanitized = sanitized.replaceAll(environmentValue, "[REDACTED_ENV]");
  }

  return sanitized
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => safeDiagnosticLine.test(line))
    .join("\n")
    .slice(-maximumStreamBytes);
}
