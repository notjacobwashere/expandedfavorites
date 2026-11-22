# SPDX-License-Identifier: GPL-3.0-or-later
param([Parameter(Mandatory = $true)][string]$Payload)

$ErrorActionPreference = 'Stop'
$vencord = Join-Path $env:APPDATA 'Vencord'
$dist = Join-Path $vencord 'dist'
$settingsPath = Join-Path $vencord 'settings\settings.json'
$manifest = Get-Content (Join-Path $Payload 'manifest.json') -Raw | ConvertFrom-Json
$core = @('patcher.js', 'preload.js', 'renderer.js', 'renderer.css')
$clientNames = @('Discord', 'DiscordCanary', 'DiscordPTB', 'DiscordDevelopment')
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Hash([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}

function Assert-Inside([string]$Path, [string]$Parent) {
    $prefix = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    if (![IO.Path]::GetFullPath($Path).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unexpected path: $Path"
    }
}

if ($env:VENCORD_USER_DATA_DIR -or $env:DISCORD_USER_DATA_DIR) {
    throw 'This installer supports the standard Windows Vencord data folder. Use the custom-build steps for redirected installs.'
}
foreach ($name in $core) {
    if (!(Test-Path -LiteralPath (Join-Path $dist $name) -PathType Leaf)) {
        throw 'Install Vencord in the Windows Discord desktop app first, then run this installer again.'
    }
}
$renderer = [IO.File]::ReadAllText((Join-Path $dist 'renderer.js'))
$patcher = [IO.File]::ReadAllText((Join-Path $dist 'patcher.js'))
$alreadyPresent = $renderer -match 'name\s*:\s*"ExpandedFavorites"' -and $patcher.Contains('ExpandedFavorites')

if (!$alreadyPresent) {
    foreach ($name in $core) {
        if ((Get-Hash (Join-Path $dist $name)) -ne $manifest.stock.$name) {
            throw 'This Vencord build is different from the supported stock build. Your installation was left intact. See the GitHub README for custom-build instructions.'
        }
    }
    foreach ($file in $manifest.payload.PSObject.Properties) {
        if ($file.Name -notmatch '^(patcher\.js|preload\.js|renderer\.(js|css))(\.map|\.LEGAL\.txt)?$' -or
            (Get-Hash (Join-Path $Payload $file.Name)) -ne $file.Value) {
            throw "The installer payload failed verification: $($file.Name)"
        }
    }
}

function Read-Settings {
    if (Test-Path -LiteralPath $settingsPath) {
        return [IO.File]::ReadAllText($settingsPath) | ConvertFrom-Json
    }
    [pscustomobject]@{}
}

$settings = Read-Settings
if ($alreadyPresent -and $settings.plugins.ExpandedFavorites.enabled -eq $true) {
    Write-Host 'ExpandedFavorites is already installed and enabled.'
    exit 0
}

$running = @(Get-Process -Name $clientNames -ErrorAction SilentlyContinue)
$restart = @{}
foreach ($client in $running) {
    if (!$client.Path) { throw "Could not identify the running $($client.ProcessName) executable." }
    $root = Join-Path $env:LOCALAPPDATA $client.ProcessName
    Assert-Inside $client.Path $root
    if ([IO.Path]::GetFileName($client.Path) -ine ($client.ProcessName + '.exe')) {
        throw "Unexpected Discord executable: $($client.Path)"
    }
    if (!$restart.ContainsKey($client.ProcessName) -or $client.MainWindowHandle -ne 0) {
        $restart[$client.ProcessName] = $client.Path
    }
}

$backup = Join-Path $vencord ('expandedfavorites-backup-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $backup 'staging'
$oldDist = Join-Path $backup 'dist'
$settingsBackup = Join-Path $backup 'settings.json'
$settingsStage = Join-Path $backup 'settings-new.json'
$moved = $false
$installed = $false
$stopped = @{}

try {
    New-Item -ItemType Directory -Path $backup | Out-Null
    if (!$alreadyPresent) {
        Copy-Item -LiteralPath $dist -Destination $stage -Recurse
        foreach ($file in $manifest.payload.PSObject.Properties) {
            Copy-Item -LiteralPath (Join-Path $Payload $file.Name) -Destination (Join-Path $stage $file.Name) -Force
        }
    }
    foreach ($client in $running) {
        $stopped[$client.ProcessName] = $restart[$client.ProcessName]
        if ($client.MainWindowHandle -ne 0) { $null = $client.CloseMainWindow() }
    }
    if ($running.Count) { Start-Sleep -Milliseconds 1500 }
    foreach ($client in $running) {
        if (!$client.HasExited) {
            $client | Stop-Process -ErrorAction Stop
            if (!$client.WaitForExit(5000)) { throw "Could not close $($client.ProcessName)." }
        }
    }
    if (Get-Process -Name $clientNames -ErrorAction SilentlyContinue) {
        throw 'Discord started during installation. Close it and try again.'
    }

    $settings = Read-Settings
    if ($null -eq $settings.plugins) {
        $settings | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    if ($null -eq $settings.plugins.ExpandedFavorites) {
        $settings.plugins | Add-Member -NotePropertyName ExpandedFavorites -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $settings.plugins.ExpandedFavorites | Add-Member -NotePropertyName enabled -NotePropertyValue $true -Force
    if (!$alreadyPresent) {
        $settings | Add-Member -NotePropertyName autoUpdate -NotePropertyValue $false -Force
        $settings | Add-Member -NotePropertyName autoUpdateNotification -NotePropertyValue $true -Force
    }
    New-Item -ItemType Directory -Path (Split-Path $settingsPath) -Force | Out-Null
    [IO.File]::WriteAllText($settingsStage, ($settings | ConvertTo-Json -Depth 100), $utf8)

    if (!$alreadyPresent) {
        Move-Item -LiteralPath $dist -Destination $oldDist
        $moved = $true
        Move-Item -LiteralPath $stage -Destination $dist
        $installed = $true
    }
    if (Test-Path -LiteralPath $settingsPath) {
        [IO.File]::Replace($settingsStage, $settingsPath, $settingsBackup)
    } else {
        [IO.File]::Move($settingsStage, $settingsPath)
    }
} catch {
    if ($moved) {
        if ($installed) { Move-Item -LiteralPath $dist -Destination $stage }
        Move-Item -LiteralPath $oldDist -Destination $dist
    }
    throw
} finally {
    foreach ($entry in $stopped.GetEnumerator()) {
        if (!(Get-Process -Name $entry.Key -ErrorAction SilentlyContinue)) {
            Start-Process -FilePath $entry.Value -WindowStyle Hidden
        }
    }
}

Write-Host 'ExpandedFavorites is installed and enabled.'
if (!$alreadyPresent) { Write-Host 'Vencord automatic updates were turned off to keep the plugin installed. Update notifications remain on.' }
Write-Host "Backup: $backup"
