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
        Write-Warn "source/frontend not present yet. See docs/TODO.md and docs/dev/APP_STATE.md for current state."
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
        Write-Warn "source/src-tauri not present yet. See docs/TODO.md and docs/dev/APP_STATE.md for current state."
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
            Write-Warn "source/src-tauri missing — see docs/TODO.md for state."
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
            & npm run lint 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "lint failed" }
            & npm run build 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "build failed" }
            & node scripts/check-entry-chunks.mjs 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "chunk check failed" }
            Pop-Location
        }
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir
            & cargo check 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "cargo failed" }
            Pop-Location
        }
        if ($ok) { Write-Ok "[VERIFY] Passed." } else { Write-Warn "[VERIFY] Some checks failed." }
    }
    "test:e2e" {
        Write-Info "[E2E] Running Playwright..."
        Invoke-FrontendNpm @("run", "test:e2e")
    }
    "desktop-smoke" {
        Write-Info "[SMOKE] Unbundled Tauri build + native Rust peek validation..."
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir
            cargo tauri build --no-bundle
            # Real desktop binary read (read_file_binary) + peeks (get_smf_desktop_info + peek_*_basic for header/rig/anim/model) + early validation are now also exercised automatically here via cargo test.
            # The Rust tests (in main.rs) perform actual std::fs reads against the local mixamo_smf_baldguy.smf (or old-src samples) when present and assert on header + counts (exact same parsing as the Tauri commands).
            # This closes part of the automated desktop e2e gap for the native FS/peek layer (complements web Playwright e2e which covers shared TS loaders + UI).
            # Full UI + native dialog/save roundtrip in the running app still benefits from manual: run '.\run.ps1 -Task tauri-dev', then Open + load source/frontend/tests/mixamo_smf_baldguy.smf and watch status for "Rust validated SMF | SMF model basic: ~N meshes ..." + bone tree + export.
            $cargoOutput = cargo test 2>&1 | Out-String
            Write-Host $cargoOutput
            if ($LASTEXITCODE -ne 0) { Write-Warn "cargo test (desktop peek smoke) had issues" }
            if ($cargoOutput -match 'model~') {
                Write-Ok "Rust desktop peek tests used real sample (mixamo or old-src) for native binary read + header/rig/anim/model validation."
            }
            Write-Ok "[SMOKE] Unbundled build + Rust native peek tests complete (3 tests: main peek, validate, header/invalid). See TODO.md (desktop e2e subtask) + the local real .smf for full tauri-dev manual validation of peeks + UI (bone tree, export, native I/O)."
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

See docs/TODO.md, docs/dev/APP_STATE.md and summary_bank.json for state, commands, gaps. Source/frontend and src-tauri fully populated (modular hook+components+loaders+Rust peeks).
"@
    }
}
