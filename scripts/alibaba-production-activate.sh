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
readonly EXACT_UNIT_SHA256="fed6c26d80ad070decf4ddeabb7f4af6d23c38c24d2494666c7bfe981e39500b"
readonly ACME_WEBROOT="/var/www/html"
readonly PHASE_PATH="/etc/academiccloud/prepared/prod03b-activation-phase"
readonly EVIDENCE_PATH="/etc/academiccloud/prepared/prod03b-activation-evidence.txt"
readonly RESOURCE_EVIDENCE_PATH="/etc/academiccloud/prepared/prod03b-resource-evidence.txt"
readonly RESOURCE_SAMPLES_PATH="/etc/academiccloud/prepared/prod03b-resource-samples.tsv"
readonly RESOURCE_SAMPLE_TEMP="/run/academiccloud-prod03b-resource-samples.tsv"
readonly RESOURCE_STOP_TEMP="/run/academiccloud-prod03b-resource-stop"

fail() {
  printf 'activation error: %s\n' "$*" >&2
  exit 1
}

read_memory_event() {
  local event_name="$1"
  local event_path="$2"
  local event_value
  event_value="$(awk -v expected="$event_name" '$1 == expected { print $2 }' "$event_path")"
  [[ "$event_value" =~ ^[0-9]+$ ]] || fail "memory event is unavailable: ${event_name}"
  printf '%s\n' "$event_value"
}

assert_value_absent_from_service_journal() {
  local value_label="$1"
  local forbidden_value="$2"
  local journal_line
  while IFS= read -r journal_line; do
    [[ "$journal_line" != *"$forbidden_value"* ]] || fail "private input appeared in the AcademicCloud service journal: ${value_label}"
  done <<<"$service_journal"
  journal_line=''
}

assert_login_absent_from_service_journal() {
  local journal_line
  local compact_login_field="\"loginName\":\"${login_name}\""
  local spaced_login_field="\"loginName\": \"${login_name}\""
  while IFS= read -r journal_line; do
    [[ "$journal_line" != *"$compact_login_field"* && "$journal_line" != *"$spaced_login_field"* ]] || fail "account login appeared in the AcademicCloud service journal"
  done <<<"$service_journal"
  compact_login_field=''
  spaced_login_field=''
  journal_line=''
}

