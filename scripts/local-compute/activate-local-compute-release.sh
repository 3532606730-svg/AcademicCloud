#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 || $# != 1 )); then
  echo "usage (as root): activate-local-compute-release.sh RELEASE_ROOT" >&2
  exit 2
fi

readonly RELEASE_ROOT="$1"
readonly COMPUTE_ROOT="/srv/academiccloud-compute"
readonly ENVIRONMENT_FILE="${COMPUTE_ROOT}/control/academiccloud-local-compute.env"
readonly UNIT_SOURCE="${RELEASE_ROOT}/deployment/academiccloud-local-compute.service"
readonly UNIT_TARGET="/etc/systemd/system/academiccloud-local-compute.service"
readonly CURRENT_LINK="${COMPUTE_ROOT}/current"
readonly STABILITY_SECONDS=15

[[ "$RELEASE_ROOT" =~ ^${COMPUTE_ROOT}/releases/[a-f0-9]{40}$ ]]
test -d "$RELEASE_ROOT"
test -f "$RELEASE_ROOT/release-manifest.json"
test -f "$RELEASE_ROOT/release-files.sha256"
test -f "$RELEASE_ROOT/release-files.sha256.sha256"
test -x "$RELEASE_ROOT/runtime/node/bin/node"
test -x "$RELEASE_ROOT/runtime/llama/bin/llama-server"
test -x "$RELEASE_ROOT/runtime/paddle/venv/bin/python"
test "$(stat -c '%U:%G|%a' "$RELEASE_ROOT")" = "root:root|555"
test -z "$(find "$RELEASE_ROOT" -xdev \( -type f -o -type d \) -perm /022 -print -quit)"
test -f "$ENVIRONMENT_FILE"
test "$(stat -c '%U:%G|%a' "$ENVIRONMENT_FILE")" = "academiccloud:academiccloud|600"
test "$(jq -r '.provider' "$RELEASE_ROOT/release-manifest.json")" = "local_pull"
test "$(jq -r '.source.commit' "$RELEASE_ROOT/release-manifest.json")" = "$(basename "$RELEASE_ROOT")"
printf '%s  %s\n' "$(cat "$RELEASE_ROOT/release-files.sha256.sha256")" "$RELEASE_ROOT/release-files.sha256" \
  | sha256sum --check --strict
(
  cd "$RELEASE_ROOT"
  sha256sum --check --strict release-files.sha256 >/dev/null
)

PREVIOUS_RELEASE=""
if [[ -e "$CURRENT_LINK" || -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
  [[ "$PREVIOUS_RELEASE" =~ ^${COMPUTE_ROOT}/releases/[a-f0-9]{40}$ ]]
  test -d "$PREVIOUS_RELEASE"
fi

rollback_activation() {
  if [[ -n "$PREVIOUS_RELEASE" ]]; then
    install -o root -g root -m 0644 \
      "$PREVIOUS_RELEASE/deployment/academiccloud-local-compute.service" "$UNIT_TARGET"
    ln -sfn "$PREVIOUS_RELEASE" "${COMPUTE_ROOT}/.rollback-current.$$"
    mv -Tf "${COMPUTE_ROOT}/.rollback-current.$$" "$CURRENT_LINK"
    systemctl daemon-reload
    systemctl restart academiccloud-local-compute.service
  else
    systemctl stop academiccloud-local-compute.service || true
    systemctl disable academiccloud-local-compute.service || true
    rm -f -- "$CURRENT_LINK"
  fi
  echo "Local Compute activation failed and the previous selection was restored" >&2
  exit 4
}

install -o root -g root -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
ln -sfn "$RELEASE_ROOT" "${COMPUTE_ROOT}/.current.$$"
mv -Tf "${COMPUTE_ROOT}/.current.$$" "$CURRENT_LINK"
systemctl daemon-reload
systemctl enable academiccloud-local-compute.service
BEFORE_RESTARTS="$(systemctl show academiccloud-local-compute.service --property=NRestarts --value 2>/dev/null || printf '0')"
[[ "$BEFORE_RESTARTS" =~ ^[0-9]+$ ]] || BEFORE_RESTARTS=0
if ! systemctl restart academiccloud-local-compute.service \
  || ! systemctl is-active --quiet academiccloud-local-compute.service; then
  rollback_activation
fi

sleep "$STABILITY_SECONDS"
SERVICE_PROPERTIES="$(systemctl show academiccloud-local-compute.service \
  --property=ActiveState --property=SubState --property=Result --property=NRestarts \
  --property=MainPID --property=ExecMainStatus --property=User --property=Group --property=FragmentPath)"
AFTER_RESTARTS="$(sed -n 's/^NRestarts=//p' <<<"$SERVICE_PROPERTIES")"
if ! grep -qx 'ActiveState=active' <<<"$SERVICE_PROPERTIES" \
  || ! grep -qx 'SubState=running' <<<"$SERVICE_PROPERTIES" \
  || ! grep -qx 'Result=success' <<<"$SERVICE_PROPERTIES" \
  || ! grep -qx 'ExecMainStatus=0' <<<"$SERVICE_PROPERTIES" \
  || ! grep -qx 'User=academiccloud' <<<"$SERVICE_PROPERTIES" \
  || ! grep -qx 'Group=academiccloud' <<<"$SERVICE_PROPERTIES" \
  || ! grep -qx "FragmentPath=$UNIT_TARGET" <<<"$SERVICE_PROPERTIES" \
  || ! grep -Eq '^MainPID=[1-9][0-9]*$' <<<"$SERVICE_PROPERTIES" \
  || [[ "$AFTER_RESTARTS" != "$BEFORE_RESTARTS" ]] \
  || [[ "$(readlink -f "$CURRENT_LINK")" != "$RELEASE_ROOT" ]] \
  || [[ "$(stat -c '%U:%G|%a' "$ENVIRONMENT_FILE")" != 'academiccloud:academiccloud|600' ]]; then
  rollback_activation
fi

printf 'LOCAL_COMPUTE_RELEASE_ACTIVATION=PASS\n'
printf 'ACTIVE_SOURCE_COMMIT=%s\n' "$(jq -r '.source.commit' "$RELEASE_ROOT/release-manifest.json")"
printf 'STABILITY_SECONDS=%s\n' "$STABILITY_SECONDS"
printf 'WORKER_RESTARTS=%s\n' "$AFTER_RESTARTS"
