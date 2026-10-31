$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetPathRoot($PSScriptRoot) -ine 'D:\') { throw 'Move this Signal folder to D: first.' }
$browserCache = Join-Path $PSScriptRoot '.cache\browser'
$tempPath = Join-Path $PSScriptRoot '.cache\tmp'
New-Item -ItemType Directory -Force -Path $browserCache, $tempPath | Out-Null
$env:TEMP = $tempPath
$env:TMP = $tempPath
try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:1421/api/health' -TimeoutSec 3 | Out-Null }
catch { throw 'Start-Signal.cmd must be running first. Wait for its local website address, then try again.' }
$edgePaths = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$edge) { throw 'Microsoft Edge was not found. Open the website manually, or install a browser on D: with a D: profile.' }
$profilePath = Join-Path $browserCache 'profile'
$diskCachePath = Join-Path $browserCache 'disk'
Start-Process -FilePath $edge -ArgumentList @(
    "--user-data-dir=`"$profilePath`"",
    "--disk-cache-dir=`"$diskCachePath`"",
    '--no-first-run',
    'http://127.0.0.1:1421'
)
