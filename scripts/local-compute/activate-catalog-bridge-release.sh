#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 || $# != 1 )); then
  echo "usage (as root): activate-catalog-bridge-release.sh RELEASE_ROOT" >&2
  exit 2
fi

readonly RELEASE_ROOT="$1"
readonly COMPUTE_ROOT="/srv/academiccloud-compute"
readonly CATALOG_RELEASE_PARENT="${COMPUTE_ROOT}/catalog-releases"
readonly CATALOG_CURRENT_LINK="${COMPUTE_ROOT}/catalog-current"
readonly MAIN_CURRENT_LINK="${COMPUTE_ROOT}/current"
readonly BRIDGE_UNIT="academiccloud-catalog-bridge.service"
readonly MAIN_UNIT="academiccloud-local-compute.service"
readonly UNIT_SOURCE="${RELEASE_ROOT}/deployment/${BRIDGE_UNIT}"
readonly UNIT_TARGET="/etc/systemd/system/${BRIDGE_UNIT}"
readonly STABILITY_SECONDS=10
readonly UNIT_BACKUP="${COMPUTE_ROOT}/tmp/.catalog-bridge-unit.$$.bak"

[[ "$RELEASE_ROOT" =~ ^${CATALOG_RELEASE_PARENT}/[a-f0-9]{40}$ ]]
test -f "$UNIT_SOURCE"
test -x "$RELEASE_ROOT/deployment/verify-catalog-bridge-release.sh"
"$RELEASE_ROOT/deployment/verify-catalog-bridge-release.sh" "$RELEASE_ROOT"

service_state() {
  systemctl "$1" "$2" 2>/dev/null || true
}

link_state() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    readlink -f "$path"
  else
    printf '__absent__\n'
  fi
}

readonly MAIN_ACTIVE_BEFORE="$(service_state is-active "$MAIN_UNIT")"
readonly MAIN_ENABLED_BEFORE="$(service_state is-enabled "$MAIN_UNIT")"
readonly MAIN_CURRENT_BEFORE="$(link_state "$MAIN_CURRENT_LINK")"
readonly BRIDGE_ACTIVE_BEFORE="$(service_state is-active "$BRIDGE_UNIT")"
readonly BRIDGE_ENABLED_BEFORE="$(service_state is-enabled "$BRIDGE_UNIT")"
readonly CATALOG_CURRENT_BEFORE="$(link_state "$CATALOG_CURRENT_LINK")"
readonly UNIT_EXISTED_BEFORE="$([[ -f "$UNIT_TARGET" ]] && printf true || printf false)"

install -d -o academiccloud -g academiccloud -m 0750 "${COMPUTE_ROOT}/tmp"
if [[ "$UNIT_EXISTED_BEFORE" == "true" ]]; then
  cp -a -- "$UNIT_TARGET" "$UNIT_BACKUP"
fi

restore_bridge_state() {
  systemctl stop "$BRIDGE_UNIT" >/dev/null 2>&1 || true

  if [[ "$CATALOG_CURRENT_BEFORE" == "__absent__" ]]; then
    rm -f -- "$CATALOG_CURRENT_LINK"
  elif [[ "$CATALOG_CURRENT_BEFORE" =~ ^${CATALOG_RELEASE_PARENT}/[a-f0-9]{40}$ ]]; then
    ln -sfn "$CATALOG_CURRENT_BEFORE" "${COMPUTE_ROOT}/.catalog-current.rollback.$$" || true
    mv -Tf "${COMPUTE_ROOT}/.catalog-current.rollback.$$" "$CATALOG_CURRENT_LINK" || true
  fi

  if [[ "$UNIT_EXISTED_BEFORE" == "true" && -f "$UNIT_BACKUP" ]]; then
    install -o root -g root -m 0644 "$UNIT_BACKUP" "$UNIT_TARGET" || true
  else
    rm -f -- "$UNIT_TARGET"
  fi
  systemctl daemon-reload >/dev/null 2>&1 || true

  case "$BRIDGE_ENABLED_BEFORE" in
    enabled|enabled-runtime|linked|linked-runtime|alias)
      systemctl enable "$BRIDGE_UNIT" >/dev/null 2>&1 || true
      ;;
    *)
      systemctl disable "$BRIDGE_UNIT" >/dev/null 2>&1 || true
      ;;
  esac
  if [[ "$BRIDGE_ACTIVE_BEFORE" == "active" ]]; then
    systemctl start "$BRIDGE_UNIT" >/dev/null 2>&1 || true
  fi
  rm -f -- "$UNIT_BACKUP"
}