record_phase() {
  local new_phase="$1"
  local temporary="${PHASE_PATH}.new"
  printf '%s\n' "$new_phase" >"$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
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
  # The phase file is the commit marker. Publish it only after the matching
  # evidence is complete so an interruption always resumes from a safe phase.
  mv -T -- "$temporary" "$PHASE_PATH"
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

sampler_pid=''
cleanup_memory() {
  if [[ -n "$sampler_pid" ]]; then
    : >"$RESOURCE_STOP_TEMP"
    wait "$sampler_pid" 2>/dev/null || true
    sampler_pid=''
  fi
  rm -f -- "$RESOURCE_SAMPLE_TEMP" "$RESOURCE_STOP_TEMP"
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
[[ "$login_name" =~ ^[A-Za-z0-9._@+-]{3,64}$ ]] || fail "login name must be 3-64 characters from the reviewed safe identifier set"
[[ ${#initial_password} -ge 12 && ${#initial_password} -le 1024 ]] || fail "password must contain 12-1024 characters"

[[ "$(readlink -f -- "$RELEASE_PATH")" == "$EXACT_RELEASE" ]] || fail "unexpected current release"
[[ -f /etc/systemd/system/academiccloud.service && ! -L /etc/systemd/system/academiccloud.service ]] || fail "production unit is absent"
[[ "$(sha256sum /etc/systemd/system/academiccloud.service | awk '{print $1}')" == "$EXACT_UNIT_SHA256" ]] || fail "production unit identity changed"
cmp --silent -- /etc/systemd/system/academiccloud.service "${EXACT_RELEASE}/deployment/systemd/academiccloud.service" || fail "installed and artifact systemd units differ"
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
[[ -f "/etc/letsencrypt/live/${APP_HOST}/cert.pem" ]] || fail "certificate leaf is absent"
[[ -f "/etc/letsencrypt/live/${APP_HOST}/chain.pem" ]] || fail "certificate issuer chain is absent"
[[ -f "/etc/letsencrypt/live/${APP_HOST}/privkey.pem" ]] || fail "certificate key is absent"
openssl x509 -in "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" -noout -checkend 2592000 >/dev/null
openssl x509 -in "/etc/letsencrypt/live/${APP_HOST}/cert.pem" -noout -checkhost "$APP_HOST" >/dev/null
cmp --silent -- <(cat "/etc/letsencrypt/live/${APP_HOST}/cert.pem" "/etc/letsencrypt/live/${APP_HOST}/chain.pem") "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" || fail "full certificate chain does not exactly contain the reviewed leaf and issuer chain"
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt \
  -untrusted "/etc/letsencrypt/live/${APP_HOST}/chain.pem" \
  "/etc/letsencrypt/live/${APP_HOST}/cert.pem" >/dev/null
mapfile -t certificate_dns_names < <(
  openssl x509 -in "/etc/letsencrypt/live/${APP_HOST}/cert.pem" -noout -ext subjectAltName |
    tr ',' '\n' |
    sed -n 's/^[[:space:]]*DNS://p'
)
[[ "${#certificate_dns_names[@]}" -eq 1 && "${certificate_dns_names[0]}" == "$APP_HOST" ]] || fail "certificate SAN set is not the exact production hostname"
certificate_dns_names=()
certificate_public_key_sha256="$(openssl x509 -in "/etc/letsencrypt/live/${APP_HOST}/fullchain.pem" -noout -pubkey | sha256sum | awk '{print $1}')"
private_public_key_sha256="$(openssl pkey -in "/etc/letsencrypt/live/${APP_HOST}/privkey.pem" -pubout | sha256sum | awk '{print $1}')"
[[ "$certificate_public_key_sha256" == "$private_public_key_sha256" ]] || fail "certificate and private key do not match"
certificate_public_key_sha256=''
private_public_key_sha256=''
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
    --setenv=NODE_ENV=production \
    --setenv="DATABASE_PATH=${DATABASE_PATH}" \
    --setenv="MIGRATIONS_DIRECTORY=${RELEASE_PATH}/database/migrations" \
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
      "--login=${login_name}" --password-stdin >/dev/null
    account_rows="$(account_probe)"
  fi
  printf '%s' "$account_rows" | /usr/bin/node --input-type=module -e '
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const rows = JSON.parse(input);
if (rows.length !== 1 || rows[0].loginName !== process.argv[1]) {
  throw new Error("production account state differs from the exact initial account");
}
' "$login_name"
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
  const hashParts = String(row ? row.passwordHash : "").split("$");
  const parametersMatch = hashParts.length >= 5 && hashParts[1] === "argon2id" && hashParts[2] === "v=19" &&
    hashParts[3].split(",").sort().join(",") === "m=65536,p=1,t=3";
  if (!row || !parametersMatch || !(await argon2.verify(row.passwordHash, password))) {
    throw new Error("Owner input does not authenticate the exact initial account");
  }
  database.pragma("foreign_keys = ON");
  const journalMode = database.pragma("journal_mode", { simple: true });
  const synchronous = database.pragma("synchronous", { simple: true });
  const foreignKeys = database.pragma("foreign_keys", { simple: true });
  const integrity = database.pragma("integrity_check", { simple: true });
  const foreignKeyViolations = database.pragma("foreign_key_check");
  const migrationState = database.prepare("select count(*) as count, max(version) as version from schema_migrations").get();
  if (journalMode !== "wal" || synchronous !== 2 || foreignKeys !== 1 || integrity !== "ok" || foreignKeyViolations.length !== 0 || migrationState.count !== 4 || migrationState.version !== 4) {
    throw new Error("production SQLite durability, integrity, or migration state is invalid");
  }
} finally {
  database.close();
}
' "$DATABASE_PATH" "$RELEASE_PATH" "$login_name"
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
  [[ "$(ss -lntH 'sport = :3000' | awk '{print $4}' | sort -u)" == "127.0.0.1:3000" ]] || fail "application listener is not exact loopback-only"
fi

[[ "$(systemctl is-active academiccloud.service)" == "active" ]] || fail "application service is not active"
curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/health >/dev/null
curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3000/api/ready >/dev/null
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "public route changed during loopback activation"

if [[ "$phase" == "account-provisioned" ]]; then
  session_acceptance_exit=0
  printf '%s' "$initial_password" | /usr/bin/node --input-type=module -e '
import { spawnSync } from "node:child_process";
const [loginName, origin] = process.argv.slice(1);
let password = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) password += chunk;
const baseUrl = "http://127.0.0.1:3000";
const waitForEndpoint = async (path) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`production endpoint did not recover: ${path}`);
};
const checkedCookie = (response) => {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const parts = setCookie.split(";").map((part) => part.trim());
  const lower = parts.map((part) => part.toLowerCase());
  if (!parts[0]?.startsWith("__Host-ac_session=") || !lower.includes("secure") || !lower.includes("httponly") || !lower.includes("samesite=strict") || !lower.includes("path=/") || lower.some((part) => part.startsWith("domain="))) {
    throw new Error("production session cookie policy mismatch");
  }
  return parts[0];
};
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ loginName, password }),
});
password = "";
if (login.status !== 200) throw new Error(`loopback login failed with status ${login.status}`);
const loginBody = await login.json();
if (loginBody?.account?.loginName !== loginName) throw new Error("loopback login account mismatch");
const cookie = checkedCookie(login);
const beforeRestart = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
if (beforeRestart.status !== 200 || (await beforeRestart.json())?.account?.loginName !== loginName) throw new Error("pre-restart session check failed");
const restart = spawnSync("/usr/bin/systemctl", ["restart", "academiccloud.service"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 45_000,
});
if (restart.status !== 0) throw new Error("production service restart failed");
await waitForEndpoint("/api/health");
await waitForEndpoint("/api/ready");
const afterRestart = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
if (afterRestart.status !== 200 || (await afterRestart.json())?.account?.loginName !== loginName) throw new Error("persisted session check failed");
const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie, origin } });
if (logout.status !== 204) throw new Error(`loopback logout failed with status ${logout.status}`);
const clearCookie = logout.headers.get("set-cookie") ?? "";
if (!clearCookie.startsWith("__Host-ac_session=") || !/Max-Age=0/i.test(clearCookie)) throw new Error("logout cookie clearing policy mismatch");
const revoked = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
if (revoked.status !== 401) throw new Error("logged-out session remains valid");
process.stdout.write(`${JSON.stringify({ status: "ok", login: true, preRestartSession: true, sessionSurvivedRestart: true, readinessAfterRestart: true, logoutRevoked: true })}\n`);
' "$login_name" "https://${APP_HOST}" || session_acceptance_exit=$?
  [[ "$session_acceptance_exit" -eq 0 ]] || fail "real loopback restart/session acceptance failed"

  [[ ! -e "$RESOURCE_SAMPLE_TEMP" && ! -L "$RESOURCE_SAMPLE_TEMP" ]] || fail "resource sample staging path already exists"
  [[ ! -e "$RESOURCE_STOP_TEMP" && ! -L "$RESOURCE_STOP_TEMP" ]] || fail "resource sampler stop path already exists"
  control_group="$(systemctl show -p ControlGroup --value academiccloud.service)"
  [[ "$control_group" == "/system.slice/academiccloud.service" ]] || fail "unexpected production service cgroup"
  cgroup_path="/sys/fs/cgroup${control_group}"
  [[ -r "${cgroup_path}/memory.current" && -r "${cgroup_path}/memory.events" ]] || fail "production memory cgroup is unavailable"
  cgroup_inode_before="$(stat -c '%i' -- "$cgroup_path")"
  cgroup_high_before="$(read_memory_event high "${cgroup_path}/memory.events")"
  cgroup_max_before="$(read_memory_event max "${cgroup_path}/memory.events")"
  cgroup_oom_before="$(read_memory_event oom "${cgroup_path}/memory.events")"
  cgroup_oom_kill_before="$(read_memory_event oom_kill "${cgroup_path}/memory.events")"
  cgroup_oom_group_kill_before="$(read_memory_event oom_group_kill "${cgroup_path}/memory.events")"
  [[ "$cgroup_high_before" -eq 0 && "$cgroup_max_before" -eq 0 && "$cgroup_oom_before" -eq 0 && "$cgroup_oom_kill_before" -eq 0 && "$cgroup_oom_group_kill_before" -eq 0 ]] || fail "production cgroup already contains memory-pressure or OOM evidence"
  if ! current_boot_kernel_log="$(journalctl -k -b --no-pager 2>/dev/null)"; then
    fail "current-boot kernel journal could not be read before measured authentication"
  fi
  current_boot_oom_before="$(printf '%s\n' "$current_boot_kernel_log" | grep -Ei 'out of memory|killed process|oom-kill' || true)"
  current_boot_kernel_log=''
  [[ -z "$current_boot_oom_before" ]] || fail "current boot already contains kernel OOM evidence"
  resource_started_at="$(date --iso-8601=seconds)"
  : >"$RESOURCE_SAMPLE_TEMP"
  chown root:root "$RESOURCE_SAMPLE_TEMP"
  chmod 0600 "$RESOURCE_SAMPLE_TEMP"
  (
    while [[ ! -e "$RESOURCE_STOP_TEMP" ]]; do
      sample_mem_available="$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)"
      sample_swap_free="$(awk '$1 == "SwapFree:" { print $2 }' /proc/meminfo)"
      sample_cgroup_current=0
      if [[ -r "${cgroup_path}/memory.current" ]]; then
        sample_cgroup_current="$(<"${cgroup_path}/memory.current")"
      fi
      printf '%s\t%s\t%s\t%s\n' "$(date +%s%N)" "$sample_mem_available" "$sample_swap_free" "$sample_cgroup_current" >>"$RESOURCE_SAMPLE_TEMP"
      sleep 0.025
    done
  ) &
  sampler_pid=$!

  authentication_exit=0
  printf '%s' "$initial_password" | /usr/bin/node --input-type=module -e '
