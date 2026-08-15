// Bounded, non-shell command execution.
// Local commands use child_process.execFile (argument arrays, no shell).
// Remote SSH commands are FIXED static argument lists (never built from user
// input); the user-supplied value is only the SSH alias, validated strictly.

import { execFile } from "node:child_process";

export const SSH_CONNECT_TIMEOUT_SECONDS = 10;
export const REMOTE_COMMAND_TIMEOUT_MS = 25_000;
export const LOCAL_COMMAND_TIMEOUT_MS = 15_000;
export const MAX_STDOUT_BYTES = 16 * 1024;
export const MAX_STDERR_BYTES = 8 * 1024;

export const SSH_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateSshAlias(alias) {
  if (typeof alias !== "string" || alias.length === 0 || alias.length > 253) {
    return false;
  }
  return !SSH_ALIAS_PATTERN.test(alias) ? false : true;
}

function runExecFile(executable, args, { timeoutMs, maxStdoutBytes = MAX_STDOUT_BYTES, maxStderrBytes = MAX_STDERR_BYTES }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, durationMs: Date.now() - started });
    };

    const child = execFile(
      executable,
      args,
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes) + 64 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error && (error.killed || error.code === "ETIMEDOUT" || String(error.signal) === "SIGTERM")) {
          finish({ ok: false, kind: "TIMEOUT", stdout: "", stderr: "", exitCode: null, limited: false });
          return;
        }
        const exitCode = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
        const stdoutExceeded = stdout.length > maxStdoutBytes;
        const stderrExceeded = stderr.length > maxStderrBytes;
        const limited = stdoutExceeded || stderrExceeded;
        finish({
          // Never pass truncated evidence as success: capped output is an
          // explicit OUTPUT_LIMIT_EXCEEDED result, not OK.
          ok: !error && !limited,
          kind: limited ? "OUTPUT_LIMIT_EXCEEDED" : error ? "COMMAND_FAILED" : "OK",
          stdout: stdout.slice(0, maxStdoutBytes),
          stderr: stderr.slice(0, maxStderrBytes),
          exitCode,
          limited,
        });
      },
    );
    child.on("error", (error) => {
      finish({ ok: false, kind: "COMMAND_FAILED", stdout: "", stderr: "", exitCode: null, limited: false });
      void error;
    });
  });
}

export function runLocalCommand(executable, args, options = {}) {
  return runExecFile(executable, args, { ...options, timeoutMs: options.timeoutMs ?? LOCAL_COMMAND_TIMEOUT_MS });
}

// POSIX single-quote wrapping for FIXED remote arguments. The remote side is
// executed by the user's login shell (OpenSSH behavior), so every argument is
// quoted to keep shell metacharacters literal. This applies only to the
// static allowlisted check arguments — never to user input.
export function shQuote(argument) {
  return `'${String(argument).replace(/'/g, `'\\''`)}'`;
}

// Returns ONLY the ssh option + remote-command arguments (NO executable).
// The executable "ssh" is supplied exactly once by runRemoteCheck.
export function buildSshArgs(alias, remoteArgs) {
  return [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`,
    "--",
    alias,
    ...remoteArgs.map(shQuote),
  ];
}

export function runRemoteCheck(alias, remoteArgs, options = {}) {
  if (!validateSshAlias(alias)) {
    return Promise.resolve({ ok: false, kind: "SAFETY_VIOLATION", stdout: "", stderr: "", exitCode: null, durationMs: 0, limited: false });
  }
  return runExecFile("ssh", buildSshArgs(alias, remoteArgs), {
    ...options,
    timeoutMs: options.timeoutMs ?? REMOTE_COMMAND_TIMEOUT_MS,
  });
}
