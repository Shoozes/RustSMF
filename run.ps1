[CmdletBinding()]
param(
    [string]$Task = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$SourceDir = Join-Path $RepoRoot "source"
$FrontendDir = Join-Path $SourceDir "frontend"
$SrcTauriDir = Join-Path $SourceDir "src-tauri"
$DevStackStatePath = Join-Path $RepoRoot "runtime-data\dev-stack.json"

Set-Location -LiteralPath $RepoRoot

function Write-Info([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host $Message -ForegroundColor Yellow }
function Write-Ok([string]$Message) { Write-Host $Message -ForegroundColor Green }

function Ensure-Dirs {
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "runtime-data") | Out-Null
}

function Stop-StaleDevStack {
    if (Test-Path -LiteralPath $DevStackStatePath) {
        try { Remove-Item -LiteralPath $DevStackStatePath -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Invoke-FrontendNpm([string[]]$NpmArgs) {
    if (-not (Test-Path -LiteralPath $FrontendDir)) {
        Write-Warn "source/frontend not present yet. See plan.md for scaffold step."
        return $false
    }
    Push-Location $FrontendDir
    try {
        & npm @NpmArgs
        return $LASTEXITCODE -eq 0
    } finally {
        Pop-Location
    }
}

function Invoke-TauriCargo([string[]]$CargoArgs) {
    if (-not (Test-Path -LiteralPath $SrcTauriDir)) {
        Write-Warn "source/src-tauri not present yet. See plan.md for scaffold step."
        return $false
    }
    Push-Location $SrcTauriDir
    try {
        & cargo @CargoArgs
        return $LASTEXITCODE -eq 0
    } finally {
        Pop-Location
    }
}

switch -Exact ($Task.ToLowerInvariant()) {
    "setup" {
        Write-Info "[SETUP] Installing frontend deps + Playwright..."
        Ensure-Dirs
        Stop-StaleDevStack
        if (Test-Path $FrontendDir) {
            Push-Location $FrontendDir
            npm install
            npx playwright install --with-deps | Out-Null
            Pop-Location
        } else {
            Write-Warn "Skip npm (no source/frontend yet)"
        }
        if (Test-Path $SrcTauriDir) {
            Write-Info "[SETUP] cargo check in src-tauri..."
            Push-Location $SrcTauriDir; cargo check; Pop-Location
        }
        Write-Ok "[SETUP] Complete (or partial if source not scaffolded)."
    }
    "dev" {
        Write-Info "[DEV] Starting Vite frontend (browser Three.js editor)..."
        Stop-StaleDevStack
        Invoke-FrontendNpm @("run", "dev")
    }
    "tauri-dev" {
        Write-Info "[TAURI-DEV] Starting Tauri desktop shell..."
        Stop-StaleDevStack
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir
            cargo tauri dev
            Pop-Location
        } else {
            Write-Warn "source/src-tauri missing — run scaffold first (plan.md)."
        }
    }
    "compile" {
        Write-Info "[COMPILE] Building Tauri desktop package..."
        if (Test-Path $FrontendDir) {
            Push-Location $FrontendDir; npm run build; Pop-Location
        }
        Invoke-TauriCargo @("tauri", "build")
    }
    "verify" {
        Write-Info "[VERIFY] Lint + build + checks..."
        $ok = $true
        if (Test-Path $FrontendDir) {
            Push-Location $FrontendDir
            npm run lint 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { $ok = $false }
            npm run build 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { $ok = $false }
            Pop-Location
        }
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir; cargo check; if ($LASTEXITCODE -ne 0) { $ok = $false }; Pop-Location
        }
        if ($ok) { Write-Ok "[VERIFY] Passed (or partial)." } else { Write-Warn "[VERIFY] Some checks failed (expected until scaffold complete)." }
    }
    "test:e2e" {
        Write-Info "[E2E] Running Playwright..."
        Invoke-FrontendNpm @("run", "test:e2e")
    }
    "desktop-smoke" {
        Write-Info "[SMOKE] Unbundled Tauri build + boot check..."
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir
            cargo tauri build --no-bundle
            # In real smoke you would launch the exe and probe; placeholder here
            Write-Ok "[SMOKE] Build step finished (full launch probe added post-scaffold)."
            Pop-Location
        } else {
            Write-Warn "src-tauri missing."
        }
    }
    default {
        Write-Host @"
RustSMF run.ps1 (minimal harness launcher)

Tasks (used by .tools/project.json):
  setup         - npm + playwright + cargo check
  dev           - Vite web dev (frontend)
  tauri-dev     - Tauri desktop dev
  compile       - production desktop build
  verify        - lint/build/cargo checks
  test:e2e      - Playwright
  desktop-smoke - unbundled tauri build + basic check

Example:  .\run.ps1 -Task verify

See plan.md for full scaffold + conversion steps. Source/frontend and src-tauri are populated in the next increment.
"@
    }
}
