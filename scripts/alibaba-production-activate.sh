#!/usr/bin/env bash

# Prepared by PROD-03A and executed only during the separately gated PROD-03B.
# Secrets arrive as newline-delimited standard input from the local Owner wrapper.
set -Eeuo pipefail
set +x
umask 077

readonly APP_HOST="cloud.ajtlab.top"
readonly OSS_ENDPOINT="https://oss-ap-southeast-3.aliyuncs.com"
readonly OSS_REGION="oss-ap-southeast-3"
readonly OSS_BUCKET="ajt-academiccloud-kl-8f3c"
readonly ENV_PATH="/etc/academiccloud/academiccloud.env"
readonly DATABASE_PATH="/var/lib/academiccloud/academiccloud.sqlite"
readonly RELEASE_PATH="/opt/academiccloud/current"
readonly EXACT_RELEASE="/opt/academiccloud/releases/639baa9596a17f4160521f31440d9e3ac3b12eda"
readonly ACME_WEBROOT="/var/www/html"
readonly PHASE_PATH="/etc/academiccloud/prepared/prod03b-activation-phase"
readonly EVIDENCE_PATH="/etc/academiccloud/prepared/prod03b-activation-evidence.txt"

fail() {
  printf 'activation error: %s\n' "$*" >&2
  exit 1
}

record_phase() {
  local new_phase="$1"
  local temporary="${PHASE_PATH}.new"
  printf '%s\n' "$new_phase" >"$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  mv -T -- "$temporary" "$PHASE_PATH"
  phase="$new_phase"
  {
    printf 'capturedAt=%s\n' "$(date --iso-8601=seconds)"
    printf 'phase=%s\n' "$phase"
    printf 'release=%s\n' "$(readlink -f -- "$RELEASE_PATH")"
    printf 'serviceEnabled=%s\n' "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)"
    printf 'serviceActive=%s\n' "$(systemctl is-active academiccloud.service 2>/dev/null || true)"
    printf 'serviceMainPID=%s\n' "$(systemctl show -p MainPID --value academiccloud.service)"
    printf 'publicSite=%s\n' "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)"
    printf 'certificate=%s\n' "$([[ -f "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" ]] && printf present || printf absent)"
    printf 'environment=%s\n' "$([[ -f "$ENV_PATH" ]] && printf present-root-0600 || printf absent)"
    printf 'database=%s\n' "$([[ -f "$DATABASE_PATH" ]] && printf present-academiccloud-0600 || printf absent)"
  } >"${EVIDENCE_PATH}.new"
  chown root:root "${EVIDENCE_PATH}.new"
  chmod 0600 "${EVIDENCE_PATH}.new"
  mv -T -- "${EVIDENCE_PATH}.new" "$EVIDENCE_PATH"
}

if [[ "$#" -ne 0 || "$(id -u)" -ne 0 ]]; then
  fail "run as root with no arguments and provide the five interactive fields on standard input"
fi

IFS= read -r access_key_id || fail "missing AccessKey ID"
IFS= read -r access_key_secret || fail "missing AccessKey secret"
IFS= read -r acme_email || fail "missing ACME contact email"
IFS= read -r login_name || fail "missing initial login name"
IFS= read -r initial_password || fail "missing initial password"
if IFS= read -r unexpected_line; then
  fail "unexpected extra input"
fi

cleanup_memory() {
  if [[ -f "${ENV_PATH}.prod03b-new" && ! -L "${ENV_PATH}.prod03b-new" && ! -e "$ENV_PATH" && "$(stat -c '%u:%g:%a' -- "${ENV_PATH}.prod03b-new")" == "0:0:600" ]]; then
    rm -f -- "${ENV_PATH}.prod03b-new"
  fi
  access_key_secret=''
  initial_password=''
  unexpected_line=''
}
trap cleanup_memory EXIT

