<#
.SYNOPSIS
    Packages the Firefox extension into a zip ready for upload to addons.mozilla.org.

.DESCRIPTION
    Repo layout:

      docs/       Served by GitHub Pages (Settings > Pages > main, /docs folder).
                  docs/ is the site root, so docs/index.html is
                  https://psmyles.github.io/start-page/index.html.
                  Edit index.html or icon/ and just push - the installed
                  extension picks it up on the next new tab, no re-release.

      extension/  The installable add-on shell. Changing anything in here means
                  a version bump and a fresh upload to AMO.

    Manifest V3 forbids remote code, so script.js, styles.css and the font have
    to be bundled into the package as well as being served from docs/. There is
    still only ONE copy of each in the repo - this script reaches into docs/ for
    them at build time. The trade-off: editing those three does require a new
    version upload, unlike index.html and the tile icons.

.PARAMETER Bump
    Increment the last segment of the manifest version before packaging
    (e.g. 4.0 -> 4.1) and write it back to extension/manifest.json.

.PARAMETER OutputDir
    Where to write the zip. Defaults to .\dist (gitignored).

.EXAMPLE
    .\build-extension.ps1
    Package the current manifest version.

.EXAMPLE
    .\build-extension.ps1 -Bump
    Bump 4.0 -> 4.1 in the manifest, then package.
#>
[CmdletBinding()]
param(
    [switch]$Bump,
    [string]$OutputDir = (Join-Path $PSScriptRoot 'dist')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- What goes in the package ---------------------------------------------
# source path in the repo  ->  path inside the zip
# Entries must land at the archive root; Firefox rejects a nested manifest.json.
$PackageMap = [ordered]@{
    'extension/manifest.json'          = 'manifest.json'
    'extension/local-index.html'       = 'local-index.html'
    'extension/injector.js'            = 'injector.js'
    'docs/script.js'                   = 'script.js'
    'docs/styles.css'                  = 'styles.css'
    'docs/fonts/SwedenSansRegular.ttf' = 'fonts/SwedenSansRegular.ttf'
}

$manifestSource = 'extension/manifest.json'
$manifestPath   = Join-Path $PSScriptRoot $manifestSource

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found at $manifestPath"
}

# --- Read + validate the manifest -----------------------------------------
$rawManifest = Get-Content -LiteralPath $manifestPath -Raw

try {
    $manifest = $rawManifest | ConvertFrom-Json
}
catch {
    throw "extension/manifest.json is not valid JSON: $($_.Exception.Message)"
}

if ($rawManifest -notmatch '"version"\s*:\s*"([^"]+)"') {
    throw 'Could not find a "version" field in extension/manifest.json'
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
# Manifest icon paths are relative to the extension folder, and keep that same
# path inside the package. Safe under StrictMode: test before touching.
if ($manifest.PSObject.Properties['icons']) {
    foreach ($iconProp in $manifest.icons.PSObject.Properties) {
        $iconPath = [string]$iconProp.Value
        if ($iconPath -and -not $PackageMap.Contains("extension/$iconPath")) {
            $PackageMap["extension/$iconPath"] = $iconPath
        }
    }
}

# --- Verify every source file exists before building anything -------------
$missing = @($PackageMap.Keys | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $_))
})
if ($missing.Count -gt 0) {
    throw "Missing source file(s): $($missing -join ', ')"
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
# Built entry-by-entry rather than with Compress-Archive so entry names are
# controlled exactly: forward slashes, and rooted at the archive top level.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($source in $PackageMap.Keys) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            (Join-Path $PSScriptRoot $source),
            ($PackageMap[$source] -replace '\\', '/'),
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

$PackageMap.Keys |
    ForEach-Object {
        [pscustomobject]@{
            Source      = $_
            InPackage   = $PackageMap[$_]
            Bytes       = (Get-Item -LiteralPath (Join-Path $PSScriptRoot $_)).Length
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
