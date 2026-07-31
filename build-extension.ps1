<#
.SYNOPSIS
    Packages the Firefox extension into a zip ready for upload to addons.mozilla.org.

.DESCRIPTION
    This repo contains two separate things:

      1. The extension shell  - manifest.json, local-index.html, injector.js
                                Packaged here and uploaded to AMO. Changing any
                                of these requires a version bump + re-upload.

      2. The page content     - index.html, styles.css, script.js, icon/, fonts/
                                Served from GitHub Pages. Changing these needs
                                only a git push; the extension picks them up.

    Only group 1 goes into the zip. This script builds that zip with manifest.json
    at the archive root, which is what AMO requires.

.PARAMETER Bump
    Increment the last segment of the manifest version before packaging
    (e.g. 3.8 -> 3.9) and write it back to manifest.json.

.PARAMETER OutputDir
    Where to write the zip. Defaults to .\dist (gitignored).

.EXAMPLE
    .\build-extension.ps1
    Package the current manifest version.

.EXAMPLE
    .\build-extension.ps1 -Bump
    Bump 3.8 -> 3.9 in manifest.json, then package.
#>
[CmdletBinding()]
param(
    [switch]$Bump,
    [string]$OutputDir = (Join-Path $PSScriptRoot 'dist')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Files that make up the installable extension -------------------------
# Anything not listed here is GitHub Pages content and must NOT be packaged.
$ExtensionFiles = @(
    'manifest.json'
    'local-index.html'
    'injector.js'
)

$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found at $manifestPath"
}

# --- Read + validate the manifest -----------------------------------------
$rawManifest = Get-Content -LiteralPath $manifestPath -Raw

try {
    $manifest = $rawManifest | ConvertFrom-Json
}
catch {
    throw "manifest.json is not valid JSON: $($_.Exception.Message)"
}

if ($rawManifest -notmatch '"version"\s*:\s*"([^"]+)"') {
    throw 'Could not find a "version" field in manifest.json'
}
$version = $Matches[1]

# --- Optionally bump the version ------------------------------------------
if ($Bump) {
    $segments = $version -split '\.'
    $segments[-1] = [string]([int]$segments[-1] + 1)
    $newVersion = $segments -join '.'

    # Rewrite only the version value so the rest of the file keeps its formatting.
    $rawManifest = [regex]::Replace(
        $rawManifest,
        '("version"\s*:\s*")[^"]+(")',
        "`${1}$newVersion`${2}",
        [System.Text.RegularExpressions.RegexOptions]::None,
        [timespan]::FromSeconds(5)
    )

    Set-Content -LiteralPath $manifestPath -Value $rawManifest -NoNewline -Encoding utf8
    Write-Host "Version bumped: $version -> $newVersion" -ForegroundColor Yellow
    $version = $newVersion
}

# --- Pull in any icons the manifest declares ------------------------------
# Safe under StrictMode: test for the property before touching it.
if ($manifest.PSObject.Properties['icons']) {
    foreach ($iconProp in $manifest.icons.PSObject.Properties) {
        $iconPath = [string]$iconProp.Value
        if ($iconPath -and $ExtensionFiles -notcontains $iconPath) {
            $ExtensionFiles += $iconPath
        }
    }
}

# --- Verify every file exists before we build anything --------------------
$missing = @()
foreach ($relative in $ExtensionFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $relative))) {
        $missing += $relative
    }
}
if ($missing.Count -gt 0) {
    throw "Missing extension file(s): $($missing -join ', ')"
}

# --- Work out the output path ---------------------------------------------
$slug = ($manifest.name -replace '[^\w\s-]', '' -replace '\s+', '-').ToLowerInvariant()
if (-not $slug) { $slug = 'extension' }

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$zipPath = Join-Path $OutputDir "$slug-$version.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
    Write-Host "Replaced existing $([System.IO.Path]::GetFileName($zipPath))" -ForegroundColor DarkGray
}

# --- Build the zip --------------------------------------------------------
# Built entry-by-entry rather than with Compress-Archive so that entry names are
# guaranteed to use forward slashes and sit at the archive root. Firefox rejects
# archives where manifest.json is nested inside a folder.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in $ExtensionFiles) {
        $fullPath  = Join-Path $PSScriptRoot $relative
        $entryName = $relative -replace '\\', '/'

        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $fullPath,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

# --- Report ---------------------------------------------------------------
Write-Host ''
Write-Host "Packaged $($manifest.name) v$version" -ForegroundColor Green

$ExtensionFiles |
    ForEach-Object {
        [pscustomobject]@{
            File  = $_
            Bytes = (Get-Item -LiteralPath (Join-Path $PSScriptRoot $_)).Length
        }
    } |
    Format-Table -AutoSize |
    Out-String |
    Write-Host

$zipSize = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1KB, 1)
Write-Host "-> $zipPath ($zipSize KB)" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Upload at: https://addons.mozilla.org/developers/addon/my-startpage/versions/submit/' -ForegroundColor DarkGray
Write-Host 'AMO rejects a version number it has already seen - use -Bump if this one is taken.' -ForegroundColor DarkGray