[[ "$access_key_id" =~ ^[A-Za-z0-9_-]{12,64}$ ]] || fail "invalid AccessKey ID format"
[[ "$access_key_secret" =~ ^[A-Za-z0-9_+/=-]{20,128}$ ]] || fail "invalid AccessKey secret format"
[[ "$acme_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail "invalid ACME email format"
[[ ${#login_name} -ge 1 && ${#login_name} -le 254 && ! "$login_name" =~ [[:space:]] ]] || fail "invalid login name format"
[[ ${#initial_password} -ge 12 && ${#initial_password} -le 1024 ]] || fail "password must contain 12-1024 characters"

[[ "$(readlink -f -- "$RELEASE_PATH")" == "$EXACT_RELEASE" ]] || fail "unexpected current release"
[[ -f /etc/systemd/system/academiccloud.service && ! -L /etc/systemd/system/academiccloud.service ]] || fail "production unit is absent"
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == "disabled" ]] || fail "production unit must remain disabled"
[[ -x /usr/bin/certbot ]] || fail "Certbot tooling is not installed"
[[ -d "$ACME_WEBROOT" && ! -L "$ACME_WEBROOT" ]] || fail "reviewed ACME webroot is absent"
[[ "$(systemctl is-active nginx.service)" == "active" ]] || fail "Nginx is not active"
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "public route state is outside the reviewed baseline"
[[ ! -e /etc/nginx/sites-enabled/academiccloud && ! -L /etc/nginx/sites-enabled/academiccloud ]] || fail "public AcademicCloud route already exists"

phase="initial"
if [[ -f "$PHASE_PATH" && ! -L "$PHASE_PATH" ]]; then
  [[ "$(stat -c '%u:%g:%a' -- "$PHASE_PATH")" == "0:0:600" ]] || fail "activation phase file has unsafe ownership or mode"
  phase="$(<"$PHASE_PATH")"
fi
case "$phase" in
  initial|certificate-ready|environment-ready|database-migrated|account-provisioned|loopback-ready) ;;
  *) fail "unknown activation phase" ;;
esac
case "$phase" in
  initial)
    [[ ! -e "$ENV_PATH" && ! -L "$ENV_PATH" ]] || fail "unrecorded production environment exists in initial phase"
    [[ ! -e "$DATABASE_PATH" && ! -L "$DATABASE_PATH" ]] || fail "unrecorded production database exists in initial phase"
    ;;
  certificate-ready)
    [[ ! -e "$DATABASE_PATH" && ! -L "$DATABASE_PATH" ]] || fail "production database exists before environment-ready"
    ;;
esac
case "$phase" in
  initial|certificate-ready|environment-ready|database-migrated)
    [[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == "inactive" ]] || fail "application must be inactive before account provisioning"
    [[ "$(systemctl show -p MainPID --value academiccloud.service)" == "0" ]] || fail "application process exists before account provisioning"
    ;;
  account-provisioned)
    case "$(systemctl is-active academiccloud.service 2>/dev/null || true)" in inactive|failed|active) ;; *) fail "unexpected service state during loopback recovery" ;; esac
    ;;
  loopback-ready)
    [[ "$(systemctl is-active academiccloud.service)" == "active" ]] || fail "recorded loopback-ready service is not active"
    ;;
esac

# Certificate issuance is deliberately first: a DNS/ACME failure leaves no app secret,
# database, or account. If issuance completed just before interruption, validate and resume.
if [[ "$phase" == "initial" ]]; then
  if [[ ! -f "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" ]]; then
    certbot certonly --non-interactive --agree-tos --no-eff-email \
      --email "$acme_email" --webroot --webroot-path "$ACME_WEBROOT" \
      --domains "$APP_HOST"
  fi
fi
[[ -f "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" ]] || fail "certificate chain is absent"
[[ -f "/etc/letsencrypt/live/${APP_HOST}/privkey.pem" ]] || fail "certificate key is absent"
openssl x509 -in "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" -noout -checkend 86400 >/dev/null
openssl x509 -in "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" -noout -ext subjectAltName | grep -Fq "DNS:${APP_HOST}"
if [[ "$phase" == "initial" ]]; then
  record_phase certificate-ready
fi

