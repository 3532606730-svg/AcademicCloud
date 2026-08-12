export type BackupCommand =
  | { operation: "create"; path: string }
  | { operation: "verify"; path: string };

export function parseBackupArguments(arguments_: readonly string[]): BackupCommand {
  const [operation, pathArgument, ...extra] = arguments_;

  if (extra.length > 0 || (operation !== "create" && operation !== "verify")) {
    throw new Error("usage: backup create --output=<path> | backup verify --input=<path>");
  }

  const prefix = operation === "create" ? "--output=" : "--input=";

  if (!pathArgument?.startsWith(prefix) || pathArgument.length === prefix.length) {
    throw new Error("usage: backup create --output=<path> | backup verify --input=<path>");
  }

  return { operation, path: pathArgument.slice(prefix.length) };
}
