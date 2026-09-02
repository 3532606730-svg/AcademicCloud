[CmdletBinding()]
param(
    [string]$DistributionName = "AcademicCloudComputeV2",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DistributionName) -or $DistributionName -match '["\r\n]') {
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

$content = @(
    "@echo off",
    "wsl.exe -d `"$DistributionName`" --exec /bin/true >nul 2>&1"
) -join "`r`n"

[System.IO.File]::WriteAllText($launcher, "$content`r`n", [System.Text.Encoding]::ASCII)
Write-Output "Installed AcademicCloud Catalog Bridge login launcher: $launcher"
