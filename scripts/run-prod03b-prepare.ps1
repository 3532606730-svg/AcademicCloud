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
$evidenceDirectory = Join-Path $repositoryRoot 'output/prod-03b-prepare-evidence'
$evidencePath = Join-Path $evidenceDirectory 'activation-update-evidence.txt'
$expectedOldSha256 = 'b4e36d8070ff99a45393e251d94f2248b7803c74417175853fdae260909be01f'
$expectedNewSha256 = '98dbc9cfd676a3e784cb802a1a52e1b0058a249ce36ebe4969278f8bff31a660'
$expectedOwnerWrapperSha256 = '3e7b66b6026b794d7ad339d9f2e90f7edc79c13df1ef1f40445274590b8780e6'

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
    '-o', 'RequestTTY=no'
    '-o', 'ConnectTimeout=15'
    '-o', 'ServerAliveInterval=15'
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
            throw 'Strict SSH preparation operation exceeded its reviewed time bound.'
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

$stage = (& ssh.exe @sshOptions $SshAlias "/usr/bin/env bash -c 'set -Eeuo pipefail; umask 077; stage=`$(mktemp -d /var/tmp/academiccloud-prod03b-XXXXXXXX); [[ `"`$stage`" =~ ^/var/tmp/academiccloud-prod03b-[A-Za-z0-9]{8}`$ ]]; [[ `"`$(stat -c %u:%g:%a -- `"`$stage`")`" == 0:0:700 ]]; printf %s `"`$stage`"'").Trim()
if ($LASTEXITCODE -ne 0 -or $stage -notmatch '^/var/tmp/academiccloud-prod03b-[A-Za-z0-9]{8}$') {
    throw 'Failed to create the exact root-owned PROD-03B preparation stage.'
}

Write-Host "Created non-secret preparation stage: $stage"
& scp.exe @scpOptions $activationPath "${SshAlias}:$stage/alibaba-production-activate.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Activation transfer failed; preserved exact non-secret stage $stage for diagnosis."
}

$remoteUpdate = @'
set -Eeuo pipefail
set +x
umask 077

stage="$1"
expected_new="$2"
expected_old="$3"
target=/etc/academiccloud/prepared/alibaba-production-activate.sh
incoming="${stage}/alibaba-production-activate.sh"
backup="${stage}/activation.before"
evidence="${stage}/activation-update-evidence.txt"
temporary="${target}.prod03b-new"
published=0

fail() {
  printf 'prepare error: %s\n' "$*" >&2
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
[[ "$stage" =~ ^/var/tmp/academiccloud-prod03b-[A-Za-z0-9]{8}$ ]] || fail 'unsafe stage path'
[[ "$(readlink -f -- "$stage")" == "$stage" && "$(stat -c '%u:%g:%a' -- "$stage")" == '0:0:700' ]] || fail 'unsafe stage identity'
[[ "$expected_new" =~ ^[0-9a-f]{64}$ && "$expected_old" =~ ^[0-9a-f]{64}$ && "$expected_new" != "$expected_old" ]] || fail 'unsafe script identity arguments'
[[ -f "$incoming" && ! -L "$incoming" && "$(stat -c '%u:%g' -- "$incoming")" == '0:0' ]] || fail 'unsafe transferred activation file'
[[ "$(sha256sum "$incoming" | awk '{print $1}')" == "$expected_new" ]] || fail 'transferred activation SHA-256 mismatch'
/bin/bash -n "$incoming"
[[ "$(readlink -f /opt/academiccloud/current)" == '/opt/academiccloud/releases/639baa9596a17f4160521f31440d9e3ac3b12eda' ]] || fail 'unexpected installed release'
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == 'disabled' ]] || fail 'service is not disabled'
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == 'inactive' && "$(systemctl show -p MainPID --value academiccloud.service)" == '0' ]] || fail 'service is not inactive'
[[ "$(systemctl is-enabled certbot.timer 2>/dev/null || true)" == 'disabled' && "$(systemctl is-active certbot.timer 2>/dev/null || true)" == 'inactive' ]] || fail 'renewal timer state changed'
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == 'default' ]] || fail 'active Nginx site state changed'
for absent in \
  /etc/academiccloud/academiccloud.env \
  /var/lib/academiccloud/academiccloud.sqlite \
  /etc/academiccloud/prepared/prod03b-activation-phase \
  /etc/academiccloud/prepared/prod03b-activation-evidence.txt \
  /etc/academiccloud/prepared/prod03b-resource-evidence.txt \
  /etc/academiccloud/prepared/prod03b-resource-samples.tsv \
  /etc/letsencrypt/live/cloud.ajtlab.top; do
  [[ ! -e "$absent" && ! -L "$absent" ]] || fail "unexpected activation state exists: ${absent}"
