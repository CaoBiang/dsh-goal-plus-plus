<#
.SYNOPSIS
    Build, install, or package the local Goal++ DeepSeek Harness plugin.

.DESCRIPTION
    With no -Action argument, shows an interactive menu. The Install action
    builds the current checkout and registers it in the local dsh web profile.
    The Package action builds the current checkout and writes a distributable
    tarball to the repository's dist directory.

.EXAMPLE
    .\goalpp.ps1

.EXAMPLE
    .\goalpp.ps1 -Action Install

.EXAMPLE
    .\goalpp.ps1 -Action Package
#>

[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Install', 'Package')]
    [string]$Action = 'Menu'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -LiteralPath $Root

$ManifestPath = Join-Path $Root 'package.json'
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "package.json was not found in $Root"
}

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$PackageName = [string]$Manifest.name
$PackageVersion = [string]$Manifest.version

if ([string]::IsNullOrWhiteSpace($PackageName) -or [string]::IsNullOrWhiteSpace($PackageVersion)) {
    throw 'package.json must define both name and version'
}

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH"
    }
}

function Assert-BuildOutputs {
    $required = @('lib/index.js', 'lib/client.js')
    foreach ($relativePath in $required) {
        $path = Join-Path $Root $relativePath
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Build output is missing: $relativePath"
        }
    }
}

function Ensure-Dependencies {
    Assert-Command -Name 'pnpm'

    $pnpmStoreLock = Join-Path $Root 'node_modules/.pnpm/lock.yaml'
    if (Test-Path -LiteralPath $pnpmStoreLock -PathType Leaf) {
        return
    }

    Write-Host '==> Installing project dependencies' -ForegroundColor Cyan
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm install failed with exit code $LASTEXITCODE"
    }
}

function Build-Plugin {
    Ensure-Dependencies

    Write-Host "==> Building $PackageName@$PackageVersion" -ForegroundColor Cyan
    & pnpm run build
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm run build failed with exit code $LASTEXITCODE"
    }

    Assert-BuildOutputs
    Write-Host 'Build complete.' -ForegroundColor Green
}

function Install-LocalPlugin {
    Assert-Command -Name 'dsh'
    Build-Plugin

    Write-Host "==> Removing any previous $PackageName installation from the web profile" -ForegroundColor Cyan
    & dsh plugin --profile web remove $PackageName
    $removeExitCode = $LASTEXITCODE
    if ($removeExitCode -ne 0) {
        Write-Host 'No previous installation was removed; continuing with local registration.' -ForegroundColor DarkYellow
    }

    Write-Host "==> Installing the current checkout into dsh profile 'web'" -ForegroundColor Cyan
    & dsh plugin --profile web add .
    if ($LASTEXITCODE -ne 0) {
        throw "dsh plugin add failed with exit code $LASTEXITCODE"
    }

    Write-Host "Installed $PackageName@$PackageVersion from $Root" -ForegroundColor Green
    Write-Host 'Restart dsh web if it is already running so the new bundle is loaded.' -ForegroundColor DarkYellow
}

function Package-Plugin {
    Assert-Command -Name 'pnpm'
    Build-Plugin

    $dist = Join-Path $Root 'dist'
    New-Item -ItemType Directory -Force -Path $dist | Out-Null

    Write-Host "==> Packing into $dist" -ForegroundColor Cyan
    & pnpm pack --pack-destination $dist
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm pack failed with exit code $LASTEXITCODE"
    }

    $artifact = Get-ChildItem -LiteralPath $dist -Filter "$PackageName-*.tgz" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $artifact) {
        throw "pnpm pack completed but no $PackageName tarball was found in $dist"
    }

    Write-Host "Package ready: $($artifact.FullName)" -ForegroundColor Green
}

function Show-Menu {
    while ($true) {
        Write-Host ''
        Write-Host "Goal++ local plugin tool ($PackageName@$PackageVersion)" -ForegroundColor Cyan
        Write-Host '1. Install current Goal++ into local dsh web profile'
        Write-Host '2. Build and package Goal++ for distribution'
        Write-Host '0. Exit'
        $choice = Read-Host 'Choose an action'

        try {
            switch ($choice) {
                '1' { Install-LocalPlugin }
                '2' { Package-Plugin }
                '0' { return }
                default { Write-Host 'Please choose 1, 2, or 0.' -ForegroundColor DarkYellow; continue }
            }
        } catch {
            Write-Host "Operation failed: $($_.Exception.Message)" -ForegroundColor Red
        }

        [void](Read-Host 'Press Enter to return to the menu')
    }
}

switch ($Action) {
    'Install' { Install-LocalPlugin }
    'Package' { Package-Plugin }
    default { Show-Menu }
}