fail_activation() {
  trap - ERR
  set +e
  restore_bridge_state
  echo "Catalog bridge activation failed; prior bridge state restored. Main Local Compute worker was not modified." >&2
  exit 4
}

trap 'fail_activation' ERR

install -o root -g root -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
ln -sfn "$RELEASE_ROOT" "${COMPUTE_ROOT}/.catalog-current.$$"
mv -Tf "${COMPUTE_ROOT}/.catalog-current.$$" "$CATALOG_CURRENT_LINK"
systemctl daemon-reload
systemctl enable "$BRIDGE_UNIT" >/dev/null

BEFORE_RESTARTS="$(systemctl show "$BRIDGE_UNIT" --property=NRestarts --value 2>/dev/null || printf '0')"
[[ "$BEFORE_RESTARTS" =~ ^[0-9]+$ ]] || BEFORE_RESTARTS=0
systemctl restart "$BRIDGE_UNIT"
systemctl is-active --quiet "$BRIDGE_UNIT"

HEALTH="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:43117/health)"
test "$(jq -r '.status' <<<"$HEALTH")" = "ok"
test "$(jq -r '.service' <<<"$HEALTH")" = "academiccloud-catalog-bridge"
test "$(jq -r '.version' <<<"$HEALTH")" = "1"

LISTENERS="$(ss -H -ltn 'sport = :43117' | awk '{print $4}')"
test "$LISTENERS" = "127.0.0.1:43117"

sleep "$STABILITY_SECONDS"
SERVICE_PROPERTIES="$(systemctl show "$BRIDGE_UNIT" \
  --property=ActiveState --property=SubState --property=Result --property=NRestarts \
  --property=MainPID --property=ExecMainStatus --property=User --property=Group --property=FragmentPath)"
AFTER_RESTARTS="$(sed -n 's/^NRestarts=//p' <<<"$SERVICE_PROPERTIES")"

grep -qx 'ActiveState=active' <<<"$SERVICE_PROPERTIES"
grep -qx 'SubState=running' <<<"$SERVICE_PROPERTIES"
grep -qx 'Result=success' <<<"$SERVICE_PROPERTIES"
grep -qx 'ExecMainStatus=0' <<<"$SERVICE_PROPERTIES"
grep -qx 'User=academiccloud' <<<"$SERVICE_PROPERTIES"
grep -qx 'Group=academiccloud' <<<"$SERVICE_PROPERTIES"
grep -qx "FragmentPath=$UNIT_TARGET" <<<"$SERVICE_PROPERTIES"
grep -Eq '^MainPID=[1-9][0-9]*$' <<<"$SERVICE_PROPERTIES"
test "$AFTER_RESTARTS" = "$BEFORE_RESTARTS"
test "$(readlink -f "$CATALOG_CURRENT_LINK")" = "$RELEASE_ROOT"

# Catalog export has a separate package, release selector, and service. Its
# activation must not silently start/stop/repoint the main AI Local Pull worker.
test "$(service_state is-active "$MAIN_UNIT")" = "$MAIN_ACTIVE_BEFORE"
test "$(service_state is-enabled "$MAIN_UNIT")" = "$MAIN_ENABLED_BEFORE"
test "$(link_state "$MAIN_CURRENT_LINK")" = "$MAIN_CURRENT_BEFORE"

trap - ERR
rm -f -- "$UNIT_BACKUP"
printf 'CATALOG_BRIDGE_RELEASE_ACTIVATION=PASS\n'
printf 'ACTIVE_SOURCE_COMMIT=%s\n' "$(jq -r '.source.commit' "$RELEASE_ROOT/release-manifest.json")"
printf 'CATALOG_CURRENT=%s\n' "$(readlink -f "$CATALOG_CURRENT_LINK")"
printf 'LISTENER=%s\n' "$LISTENERS"
printf 'STABILITY_SECONDS=%s\n' "$STABILITY_SECONDS"
printf 'BRIDGE_RESTARTS=%s\n' "$AFTER_RESTARTS"
printf 'MAIN_WORKER_ACTIVE_UNCHANGED=%s\n' "$MAIN_ACTIVE_BEFORE"
printf 'MAIN_WORKER_ENABLED_UNCHANGED=%s\n' "$MAIN_ENABLED_BEFORE"
printf 'MAIN_CURRENT_UNCHANGED=%s\n' "$MAIN_CURRENT_BEFORE"
