[CmdletBinding()]
param(
    [string]$SshAlias = 'academiccloud-prod',
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$AccessKeyCsvPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($SshAlias -notmatch '^[A-Za-z0-9._-]+$') {
    throw 'SSH alias contains unsupported characters.'
}

$bucketOrigin = 'https://ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com'
$applicationOrigin = 'https://cloud.ajtlab.top'
$expectedActivationSha256 = '93ee91d5cca92957beea817c1beb278a357ce6f6cba87967192d96c7a32d5be6'

function Invoke-HeaderProbe {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string[]]$CurlArguments
    )

    $output = @(& curl.exe -sS -D - -o NUL --max-time 15 @CurlArguments $Uri)
    if ($LASTEXITCODE -ne 0) {
        throw 'The read-only OSS HTTP probe failed.'
    }
    $statusLines = @($output | Where-Object { $_ -match '^HTTP/\S+\s+\d{3}(?:\s|$)' })
    if ($statusLines.Count -lt 1) {
        throw 'The OSS HTTP probe returned no status line.'
    }
    $status = [int](($statusLines[-1] -split '\s+')[1])
    return [pscustomobject]@{ Status = $status; Headers = @($output | Where-Object { $_ -ne '' }) }
}

$anonymousHead = Invoke-HeaderProbe -Uri "$bucketOrigin/objects/prod03b-anonymous-probe-must-not-exist" -CurlArguments @('-I')
$anonymousList = Invoke-HeaderProbe -Uri "$bucketOrigin/?list-type=2" -CurlArguments @('-X', 'GET')
if ($anonymousHead.Status -ne 403 -or $anonymousList.Status -ne 403) {
    throw 'Anonymous bucket access or listing is not denied exactly as required.'
}

& node.exe (Join-Path $PSScriptRoot 'oss-cors-contract.mjs')
if ($LASTEXITCODE -ne 0) {
    throw 'The exact POST plus multipart PUT Content-MD5 OSS CORS contract is absent or broader than approved.'
}

Write-Host 'Read-only OSS anonymous-access and exact CORS probes passed.'

