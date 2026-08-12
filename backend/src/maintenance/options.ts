import type { ReliabilityMaintenanceOptions } from "./reliability-maintenance.js";

export interface MaintenanceCliOptions extends Required<ReliabilityMaintenanceOptions> {}

export function parseMaintenanceArguments(arguments_: readonly string[]): MaintenanceCliOptions {
  const options: MaintenanceCliOptions = {
    apply: false,
    limit: 100,
    pendingAgeMilliseconds: 24 * 60 * 60 * 1_000,
    purgingAgeMilliseconds: 15 * 60 * 1_000,
  };

  for (const argument of arguments_) {
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }

    const [name, rawValue, extra] = argument.split("=");

    if (extra !== undefined || rawValue === undefined || !/^\d+$/.test(rawValue)) {
      throw new Error("invalid maintenance argument");
    }

    const value = Number(rawValue);

    if (name === "--limit") options.limit = value;
    else if (name === "--pending-age-hours") options.pendingAgeMilliseconds = value * 60 * 60 * 1_000;
    else if (name === "--purging-age-minutes") options.purgingAgeMilliseconds = value * 60 * 1_000;
    else throw new Error("invalid maintenance argument");
  }

  return options;
}
