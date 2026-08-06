$ErrorActionPreference = "Stop"

$repository = if ($env:ORYNT_RELEASE_REPOSITORY) { $env:ORYNT_RELEASE_REPOSITORY } else { "codepawl/orynt" }
$arch = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
  "X64" { "x64" }
  "Arm64" { throw "Windows ARM has no native Orynt 0.1 archive; install with: npm install --global orynt" }
  default { throw "Unsupported Windows architecture." }
}
$archiveName = "orynt-win32-$arch.tar.gz"
$baseUrl = "https://github.com/$repository/releases/latest/download"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("orynt-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
  $archivePath = Join-Path $temporaryRoot $archiveName
  $checksumPath = "$archivePath.sha256"
  Invoke-WebRequest -Uri "$baseUrl/$archiveName" -OutFile $archivePath
  Invoke-WebRequest -Uri "$baseUrl/$archiveName.sha256" -OutFile $checksumPath
  $expected = ((Get-Content $checksumPath -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "Orynt archive checksum mismatch." }
  $payload = Join-Path $temporaryRoot "payload"
  New-Item -ItemType Directory -Path $payload | Out-Null
  tar -xzf $archivePath -C $payload
  $version = (& (Join-Path $payload "orynt.exe") --version).Trim()
  $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
  $installRoot = Join-Path $localAppData "Orynt"
  $versionsRoot = Join-Path $installRoot "versions"
  $versionRoot = Join-Path $versionsRoot $version
  $binRoot = Join-Path $installRoot "bin"
  $stateRoot = if ($env:ORYNT_STATE_HOME) {
    Join-Path $env:ORYNT_STATE_HOME "orynt"
  } else {
    Join-Path $localAppData "orynt"
  }
  New-Item -ItemType Directory -Force -Path $versionsRoot, $binRoot, $stateRoot | Out-Null
  if (Test-Path $versionRoot) { throw "Orynt $version is already installed." }
  Move-Item $payload $versionRoot
  $currentPointer = Join-Path $stateRoot "current.txt"
  Set-Content -Path $currentPointer -Value $version -Encoding utf8NoBOM
  $launcherPath = Join-Path $binRoot "orynt.cmd"
  @"
@echo off
setlocal
set /p ORYNT_VERSION=<"$currentPointer"
"$versionsRoot\%ORYNT_VERSION%\orynt.exe" %*
"@ | Set-Content -Path $launcherPath -Encoding ascii
  @{
    schemaVersion = 1
    installKind = "native"
    versionsRoot = $versionsRoot
    currentPointer = $currentPointer
    launcherPath = $launcherPath
    currentVersion = $version
  } | ConvertTo-Json | Set-Content -Path (Join-Path $stateRoot "install-v1.json") -Encoding utf8NoBOM
  Write-Host "Installed Orynt $version at $launcherPath"
  if (($env:PATH -split ";") -notcontains $binRoot) {
    Write-Host "Add $binRoot to PATH to run orynt."
  }
}
finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $temporaryRoot
}
