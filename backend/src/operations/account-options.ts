export type AccountProvisionOptions = {
  loginName: string;
  passwordSource: { type: "environment"; name: string } | { type: "stdin" };
};

export function parseAccountProvisionArguments(arguments_: readonly string[]): AccountProvisionOptions {
  const [loginArgument, passwordArgument, ...extra] = arguments_;

  if (
    extra.length > 0 ||
    !loginArgument?.startsWith("--login=") ||
    loginArgument.length === "--login=".length
  ) {
    throw new Error("usage: account:provision --login=<name> (--password-stdin | --password-env=<variable>)");
  }

  if (passwordArgument === "--password-stdin") {
    return {
      loginName: loginArgument.slice("--login=".length),
      passwordSource: { type: "stdin" },
    };
  }

  if (!passwordArgument?.startsWith("--password-env=") || passwordArgument.length === "--password-env=".length) {
    throw new Error("usage: account:provision --login=<name> (--password-stdin | --password-env=<variable>)");
  }

  const passwordEnvironmentVariable = passwordArgument.slice("--password-env=".length);

  if (!/^ACADEMICCLOUD_[A-Z0-9_]{0,96}PASSWORD[A-Z0-9_]{0,31}$/.test(passwordEnvironmentVariable)) {
    throw new Error("password environment variable name is invalid");
  }

  return {
    loginName: loginArgument.slice("--login=".length),
    passwordSource: { type: "environment", name: passwordEnvironmentVariable },
  };
}
