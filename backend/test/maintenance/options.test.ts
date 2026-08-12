import assert from "node:assert/strict";
import test from "node:test";

import { parseMaintenanceArguments } from "../../src/maintenance/options.js";

test("maintenance CLI defaults to bounded dry-run and requires explicit apply", () => {
  assert.deepEqual(parseMaintenanceArguments([]), {
    apply: false,
    limit: 100,
    pendingAgeMilliseconds: 24 * 60 * 60 * 1_000,
    purgingAgeMilliseconds: 15 * 60 * 1_000,
  });
  assert.deepEqual(parseMaintenanceArguments([
    "--apply",
    "--limit=25",
    "--pending-age-hours=48",
    "--purging-age-minutes=30",
  ]), {
    apply: true,
    limit: 25,
    pendingAgeMilliseconds: 48 * 60 * 60 * 1_000,
    purgingAgeMilliseconds: 30 * 60 * 1_000,
  });
  assert.throws(() => parseMaintenanceArguments(["--owner-id=someone"]), /invalid/);
  assert.throws(() => parseMaintenanceArguments(["--apply=true"]), /invalid/);
});
