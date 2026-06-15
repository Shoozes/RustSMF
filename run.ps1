[CmdletBinding()]
param(
    [string]$Task = "tauri-dev"
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
        Write-Warn "source/frontend not present yet. See docs/dev/TODO.md and docs/dev/APP_STATE.md for current state."
        return $false
    }
    Push-Location $FrontendDir
    try {
        & npm @NpmArgs 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        return $exitCode -eq 0
    } finally {
        Pop-Location
    }
}

function Invoke-SourceNpm([string[]]$NpmArgs) {
    if (-not (Test-Path -LiteralPath $SourceDir)) {
        Write-Warn "source not present yet. See docs/dev/TODO.md and docs/dev/APP_STATE.md for current state."
        return $false
    }
    Push-Location $SourceDir
    try {
        & npm @NpmArgs 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        return $exitCode -eq 0
    } finally {
        Pop-Location
    }
}

switch -Exact ($Task.ToLowerInvariant()) {
    "setup" {
        Write-Info "[SETUP] Installing frontend deps + Playwright..."
        Ensure-Dirs
        Stop-StaleDevStack
        if (Test-Path $SourceDir) {
            Push-Location $SourceDir
            npm install
            npx playwright install --with-deps | Out-Null
            Pop-Location
        } else {
            Write-Warn "Skip npm (no source yet)"
        }
        if (Test-Path $SrcTauriDir) {
            Write-Info "[SETUP] cargo check in src-tauri..."
            Push-Location $SrcTauriDir; cargo check; Pop-Location
        }
        Write-Ok "[SETUP] Complete (or partial if source not scaffolded)."
    }
    "dev" {
        Write-Info "[DEV] Starting Vite frontend at http://localhost:5173 (browser Three.js editor)..."
        Stop-StaleDevStack
        if (-not (Invoke-FrontendNpm @("run", "dev"))) { exit 1 }
    }
    "tauri-dev" {
        Write-Info "[TAURI-DEV] Starting Tauri desktop shell..."
        Stop-StaleDevStack
        if (-not (Invoke-SourceNpm @("run", "tauri:dev"))) { exit 1 }
    }
    "compile" {
        Write-Info "[COMPILE] Building Tauri desktop package..."
        if (-not (Invoke-FrontendNpm @("run", "build"))) { exit 1 }
        if (-not (Invoke-SourceNpm @("run", "tauri:build"))) { exit 1 }
    }
    "verify" {
        Write-Info "[VERIFY] Lint + build + docs/context checks..."
        $ok = $true
        & python scripts/verify-context-bank.py 2>&1 | Out-String | Write-Host
        if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "context bank validation failed" }
        if (Test-Path $FrontendDir) {
            Push-Location $FrontendDir
            & npm run lint 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "lint failed" }
            & npm run typecheck 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "typecheck failed" }
            & npm run typecheck:test 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "test typecheck failed" }
            & npm run build 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "build failed" }
            & node scripts/check-entry-chunks.mjs 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "chunk check failed" }
            & npm run test:unit 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "unit tests failed" }
            Pop-Location
        }
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir
            & cargo check 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "cargo failed" }
            Pop-Location
        }
        if ($ok) {
            Write-Ok "[VERIFY] Passed."
        } else {
            Write-Warn "[VERIFY] Some checks failed."
            exit 1
        }
    }
    "test:e2e" {
        Write-Info "[E2E] Running Playwright..."
        if (-not (Invoke-FrontendNpm @("run", "test:e2e"))) { exit 1 }
    }
    "test:visual-strict" {
        Write-Info "[VISUAL] Running strict SMF visual snapshot checks..."
        if (-not (Invoke-FrontendNpm @("run", "test:visual-strict"))) { exit 1 }
    }
    "test:visual-update" {
        Write-Info "[VISUAL] Updating strict SMF visual snapshots..."
        if (-not (Invoke-FrontendNpm @("run", "test:visual-update"))) { exit 1 }
    }
    "desktop-smoke" {
        Write-Info "[SMOKE] Unbundled Tauri build + native Rust peek validation..."
        if (Test-Path $SrcTauriDir) {
            if (-not (Invoke-FrontendNpm @("run", "tauri:build:smoke"))) { throw "tauri build --no-bundle failed" }
            Push-Location $SrcTauriDir
            # Rust tests exercise native binary reads and the same SMF peek parser used by Tauri commands.
            # Playwright native.spec covers deterministic open/read/save/cancel IPC behavior.
            $cargoOutput = cargo test 2>&1 | Out-String
            Write-Host $cargoOutput
            if ($LASTEXITCODE -ne 0) { throw "cargo test (desktop peek smoke) failed" }
            if ($cargoOutput -match 'model~') {
                Write-Ok "Rust desktop peek tests used real sample (mixamo or old-src) for native binary read + header/rig/anim/model validation."
            }
            if ($cargoOutput -match 'valid SMF|rig ~|anim ~') {
                Write-Ok "Rust tests exercised combined desktop info + rig/anim counts (get_smf_desktop_info, peek basics)."
            }
            if ($cargoOutput -match 'SMF rig basic|SMF anim basic|SMF model basic') {
                Write-Ok "Rust tests validated individual peek basics (rig/anim/model counts from real sample or sim)."
            }
            if ($cargoOutput -match 'SMF rig basic|SMF anim basic|SMF model basic|valid SMF') {
                Write-Ok "Desktop-smoke validated native peeks and info for .smf samples (rig/anim/model + header/validate)."
            }
            if ($cargoOutput -match 'Rust desktop peek smoke on') {
                Write-Ok "Rust desktop peek smoke println executed (sample used for real binary read + parse)."
            }
            Pop-Location
            if (Test-Path $FrontendDir) {
                Write-Info "[SMOKE] Running Playwright native IPC mock suite..."
                Push-Location $FrontendDir
                try {
                    & npm run test:e2e -- tests/native.spec.ts
                    if ($LASTEXITCODE -ne 0) { throw "Playwright native IPC mock suite failed" }
                } finally {
                    Pop-Location
                }
            }
            Write-Ok "[SMOKE] Unbundled build, Rust native peek tests, and Playwright native IPC mock suite complete."
        } else {
            Write-Warn "src-tauri missing."
            exit 1
        }
    }
    default {
        Write-Host @"
RustSMF run.ps1 (minimal harness launcher)

Default: starts the Tauri desktop app. Use -Task help to print this help.

Tasks (used by .tools/project.json):
  setup         - npm + playwright + cargo check
  dev           - Vite web dev (frontend)
  tauri-dev     - Tauri desktop dev
  compile       - production desktop build
  verify        - lint/typecheck/build/chunk/unit/cargo checks
  test:e2e      - Playwright
  test:visual-strict - opt-in strict SMF visual snapshot checks
  test:visual-update - refresh opt-in strict SMF visual snapshots
  desktop-smoke - unbundled tauri build + basic check

Examples:
  .\run.ps1
  .\run.bat
  .\run.ps1 -Task verify

See docs/dev/TODO.md, docs/dev/APP_STATE.md and summary_bank.json for state, commands, gaps. Source/frontend and src-tauri fully populated (modular hook+components+loaders+Rust peeks).
"@
    }
}
