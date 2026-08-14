#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <stage-directory> <artifact-base> <zip-sha256> <source-commit>" >&2
  exit 64
fi

stage_directory="$1"
artifact_base="$2"
expected_zip_sha256="$3"
expected_source_commit="$4"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "runtime acceptance orchestration must run as root" >&2
  exit 65
fi

if [[ ! "$artifact_base" =~ ^academiccloud-linux-x64-node24-[0-9a-f]{40}$ ]]; then
  echo "invalid artifact base" >&2
  exit 65
fi

if [[ ! "$expected_zip_sha256" =~ ^[0-9a-f]{64}$ ]] ||
   [[ ! "$expected_source_commit" =~ ^[0-9a-f]{40}$ ]] ||
   [[ "$artifact_base" != "academiccloud-linux-x64-node24-$expected_source_commit" ]]; then
  echo "invalid or inconsistent artifact identity" >&2
  exit 65
fi

resolved_stage="$(readlink -f -- "$stage_directory")"
if [[ "$resolved_stage" != "$stage_directory" ]] ||
   [[ ! "$resolved_stage" =~ ^/var/tmp/academiccloud-prod02h-[A-Za-z0-9._-]+$ ]] ||
   [[ ! -d "$resolved_stage" ]] || [[ -L "$resolved_stage" ]] ||
   [[ "$(stat -c '%U:%G' -- "$resolved_stage")" != "root:root" ]]; then
  echo "unsafe staging directory" >&2
  exit 65
fi

artifact_zip="$resolved_stage/artifact.zip"
output_directory="$resolved_stage/output"
scripts_directory="$resolved_stage/scripts"
temporary_directory="$resolved_stage/tmp"
samples_path="$resolved_stage/memory-samples.tsv"
pre_snapshot="$resolved_stage/pre-state.txt"
post_snapshot="$resolved_stage/post-state.txt"
kernel_oom_path="$resolved_stage/kernel-oom.txt"
report_path="$resolved_stage/host-runtime-report.json"
unit_name="academiccloud-prod02h-${expected_source_commit:0:12}.service"
unit_cgroup="/sys/fs/cgroup/system.slice/$unit_name"
evidence_directory="$output_directory/host-evidence"

if [[ "$(uname -s)" != "Linux" ]] || [[ "$(uname -m)" != "x86_64" ]]; then
  echo "host platform must be Linux x86_64" >&2
  exit 65
fi

# shellcheck disable=SC1091
. /etc/os-release
if [[ "$ID" != "ubuntu" ]] || [[ "$VERSION_ID" != "24.04" ]]; then
  echo "host operating system must be Ubuntu 24.04" >&2
  exit 65
fi

host_node_version="$(node --version)"
host_npm_version="$(npm --version)"
if [[ ! "$host_node_version" =~ ^v24\. ]]; then
  echo "host runtime must be Node.js 24.x" >&2
  exit 65
fi

if [[ "$(id -u nobody)" != "65534" ]] || [[ "$(getent group nogroup | cut -d: -f3)" != "65534" ]]; then
  echo "expected nobody:nogroup runtime identity is unavailable" >&2
  exit 65
fi

if [[ ! -f "$artifact_zip" ]] || [[ -L "$artifact_zip" ]]; then
  echo "artifact ZIP is missing or unsafe" >&2
  exit 66
fi

actual_zip_sha256="$(sha256sum -- "$artifact_zip" | awk '{print $1}')"
if [[ "$actual_zip_sha256" != "$expected_zip_sha256" ]]; then
  echo "artifact ZIP SHA-256 mismatch" >&2
  exit 66
fi

mkdir -m 0700 -- "$output_directory" "$scripts_directory" "$temporary_directory"

STAGE_DIRECTORY="$resolved_stage" ARTIFACT_BASE="$artifact_base" python3 - <<'PY'
import os
import pathlib
import shutil
import stat
import zipfile

