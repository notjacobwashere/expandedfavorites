# SPDX-License-Identifier: GPL-3.0-or-later
param(
    [Parameter(Mandatory = $true)][string]$StockDirectory,
    [Parameter(Mandatory = $true)][string]$BuildDirectory,
    [Parameter(Mandatory = $true)][string]$OutputFile
)

$ErrorActionPreference = 'Stop'
$stock = (Resolve-Path -LiteralPath $StockDirectory).Path
$build = (Resolve-Path -LiteralPath $BuildDirectory).Path
$output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputFile)
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$core = @('patcher.js', 'preload.js', 'renderer.js', 'renderer.css')
$manifest = @{ stock = @{}; payload = @{} }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('ExpandedFavoritesBuild-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $scratch 'payload'
$zip = Join-Path $scratch 'payload.zip'

try {
    New-Item -ItemType Directory -Path $payload -Force | Out-Null
    foreach ($name in $core) {
        $manifest.stock[$name] = (Get-FileHash -LiteralPath (Join-Path $stock $name)).Hash
        foreach ($fileName in @($name, "$name.map", "$name.LEGAL.txt")) {
            $from = Join-Path $build $fileName
            if (!(Test-Path -LiteralPath $from -PathType Leaf)) {
                if ($fileName -eq $name) { throw "Missing build output: $name" }
                continue
            }
            Copy-Item -LiteralPath $from -Destination (Join-Path $payload $fileName)
            $manifest.payload[$fileName] = (Get-FileHash -LiteralPath $from).Hash
        }
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install.ps1') -Destination $payload
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $payload 'manifest.json') -Encoding ASCII
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($payload, $zip)
    & (Join-Path $framework 'csc.exe') /nologo /target:exe /optimize+ /reference:System.IO.Compression.FileSystem.dll "/resource:$zip,payload.zip" "/out:$output" (Join-Path $PSScriptRoot 'Launcher.cs')
    if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed with exit code $LASTEXITCODE." }
} finally {
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