const [loginName, origin] = process.argv.slice(1);
let password = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) password += chunk;
const baseUrl = "http://127.0.0.1:3000";
const checkedCookie = (response) => {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const parts = setCookie.split(";").map((part) => part.trim());
  const lower = parts.map((part) => part.toLowerCase());
  if (!parts[0]?.startsWith("__Host-ac_session=") || !lower.includes("secure") || !lower.includes("httponly") || !lower.includes("samesite=strict") || !lower.includes("path=/") || lower.some((part) => part.startsWith("domain="))) {
    throw new Error("production session cookie policy mismatch");
  }
  return parts[0];
};
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ loginName, password }),
});
password = "";
if (login.status !== 200) throw new Error(`loopback login failed with status ${login.status}`);
const loginBody = await login.json();
if (loginBody?.account?.loginName !== loginName) throw new Error("loopback login account mismatch");
const cookie = checkedCookie(login);
const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
if (session.status !== 200) throw new Error(`measured session failed with status ${session.status}`);
const sessionBody = await session.json();
if (sessionBody?.account?.loginName !== loginName) throw new Error("measured session account mismatch");
const logout = await fetch(`${baseUrl}/api/auth/logout`, {
  method: "POST",
  headers: { cookie, origin },
});
if (logout.status !== 204) throw new Error(`loopback logout failed with status ${logout.status}`);
const clearCookie = logout.headers.get("set-cookie") ?? "";
if (!clearCookie.startsWith("__Host-ac_session=") || !/Max-Age=0/i.test(clearCookie)) throw new Error("logout cookie clearing policy mismatch");
const revoked = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
if (revoked.status !== 401) throw new Error("logged-out session remains valid");
process.stdout.write(`${JSON.stringify({ status: "ok", measuredLogin: true, currentSession: true, logoutRevoked: true })}\n`);
' "$login_name" "https://${APP_HOST}" || authentication_exit=$?
  : >"$RESOURCE_STOP_TEMP"
  sampler_exit=0
  wait "$sampler_pid" || sampler_exit=$?
  sampler_pid=''
  rm -f -- "$RESOURCE_STOP_TEMP"

  read -r sample_count cgroup_observed minimum_mem_available minimum_swap_free maximum_cgroup_current < <(
    awk -F '\t' '
      NR == 1 { minMem = $2; minSwap = $3 }
      { count += 1; if ($4 > 0) observed += 1; if ($2 < minMem) minMem = $2; if ($3 < minSwap) minSwap = $3; if ($4 > maxCurrent) maxCurrent = $4 }
      END { printf "%d %d %d %d %d\n", count, observed, minMem, minSwap, maxCurrent }
    ' "$RESOURCE_SAMPLE_TEMP"
  )
  cgroup_high_after="$(read_memory_event high "${cgroup_path}/memory.events")"
  cgroup_max_after="$(read_memory_event max "${cgroup_path}/memory.events")"
  cgroup_oom_after="$(read_memory_event oom "${cgroup_path}/memory.events")"
  cgroup_oom_kill_after="$(read_memory_event oom_kill "${cgroup_path}/memory.events")"
  cgroup_oom_group_kill_after="$(read_memory_event oom_group_kill "${cgroup_path}/memory.events")"
  [[ "$(systemctl show -p ControlGroup --value academiccloud.service)" == "$control_group" ]] || fail "production service cgroup changed during measured authentication"
  cgroup_inode_after="$(stat -c '%i' -- "$cgroup_path")"
  [[ "$cgroup_inode_after" == "$cgroup_inode_before" ]] || fail "production cgroup was recreated during measured authentication"
  cgroup_high_delta=$((cgroup_high_after - cgroup_high_before))
  cgroup_max_delta=$((cgroup_max_after - cgroup_max_before))
  cgroup_oom_delta=$((cgroup_oom_after - cgroup_oom_before))
  cgroup_oom_kill_delta=$((cgroup_oom_kill_after - cgroup_oom_kill_before))
  cgroup_oom_group_kill_delta=$((cgroup_oom_group_kill_after - cgroup_oom_group_kill_before))
  cgroup_memory_peak="$(<"${cgroup_path}/memory.peak")"
  systemd_memory_peak="$(systemctl show -p MemoryPeak --value academiccloud.service)"
  if ! measured_kernel_log="$(journalctl -k -b --since "$resource_started_at" --no-pager 2>/dev/null)"; then
    fail "bounded kernel journal could not be read after measured authentication"
  fi
  kernel_oom_evidence="$(printf '%s\n' "$measured_kernel_log" | grep -Ei 'out of memory|killed process|oom-kill' || true)"
  measured_kernel_log=''
  resource_finished_at="$(date --iso-8601=seconds)"
  sample_sha256="$(sha256sum "$RESOURCE_SAMPLE_TEMP" | awk '{print $1}')"
  resource_status=failed
  if [[ "$authentication_exit" -eq 0 && "$sampler_exit" -eq 0 &&
        "$sample_count" =~ ^[0-9]+$ && "$sample_count" -ge 3 &&
        "$cgroup_observed" =~ ^[0-9]+$ && "$cgroup_observed" -ge 1 &&
        "$minimum_mem_available" =~ ^[0-9]+$ && "$minimum_mem_available" -ge 131072 &&
        "$minimum_swap_free" =~ ^[0-9]+$ && "$minimum_swap_free" -gt 0 &&
        "$maximum_cgroup_current" =~ ^[0-9]+$ && "$maximum_cgroup_current" -gt 0 &&
        "$cgroup_memory_peak" =~ ^[0-9]+$ && "$cgroup_memory_peak" -gt 0 &&
        "$systemd_memory_peak" =~ ^[0-9]+$ && "$systemd_memory_peak" -gt 0 &&
        "$cgroup_high_delta" -eq 0 && "$cgroup_max_delta" -eq 0 &&
        "$cgroup_oom_delta" -eq 0 && "$cgroup_oom_kill_delta" -eq 0 && "$cgroup_oom_group_kill_delta" -eq 0 &&
        -z "$kernel_oom_evidence" ]]; then
    resource_status=ok
  fi
  install -o root -g root -m 0600 "$RESOURCE_SAMPLE_TEMP" "${RESOURCE_SAMPLES_PATH}.new"
  mv -T -- "${RESOURCE_SAMPLES_PATH}.new" "$RESOURCE_SAMPLES_PATH"
  {
    printf 'status=%s\n' "$resource_status"
    printf 'startedAt=%s\n' "$resource_started_at"
    printf 'finishedAt=%s\n' "$resource_finished_at"
    printf 'authenticationExit=%s\n' "$authentication_exit"
    printf 'samplerExit=%s\n' "$sampler_exit"
    printf 'sampleCount=%s\n' "$sample_count"
    printf 'cgroupObservedSamples=%s\n' "$cgroup_observed"
    printf 'minimumMemAvailableKiB=%s\n' "$minimum_mem_available"
    printf 'minimumSwapFreeKiB=%s\n' "$minimum_swap_free"
    printf 'maximumCgroupCurrentBytes=%s\n' "$maximum_cgroup_current"
    printf 'cgroupMemoryPeakBytes=%s\n' "$cgroup_memory_peak"
    printf 'systemdMemoryPeakBytes=%s\n' "$systemd_memory_peak"
    printf 'cgroupHighBefore=%s\n' "$cgroup_high_before"
    printf 'cgroupHighAfter=%s\n' "$cgroup_high_after"
    printf 'cgroupHighDelta=%s\n' "$cgroup_high_delta"
    printf 'cgroupMaxBefore=%s\n' "$cgroup_max_before"
    printf 'cgroupMaxAfter=%s\n' "$cgroup_max_after"
    printf 'cgroupMaxDelta=%s\n' "$cgroup_max_delta"
    printf 'cgroupOomBefore=%s\n' "$cgroup_oom_before"
    printf 'cgroupOomAfter=%s\n' "$cgroup_oom_after"
    printf 'cgroupOomDelta=%s\n' "$cgroup_oom_delta"
    printf 'cgroupOomKillBefore=%s\n' "$cgroup_oom_kill_before"
    printf 'cgroupOomKillAfter=%s\n' "$cgroup_oom_kill_after"
    printf 'cgroupOomKillDelta=%s\n' "$cgroup_oom_kill_delta"
    printf 'cgroupOomGroupKillBefore=%s\n' "$cgroup_oom_group_kill_before"
    printf 'cgroupOomGroupKillAfter=%s\n' "$cgroup_oom_group_kill_after"
    printf 'cgroupOomGroupKillDelta=%s\n' "$cgroup_oom_group_kill_delta"
    printf 'cgroupInode=%s\n' "$cgroup_inode_before"
    printf 'kernelOomEvidence=%s\n' "$([[ -z "$kernel_oom_evidence" ]] && printf absent || printf present)"
    printf 'sampleSha256=%s\n' "$sample_sha256"
  } >"${RESOURCE_EVIDENCE_PATH}.new"
  chown root:root "${RESOURCE_EVIDENCE_PATH}.new"
  chmod 0600 "${RESOURCE_EVIDENCE_PATH}.new"
  mv -T -- "${RESOURCE_EVIDENCE_PATH}.new" "$RESOURCE_EVIDENCE_PATH"
  rm -f -- "$RESOURCE_SAMPLE_TEMP"

  [[ "$resource_status" == "ok" ]] || fail "real authentication resource acceptance did not satisfy every gate"
  [[ "$authentication_exit" -eq 0 ]] || fail "real loopback authentication acceptance failed"
  [[ "$sampler_exit" -eq 0 && "$sample_count" -ge 3 && "$cgroup_observed" -ge 1 ]] || fail "resource sampling was incomplete"
  [[ "$minimum_mem_available" -ge 131072 ]] || fail "whole-host memory headroom fell below 128 MiB"
  [[ "$minimum_swap_free" -gt 0 ]] || fail "swap was exhausted during authentication acceptance"
  [[ "$maximum_cgroup_current" -gt 0 && "$cgroup_memory_peak" -gt 0 && "$systemd_memory_peak" -gt 0 ]] || fail "production cgroup memory evidence is incomplete"
  [[ "$cgroup_high_delta" -eq 0 && "$cgroup_max_delta" -eq 0 && "$cgroup_oom_delta" -eq 0 && "$cgroup_oom_kill_delta" -eq 0 && "$cgroup_oom_group_kill_delta" -eq 0 ]] || fail "production cgroup recorded memory-pressure or OOM evidence"
  [[ -z "$kernel_oom_evidence" ]] || fail "kernel OOM evidence appeared during authentication acceptance"