stage = pathlib.Path(os.environ["STAGE_DIRECTORY"])
artifact_base = os.environ["ARTIFACT_BASE"]
archive = stage / "artifact.zip"
output = stage / "output"
expected = {
    f"{artifact_base}.tar.gz",
    f"{artifact_base}.tar.gz.sha256",
    f"{artifact_base}.manifest.json",
    f"{artifact_base}.runtime-verification.json",
}

with zipfile.ZipFile(archive) as bundle:
    infos = bundle.infolist()
    names = {info.filename for info in infos}
    if names != expected or len(infos) != len(expected):
        raise SystemExit("artifact ZIP does not contain the exact four-file bundle")
    for info in infos:
        path = pathlib.PurePosixPath(info.filename)
        mode = info.external_attr >> 16
        if (
            info.is_dir()
            or path.is_absolute()
            or ".." in path.parts
            or len(path.parts) != 1
            or stat.S_ISLNK(mode)
        ):
            raise SystemExit(f"unsafe artifact ZIP entry: {info.filename}")
        destination = output / info.filename
        with bundle.open(info, "r") as source, destination.open("xb") as target:
            shutil.copyfileobj(source, target)
PY

archive_path="$output_directory/$artifact_base.tar.gz"
checksum_path="$output_directory/$artifact_base.tar.gz.sha256"
manifest_path="$output_directory/$artifact_base.manifest.json"
github_evidence_path="$output_directory/$artifact_base.runtime-verification.json"

(
  cd -- "$output_directory"
  sha256sum --check --strict -- "$artifact_base.tar.gz.sha256"
)

MANIFEST_PATH="$manifest_path" EVIDENCE_PATH="$github_evidence_path" \
EXPECTED_SOURCE_COMMIT="$expected_source_commit" python3 - <<'PY'
import json
import os

with open(os.environ["MANIFEST_PATH"], encoding="utf-8") as handle:
    manifest = json.load(handle)
with open(os.environ["EVIDENCE_PATH"], encoding="utf-8") as handle:
    evidence = json.load(handle)

source = os.environ["EXPECTED_SOURCE_COMMIT"]
expected_native = [
    "node_modules/argon2/prebuilds/linux-x64/argon2.glibc.node",
    "node_modules/better-sqlite3/prebuilds/linux-x64.node",
]

if manifest.get("sourceCommit") != source:
    raise SystemExit("manifest source commit mismatch")
if manifest.get("platform") != "linux" or manifest.get("architecture") != "x64":
    raise SystemExit("manifest platform mismatch")
if evidence.get("status") != "ok" or evidence.get("sourceCommit") != source:
    raise SystemExit("GitHub runtime evidence identity mismatch")
if evidence.get("nativeModules", {}).get("paths") != expected_native:
    raise SystemExit("GitHub runtime evidence native-module mismatch")
if evidence.get("compiledAcceptance", {}).get("status") != "ok":
    raise SystemExit("GitHub compiled acceptance evidence is not successful")
PY

manifest_node_version="$(MANIFEST_PATH="$manifest_path" python3 - <<'PY'
import json
import os
with open(os.environ["MANIFEST_PATH"], encoding="utf-8") as handle:
    print(json.load(handle)["nodeVersion"])
PY
)"
if [[ "$host_node_version" != "$manifest_node_version" ]]; then
  echo "host Node.js version does not match the artifact builder" >&2
  exit 66
fi

tar -xOzf "$archive_path" ./scripts/production-artifact.mjs \
  > "$scripts_directory/production-artifact.mjs"
verifier_sha256="$(sha256sum -- "$scripts_directory/production-artifact.mjs" | awk '{print $1}')"

MANIFEST_PATH="$manifest_path" VERIFIER_SHA256="$verifier_sha256" python3 - <<'PY'
import json
import os

with open(os.environ["MANIFEST_PATH"], encoding="utf-8") as handle:
    manifest = json.load(handle)
entry = next(
    (item for item in manifest["files"] if item["path"] == "scripts/production-artifact.mjs"),
    None,
)
if entry is None or entry.get("sha256") != os.environ["VERIFIER_SHA256"]:
    raise SystemExit("extracted verifier does not match the artifact manifest")
