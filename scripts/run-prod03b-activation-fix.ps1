[CmdletBinding()]
param(
    [string]$SshAlias = 'academiccloud-prod'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($SshAlias -notmatch '^[A-Za-z0-9._-]+$') {
    throw 'SSH alias contains unsupported characters.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$activationPath = Join-Path $PSScriptRoot 'alibaba-production-activate.sh'
$ownerWrapperPath = Join-Path $PSScriptRoot 'production-owner-bootstrap.ps1'
$evidenceDirectory = Join-Path $repositoryRoot 'output/prod-03b-activation-fix'
$evidencePath = Join-Path $evidenceDirectory 'activation-fix-evidence.txt'
$expectedCurrentSha256 = '98dbc9cfd676a3e784cb802a1a52e1b0058a249ce36ebe4969278f8bff31a660'
$expectedNewSha256 = '944c1ee5c856ee101569f041187e57fbe9d8e9da63191af7aa37063caa3ba62b'
$expectedOwnerWrapperSha256 = 'c27cdc19eabc70b4284e44ab78936bd722f61aefe8e68f21dc50d2bcb6228654'

foreach ($path in @($activationPath, $ownerWrapperPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required reviewed file is absent: $path"
    }
}

$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($ownerWrapperPath, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -ne 0) {
    throw 'The Owner wrapper failed PowerShell syntax validation.'
}

$actualActivationSha256 = (Get-FileHash -LiteralPath $activationPath -Algorithm SHA256).Hash.ToLowerInvariant()
$actualOwnerWrapperSha256 = (Get-FileHash -LiteralPath $ownerWrapperPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualActivationSha256 -cne $expectedNewSha256 -or $actualOwnerWrapperSha256 -cne $expectedOwnerWrapperSha256) {
    throw 'A reviewed activation or Owner-wrapper file changed after independent identity pinning.'
}

$sshOptions = @(
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ClearAllForwardings=yes',
    '-o', 'RequestTTY=no',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-T'
)
$scpOptions = @(
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ClearAllForwardings=yes',
    '-o', 'RequestTTY=no',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3'
)

function Invoke-StrictSshInput {
    param(
        [Parameter(Mandatory)][string]$RemoteCommand,
        [Parameter(Mandatory)][string]$InputText
    )

    if ($RemoteCommand.Contains('"')) {
        throw 'Remote command contains an unsupported quote character.'
    }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'ssh.exe'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Arguments = "-o BatchMode=yes -o StrictHostKeyChecking=yes -o ClearAllForwardings=yes -o RequestTTY=no -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -T $SshAlias `"$RemoteCommand`""
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Failed to start strict SSH input process.'
    }
    try {
        $process.StandardInput.NewLine = "`n"
        $process.StandardInput.Write($InputText.Replace("`r`n", "`n"))
        $process.StandardInput.Close()
        $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
        $standardErrorTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(180000)) {
            $process.Kill()
            $process.WaitForExit()
            throw 'Strict SSH activation-fix operation exceeded its reviewed time bound.'
        }
        $standardOutput = $standardOutputTask.Result
        $standardError = $standardErrorTask.Result
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StandardOutput = $standardOutput
            StandardError = $standardError
        }
    }
    finally {
        $process.Dispose()
    }
}