$activationGate = "/usr/bin/env bash -c 'set -Eeuo pipefail; target=/etc/academiccloud/prepared/alibaba-production-activate.sh; [[ -f `"`$target`" && ! -L `"`$target`" ]]; [[ `"`$(stat -c %u:%g:%a -- `"`$target`")`" == 0:0:600 ]]; actual=`$(sha256sum `"`$target`"); actual=`$`{actual%% *`}; [[ `"`$actual`" == $expectedActivationSha256 ]]'"
& ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=yes -o ClearAllForwardings=yes -o RequestTTY=no -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -T $SshAlias $activationGate
if ($LASTEXITCODE -ne 0) {
    throw 'The protected remote activation script does not match the independently reviewed identity.'
}
Write-Host 'Protected remote activation identity passed.'

function ConvertFrom-EphemeralSecureString {
    param([Parameter(Mandatory)][Security.SecureString]$Value)

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$accessKeyId = $null
$accessKeySecret = $null
$acmeEmail = $null
$loginName = $null
$password = $null
$passwordConfirm = $null
$passwordSecure = $null
$passwordConfirmSecure = $null
$credentialCsvRows = $null
$credentialCsvRow = $null
$ramConsolePassword = $null
try {
    $credentialCsvItem = Get-Item -LiteralPath $AccessKeyCsvPath -Force
    $repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $credentialCsvFullPath = [IO.Path]::GetFullPath($credentialCsvItem.FullName)
    $repositoryPrefix = $repositoryRoot + [IO.Path]::DirectorySeparatorChar
    if (
        $credentialCsvItem.PSProvider.Name -cne 'FileSystem' -or
        $credentialCsvItem -isnot [IO.FileInfo] -or
        $credentialCsvFullPath.StartsWith('\\', [StringComparison]::Ordinal) -or
        $credentialCsvFullPath.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
        $credentialCsvFullPath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        (($credentialCsvItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
        $credentialCsvItem.Length -le 0 -or
        $credentialCsvItem.Length -gt 4096
    ) {
        throw 'The AccessKey CSV must be a repository-external local regular non-reparse file between 1 and 4096 bytes.'
    }
    $credentialCsvRows = @(Import-Csv -LiteralPath $credentialCsvFullPath -Encoding UTF8)
    if ($credentialCsvRows.Count -ne 1) {
        throw 'The AccessKey CSV must contain exactly one data row.'
    }
    $credentialCsvRow = $credentialCsvRows[0]
    $requiredCsvColumns = @('UserPrincipalName', 'Password', 'AccessKeyId', 'AccessKeySecret', 'SecurityPhone', 'SecurityEmail')
    $credentialCsvColumns = @($credentialCsvRow.PSObject.Properties.Name)
    if ($credentialCsvColumns.Count -ne $requiredCsvColumns.Count) {
        throw 'The AccessKey CSV must contain exactly the six reviewed Alibaba RAM export columns.'
    }
    foreach ($requiredColumn in $requiredCsvColumns) {
        if ($credentialCsvColumns -cnotcontains $requiredColumn) {
            throw 'The AccessKey CSV schema does not match the reviewed Alibaba RAM export.'
        }
    }
    foreach ($column in $requiredCsvColumns) {
        $columnValue = [string]$credentialCsvRow.$column
        if ($columnValue.Contains("`r") -or $columnValue.Contains("`n") -or $columnValue.Contains([char]0)) {
            throw 'The AccessKey CSV contains an unsupported multiline or NUL value.'
        }
    }
    $accessKeyId = [string]$credentialCsvRow.AccessKeyId
    $accessKeySecret = [string]$credentialCsvRow.AccessKeySecret
    $ramConsolePassword = [string]$credentialCsvRow.Password
    if ([string]::IsNullOrWhiteSpace($accessKeyId) -or [string]::IsNullOrWhiteSpace($accessKeySecret)) {
        throw 'The AccessKey CSV does not contain a usable AccessKey pair.'
    }
    Write-Host 'Parsed the exact one-row RAM export locally; its console password will not be sent or reused.'

    $acmeEmail = Read-Host 'Let''s Encrypt contact email'
    $loginName = Read-Host 'Initial AcademicCloud login name'
    $passwordSecure = Read-Host 'Initial AcademicCloud password (12-1024 characters)' -AsSecureString
    $passwordConfirmSecure = Read-Host 'Confirm initial AcademicCloud password' -AsSecureString
    $password = ConvertFrom-EphemeralSecureString $passwordSecure
    $passwordConfirm = ConvertFrom-EphemeralSecureString $passwordConfirmSecure

    foreach ($entry in @($accessKeyId, $accessKeySecret, $acmeEmail, $loginName, $password, $passwordConfirm)) {
        if ($null -ne $entry -and ($entry.Contains("`r") -or $entry.Contains("`n") -or $entry.Contains([char]0))) {
            throw 'Input fields must not contain newline or NUL characters.'
        }
    }
    if ($password -cne $passwordConfirm) {
        throw 'The two password entries do not match.'
    }
    if ($ramConsolePassword -and $password -ceq $ramConsolePassword) {
        throw 'The AcademicCloud password must not reuse the Alibaba RAM console password from the credential export.'
    }
    if ($password -ceq $accessKeySecret) {
        throw 'The AcademicCloud password must not reuse the Alibaba RAM AccessKey secret.'
    }
    if ($loginName -cnotmatch '^[A-Za-z0-9._@+-]{3,64}$') {
        throw 'The login name must be 3-64 characters using only letters, digits, dot, underscore, at, plus, or hyphen.'
    }

    $credentialCsvRow.AccessKeySecret = $null
    $credentialCsvRow.Password = $null
    $ramConsolePassword = $null
    $credentialCsvRow = $null
    $credentialCsvRows = $null
    $credentialCsvColumns = $null
    $requiredCsvColumns = $null
    $credentialCsvItem = $null
    $credentialCsvFullPath = $null
    $columnValue = $null
    $passwordConfirm = $null
    $passwordSecure.Dispose()
    $passwordSecure = $null
    $passwordConfirmSecure.Dispose()
    $passwordConfirmSecure = $null

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'ssh.exe'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.Arguments = "-o BatchMode=yes -o StrictHostKeyChecking=yes -o ClearAllForwardings=yes -o RequestTTY=no -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -T $SshAlias `"/usr/bin/timeout --foreground --kill-after=30s 900s /bin/bash /etc/academiccloud/prepared/alibaba-production-activate.sh`""
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Failed to start the SSH process.'
    }
    try {
        $process.StandardInput.NewLine = "`n"
        foreach ($entry in @($accessKeyId, $accessKeySecret, $acmeEmail, $loginName, $password)) {
            $process.StandardInput.WriteLine($entry)
        }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(950000)) {
            $process.Kill()
            $process.WaitForExit()
            throw 'Remote activation exceeded its reviewed time bound; state is preserved for resumable diagnosis.'
        }
        if ($process.ExitCode -ne 0) {
            throw "Remote activation failed with exit code $($process.ExitCode)."
        }
    }
    finally {
        $process.Dispose()
    }
}
finally {
    if ($null -ne $credentialCsvRow) {
        $credentialCsvRow.AccessKeySecret = $null
        $credentialCsvRow.Password = $null
    }
    $accessKeyId = $null
    $accessKeySecret = $null
    $ramConsolePassword = $null
    $credentialCsvRow = $null
    $credentialCsvRows = $null
    $acmeEmail = $null
    $loginName = $null
    $password = $null
    $passwordConfirm = $null
    if ($null -ne $passwordSecure) {
        $passwordSecure.Dispose()
    }
    if ($null -ne $passwordConfirmSecure) {
        $passwordConfirmSecure.Dispose()
    }
}