done
[[ -f "$target" && ! -L "$target" && "$(stat -c '%u:%g:%a' -- "$target")" == '0:0:600' ]] || fail 'installed activation file identity is unsafe'
before_sha256="$(sha256sum "$target" | awk '{print $1}')"
[[ "$before_sha256" == "$expected_old" || "$before_sha256" == "$expected_new" ]] || fail 'installed activation file is outside the reviewed update chain'
cp --preserve=mode,ownership,timestamps -- "$target" "$backup"
chown root:root "$backup"
chmod 0600 "$backup"
if [[ "$before_sha256" != "$expected_new" ]]; then
  install -o root -g root -m 0600 "$incoming" "$temporary"
  /bin/bash -n "$temporary"
  [[ "$(sha256sum "$temporary" | awk '{print $1}')" == "$expected_new" ]] || fail 'prepared activation SHA-256 mismatch'
  mv -T -- "$temporary" "$target"
  published=1
fi
[[ "$(sha256sum "$target" | awk '{print $1}')" == "$expected_new" && "$(stat -c '%u:%g:%a' -- "$target")" == '0:0:600' ]] || fail 'activation publication failed'
/bin/bash -n "$target"
{
  printf 'status=ok\n'
  printf 'beforeSha256=%s\n' "$before_sha256"
  printf 'afterSha256=%s\n' "$expected_new"
  printf 'service=disabled-inactive\n'
  printf 'renewalTimer=disabled-inactive\n'
  printf 'publicRoute=unchanged-default-only\n'
  printf 'activationState=absent\n'
} >"$evidence"
chown root:root "$evidence"
chmod 0600 "$evidence"
published=0
trap - EXIT
'@

$remoteCommand = "/bin/bash -s -- '$stage' '$expectedNewSha256' '$expectedOldSha256'"
$updateResult = Invoke-StrictSshInput -RemoteCommand $remoteCommand -InputText $remoteUpdate
if ($updateResult.ExitCode -ne 0) {
    if ($updateResult.StandardError) {
        [Console]::Error.WriteLine($updateResult.StandardError.Trim())
    }
    throw "Activation update failed; rollback was attempted and exact non-secret stage $stage is preserved for diagnosis."
}

New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
if (Test-Path -LiteralPath $evidencePath) {
    throw "Local evidence path already exists: $evidencePath"
}
& scp.exe @scpOptions "${SshAlias}:$stage/activation-update-evidence.txt" $evidencePath
if ($LASTEXITCODE -ne 0) {
    throw "Evidence retrieval failed; exact non-secret stage $stage is preserved."
}
$evidenceSha256 = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
$evidenceLines = @(Get-Content -LiteralPath $evidencePath)
if (
    $evidenceLines.Count -ne 7 -or
    $evidenceLines[0] -cne 'status=ok' -or
    $evidenceLines[1] -notmatch '^beforeSha256=[0-9a-f]{64}$' -or
    ($evidenceLines[1] -cne "beforeSha256=$expectedOldSha256" -and $evidenceLines[1] -cne "beforeSha256=$expectedNewSha256") -or
    $evidenceLines[2] -cne "afterSha256=$expectedNewSha256" -or
    $evidenceLines[3] -cne 'service=disabled-inactive' -or
    $evidenceLines[4] -cne 'renewalTimer=disabled-inactive' -or
    $evidenceLines[5] -cne 'publicRoute=unchanged-default-only' -or
    $evidenceLines[6] -cne 'activationState=absent'
) {
    throw "Retrieved activation evidence is not the exact reviewed seven-line record; exact stage $stage is preserved."
}

$cleanupCommand = "/bin/bash -s -- '$stage' '$expectedNewSha256' '$evidenceSha256'"
$cleanupScript = @'
set -Eeuo pipefail
stage="$1"
expected_new="$2"
expected_evidence="$3"
[[ "$(id -u)" -eq 0 ]]
[[ "$stage" =~ ^/var/tmp/academiccloud-prod03b-[A-Za-z0-9]{8}$ ]]
[[ "$(readlink -f -- "$stage")" == "$stage" && "$(stat -c '%u:%g:%a' -- "$stage")" == '0:0:700' ]]
[[ "$(find "$stage" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == $'activation-update-evidence.txt\nactivation.before\nalibaba-production-activate.sh' ]]
[[ "$(sha256sum "$stage/activation-update-evidence.txt" | awk '{print $1}')" == "$expected_evidence" ]]
[[ "$(sha256sum /etc/academiccloud/prepared/alibaba-production-activate.sh | awk '{print $1}')" == "$expected_new" ]]
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

Write-Host "PROD-03B non-secret activation update passed."
Write-Host "Activation SHA-256: $expectedNewSha256"
Write-Host "Evidence SHA-256: $evidenceSha256"
Write-Host 'Service remains disabled/inactive; no secret, certificate, database, account, public route, or object operation occurred.'