$preflight = @'
set -Eeuo pipefail
fail() {
  printf 'activation-fix preflight error: %s\n' "$*" >&2
  exit 1
}
expected_current="$1"
expected_new="$2"
[[ "$expected_current" =~ ^[0-9a-f]{64}$ && "$expected_new" =~ ^[0-9a-f]{64}$ && "$expected_current" != "$expected_new" ]] || fail "unsafe identity arguments"
target=/etc/academiccloud/prepared/alibaba-production-activate.sh
[[ -f "$target" && ! -L "$target" && "$(stat -c '%u:%g:%a' -- "$target")" == '0:0:600' ]] || fail 'installed activation identity is unsafe'
before_sha256="$(sha256sum "$target" | awk '{print $1}')"
[[ "$before_sha256" == "$expected_current" ]] || fail 'installed activation is not the exact pre-fix reviewed identity'
[[ -f /etc/academiccloud/prepared/prod03b-activation-phase && ! -L /etc/academiccloud/prepared/prod03b-activation-phase && "$(stat -c '%u:%g:%a' -- /etc/academiccloud/prepared/prod03b-activation-phase)" == '0:0:600' ]] || fail 'phase file identity is unsafe'
phase_value="$(</etc/academiccloud/prepared/prod03b-activation-phase)"
[[ "$phase_value" == 'account-provisioned' ]] || fail "unexpected activation phase: ${phase_value}"
[[ -f /etc/academiccloud/academiccloud.env && ! -L /etc/academiccloud/academiccloud.env && "$(stat -c '%u:%g:%a' -- /etc/academiccloud/academiccloud.env)" == '0:0:600' ]] || fail 'production environment identity is unsafe'
[[ -f /var/lib/academiccloud/academiccloud.sqlite && ! -L /var/lib/academiccloud/academiccloud.sqlite && "$(stat -c '%U:%G:%a' -- /var/lib/academiccloud/academiccloud.sqlite)" == 'academiccloud:academiccloud:600' ]] || fail 'production database identity is unsafe'
[[ -d /etc/letsencrypt/live/cloud.ajtlab.top && ! -L /etc/letsencrypt/live/cloud.ajtlab.top ]] || fail 'production certificate directory is absent'
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == 'disabled' ]] || fail 'service is not disabled'
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == 'inactive' && "$(systemctl show -p MainPID --value academiccloud.service)" == '0' ]] || fail 'service is not inactive'
[[ "$(ss -lntH 'sport = :3000' | wc -l)" -eq 0 ]] || fail 'port 3000 listener exists'
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == 'default' ]] || fail 'active Nginx site state changed'
[[ "$(systemctl is-enabled certbot.timer 2>/dev/null || true)" == 'disabled' && "$(systemctl is-active certbot.timer 2>/dev/null || true)" == 'inactive' ]] || fail 'renewal timer state changed'
[[ "$(find /var/tmp -maxdepth 1 -name 'academiccloud-prod03b-fix-*' -printf '%f\n' | wc -l)" -eq 0 ]] || fail 'activation-fix stage residue exists'
account_check="$(/usr/bin/node --input-type=module -e '
import { createRequire } from "node:module";
const [databasePath, releasePath] = process.argv.slice(1);
const require = createRequire(`${releasePath}/package.json`);
const Database = require("better-sqlite3");
const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const rows = db.prepare("select password_hash as passwordHash from accounts").all();
  const structural = rows.length === 1 && String(rows[0].passwordHash).startsWith("$argon2id$v=19$m=") &&
    String(rows[0].passwordHash).split("$")[3].split(",").sort().join(",") === "m=65536,p=1,t=3";
  console.log(structural ? "ok" : "mismatch");
} finally { db.close(); }
' /var/lib/academiccloud/academiccloud.sqlite /opt/academiccloud/current)"
[[ "$account_check" == 'ok' ]] || fail 'stored account hash does not match the reviewed argon2 0.45.x structural format'
echo "preflight-ok"
stage="$(mktemp -d /var/tmp/academiccloud-prod03b-fix-XXXXXXXX)"
[[ "$stage" =~ ^/var/tmp/academiccloud-prod03b-fix-[A-Za-z0-9]{8}$ ]]
[[ "$(stat -c '%u:%g:%a' -- "$stage")" == '0:0:700' ]]
printf '%s\n' "$stage"
'@
$preflightCommand = "/bin/bash -s -- '$expectedCurrentSha256' '$expectedNewSha256'"
$preflightResult = Invoke-StrictSshInput -RemoteCommand $preflightCommand -InputText $preflight
if ($preflightResult.ExitCode -ne 0) {
    if ($preflightResult.StandardError) {
        [Console]::Error.WriteLine($preflightResult.StandardError.Trim())
    }
    throw 'Activation-fix preflight failed; no remote state was changed.'
}
$stageLines = @($preflightResult.StandardOutput -split "`r?`n" | Where-Object { $_ -match '^/var/tmp/academiccloud-prod03b-fix-[A-Za-z0-9]{8}$' })
if ($stageLines.Count -ne 1) {
    throw 'Failed to create the exact root-owned PROD-03B activation-fix stage.'
}
$stage = $stageLines[0]

Write-Host "Created non-secret activation-fix stage: $stage"
& scp.exe @scpOptions $activationPath "${SshAlias}:$stage/alibaba-production-activate.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Activation transfer failed; preserved exact non-secret stage $stage for diagnosis."
}

$remoteUpdate = @'
set -Eeuo pipefail
set +x
umask 077

stage="$1"
expected_current="$2"
expected_new="$3"
target=/etc/academiccloud/prepared/alibaba-production-activate.sh
incoming="${stage}/alibaba-production-activate.sh"
backup="${stage}/activation.before"
evidence="${stage}/activation-fix-evidence.txt"
temporary="${target}.prod03b-fix-new"
published=0

fail() {
  printf 'activation-fix error: %s\n' "$*" >&2
  exit 1
}