PY

snapshot_state() {
  local destination="$1"
  {
    printf 'nginx_active='; systemctl is-active nginx 2>/dev/null || true
    printf 'nginx_enabled='; systemctl is-enabled nginx 2>/dev/null || true
    printf 'academiccloud_active='; systemctl is-active academiccloud 2>/dev/null || true
    printf 'academiccloud_enabled='; systemctl is-enabled academiccloud 2>/dev/null || true
    for path in /opt/academiccloud /etc/academiccloud /var/lib/academiccloud; do
      if [[ -e "$path" ]]; then
        stat -c 'path=%n|%F|%a|%U:%G' -- "$path"
      else
        printf 'path=%s|absent\n' "$path"
      fi
    done
    printf 'nginx_config_sha256='
    find /etc/nginx -xdev -type f -print0 2>/dev/null |
      sort -z |
      xargs -0r sha256sum |
      sha256sum |
      awk '{print $1}'
    ss -H -lntup 2>/dev/null |
      sed -E 's/pid=[0-9]+/pid=*/g' |
      sort
  } > "$destination"
}

snapshot_state "$pre_snapshot"
acceptance_started_at="$(date --iso-8601=seconds)"

mkdir -m 0700 -- "$evidence_directory"
chown root:root -- "$resolved_stage" "$artifact_zip" "$output_directory" "$scripts_directory"
chown root:root -- "$output_directory"/* "$scripts_directory/production-artifact.mjs"
chown nobody:nogroup -- "$temporary_directory" "$evidence_directory"
chmod 0755 -- "$resolved_stage"
chmod 0555 -- "$output_directory" "$scripts_directory"
find "$output_directory" -maxdepth 1 -type f -exec chmod 0444 -- {} +
chmod 0444 -- "$scripts_directory/production-artifact.mjs"
chmod 0700 -- "$temporary_directory" "$evidence_directory"

unit_load_state="$(systemctl show -p LoadState --value "$unit_name" 2>/dev/null || true)"
if [[ "$unit_load_state" != "not-found" ]]; then
  echo "transient acceptance unit already exists: $unit_name ($unit_load_state)" >&2
  exit 67
fi

unit_created_by_this_run=false
cleanup_unit() {
  if [[ "$unit_created_by_this_run" == "true" ]]; then
    systemctl stop "$unit_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup_unit EXIT HUP INT TERM

set +e
systemd-run --quiet --wait --pipe --collect --unit="$unit_name" \
  --property=User=nobody \
  --property=Group=nogroup \
  --property="WorkingDirectory=$resolved_stage" \
  --property=NoNewPrivileges=yes \
  --property=PrivateNetwork=yes \
  --property=PrivateDevices=yes \
  --property=ProtectSystem=strict \
  --property=ProtectHome=yes \
  --property=ProtectControlGroups=yes \
  --property=ProtectKernelModules=yes \
  --property=ProtectKernelTunables=yes \
  --property=ProtectKernelLogs=yes \
  --property=ProtectClock=yes \
  --property=ProtectHostname=yes \
  --property=LockPersonality=yes \
  --property=RestrictRealtime=yes \
  --property=RestrictSUIDSGID=yes \
  --property=RestrictNamespaces=yes \
  --property=RemoveIPC=yes \
  --property=CapabilityBoundingSet= \
  --property=AmbientCapabilities= \
  --property="RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK" \
  --property=SystemCallArchitectures=native \
  --property="ReadWritePaths=$evidence_directory $temporary_directory" \
  --property=LimitCORE=0 \
  --property=TasksMax=128 \
  --property=MemoryAccounting=yes \
  --property=MemoryHigh=320M \
  --property=MemoryMax=384M \
  --property=RuntimeMaxSec=180 \
  --property=TimeoutStopSec=10s \
  --property=KillMode=control-group \
  /usr/bin/env -i \
    PATH=/usr/bin:/bin \
    HOME=/nonexistent \
    TMPDIR="$temporary_directory" \
    CI=true \
    /usr/bin/node "$scripts_directory/production-artifact.mjs" verify \
      "--archive=output/$artifact_base.tar.gz" \
      "--manifest=output/$artifact_base.manifest.json" \
      "--checksum=output/$artifact_base.tar.gz.sha256" \
      "--evidence=output/host-evidence/$artifact_base.alibaba-runtime-verification.json" \
  > "$resolved_stage/systemd-run.stdout" \
  2> "$resolved_stage/systemd-run.stderr" &
runner_pid=$!
unit_created_by_this_run=true
set -e

printf 'epoch_ms\tmem_available_kib\tswap_free_kib\tcgroup_present\tcgroup_current_bytes\tcgroup_peak_bytes\tcgroup_oom\tcgroup_oom_kill\n' \
  > "$samples_path"

while kill -0 "$runner_pid" 2>/dev/null; do
  epoch_ms="$(date +%s%3N)"
  mem_available_kib="$(awk '$1 == "MemAvailable:" {print $2}' /proc/meminfo)"
  swap_free_kib="$(awk '$1 == "SwapFree:" {print $2}' /proc/meminfo)"
  cgroup_current_bytes=0
  cgroup_peak_bytes=0
  cgroup_oom=0
  cgroup_oom_kill=0
  cgroup_present=0
  if [[ -d "$unit_cgroup" ]]; then
    cgroup_present=1
    cgroup_current_bytes="$(cat "$unit_cgroup/memory.current" 2>/dev/null || printf 0)"
    cgroup_peak_bytes="$(cat "$unit_cgroup/memory.peak" 2>/dev/null || printf 0)"
    cgroup_oom="$(awk '$1 == "oom" {print $2}' "$unit_cgroup/memory.events" 2>/dev/null || printf 0)"
    cgroup_oom_kill="$(awk '$1 == "oom_kill" {print $2}' "$unit_cgroup/memory.events" 2>/dev/null || printf 0)"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$epoch_ms" "$mem_available_kib" "$swap_free_kib" "$cgroup_present" \
    "$cgroup_current_bytes" "$cgroup_peak_bytes" "$cgroup_oom" "$cgroup_oom_kill" \
    >> "$samples_path"
  sleep 0.025
done

set +e
wait "$runner_pid"
unit_exit_code=$?
set -e
acceptance_finished_at="$(date --iso-8601=seconds)"

journalctl -k --since "$acceptance_started_at" --until "$acceptance_finished_at" --no-pager 2>/dev/null |
  grep -Ei 'out of memory|oom-kill|killed process' > "$kernel_oom_path" || true

snapshot_state "$post_snapshot"
snapshot_same=false
if cmp --silent -- "$pre_snapshot" "$post_snapshot"; then
  snapshot_same=true
fi

STAGE_DIRECTORY="$resolved_stage" \
ARTIFACT_BASE="$artifact_base" \
EXPECTED_SOURCE_COMMIT="$expected_source_commit" \
EXPECTED_ZIP_SHA256="$expected_zip_sha256" \
ACTUAL_ZIP_SHA256="$actual_zip_sha256" \
VERIFIER_SHA256="$verifier_sha256" \
HOST_NODE_VERSION="$host_node_version" \
HOST_NPM_VERSION="$host_npm_version" \
HOST_OS_ID="$ID" \
HOST_OS_VERSION="$VERSION_ID" \
HOST_ARCHITECTURE="$(uname -m)" \
UNIT_NAME="$unit_name" \
UNIT_EXIT_CODE="$unit_exit_code" \
ACCEPTANCE_STARTED_AT="$acceptance_started_at" \
ACCEPTANCE_FINISHED_AT="$acceptance_finished_at" \
SNAPSHOT_SAME="$snapshot_same" \
python3 - <<'PY'
import csv
import json
import os
import pathlib

stage = pathlib.Path(os.environ["STAGE_DIRECTORY"])
artifact_base = os.environ["ARTIFACT_BASE"]
samples = []
with (stage / "memory-samples.tsv").open(encoding="utf-8") as handle:
    for row in csv.DictReader(handle, delimiter="\t"):
        samples.append({key: int(value) for key, value in row.items()})
if not samples:
    raise SystemExit("no memory samples were recorded")

runtime_path = stage / "output" / "host-evidence" / f"{artifact_base}.alibaba-runtime-verification.json"
runtime = None
runtime_error = None
try:
    with runtime_path.open(encoding="utf-8") as handle:
        runtime = json.load(handle)
except Exception as error:  # preserve diagnostics for ordinary host/runtime failures
    runtime_error = f"{type(error).__name__}: {error}"

kernel_oom_lines = [
    line
    for line in (stage / "kernel-oom.txt").read_text(encoding="utf-8").splitlines()
    if line.strip()
]

report = {
    "schemaVersion": 1,
    "status": "ok",
    "sourceCommit": os.environ["EXPECTED_SOURCE_COMMIT"],
    "artifactBase": artifact_base,
    "artifactZipSha256": os.environ["ACTUAL_ZIP_SHA256"],
    "artifactZipSha256Expected": os.environ["EXPECTED_ZIP_SHA256"],
    "verifierSha256": os.environ["VERIFIER_SHA256"],
    "hostNodeVersion": os.environ["HOST_NODE_VERSION"],
    "hostNpmVersion": os.environ["HOST_NPM_VERSION"],
    "hostOsId": os.environ["HOST_OS_ID"],
    "hostOsVersion": os.environ["HOST_OS_VERSION"],
    "hostArchitecture": os.environ["HOST_ARCHITECTURE"],
    "unit": os.environ["UNIT_NAME"],
    "unitExitCode": int(os.environ["UNIT_EXIT_CODE"]),
    "startedAt": os.environ["ACCEPTANCE_STARTED_AT"],
    "finishedAt": os.environ["ACCEPTANCE_FINISHED_AT"],
    "sampleCount": len(samples),
    "minimumMemAvailableKiB": min(row["mem_available_kib"] for row in samples),
    "minimumSwapFreeKiB": min(row["swap_free_kib"] for row in samples),
    "cgroupObserved": any(row["cgroup_present"] == 1 for row in samples),
    "maximumCgroupCurrentBytes": max(row["cgroup_current_bytes"] for row in samples),
    "maximumCgroupPeakBytes": max(row["cgroup_peak_bytes"] for row in samples),
    "maximumCgroupOomEvents": max(row["cgroup_oom"] for row in samples),
    "maximumCgroupOomKillEvents": max(row["cgroup_oom_kill"] for row in samples),
    "kernelOomLines": kernel_oom_lines,
    "prePostStateIdentical": os.environ["SNAPSHOT_SAME"] == "true",
    "networkIsolation": "systemd PrivateNetwork=yes",
    "executionUser": "nobody:nogroup",
    "memoryHighBytes": 320 * 1024 * 1024,
    "memoryMaxBytes": 384 * 1024 * 1024,
    "headroomGateKiB": 128 * 1024,
    "runtimeVerification": runtime,
    "runtimeVerificationError": runtime_error,
}

passed = (
    report["unitExitCode"] == 0
    and isinstance(runtime, dict)
    and runtime.get("status") == "ok"
    and runtime.get("sourceCommit") == report["sourceCommit"]
    and report["minimumMemAvailableKiB"] >= report["headroomGateKiB"]
    and report["minimumSwapFreeKiB"] > 0
    and report["cgroupObserved"]
    and report["maximumCgroupPeakBytes"] > 0
    and report["maximumCgroupOomEvents"] == 0
    and report["maximumCgroupOomKillEvents"] == 0
    and not report["kernelOomLines"]
    and report["prePostStateIdentical"]
)
report["status"] = "ok" if passed else "failed"

(stage / "host-runtime-report.json").write_text(
    json.dumps(report, indent=2) + "\n", encoding="utf-8"
)
if not passed:
    raise SystemExit("Alibaba runtime acceptance gate failed; inspect host-runtime-report.json")
PY

echo "Alibaba runtime acceptance passed"
