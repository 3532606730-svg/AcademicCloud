#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly SOURCE_COMMIT="639baa9596a17f4160521f31440d9e3ac3b12eda"
readonly EXPECTED_NGINX_HASH="cb5d4fbec0712ab7911dbd4973ca42b3305852d91da33d739e530099dd13670c"

fail() {
  printf 'certbot foundation error: %s\n' "$*" >&2
  exit 1
}

if [[ "$#" -ne 1 || "$(id -u)" -ne 0 ]]; then
  fail "usage: $0 /var/tmp/academiccloud-prod03a-XXXXXXXX (as root)"
fi
readonly STAGE="$1"
readonly STAGE_REAL="$(readlink -f -- "$STAGE")"
[[ "$STAGE" == "$STAGE_REAL" && "$STAGE_REAL" =~ ^/var/tmp/academiccloud-prod03a-[A-Za-z0-9]{8}$ ]] || fail "invalid task stage"
[[ -d "$STAGE_REAL" && ! -L "$STAGE_REAL" && "$(stat -c '%u:%g:%a' -- "$STAGE_REAL")" == "0:0:700" ]] || fail "invalid task stage ownership or mode"
[[ -f "${STAGE_REAL}/alibaba-certbot-foundation.sh" && ! -L "${STAGE_REAL}/alibaba-certbot-foundation.sh" ]] || fail "certbot script is not a regular file"
[[ "$(stat -c '%u:%g' -- "${STAGE_REAL}/alibaba-certbot-foundation.sh")" == "0:0" ]] || fail "certbot script is not root-owned"

[[ "$(readlink -f /opt/academiccloud/current)" == "/opt/academiccloud/releases/${SOURCE_COMMIT}" ]] || fail "foundation release is absent"
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == "disabled" ]] || fail "application service is not disabled"
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == "inactive" ]] || fail "application service is not inactive"
[[ ! -e /etc/academiccloud/academiccloud.env && ! -L /etc/academiccloud/academiccloud.env ]] || fail "production environment unexpectedly exists"
[[ ! -e /var/lib/academiccloud/academiccloud.sqlite && ! -L /var/lib/academiccloud/academiccloud.sqlite ]] || fail "production database unexpectedly exists"
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "enabled Nginx sites changed"
readonly NGINX_HASH_BEFORE="$(find /etc/nginx -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
[[ "$NGINX_HASH_BEFORE" == "$EXPECTED_NGINX_HASH" ]] || fail "Nginx tree differs from baseline"
nginx -t
[[ -z "$(dpkg --audit)" ]] || fail "dpkg audit is not clean"
apt-get check
if pgrep -x apt >/dev/null || pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || pgrep -x unattended-upgrade >/dev/null; then
  fail "another package-management process is active"
fi
[[ ! -e /etc/letsencrypt/accounts && ! -L /etc/letsencrypt/accounts ]] || fail "ACME account state already exists"
[[ ! -e /etc/letsencrypt/live && ! -L /etc/letsencrypt/live ]] || fail "certificate live state already exists"
[[ ! -e /etc/letsencrypt/archive && ! -L /etc/letsencrypt/archive ]] || fail "certificate archive state already exists"
[[ ! -e /etc/letsencrypt/renewal && ! -L /etc/letsencrypt/renewal ]] || fail "certificate renewal state already exists"

dpkg-query -W -f='${binary:Package}\t${Version}\n' | sort >"${STAGE_REAL}/packages-before.txt"
apt-cache policy certbot >"${STAGE_REAL}/certbot-policy-before.txt"
apt-get -s install --no-install-recommends certbot >"${STAGE_REAL}/certbot-install-simulation.txt"
chmod 0600 "${STAGE_REAL}/packages-before.txt" "${STAGE_REAL}/certbot-policy-before.txt" "${STAGE_REAL}/certbot-install-simulation.txt"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=l
apt-get update 2>&1 | tee "${STAGE_REAL}/apt-update.txt"
apt-get install --yes --no-install-recommends --no-upgrade --no-remove certbot 2>&1 | tee "${STAGE_REAL}/apt-install.txt"
unset DEBIAN_FRONTEND
unset NEEDRESTART_MODE
chmod 0600 "${STAGE_REAL}/apt-update.txt" "${STAGE_REAL}/apt-install.txt"

dpkg-query -W -f='${binary:Package}\t${Version}\n' | sort >"${STAGE_REAL}/packages-after.txt"
comm -13 "${STAGE_REAL}/packages-before.txt" "${STAGE_REAL}/packages-after.txt" >"${STAGE_REAL}/packages-added.txt"
certbot --version >"${STAGE_REAL}/certbot-version.txt" 2>&1
chmod 0600 "${STAGE_REAL}/packages-after.txt" "${STAGE_REAL}/packages-added.txt" "${STAGE_REAL}/certbot-version.txt"

dpkg-query -W -f='${Status}\n' certbot | grep -Fxq 'install ok installed' || fail "certbot package is not installed"
if dpkg-query -W -f='${Status}\n' python3-certbot-nginx 2>/dev/null | grep -Fxq 'install ok installed'; then
  fail "the Nginx-mutating Certbot plugin was installed"
fi
systemctl disable --now certbot.timer >/dev/null 2>&1 || true
[[ "$(systemctl is-enabled certbot.timer 2>/dev/null || true)" == "disabled" ]] || fail "certbot timer is not disabled"
[[ "$(systemctl is-active certbot.timer 2>/dev/null || true)" == "inactive" ]] || fail "certbot timer is not inactive"
[[ ! -e /etc/letsencrypt/accounts && ! -L /etc/letsencrypt/accounts ]] || fail "ACME account was unexpectedly registered"
[[ ! -e /etc/letsencrypt/live && ! -L /etc/letsencrypt/live ]] || fail "certificate was unexpectedly issued"
[[ ! -e /etc/letsencrypt/archive && ! -L /etc/letsencrypt/archive ]] || fail "certificate archive was unexpectedly created"
[[ ! -e /etc/letsencrypt/renewal && ! -L /etc/letsencrypt/renewal ]] || fail "certificate renewal state was unexpectedly created"

readonly NGINX_HASH_AFTER="$(find /etc/nginx -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
[[ "$NGINX_HASH_AFTER" == "$NGINX_HASH_BEFORE" ]] || fail "Certbot tooling changed the Nginx tree"
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "Certbot tooling changed the active route"
nginx -t
if ss -lntH 'sport = :3000' | grep -q .; then fail "application listener unexpectedly exists"; fi

{
  printf 'capturedAt=%s\n' "$(date --iso-8601=seconds)"
  printf 'certbotVersion=%s\n' "$(certbot --version 2>&1)"
  printf 'certbotTimerEnabled=%s\n' "$(systemctl is-enabled certbot.timer 2>/dev/null || true)"
  printf 'certbotTimerActive=%s\n' "$(systemctl is-active certbot.timer 2>/dev/null || true)"
  printf 'nginxTreeSha256=%s\n' "$NGINX_HASH_AFTER"
  printf '%s\n' 'acmeAccount=absent' 'certificate=absent' 'publicRoute=unchanged' 'application=inactive'
} >"${STAGE_REAL}/certbot-foundation-evidence.txt"
chmod 0600 "${STAGE_REAL}/certbot-foundation-evidence.txt"

printf 'certbot-foundation-status=ok\ntimer=disabled,inactive\ncertificate=absent\npublicRoute=unchanged\n'