rollback() {
  exit_code=$?
  if [[ "$exit_code" -ne 0 && "$published" -eq 1 && -f "$backup" && ! -L "$backup" ]]; then
    install -o root -g root -m 0600 "$backup" "$temporary"
    mv -T -- "$temporary" "$target"
  fi
  rm -f -- "$temporary"
  exit "$exit_code"
}
trap rollback EXIT

[[ "$(id -u)" -eq 0 ]] || fail 'root identity required'
[[ "$stage" =~ ^/var/tmp/academiccloud-prod03b-fix-[A-Za-z0-9]{8}$ ]] || fail 'unsafe stage path'
[[ "$(readlink -f -- "$stage")" == "$stage" && "$(stat -c '%u:%g:%a' -- "$stage")" == '0:0:700' ]] || fail 'unsafe stage identity'
[[ "$expected_current" =~ ^[0-9a-f]{64}$ && "$expected_new" =~ ^[0-9a-f]{64}$ && "$expected_current" != "$expected_new" ]] || fail 'unsafe script identity arguments'
[[ -f "$incoming" && ! -L "$incoming" && "$(stat -c '%u:%g' -- "$incoming")" == '0:0' ]] || fail 'unsafe transferred activation file'
[[ "$(sha256sum "$incoming" | awk '{print $1}')" == "$expected_new" ]] || fail 'transferred activation SHA-256 mismatch'
/bin/bash -n "$incoming"

[[ -f "$target" && ! -L "$target" && "$(stat -c '%u:%g:%a' -- "$target")" == '0:0:600' ]] || fail 'installed activation identity is unsafe'
before_sha256="$(sha256sum "$target" | awk '{print $1}')"
[[ "$before_sha256" == "$expected_current" ]] || fail 'installed activation is not the exact pre-fix reviewed identity'
phase_value="$(</etc/academiccloud/prepared/prod03b-activation-phase)"
[[ "$phase_value" == 'account-provisioned' ]] || fail "unexpected activation phase: ${phase_value}"
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == 'inactive' && "$(systemctl show -p MainPID --value academiccloud.service)" == '0' ]] || fail 'service is not inactive'

cp --preserve=mode,ownership,timestamps -- "$target" "$backup"
chown root:root "$backup"
chmod 0600 "$backup"
install -o root -g root -m 0600 "$incoming" "$temporary"
/bin/bash -n "$temporary"
[[ "$(sha256sum "$temporary" | awk '{print $1}')" == "$expected_new" ]] || fail 'prepared activation SHA-256 mismatch'
mv -T -- "$temporary" "$target"
published=1
[[ "$(sha256sum "$target" | awk '{print $1}')" == "$expected_new" && "$(stat -c '%u:%g:%a' -- "$target")" == '0:0:600' ]] || fail 'activation publication failed'
/bin/bash -n "$target"
{
  printf 'status=ok\n'
  printf 'beforeSha256=%s\n' "$before_sha256"
  printf 'afterSha256=%s\n' "$expected_new"
  printf 'phase=%s\n' "$phase_value"
  printf 'service=disabled-inactive\n'
  printf 'publicRoute=unchanged-default-only\n'
  printf 'accountHashStructural=ok\n'
} >"$evidence"
chown root:root "$evidence"
chmod 0600 "$evidence"
published=0
trap - EXIT
'@

$remoteCommand = "/bin/bash -s -- '$stage' '$expectedCurrentSha256' '$expectedNewSha256'"
$updateResult = Invoke-StrictSshInput -RemoteCommand $remoteCommand -InputText $remoteUpdate
if ($updateResult.ExitCode -ne 0) {
    if ($updateResult.StandardError) {
        [Console]::Error.WriteLine($updateResult.StandardError.Trim())
    }
    throw "Activation-fix publication failed; rollback was attempted and exact non-secret stage $stage is preserved for diagnosis."
}

New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
if (Test-Path -LiteralPath $evidencePath) {
    throw "Local evidence path already exists: $evidencePath"
}
& scp.exe @scpOptions "${SshAlias}:$stage/activation-fix-evidence.txt" $evidencePath
if ($LASTEXITCODE -ne 0) {
    throw "Evidence retrieval failed; exact non-secret stage $stage is preserved."
}
$evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
$evidenceLines = @(Get-Content -LiteralPath $evidencePath)
if (
    $evidenceLines.Count -ne 7 -or
    $evidenceLines[0] -cne 'status=ok' -or
    $evidenceLines[1] -cne "beforeSha256=$expectedCurrentSha256" -or
    $evidenceLines[2] -cne "afterSha256=$expectedNewSha256" -or
    $evidenceLines[3] -cne 'phase=account-provisioned' -or
    $evidenceLines[4] -cne 'service=disabled-inactive' -or
    $evidenceLines[5] -cne 'publicRoute=unchanged-default-only' -or
    $evidenceLines[6] -cne 'accountHashStructural=ok'
) {
    throw "Retrieved activation-fix evidence is not the exact reviewed seven-line record; exact stage $stage is preserved."
}

