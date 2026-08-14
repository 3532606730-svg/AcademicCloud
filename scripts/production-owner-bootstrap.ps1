[CmdletBinding()]
param(
    [string]$SshAlias = 'academiccloud-prod'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($SshAlias -notmatch '^[A-Za-z0-9._-]+$') {
    throw 'SSH alias contains unsupported characters.'
}

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

$accessKeyId = Read-Host 'Alibaba RAM AccessKey ID'
$accessKeySecretSecure = Read-Host 'Alibaba RAM AccessKey secret' -AsSecureString
$accessKeySecretConfirmSecure = Read-Host 'Confirm Alibaba RAM AccessKey secret' -AsSecureString
$acmeEmail = Read-Host 'Let''s Encrypt contact email'
$loginName = Read-Host 'Initial AcademicCloud login name'
$passwordSecure = Read-Host 'Initial AcademicCloud password (12-1024 characters)' -AsSecureString
$passwordConfirmSecure = Read-Host 'Confirm initial AcademicCloud password' -AsSecureString

$accessKeySecret = ConvertFrom-EphemeralSecureString $accessKeySecretSecure
$accessKeySecretConfirm = ConvertFrom-EphemeralSecureString $accessKeySecretConfirmSecure
$password = ConvertFrom-EphemeralSecureString $passwordSecure
$passwordConfirm = ConvertFrom-EphemeralSecureString $passwordConfirmSecure
try {
    foreach ($entry in @($accessKeyId, $accessKeySecret, $accessKeySecretConfirm, $acmeEmail, $loginName, $password, $passwordConfirm)) {
        if ($entry.Contains("`r") -or $entry.Contains("`n") -or $entry.Contains([char]0)) {
            throw 'Input fields must not contain newline or NUL characters.'
        }
    }
    if ($password -cne $passwordConfirm) {
        throw 'The two password entries do not match.'
    }
    if ($accessKeySecret -cne $accessKeySecretConfirm) {
        throw 'The two AccessKey secret entries do not match.'
    }

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'ssh.exe'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.Arguments = "-o BatchMode=yes -o StrictHostKeyChecking=yes -o ClearAllForwardings=yes -o RequestTTY=no -T $SshAlias `"/bin/bash /etc/academiccloud/prepared/alibaba-production-activate.sh`""
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
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "Remote activation failed with exit code $($process.ExitCode)."
        }
    }
    finally {
        $process.Dispose()
    }
}
finally {
    $accessKeySecret = $null
    $accessKeySecretConfirm = $null
    $password = $null
    $passwordConfirm = $null
    $accessKeySecretSecure.Dispose()
    $accessKeySecretConfirmSecure.Dispose()
    $passwordSecure.Dispose()
    $passwordConfirmSecure.Dispose()
}
