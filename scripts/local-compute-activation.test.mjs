import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const source = readFileSync(new URL("./local-compute/activate-local-compute-release.sh", import.meta.url), "utf8");
const stabilityCheck = source.slice(source.indexOf("systemctl enable academiccloud-local-compute.service"));
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const bashAvailable = process.platform !== "win32" || existsSync(bash);

// Execute the actual activation/stability block with a stateful fake systemd.
// No service, filesystem selection, environment file, or wall-clock sleep is touched.
function activate(scenario) {
  return spawnSync(bash, ["--noprofile", "--norc", "-s"], {
    encoding: "utf8",
    timeout: 10_000,
    input: `set -euo pipefail
RELEASE_ROOT=/test/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
CURRENT_LINK=/test/current
ENVIRONMENT_FILE=/test/control/worker.env
UNIT_TARGET=/test/systemd/worker.service
STABILITY_SECONDS=15
scenario=${scenario}
restarts=1
phase=before
rollback_activation() { echo ROLLED_BACK; exit 4; }
systemctl() {
  case "$1" in
    enable|is-active) return 0 ;;
    restart) restarts=0; phase=started ;;
    show)
      count=$restarts
      pid=100
      if [[ "$phase" == after && "$scenario" == restart ]]; then count=1; fi
      if [[ "$phase" == after && "$scenario" == pid-change ]]; then pid=101; fi
      if [[ "$phase" == started && "$scenario" == missing-pid ]]; then pid=0; fi
      printf 'NRestarts=%s\nMainPID=%s\n' "$count" "$pid"
      printf 'ActiveState=active\nSubState=running\nResult=success\nExecMainStatus=0\nUser=academiccloud\nGroup=academiccloud\nFragmentPath=%s\n' "$UNIT_TARGET"
      ;;
    *) echo unexpected-systemctl-command >&2; return 90 ;;
  esac
}
sleep() { test "$1" = 15; phase=after; }
readlink() { printf '%s\n' "$RELEASE_ROOT"; }
stat() {
  if [[ "$scenario" == bad-permissions ]]; then printf 'academiccloud:academiccloud|644\n';
  else printf 'academiccloud:academiccloud|600\n'; fi
}
jq() { printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; }
${stabilityCheck}`,
  });
}

test("Local Compute activation accepts a healthy new invocation after NRestarts resets", { skip: !bashAvailable }, () => {
  const result = activate("healthy");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /LOCAL_COMPUTE_RELEASE_ACTIVATION=PASS/u);
  assert.match(result.stdout, /WORKER_RESTARTS=0/u);
  assert.doesNotMatch(result.stdout, /ROLLED_BACK/u);
});

for (const scenario of ["restart", "pid-change", "missing-pid", "bad-permissions"]) {
  test(`Local Compute activation rolls back on ${scenario}`, { skip: !bashAvailable }, () => {
    const result = activate(scenario);
    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stdout, /ROLLED_BACK/u);
    assert.doesNotMatch(result.stdout, /LOCAL_COMPUTE_RELEASE_ACTIVATION=PASS/u);
  });
}
