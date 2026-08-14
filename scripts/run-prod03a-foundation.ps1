[CmdletBinding()]
param(
    [string]$SshAlias = 'academiccloud-prod',
    [string]$ArtifactZip = 'output/prod-03a-artifact/artifact.zip',
    [string]$EvidenceDirectory = 'output/prod-03a-foundation-evidence'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($SshAlias -notmatch '^[A-Za-z0-9._-]+$') {
    throw 'SSH alias contains unsupported characters.'
}
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ClearAllForwardings=yes', '-o', 'RequestTTY=no', '-T')
$scpOptions = @('-q', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ClearAllForwardings=yes', '-o', 'RequestTTY=no')

$expectedZipSha256 = '6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe'
$artifactPath = (Resolve-Path -LiteralPath $ArtifactZip).Path
$evidencePath = [IO.Path]::GetFullPath((Join-Path $PWD $EvidenceDirectory))
if ((Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedZipSha256) {
    throw 'Local production artifact ZIP SHA-256 mismatch.'
}
if (Test-Path -LiteralPath $evidencePath) {
    throw "Evidence directory already exists: $evidencePath"
}

$transferFiles = [ordered]@{
    'alibaba-production-foundation.sh' = (Resolve-Path 'scripts/alibaba-production-foundation.sh').Path
    'alibaba-certbot-foundation.sh' = (Resolve-Path 'scripts/alibaba-certbot-foundation.sh').Path
    'alibaba-production-activate.sh' = (Resolve-Path 'scripts/alibaba-production-activate.sh').Path
    'production-owner-bootstrap.ps1' = (Resolve-Path 'scripts/production-owner-bootstrap.ps1').Path
}

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE."
    }
}

function Invoke-SshCapture {
    param([Parameter(Mandatory)][string]$RemoteCommand)
    $result = & ssh.exe @sshOptions $SshAlias $RemoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "SSH command failed with exit code $LASTEXITCODE."
    }
    return ($result -join "`n").Trim()
}

$readOnlyPreflight = @'
set -Eeuo pipefail
test "$(id -u)" = 0
test "$(systemctl is-system-running)" = running
test -z "$(systemctl --failed --no-legend)"
test "$(systemctl is-active nginx.service)" = active
test "$(systemctl is-active ssh.socket)" = active
test "$(node --version)" = v24.19.0
test "$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)" -ge 900000
test "$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)" -gt 0
test -z "$(dpkg --audit)"
apt-get check >/dev/null
test ! -e /opt/academiccloud
test ! -L /opt/academiccloud
test ! -e /etc/academiccloud
test ! -L /etc/academiccloud
test ! -e /var/lib/academiccloud
test ! -L /var/lib/academiccloud
test "$(systemctl show -p LoadState --value academiccloud.service)" = not-found
! journalctl -k -b --no-pager | grep -Eiq 'out of memory|oom-kill|killed process'
'@
Invoke-SshCapture $readOnlyPreflight | Out-Null