# On resume, compare every installed value with shell built-ins. No secret is placed
# in grep, env, systemd, or process arguments during this comparison.
if [[ "$phase" == "certificate-ready" ]]; then
  if [[ ! -e "$ENV_PATH" && ! -L "$ENV_PATH" ]]; then
    readonly ENV_TEMP="${ENV_PATH}.prod03b-new"
    [[ ! -e "$ENV_TEMP" && ! -L "$ENV_TEMP" ]] || fail "environment staging path already exists"
    {
      printf '%s\n' \
        'NODE_ENV=production' \
        'HOST=127.0.0.1' \
        'PORT=3000' \
        'LOG_LEVEL=info' \
        "APP_ORIGIN=https://${APP_HOST}" \
        "DATABASE_PATH=${DATABASE_PATH}" \
        "MIGRATIONS_DIRECTORY=${RELEASE_PATH}/database/migrations" \
        'STORAGE_PROVIDER=aliyun-oss' \
        "OSS_ENDPOINT=${OSS_ENDPOINT}" \
        "OSS_REGION=${OSS_REGION}" \
        "OSS_BUCKET=${OSS_BUCKET}" \
        "OSS_ACCESS_KEY_ID=${access_key_id}" \
        "OSS_ACCESS_KEY_SECRET=${access_key_secret}" \
        'OSS_UPLOAD_AUTHORIZATION_SECONDS=300' \
        'OSS_DOWNLOAD_AUTHORIZATION_SECONDS=300' \
        'OSS_REQUEST_TIMEOUT_MILLISECONDS=30000'
    } >"$ENV_TEMP"
    chown root:root "$ENV_TEMP"
    chmod 0600 "$ENV_TEMP"
    mv -T -- "$ENV_TEMP" "$ENV_PATH"
  fi
  [[ -f "$ENV_PATH" && ! -L "$ENV_PATH" && "$(stat -c '%u:%g:%a' -- "$ENV_PATH")" == "0:0:600" ]] || fail "environment publication is incomplete"
  record_phase environment-ready
fi

if [[ "$phase" != "initial" && "$phase" != "certificate-ready" ]]; then
  [[ -f "$ENV_PATH" && ! -L "$ENV_PATH" && "$(stat -c '%u:%g:%a' -- "$ENV_PATH")" == "0:0:600" ]] || fail "installed environment has unsafe identity"
  expected_environment=(
    'NODE_ENV=production'
    'HOST=127.0.0.1'
    'PORT=3000'
    'LOG_LEVEL=info'
    "APP_ORIGIN=https://${APP_HOST}"
    "DATABASE_PATH=${DATABASE_PATH}"
    "MIGRATIONS_DIRECTORY=${RELEASE_PATH}/database/migrations"
    'STORAGE_PROVIDER=aliyun-oss'
    "OSS_ENDPOINT=${OSS_ENDPOINT}"
    "OSS_REGION=${OSS_REGION}"
    "OSS_BUCKET=${OSS_BUCKET}"
    "OSS_ACCESS_KEY_ID=${access_key_id}"
    "OSS_ACCESS_KEY_SECRET=${access_key_secret}"
    'OSS_UPLOAD_AUTHORIZATION_SECONDS=300'
    'OSS_DOWNLOAD_AUTHORIZATION_SECONDS=300'
    'OSS_REQUEST_TIMEOUT_MILLISECONDS=30000'
  )
  installed_line_count=0
  while IFS= read -r installed_line; do
    [[ "$installed_line_count" -lt "${#expected_environment[@]}" ]] || fail "installed environment has extra lines"
    [[ "$installed_line" == "${expected_environment[$installed_line_count]}" ]] || fail "installed environment differs from the exact protected configuration"
    installed_line_count=$((installed_line_count + 1))
  done <"$ENV_PATH"
  [[ "$installed_line_count" -eq "${#expected_environment[@]}" ]] || fail "installed environment line count mismatch"
  expected_environment=()
  installed_line=''
fi

run_production_operation() {
  local unit="$1"
  shift
  [[ "$(systemctl show -p LoadState --value "${unit}.service")" == "not-found" ]] || fail "transient unit already exists: ${unit}"
  systemd-run --quiet --wait --collect --pipe \
    --unit="$unit" \
    --property=User=academiccloud \
    --property=Group=academiccloud \
    --property=UMask=0077 \
    --property=PrivateNetwork=true \
    --property=RuntimeMaxSec=180 \
    --property=KillMode=control-group \
    --property=NoNewPrivileges=true \
    --property=ProtectSystem=strict \
    --property=ProtectHome=true \
    --property="ReadWritePaths=/var/lib/academiccloud" \
    --property="EnvironmentFile=${ENV_PATH}" \
    --working-directory="${RELEASE_PATH}/backend" \
    "$@"
}

