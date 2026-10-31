$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
if ([IO.Path]::GetPathRoot($projectPath) -ine 'D:\') {
    throw 'Extract the Signal folder onto D: first, for example D:\Signal, then run Start-Signal.cmd again.'
}
Set-Location $projectPath
$cachePath = Join-Path $projectPath '.cache'
$tempPath = Join-Path $cachePath 'tmp'
$toolsPath = Join-Path $projectPath '.tools'
New-Item -ItemType Directory -Force -Path $tempPath, $toolsPath | Out-Null
$env:TEMP = $tempPath
$env:TMP = $tempPath
$env:npm_config_cache = Join-Path $cachePath 'npm'
$env:SIGNAL_DATA_DIR = Join-Path $projectPath 'data'

# Portable Node: downloads, extracted tools, npm cache, and SQLite stay on D:.
$nodeVersion = 'v24.19.0'
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($architecture -eq 'Arm64') { $nodeArchitecture = 'arm64' }
elseif ($architecture -eq 'X64') { $nodeArchitecture = 'x64' }
else { throw 'This launcher requires 64-bit Windows (x64 or ARM64).' }
$archiveName = "node-$nodeVersion-win-$nodeArchitecture.zip"
$nodePath = Join-Path $toolsPath "node-$nodeVersion-win-$nodeArchitecture"
$nodeExe = Join-Path $nodePath 'node.exe'
if (!(Test-Path $nodeExe)) {
    $archivePath = Join-Path $cachePath $archiveName
    $checksumsPath = Join-Path $cachePath 'SHASUMS256.txt'
    $downloadBase = "https://nodejs.org/dist/$nodeVersion"
    Write-Host 'Downloading portable Node.js to D: (first launch only)...'
    Invoke-WebRequest -UseBasicParsing "$downloadBase/SHASUMS256.txt" -OutFile $checksumsPath
    Invoke-WebRequest -UseBasicParsing "$downloadBase/$archiveName" -OutFile $archivePath
    $record = Get-Content $checksumsPath | Where-Object { $_ -match ('\s+' + [Regex]::Escape($archiveName) + '$') }
    if (@($record).Count -ne 1) { throw 'Official Node checksum entry was not found.' }
    $expected = ($record -split '\s+')[0]
    $actual = (Get-FileHash $archivePath -Algorithm SHA256).Hash
    if ($expected -ine $actual) { Remove-Item $archivePath; throw 'Node download failed SHA-256 verification.' }
    Expand-Archive -Path $archivePath -DestinationPath $toolsPath -Force
    Remove-Item $archivePath
}
$env:PATH = "$nodePath;$env:PATH"
$npmCmd = Join-Path $nodePath 'npm.cmd'
$lockHash = (Get-FileHash 'package-lock.json' -Algorithm SHA256).Hash
$stamp = Join-Path $cachePath 'installed-lock.txt'
if (!(Test-Path 'node_modules') -or !(Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $lockHash) {
    & $npmCmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network and retry.' }
    Set-Content -Path $stamp -Value $lockHash
}
& $npmCmd run build
if ($LASTEXITCODE -ne 0) { throw 'Website build failed.' }
Write-Host ''
Write-Host 'Open http://127.0.0.1:1421 in your browser. Keep this window open.'
Write-Host 'Use Open-Signal.cmd to open Edge with a separate browser profile and cache on D:.'
Write-Host "Your data is stored at $env:SIGNAL_DATA_DIR"
Write-Host 'Press Ctrl+C to stop the website.'
& $nodeExe 'server/index.mjs'
exit $LASTEXITCODE