else
  [[ -f "$RESOURCE_EVIDENCE_PATH" && ! -L "$RESOURCE_EVIDENCE_PATH" && "$(stat -c '%u:%g:%a' -- "$RESOURCE_EVIDENCE_PATH")" == "0:0:600" ]] || fail "loopback-ready phase lacks protected resource evidence"
  grep -Fqx 'status=ok' "$RESOURCE_EVIDENCE_PATH" || fail "loopback-ready resource evidence is not successful"
fi

[[ "$phase" == "account-provisioned" || "$phase" == "loopback-ready" ]] || fail "activation did not reach the final loopback gate"
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == "disabled" ]] || fail "production service was enabled unexpectedly"
[[ "$(systemctl show -p User --value academiccloud.service)" == "academiccloud" ]] || fail "production service user changed"
[[ "$(systemctl show -p Group --value academiccloud.service)" == "academiccloud" ]] || fail "production service group changed"
[[ "$(systemctl show -p MemoryHigh --value academiccloud.service)" == "335544320" ]] || fail "production MemoryHigh changed"
[[ "$(systemctl show -p MemoryMax --value academiccloud.service)" == "402653184" ]] || fail "production MemoryMax changed"
[[ "$(systemctl show -p NoNewPrivileges --value academiccloud.service)" == "yes" ]] || fail "production NoNewPrivileges changed"
[[ "$(systemctl show -p PrivateTmp --value academiccloud.service)" == "yes" ]] || fail "production PrivateTmp changed"
[[ "$(systemctl show -p ProtectProc --value academiccloud.service)" == "invisible" ]] || fail "production ProtectProc changed"
[[ "$(systemctl show -p StateDirectory --value academiccloud.service)" == "academiccloud" ]] || fail "production StateDirectory changed"
[[ "$(systemctl is-enabled certbot.timer 2>/dev/null || true)" == "disabled" ]] || fail "certificate renewal timer was enabled prematurely"
[[ "$(systemctl is-active certbot.timer 2>/dev/null || true)" == "inactive" ]] || fail "certificate renewal timer became active prematurely"
[[ "$(ss -lntH 'sport = :3000' | awk '{print $4}' | sort -u)" == "127.0.0.1:3000" ]] || fail "final application listener is not exact loopback-only"