$cleanupCommand = "/bin/bash -s -- '$stage' '$expectedNewSha256' '$evidenceSha256'"
$cleanupScript = @'
set -Eeuo pipefail
stage="$1"
expected_new="$2"
expected_evidence="$3"
[[ "$(id -u)" -eq 0 ]]
[[ "$stage" =~ ^/var/tmp/academiccloud-prod03b-fix-[A-Za-z0-9]{8}$ ]]
[[ "$(readlink -f -- "$stage")" == "$stage" && "$(stat -c '%u:%g:%a' -- "$stage")" == '0:0:700' ]]
[[ "$(find "$stage" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == $'activation-fix-evidence.txt\nactivation.before\nalibaba-production-activate.sh' ]]
[[ "$(sha256sum "$stage/activation-fix-evidence.txt" | awk '{print $1}')" == "$expected_evidence" ]]
[[ "$(sha256sum /etc/academiccloud/prepared/alibaba-production-activate.sh | awk '{print $1}')" == "$expected_new" ]]
[[ "$(</etc/academiccloud/prepared/prod03b-activation-phase)" == 'account-provisioned' ]]
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == 'inactive' ]]
stage_reference=''
for proc_link in /proc/[0-9]*/cwd /proc/[0-9]*/root /proc/[0-9]*/exe /proc/[0-9]*/fd/*; do
  [[ -L "$proc_link" ]] || continue
  resolved_link="$(readlink -f -- "$proc_link" 2>/dev/null || true)"
  if [[ "$resolved_link" == "$stage" || "$resolved_link" == "$stage/"* ]]; then
    stage_reference="$proc_link"
    break
  fi
done
[[ -z "$stage_reference" ]]
rm -rf -- "$stage"
[[ ! -e "$stage" && ! -L "$stage" ]]
'@
$cleanupResult = Invoke-StrictSshInput -RemoteCommand $cleanupCommand -InputText $cleanupScript
if ($cleanupResult.ExitCode -ne 0) {
    if ($cleanupResult.StandardError) {
        [Console]::Error.WriteLine($cleanupResult.StandardError.Trim())
    }
    throw "Exact stage cleanup failed; do not use a glob or delete any other path. Inspect $stage."
}

$postCheckCommand = "/bin/bash -s -- '$expectedNewSha256'"
$postCheckScript = @'
set -Eeuo pipefail
expected_new="$1"
[[ "$(sha256sum /etc/academiccloud/prepared/alibaba-production-activate.sh | awk '{print $1}')" == "$expected_new" ]]
[[ "$(stat -c '%u:%g:%a' -- /etc/academiccloud/prepared/alibaba-production-activate.sh)" == '0:0:600' ]]
[[ "$(</etc/academiccloud/prepared/prod03b-activation-phase)" == 'account-provisioned' ]]
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == 'disabled' ]]
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == 'inactive' ]]
[[ "$(systemctl show -p MainPID --value academiccloud.service)" == '0' ]]
[[ "$(ss -lntH 'sport = :3000' | wc -l)" -eq 0 ]]
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == 'default' ]]
[[ "$(find /var/tmp -maxdepth 1 -name 'academiccloud-prod03b-fix-*' -printf '%f\n' | wc -l)" -eq 0 ]]
echo 'post-check-ok'
'@
$postCheckResult = Invoke-StrictSshInput -RemoteCommand $postCheckCommand -InputText $postCheckScript
if ($postCheckResult.ExitCode -ne 0) {
    if ($postCheckResult.StandardError) {
        [Console]::Error.WriteLine($postCheckResult.StandardError.Trim())
    }
    throw 'Post-install verification failed; inspect the exact remote state before proceeding.'
}
if (($postCheckResult.StandardOutput | Select-String -Pattern '^post-check-ok$') -eq $null) {
    throw 'Post-install verification marker missing; inspect the exact remote state before proceeding.'
}

Write-Host "PROD-03B activation fix installed."
Write-Host "Activation SHA-256: $expectedNewSha256"
Write-Host "Evidence SHA-256: $evidenceSha256"
Write-Host 'Phase remains account-provisioned; service disabled/inactive; no secret, database, account, certificate, environment, route, or object mutation occurred.'