$stage = Invoke-SshCapture "umask 077; mktemp -d /var/tmp/academiccloud-prod03a-XXXXXXXX"
if ($stage -notmatch '^/var/tmp/academiccloud-prod03a-[A-Za-z0-9]{8}$') {
    throw "Remote mktemp returned an unsafe stage path: $stage"
}
Write-Host "PROD-03A stage: $stage"
$foundationInvoked = $false
try {

Invoke-NativeChecked -FilePath scp.exe -ArgumentList ($scpOptions + @('--', $artifactPath, "${SshAlias}:${stage}/artifact.zip"))
foreach ($entry in $transferFiles.GetEnumerator()) {
    Invoke-NativeChecked -FilePath scp.exe -ArgumentList ($scpOptions + @('--', $entry.Value, "${SshAlias}:${stage}/$($entry.Key)"))
}

$expectedHashes = [ordered]@{ 'artifact.zip' = $expectedZipSha256 }
foreach ($entry in $transferFiles.GetEnumerator()) {
    $expectedHashes[$entry.Key] = (Get-FileHash -LiteralPath $entry.Value -Algorithm SHA256).Hash.ToLowerInvariant()
}
foreach ($entry in $expectedHashes.GetEnumerator()) {
    $remoteHash = Invoke-SshCapture "sha256sum -- '${stage}/$($entry.Key)' | awk '{print `$1}'"
    if ($remoteHash -ne $entry.Value) {
        throw "Remote transfer SHA-256 mismatch: $($entry.Key)"
    }
}

$foundationExit = 0
$foundationInvoked = $true
& ssh.exe @sshOptions $SshAlias "timeout --signal=TERM --kill-after=30s 15m /bin/bash '${stage}/alibaba-production-foundation.sh' '$stage'"
$foundationExit = $LASTEXITCODE
if ($foundationExit -eq 0) {
    & ssh.exe @sshOptions $SshAlias "timeout --signal=TERM --kill-after=30s 20m /bin/bash '${stage}/alibaba-certbot-foundation.sh' '$stage'"
    $certbotExit = $LASTEXITCODE
}
else {
    $certbotExit = 125
}

New-Item -ItemType Directory -Path $evidencePath | Out-Null
$auditPreamble = @"
set -Eeuo pipefail
test "`$(systemctl is-system-running)" = running
test -z "`$(systemctl --failed --no-legend)"
test "`$(systemctl is-active nginx.service)" = active
test "`$(systemctl is-active ssh.socket)" = active
test "`$(find /etc/nginx -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print `$1}')" = cb5d4fbec0712ab7911dbd4973ca42b3305852d91da33d739e530099dd13670c
! ss -lntH 'sport = :3000' | grep -q .
! journalctl -k -b --no-pager | grep -Eiq 'out of memory|oom-kill|killed process'
"@
$auditReport = @"
printf 'capturedAt=%s\n' "`$(date --iso-8601=seconds)"
printf 'systemState=%s\n' "`$(systemctl is-system-running)"
printf 'failedUnits=%s\n' "`$(systemctl --failed --no-legend | wc -l)"
awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/ {print}' /proc/meminfo
printf 'nginxActive=%s\n' "`$(systemctl is-active nginx.service)"
printf 'sshActive=%s\n' "`$(systemctl is-active ssh.socket)"
printf 'appLoad=%s\n' "`$(systemctl show -p LoadState --value academiccloud.service 2>/dev/null || true)"
printf 'appEnabled=%s\n' "`$(systemctl is-enabled academiccloud.service 2>/dev/null || true)"
printf 'appActive=%s\n' "`$(systemctl is-active academiccloud.service 2>/dev/null || true)"
printf 'appMainPID=%s\n' "`$(systemctl show -p MainPID --value academiccloud.service 2>/dev/null || true)"
printf 'certbotTimerEnabled=%s\n' "`$(systemctl is-enabled certbot.timer 2>/dev/null || true)"
printf 'certbotTimerActive=%s\n' "`$(systemctl is-active certbot.timer 2>/dev/null || true)"
printf 'currentTarget=%s\n' "`$(readlink -f /opt/academiccloud/current 2>/dev/null || true)"
printf 'nginxTreeSha256=%s\n' "`$(find /etc/nginx -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print `$1}')"
nginx -t 2>&1
ss -lntup
journalctl -k -b --no-pager | grep -Ei 'out of memory|oom-kill|killed process' || true
"@
if ($foundationExit -ne 0) {
    $outcomeGates = @"
test ! -e /opt/academiccloud
test ! -L /opt/academiccloud
test ! -e /etc/academiccloud
test ! -L /etc/academiccloud
test ! -e /var/lib/academiccloud
test ! -L /var/lib/academiccloud
test "`$(systemctl show -p LoadState --value academiccloud.service)" = not-found
"@
}
elseif ($certbotExit -ne 0) {
    $outcomeGates = @"
test "`$(systemctl is-enabled academiccloud.service)" = disabled
test "`$(systemctl is-active academiccloud.service)" = inactive
test "`$(systemctl show -p MainPID --value academiccloud.service)" = 0
test "`$(readlink -f /opt/academiccloud/current)" = /opt/academiccloud/releases/639baa9596a17f4160521f31440d9e3ac3b12eda
test ! -e /etc/academiccloud/academiccloud.env
test ! -L /etc/academiccloud/academiccloud.env
test ! -e /var/lib/academiccloud/academiccloud.sqlite
test ! -L /var/lib/academiccloud/academiccloud.sqlite
test ! -e /etc/nginx/sites-enabled/academiccloud
test ! -L /etc/nginx/sites-enabled/academiccloud
"@
}
else {
    $outcomeGates = @"
test "`$(systemctl is-enabled academiccloud.service)" = disabled
test "`$(systemctl is-active academiccloud.service)" = inactive
test "`$(systemctl show -p MainPID --value academiccloud.service)" = 0
test "`$(systemctl is-enabled certbot.timer)" = disabled
test "`$(systemctl is-active certbot.timer)" = inactive
test "`$(readlink -f /opt/academiccloud/current)" = /opt/academiccloud/releases/639baa9596a17f4160521f31440d9e3ac3b12eda
test ! -e /etc/academiccloud/academiccloud.env
test ! -L /etc/academiccloud/academiccloud.env
test ! -e /var/lib/academiccloud/academiccloud.sqlite
test ! -L /var/lib/academiccloud/academiccloud.sqlite
test ! -e /etc/nginx/sites-enabled/academiccloud
test ! -L /etc/nginx/sites-enabled/academiccloud
"@
}
$postAudit = $auditPreamble + "`n" + $outcomeGates + "`n" + $auditReport
$postAuditText = & ssh.exe @sshOptions $SshAlias $postAudit 2>&1
$postAuditExit = $LASTEXITCODE
$postAuditText | Set-Content -LiteralPath (Join-Path $evidencePath 'post-audit.txt') -Encoding utf8

$successEvidenceNames = @(
    'foundation-before.txt',
    'foundation-artifact-verification.json',
    'foundation-after.txt',
    'foundation-rollback-plan.txt',
    'systemd-verify.txt',
    'systemd-security.txt',
    'packages-before.txt',
    'packages-after.txt',
    'packages-added.txt',
    'certbot-policy-before.txt',
    'certbot-install-simulation.txt',
    'apt-update.txt',
    'apt-install.txt',
    'certbot-version.txt',
    'certbot-foundation-evidence.txt'
)
$evidenceNames = $successEvidenceNames + @('foundation-rollback.txt')

foreach ($name in $evidenceNames) {
    $available = Invoke-SshCapture "if test -f '${stage}/${name}'; then printf yes; fi"
    if ($available -eq 'yes') {
        Invoke-NativeChecked -FilePath scp.exe -ArgumentList ($scpOptions + @('--', "${SshAlias}:${stage}/${name}", (Join-Path $evidencePath $name)))
    }
}

if ($foundationExit -ne 0 -or $certbotExit -ne 0 -or $postAuditExit -ne 0) {
    throw "Foundation did not close cleanly (foundation=$foundationExit, certbot=$certbotExit, audit=$postAuditExit); evidence retrieved where available and exact stage preserved: $stage"
}
foreach ($name in $successEvidenceNames) {
    if (-not (Test-Path -LiteralPath (Join-Path $evidencePath $name) -PathType Leaf)) {
        throw "Required success evidence is missing; exact stage preserved: $name"
    }
}

$remoteArchive = @"
set -Eeuo pipefail
cd '$stage'
tar -czf prod03a-evidence.tgz -- $(($successEvidenceNames | ForEach-Object { "'$_'" }) -join ' ')
sha256sum prod03a-evidence.tgz | awk '{print `$1}'
"@
$remoteEvidenceHash = Invoke-SshCapture $remoteArchive
Invoke-NativeChecked -FilePath scp.exe -ArgumentList ($scpOptions + @('--', "${SshAlias}:${stage}/prod03a-evidence.tgz", (Join-Path $evidencePath 'prod03a-evidence.tgz')))
$localEvidenceHash = (Get-FileHash -LiteralPath (Join-Path $evidencePath 'prod03a-evidence.tgz') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($remoteEvidenceHash -ne $localEvidenceHash) {
    throw 'Remote/local evidence archive SHA-256 mismatch.'
}
$archiveMembers = & tar.exe -tzf (Join-Path $evidencePath 'prod03a-evidence.tgz')
if ($LASTEXITCODE -ne 0) {
    throw 'Local evidence archive listing failed.'
}
$expectedMembers = $successEvidenceNames | Sort-Object
$actualMembers = $archiveMembers | Where-Object { $_ } | Sort-Object
if (($actualMembers -join "`n") -cne ($expectedMembers -join "`n")) {
    throw 'Local evidence archive member list differs from the exact expected set.'
}
$localEvidenceHash | Set-Content -LiteralPath (Join-Path $evidencePath 'prod03a-evidence.sha256') -Encoding ascii

$cleanup = @"
set -Eeuo pipefail
stage='$stage'
test "`$(readlink -f -- "`$stage")" = "`$stage"
test "`$stage" = '$stage'
[[ "`$stage" =~ ^/var/tmp/academiccloud-prod03a-[A-Za-z0-9]{8}$ ]]
test "`$(stat -c '%u:%g:%a' -- "`$stage")" = '0:0:700'
test "`$(systemctl is-active academiccloud.service 2>/dev/null || true)" = inactive
test "`$(systemctl show -p MainPID --value academiccloud.service)" = 0
test -z "`$(find /proc/[0-9]*/cwd /proc/[0-9]*/root /proc/[0-9]*/exe /proc/[0-9]*/fd/* -lname "`$stage*" -print -quit 2>/dev/null)"
rm -rf -- "`$stage"
test ! -e "`$stage"
test ! -L "`$stage"
"@
Invoke-SshCapture $cleanup | Out-Null

Write-Host "PROD-03A foundation PASS; evidence SHA-256: $localEvidenceHash"
}
catch {
    if (-not $foundationInvoked) {
        $transferCleanup = "set -Eeuo pipefail; stage='$stage'; [[ `"`$stage`" =~ ^/var/tmp/academiccloud-prod03a-[A-Za-z0-9]{8}`$ ]]; test `"`$(readlink -f -- `"`$stage`")`" = `"`$stage`"; test `"`$(stat -c '%u:%g:%a' -- `"`$stage`")`" = 0:0:700; rm -rf -- `"`$stage`"; test ! -e `"`$stage`""
        try {
            Invoke-SshCapture $transferCleanup | Out-Null
        }
        catch {
            Write-Warning "Pre-foundation transfer cleanup requires manual inspection of exact stage: $stage"
        }
    }
    throw
}