if [[ "$phase" == "environment-ready" ]]; then
  run_production_operation academiccloud-prod03b-migrate \
    /usr/bin/node "${RELEASE_PATH}/backend/dist/persistence/sqlite/migrate.js"
  [[ -f "$DATABASE_PATH" && ! -L "$DATABASE_PATH" && "$(stat -c '%U:%G:%a' -- "$DATABASE_PATH")" == "academiccloud:academiccloud:600" ]] || fail "production database identity mismatch"
  record_phase database-migrated
fi

account_probe() {
  /usr/bin/node --input-type=module - "$DATABASE_PATH" "$RELEASE_PATH" <<'NODE'
import { createRequire } from "node:module";
const [databasePath, releasePath] = process.argv.slice(2);
const require = createRequire(`${releasePath}/package.json`);
const Database = require("better-sqlite3");
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const rows = database.prepare("select login_name as loginName from accounts order by login_name").all();
  process.stdout.write(`${JSON.stringify(rows)}\n`);
} finally {
  database.close();
}
NODE
}

if [[ "$phase" == "database-migrated" ]]; then
  account_rows="$(account_probe)"
  if [[ "$account_rows" == "[]" ]]; then
    printf '%s\n' "$initial_password" | run_production_operation academiccloud-prod03b-account \
      /usr/bin/node "${RELEASE_PATH}/backend/dist/operations/account-main.js" \
      "--login=${login_name}" --password-stdin
    account_rows="$(account_probe)"
  fi
  export ACCOUNT_ROWS="$account_rows" LOGIN_NAME="$login_name"
  /usr/bin/node --input-type=module - <<'NODE'
const rows = JSON.parse(process.env.ACCOUNT_ROWS);
if (rows.length !== 1 || rows[0].loginName !== process.env.LOGIN_NAME) {
  throw new Error("production account state differs from the exact initial account");
}
NODE
  unset ACCOUNT_ROWS LOGIN_NAME
  record_phase account-provisioned
fi

printf '%s' "$initial_password" | /usr/bin/node --input-type=module -e '
import { createRequire } from "node:module";
const [databasePath, releasePath, loginName] = process.argv.slice(1);
let password = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) password += chunk;
const require = createRequire(`${releasePath}/package.json`);
const Database = require("better-sqlite3");
const argon2 = require("argon2");
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const row = database.prepare("select password_hash as passwordHash from accounts where login_name = ?").get(loginName);
  if (!row || !(await argon2.verify(row.passwordHash, password))) {
    throw new Error("Owner input does not authenticate the exact initial account");
  }
} finally {
  database.close();
}
' "$DATABASE_PATH" "$RELEASE_PATH" "$login_name"
initial_password=''

if [[ "$phase" == "account-provisioned" ]]; then
  systemctl start academiccloud.service
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/health >/dev/null; then
      break
    fi
    if [[ "$attempt" -eq 30 ]]; then
      fail "loopback health did not become ready; state is preserved for recovery"
    fi
    sleep 1
  done
  curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/ready >/dev/null
  if ss -lntH 'sport = :3000' | awk '{print $4}' | grep -Evq '^(127\.0\.0\.1|\[::1\]):3000$'; then
    fail "application listener is not loopback-only"
  fi
  record_phase loopback-ready
fi

[[ "$phase" == "loopback-ready" ]] || fail "activation did not reach loopback-ready"
[[ "$(systemctl is-active academiccloud.service)" == "active" ]] || fail "application service is not active"
curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/health >/dev/null
curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/ready >/dev/null
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "public route changed during loopback activation"

printf 'activation-status=ok\nphase=loopback-ready\naccountLogin=%s\ncertificateDomain=%s\nservice=active-loopback-only\npublicRoute=unchanged\n' "$login_name" "$APP_HOST"
