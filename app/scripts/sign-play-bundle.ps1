param(
    [Parameter(Mandatory = $true)][string]$BundlePath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME must point to the installed JDK.' }
$keytool = Join-Path $env:JAVA_HOME 'bin/keytool.exe'
$jarsigner = Join-Path $env:JAVA_HOME 'bin/jarsigner.exe'
$sourceBundle = (Resolve-Path -LiteralPath $BundlePath).Path
$outputBundle = [IO.Path]::GetFullPath($OutputPath)
if ($sourceBundle -eq $outputBundle) { throw 'Sign a copy; preserve the Gradle output.' }
$signingDirectory = Join-Path $env:USERPROFILE '.aifect/signing'
$keystorePath = Join-Path $signingDirectory 'aifect-upload.jks'
$passwordPath = Join-Path $signingDirectory 'aifect-upload.credentials.xml'
$aliasName = 'aifect-upload'
if (-not (Test-Path -LiteralPath $signingDirectory)) {
    New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $signingDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict signing directory permissions.' }
if ((Test-Path -LiteralPath $keystorePath) -ne (Test-Path -LiteralPath $passwordPath)) {
    throw 'Incomplete existing signing material; do not regenerate or overwrite it.'
}
try {
    if (-not (Test-Path -LiteralPath $keystorePath)) {
        $randomBytes = New-Object byte[] 36
        $random = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $random.GetBytes($randomBytes) } finally { $random.Dispose() }
        $env:AIFECT_UPLOAD_PASSWORD = [Convert]::ToBase64String($randomBytes)
        $secret = ConvertTo-SecureString $env:AIFECT_UPLOAD_PASSWORD -AsPlainText -Force
        # Windows DPAPI: only this Windows user can decrypt the saved password.
        $secret | Export-Clixml -LiteralPath $passwordPath
        & $keytool -genkeypair -keystore $keystorePath -storetype JKS -alias $aliasName `
            -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 `
            -dname 'CN=AIFECT Upload, O=Motive, C=KR' `
            -storepass:env AIFECT_UPLOAD_PASSWORD -keypass:env AIFECT_UPLOAD_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed; retained files need inspection.' }
    } else {
        $secret = Import-Clixml -LiteralPath $passwordPath
        $env:AIFECT_UPLOAD_PASSWORD = [Net.NetworkCredential]::new('', $secret).Password
    }
    $outputDirectory = Split-Path -Parent $outputBundle
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourceBundle -Destination $outputBundle
    & $jarsigner -keystore $keystorePath -storepass:env AIFECT_UPLOAD_PASSWORD `
        -keypass:env AIFECT_UPLOAD_PASSWORD -sigalg SHA256withRSA -digestalg SHA-256 `
        $outputBundle $aliasName
    if ($LASTEXITCODE -ne 0) { throw 'App Bundle signing failed.' }
    & $jarsigner -verify $outputBundle
    if ($LASTEXITCODE -ne 0) { throw 'App Bundle signature verification failed.' }
    & $keytool -exportcert -rfc -keystore $keystorePath -alias $aliasName `
        -storepass:env AIFECT_UPLOAD_PASSWORD -file (Join-Path $outputDirectory 'aifect-upload-certificate.pem')
    if ($LASTEXITCODE -ne 0) { throw 'Public upload certificate export failed.' }
    Get-Item -LiteralPath $outputBundle | Select-Object FullName, Length
    Get-FileHash -LiteralPath $outputBundle -Algorithm SHA256
} finally {
    Remove-Item Env:AIFECT_UPLOAD_PASSWORD -ErrorAction SilentlyContinue
    $secret = $null
}
