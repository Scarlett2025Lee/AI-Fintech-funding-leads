$ErrorActionPreference = 'Stop'
$target = 'D:\Signal'
$stage = $null
$lock = $null
try {
    if (!(Test-Path 'D:\')) { throw 'D: drive is not available.' }
    $cache = Join-Path $target '.cache'
    $temp = Join-Path $cache 'tmp'
    New-Item -ItemType Directory -Force -Path $target, $cache, $temp | Out-Null
    $env:TEMP = $temp; $env:TMP = $temp
    $env:npm_config_cache = Join-Path $cache 'npm'
    try { $lock = [IO.File]::Open((Join-Path $cache 'launch.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Signal is running. Close its black server window, then run this installer again.' }
    try {
        $client = New-Object Net.Sockets.TcpClient
        if ($client.ConnectAsync('127.0.0.1', 1421).Wait(500) -and $client.Connected) { throw 'Port 1421 is active. Stop the existing website server before installing.' }
    } catch [System.AggregateException] { } finally { if ($client) { $client.Dispose() } }
    Write-Host 'Preparing automatic updates. Existing database, browser data and tools will be preserved.'
    $channel = 'https://raw.githubusercontent.com/Scarlett2025Lee/AI-Fintech-funding-leads/codex/signal-web/downloads/update.json?check=' + [Guid]::NewGuid().ToString('N')
    $manifestPath = Join-Path $cache 'install-manifest.json'
    Invoke-WebRequest -UseBasicParsing $channel -OutFile $manifestPath -TimeoutSec 120
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.format -ne 1 -or $manifest.sha256 -notmatch '^[a-f0-9]{64}$' -or $manifest.bytes -le 0 -or $manifest.bytes -gt 20000000) { throw 'Invalid release manifest.' }
    $uri = [Uri]$manifest.url
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or !$uri.AbsolutePath.StartsWith('/Scarlett2025Lee/AI-Fintech-funding-leads/')) { throw 'Unexpected release URL.' }
    $archive = Join-Path $cache 'install-package.zip'
    Invoke-WebRequest -UseBasicParsing $manifest.url -OutFile $archive -TimeoutSec 300
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ine $manifest.sha256 -or (Get-Item $archive).Length -ne $manifest.bytes) { throw 'Release checksum mismatch. Please try again after a minute.' }
    $stage = Join-Path $cache ('installer-stage-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        $total = 0
        foreach ($entry in $zip.Entries) {
            if (!$entry.FullName.StartsWith('Signal/') -or $entry.FullName -match '[\\:]|(^|/)\.\.(/|$)') { throw 'Unsafe archive path.' }
            $destination = [IO.Path]::GetFullPath((Join-Path $stage $entry.FullName))
            if (!$destination.StartsWith($stage + [IO.Path]::DirectorySeparatorChar)) { throw 'Archive escapes staging directory.' }
            $total += $entry.Length
            if ($total -gt 60000000) { throw 'Expanded package is too large.' }
        }
    } finally { $zip.Dispose() }
    Expand-Archive -Path $archive -DestinationPath $stage -Force
    $website = Join-Path $stage 'Signal'
    $release = Get-Content (Join-Path $website 'release.json') -Raw | ConvertFrom-Json
    if ($release.version -ne $manifest.version) { throw 'Release version mismatch.' }
    foreach ($property in $release.files.PSObject.Properties) {
        $path = [IO.Path]::GetFullPath((Join-Path $website $property.Name))
        if (!$path.StartsWith($website + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe release inventory.' }
        if ((Get-FileHash $path -Algorithm SHA256).Hash -ine $property.Value) { throw "File checksum mismatch: $($property.Name)" }
    }
    $architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
    if ($architecture -ieq 'ARM64') { $arch = 'arm64' } elseif ($architecture -ieq 'AMD64') { $arch = 'x64' } else { throw '64-bit Windows is required.' }
    $version = 'v24.19.0'
    $tools = Join-Path $target '.tools'
    $nodeFolder = Join-Path $tools "node-$version-win-$arch"
    $node = Join-Path $nodeFolder 'node.exe'
    if (!(Test-Path $node)) {
        New-Item -ItemType Directory -Force -Path $tools | Out-Null
        $name = "node-$version-win-$arch.zip"
        $nodeZip = Join-Path $cache $name
        $checksums = Join-Path $cache 'node-install-checksums.txt'
        Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/SHASUMS256.txt" -OutFile $checksums -TimeoutSec 120
        Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/$name" -OutFile $nodeZip -TimeoutSec 600
        $record = @(Get-Content $checksums | Where-Object { $_ -match ('\s+' + [Regex]::Escape($name) + '$') })
        if ($record.Count -ne 1 -or (Get-FileHash $nodeZip -Algorithm SHA256).Hash -ine ($record[0] -split '\s+')[0]) { throw 'Node checksum mismatch.' }
        Expand-Archive $nodeZip -DestinationPath $tools -Force
        Remove-Item $nodeZip
    }
    $env:PATH = "$nodeFolder;$env:PATH"
    Push-Location $website
    try {
        & (Join-Path $nodeFolder 'npm.cmd') ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Installer dependencies failed. Your existing website has not been replaced.' }
        # The staged, verified updater performs the actual installation and rollback transaction.
        & $node --use-env-proxy (Join-Path $website 'scripts\update-cli.mjs') install --root $target --manifest $manifestPath --package $archive
        if ($LASTEXITCODE -ne 0) { throw 'Installation failed. Check the error above; existing data was preserved.' }
    } finally { Pop-Location }
    $lock.Dispose(); $lock = $null
    Write-Host 'Automatic updates installed. Starting Signal...' -ForegroundColor Green
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $target 'Start-Signal.ps1') -SkipUpdate
    if ($LASTEXITCODE -ne 0) { throw 'Website startup failed; see the retained error/log.' }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
    if ($stage -and (Test-Path $stage)) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