if ! service_journal="$(journalctl -u academiccloud.service -b --output=cat --no-pager 2>/dev/null)"; then
  fail "AcademicCloud current-boot service journal could not be read for private-input scanning"
fi
assert_value_absent_from_service_journal 'AccessKey secret' "$access_key_secret"
assert_value_absent_from_service_journal 'AccessKey ID' "$access_key_id"
assert_value_absent_from_service_journal 'ACME email' "$acme_email"
assert_login_absent_from_service_journal
assert_value_absent_from_service_journal 'plaintext password' "$initial_password"
service_journal=''
access_key_secret=''
access_key_id=''
acme_email=''
login_name=''
initial_password=''
if [[ "$phase" == "account-provisioned" ]]; then
  record_phase loopback-ready
fi
[[ "$phase" == "loopback-ready" ]] || fail "activation did not reach loopback-ready"
[[ -f "$EVIDENCE_PATH" && ! -L "$EVIDENCE_PATH" && "$(stat -c '%u:%g:%a' -- "$EVIDENCE_PATH")" == "0:0:600" ]] || fail "loopback-ready activation evidence is absent or unsafe"
grep -Fqx 'phase=loopback-ready' "$EVIDENCE_PATH" || fail "loopback-ready activation evidence does not match the committed phase"

printf 'activation-status=ok\nphase=loopback-ready\naccountVerified=true\ncertificateVerified=true\nservice=active-loopback-only\npublicRoute=unchanged\n'
