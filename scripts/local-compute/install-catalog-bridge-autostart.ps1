[CmdletBinding()]
param(
    [string]$DistributionName = "AcademicCloudComputeV2",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DistributionName) -or
    $DistributionName.Length -gt 128 -or
    $DistributionName -notmatch '^[A-Za-z0-9._-]+$') {
    throw "DistributionName is invalid."
}

$startup = [Environment]::GetFolderPath("Startup")
if ([string]::IsNullOrWhiteSpace($startup)) {
    throw "Windows Startup folder is unavailable."
}

$launcher = Join-Path $startup "AcademicCloud Catalog Bridge.cmd"

if ($Remove) {
    if (Test-Path -LiteralPath $launcher) {
        Remove-Item -LiteralPath $launcher -Force
    }
    Write-Output "Removed AcademicCloud Catalog Bridge login launcher."
    exit 0
}

$known = & wsl.exe --list --quiet 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "WSL is unavailable."
}
$knownNames = @($known | ForEach-Object { $_.Trim().Trim([char]0) } | Where-Object { $_ })
if ($knownNames -notcontains $DistributionName) {
    throw "WSL distribution '$DistributionName' is not installed."
}

# An enabled systemd service does not itself keep a WSL distribution alive.
# Keep one inert Linux process running for the Windows login session so the
# loopback-only catalog bridge remains reachable from the browser. The bridge
# itself remains owned and restarted by its dedicated systemd unit.
$wslPath = Join-Path $env:SystemRoot "System32\wsl.exe"
$keepaliveCommand = "Start-Process -WindowStyle Hidden -FilePath '$wslPath' -ArgumentList '-d','$DistributionName','--exec','/usr/bin/sleep','infinity'"
$content = @(
    "@echo off",
    "powershell.exe -NoProfile -WindowStyle Hidden -Command `"$keepaliveCommand`" >nul 2>&1"
) -join "`r`n"

[System.IO.File]::WriteAllText($launcher, "$content`r`n", [System.Text.Encoding]::ASCII)
Write-Output "Installed AcademicCloud Catalog Bridge login launcher: $launcher"
