[CmdletBinding()]
param(
    [string]$Task = "menu",
    [string]$GenEyeRoot = "",
    [switch]$NoGenEye
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$SourceDir = Join-Path $RepoRoot "source"
$FrontendDir = Join-Path $SourceDir "frontend"
$SrcTauriDir = Join-Path $SourceDir "src-tauri"
$DevStackStatePath = Join-Path $RepoRoot "runtime-data\dev-stack.json"
$NodeExecutable = (Get-Command node -ErrorAction SilentlyContinue).Source
$NpmCliPath = if ($NodeExecutable) {
    Join-Path (Split-Path -Path $NodeExecutable -Parent) "node_modules\npm\bin\npm-cli.js"
} else {
    $null
}
if ($NpmCliPath -and -not (Test-Path -LiteralPath $NpmCliPath -PathType Leaf)) {
    $NpmCliPath = $null
}
$PowerShellExe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $PowerShellExe) {
    $PowerShellExe = (Get-Command powershell -ErrorAction Stop).Source
}

Set-Location -LiteralPath $RepoRoot

function Write-Info([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host $Message -ForegroundColor Yellow }
function Write-Ok([string]$Message) { Write-Host $Message -ForegroundColor Green }

function Invoke-NpmCommand([string[]]$NpmArgs) {
    if ($NodeExecutable -and $NpmCliPath) {
        & $NodeExecutable $NpmCliPath @NpmArgs
        return
    }

    $npmCommand = Get-Command npm -ErrorAction Stop
    & $npmCommand.Source @NpmArgs
}

function ConvertTo-PowerShellLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

function New-NpmPowerShellLaunch([string]$WorkingDirectory, [string[]]$NpmArgs) {
    $workingDirectoryLiteral = ConvertTo-PowerShellLiteral $WorkingDirectory
    $argumentLiterals = @($NpmArgs | ForEach-Object { ConvertTo-PowerShellLiteral $_ })
    if ($NodeExecutable -and $NpmCliPath) {
        $commandTokens = @(
            (ConvertTo-PowerShellLiteral $NodeExecutable),
            (ConvertTo-PowerShellLiteral $NpmCliPath)
        ) + $argumentLiterals
    } else {
        $npmCommand = (Get-Command npm -ErrorAction Stop).Source
        $commandTokens = @((ConvertTo-PowerShellLiteral $npmCommand)) + $argumentLiterals
    }
    return "& { Set-Location -LiteralPath $workingDirectoryLiteral; & $($commandTokens -join ' ') }"
}

function Get-NpmShellCommand([string[]]$NpmArgs) {
    $tokens = if ($NodeExecutable -and $NpmCliPath) {
        @($NodeExecutable, $NpmCliPath) + $NpmArgs
    } else {
        @((Get-Command npm -ErrorAction Stop).Source) + $NpmArgs
    }
    return ($tokens | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join " "
}

function Invoke-ContextBankVerification {
    if (-not $NodeExecutable) {
        Write-Warn "Node.js 22 or newer is required for context-bank verification."
        return $false
    }

    & $NodeExecutable scripts/verify-context-bank.mjs 2>&1 | Out-String | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "context bank validation failed"
        return $false
    }

    & $NodeExecutable --test scripts/context-bank.test.mjs 2>&1 | Out-String | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "context bank tests failed"
        return $false
    }
    return $true
}

function Ensure-Dirs {
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "runtime-data") | Out-Null
}

function Stop-ProcessTree([int]$ProcessId) {
    if (-not $ProcessId -or $ProcessId -le 0) { return }
    try {
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
        foreach ($child in $children) {
            Stop-ProcessTree -ProcessId $child.ProcessId
        }
    } catch {}
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-DevServers {
    # 1. Exact port owner (5173 is our dev/preview port)
    try {
        $conns = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($p -and ($p.ProcessName -eq 'node' -or $p.ProcessName -eq 'node.exe')) {
                Write-Warn "  Killing node (pid $($p.Id)) listening on :5173"
                Stop-ProcessTree $p.Id
            }
        }
    } catch {}

    # 2. Any node whose command line mentions vite or our managed wrapper
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='node'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'vite' -or $_.CommandLine -match 'start-vite-dev' }
        foreach ($n in $procs) {
            Write-Warn "  Killing node (pid $($n.ProcessId)) (vite dev / wrapper)"
            Stop-ProcessTree $n.ProcessId
        }
    } catch {}

    # 3. Extra sweep for tauri-cli node processes that may be lingering from outer shell close
    try {
        Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            if ($cmd -and ($cmd -match 'tauri' -or $cmd -match 'start-vite-dev')) {
                Write-Warn "  Killing node (pid $($_.Id)) (tauri cli / dev manager)"
                Stop-ProcessTree $_.Id
            }
        }
    } catch {}
}

function Stop-StaleDevStack {
    if (Test-Path -LiteralPath $DevStackStatePath) {
        try { Remove-Item -LiteralPath $DevStackStatePath -Force -ErrorAction SilentlyContinue } catch {}
    }
    Stop-DevServers
}

function Invoke-Clean {
    Write-Info "[CLEAN] Stopping dev servers and removing generated build artifacts..."
    Stop-StaleDevStack

    $paths = @(
        (Join-Path $FrontendDir "dist"),
        (Join-Path $FrontendDir "playwright-report"),
        (Join-Path $FrontendDir "test-results")
    )
    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path) {
            Write-Warn "  Removing $path"
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }

    if (Test-Path -LiteralPath $SrcTauriDir) {
        Push-Location $SrcTauriDir
        try {
            & cargo clean
            if ($LASTEXITCODE -ne 0) { throw "cargo clean failed" }
        } finally {
            Pop-Location
        }
    }

    Write-Ok "[CLEAN] Complete."
}

function Show-RunMenu {
    Write-Host ""
    Write-Host "RustSMF launcher"
    Write-Host ""
    Write-Host "1. Fetch/Setup"
    Write-Host "2. Run if already installed"
    Write-Host "3. Compile"
    Write-Host "4. Clean"
    Write-Host "5. Verify"
    Write-Host "6. Browser dev only"
    Write-Host "7. Help"
    Write-Host "0. Exit"
    Write-Host ""

    $choice = Read-Host "Select an option"
    switch ($choice.Trim()) {
        "1" { return "setup" }
        "2" { return "tauri-dev" }
        "3" { return "compile" }
        "4" { return "clean" }
        "5" { return "verify" }
        "6" { return "dev" }
        "7" { return "help" }
        "0" { return "exit" }
        default {
            Write-Warn "Unknown option: $choice"
            return "menu"
        }
    }
}

# Windows Job Object so that closing the cmd/pwsh window (X button) kills the entire dev subtree
# even without the finally block running. Child processes created by a job member are auto-added to the job.
function New-KillOnCloseJob {
    $src = @'
using System;
using System.Runtime.InteropServices;
public static class Job {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr a, string lpName);
    [DllImport("kernel32.dll")]
    private static extern bool SetInformationJobObject(IntPtr hJob, int infoType, IntPtr lpInfo, uint cb);
    [DllImport("kernel32.dll")]
    private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimit {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinWS;
        public UIntPtr MaxWS;
        public uint ActiveProcessLimit;
        public long Affinity;
        public uint Priority;
        public uint Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong a, b, c, d, e, f, g, h, i; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimit {
        public BasicLimit Basic;
        public IoCounters Io;
        public UIntPtr ProcessMem;
        public UIntPtr JobMem;
        public UIntPtr PeakProc;
        public UIntPtr PeakJob;
    }
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    public static IntPtr Create() {
        IntPtr h = CreateJobObject(IntPtr.Zero, null);
        if (h == IntPtr.Zero) return IntPtr.Zero;
        ExtendedLimit el = new ExtendedLimit();
        el.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int sz = Marshal.SizeOf(typeof(ExtendedLimit));
        IntPtr p = Marshal.AllocHGlobal(sz);
        Marshal.StructureToPtr(el, p, false);
        bool ok = SetInformationJobObject(h, JobObjectExtendedLimitInformation, p, (uint)sz);
        Marshal.FreeHGlobal(p);
        return ok ? h : IntPtr.Zero;
    }
    public static bool Assign(IntPtr job, IntPtr procHandle) {
        if (job == IntPtr.Zero || procHandle == IntPtr.Zero) return false;
        return AssignProcessToJobObject(job, procHandle);
    }
}
'@
    Add-Type -TypeDefinition $src -PassThru | Out-Null
    return [Job]::Create()
}

function Invoke-FrontendNpm([string[]]$NpmArgs) {
    if (-not (Test-Path -LiteralPath $FrontendDir)) {
        Write-Warn "Required source/frontend directory is missing. Restore the repository checkout before running frontend tasks."
        return $false
    }
    Push-Location $FrontendDir
    try {
        Invoke-NpmCommand $NpmArgs 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        return $exitCode -eq 0
    } finally {
        Pop-Location
    }
}

function Resolve-GenEyeRunBat {
    $candidates = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($env:GENEYE_RUN_BAT)) {
        $runBat = try { Resolve-Path -LiteralPath $env:GENEYE_RUN_BAT -ErrorAction Stop } catch { $null }
        if ($runBat -and (Test-Path -LiteralPath $runBat.ProviderPath -PathType Leaf)) {
            return $runBat.ProviderPath
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($GenEyeRoot)) { $candidates.Add($GenEyeRoot) }
    if (-not [string]::IsNullOrWhiteSpace($env:GENEYE_ROOT)) { $candidates.Add($env:GENEYE_ROOT) }
    $candidates.Add("C:\DevStuff\Three-sisters\GenEye")
    $candidates.Add((Join-Path $RepoRoot "..\GenEye"))
    $candidates.Add((Join-Path $RepoRoot "..\..\GenEye"))
    $candidates.Add((Join-Path $RepoRoot "..\Three-sisters\GenEye"))

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $resolved = try { Resolve-Path -LiteralPath $candidate -ErrorAction Stop } catch { $null }
        if (-not $resolved) { continue }
        $runBat = Join-Path $resolved.ProviderPath "run.bat"
        if (Test-Path -LiteralPath $runBat -PathType Leaf) {
            return $runBat
        }
    }
    return $null
}

function Read-GenEyeProjectStatus([string]$ReportPath) {
    if ([string]::IsNullOrWhiteSpace($ReportPath) -or -not (Test-Path -LiteralPath $ReportPath)) {
        return $null
    }
    try {
        $report = Get-Content -Raw -LiteralPath $ReportPath | ConvertFrom-Json
    } catch {
        return $null
    }
    if ($null -eq $report.project_tests) {
        return $null
    }
    $exitCode = if ($null -ne $report.project_tests.exit_code) {
        [int]$report.project_tests.exit_code
    } elseif ($report.project_tests.status -eq "passed") {
        0
    } else {
        1
    }
    return [pscustomobject]@{
        Status = [string]$report.project_tests.status
        ExitCode = $exitCode
    }
}

function Invoke-GenEyePlaywright {
    if ($NoGenEye -or $env:RUSTSMF_NO_GENEYE -eq "1") {
        Write-Info "[GENEYE] Disabled for this run; running browser-only Playwright."
        return $false
    }

    $runBat = Resolve-GenEyeRunBat
    if (-not $runBat) {
        Write-Warn "[GENEYE] GenEye not found; running browser-only Playwright."
        return $false
    }

    Ensure-Dirs
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outDir = Join-Path $RepoRoot "runtime-data\geneye-playwright-runs\rustsmf-e2e-$stamp"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $reportJson = Join-Path $outDir "project-report.json"
    $projectCommand = Get-NpmShellCommand @("run", "test:e2e", "--", "--reporter=json")
    $genEyeRoot = Split-Path -Path $runBat -Parent
    $args = @(
        "-Task", "playwright-full",
        "-Group", "geneye-watch-fixture",
        "-PlaywrightTestCwd", $FrontendDir,
        "-PlaywrightTestCommand", $projectCommand,
        "-PlaywrightTestReportJson", $reportJson,
        "-AllowGenEyeFailure",
        "-Out", $outDir,
        "-DurationMs", "600000",
        "-VideoFrameLimit", "4",
        "-MaxFrames", "0"
    )

    Write-Info "[GENEYE] Running advisory GenEye Playwright wrapper."
    Write-Info "[GENEYE] Evidence output: $outDir"
    Push-Location -LiteralPath $genEyeRoot
    try {
        & $runBat @args
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    $summaryPath = Join-Path $outDir "summary.json"
    $fallbackPath = Join-Path $outDir "advisory-fallback-summary.json"
    $summaryProject = Read-GenEyeProjectStatus $summaryPath
    $fallbackProject = Read-GenEyeProjectStatus $fallbackPath
    $projectStatus = if ($summaryProject) { $summaryProject } else { $fallbackProject }
    if ($projectStatus) {
        Write-Info "[GENEYE] run_path=$outDir project_tests.status=$($projectStatus.Status) project_tests.exit_code=$($projectStatus.ExitCode)"
    } else {
        Write-Warn "[GENEYE] run_path=$outDir project_tests.status=unknown project_tests.exit_code=na"
    }

    if ($exitCode -eq 0) {
        if (Test-Path -LiteralPath $summaryPath) {
            Write-Ok "[GENEYE] Advisory subagent evidence ready: $summaryPath"
            return $true
        }
        if (Test-Path -LiteralPath $fallbackPath) {
            Write-Warn "[GENEYE] Enrichment fell back to direct RustSMF tests: $fallbackPath"
            return $true
        }
        Write-Warn "[GENEYE] Wrapper exited 0 without an expected report; rerunning browser-only Playwright."
        return $false
    }

    if ($projectStatus) {
        if ($projectStatus.ExitCode -ne 0) {
            Write-Warn "[E2E] RustSMF Playwright failed under GenEye wrapper (exit $($projectStatus.ExitCode))."
            exit $projectStatus.ExitCode
        }
        Write-Warn "[GENEYE] GenEye wrapper failed after RustSMF tests passed; treating GenEye as advisory."
        return $true
    }

    Write-Warn "[GENEYE] Wrapper failed before producing RustSMF project-test evidence (exit $exitCode); running browser-only Playwright."
    return $false
}

function Invoke-SourceNpm([string[]]$NpmArgs) {
    if (-not (Test-Path -LiteralPath $SourceDir)) {
        Write-Warn "Required source directory is missing. Restore the repository checkout before running source tasks."
        return $false
    }
    Push-Location $SourceDir
    try {
        Invoke-NpmCommand $NpmArgs 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        return $exitCode -eq 0
    } finally {
        Pop-Location
    }
}

# Global safety nets: always attempt to reap dev servers on Ctrl+C / terminating errors / normal pwsh exit.
# (Job object above provides the hard guarantee for window X close of the launcher.)
trap {
    Stop-DevServers
    break
}
try {
    Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-DevServers } -ErrorAction SilentlyContinue | Out-Null
} catch {}

while ($Task.ToLowerInvariant() -eq "menu") {
    $Task = Show-RunMenu
}

$NormalizedTask = switch -Exact ($Task.ToLowerInvariant()) {
    "1" { "setup" }
    "fetch" { "setup" }
    "fetch/setup" { "setup" }
    "2" { "tauri-dev" }
    "run" { "tauri-dev" }
    "3" { "compile" }
    "build" { "compile" }
    "4" { "clean" }
    "5" { "verify" }
    "context" { "context" }
    "6" { "dev" }
    "7" { "help" }
    "0" { "exit" }
    default { $Task.ToLowerInvariant() }
}

switch -Exact ($NormalizedTask) {
    "exit" {
        Write-Info "Exiting."
    }
    "setup" {
        Write-Info "[SETUP] Installing frontend deps + Playwright..."
        Ensure-Dirs
        Stop-StaleDevStack
        if (Test-Path $SourceDir) {
            if (-not (Invoke-SourceNpm @("install"))) { exit 1 }
            if (-not (Invoke-FrontendNpm @("exec", "--", "playwright", "install", "--with-deps"))) { exit 1 }
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

        # Launch under our control so we can tie lifetime (cmd window close, Ctrl+C, script exit)
        $launch = New-NpmPowerShellLaunch $FrontendDir @("run", "dev")
        $proc = Start-Process -FilePath $PowerShellExe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $launch) `
            -NoNewWindow -PassThru -WorkingDirectory $RepoRoot
        $job = New-KillOnCloseJob
        if ($job -ne [IntPtr]::Zero -and $proc.Handle -ne [IntPtr]::Zero) {
            try { [Job]::Assign($job, $proc.Handle) | Out-Null } catch {}
        }
        try {
            $proc.WaitForExit()
            $global:LASTEXITCODE = $proc.ExitCode
            $ok = $proc.ExitCode -eq 0
            if (-not $ok) { exit 1 }
        } finally {
            if (-not $proc.HasExited) { try { $proc.Kill($true) } catch {} }
            Stop-ProcessTree $proc.Id
            Stop-DevServers
        }
    }
    "tauri-dev" {
        Write-Info "[TAURI-DEV] Starting Tauri desktop shell..."
        Stop-StaleDevStack

        # Launch under our control (the npm -> tauri cli -> our start-vite-dev.mjs wrapper).
        # The wrapper + job + explicit tree kill guarantee no rogue node servers remain
        # when the cmd/pwsh window is closed or the script is interrupted.
        $launch = New-NpmPowerShellLaunch $SourceDir @("run", "tauri:dev")
        $proc = Start-Process -FilePath $PowerShellExe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $launch) `
            -NoNewWindow -PassThru -WorkingDirectory $RepoRoot
        $job = New-KillOnCloseJob
        if ($job -ne [IntPtr]::Zero -and $proc.Handle -ne [IntPtr]::Zero) {
            try { [Job]::Assign($job, $proc.Handle) | Out-Null } catch {}
        }
        try {
            $proc.WaitForExit()
            $global:LASTEXITCODE = $proc.ExitCode
            $ok = $proc.ExitCode -eq 0
            if (-not $ok) { exit 1 }
        } finally {
            if (-not $proc.HasExited) { try { $proc.Kill($true) } catch {} }
            Stop-ProcessTree $proc.Id
            Stop-DevServers
        }
    }
    "compile" {
        Write-Info "[COMPILE] Building Tauri desktop package..."
        if (-not (Invoke-FrontendNpm @("run", "build"))) { exit 1 }
        if (-not (Invoke-SourceNpm @("run", "tauri:build"))) { exit 1 }
    }
    "clean" {
        Invoke-Clean
    }
    "context" {
        Write-Info "[CONTEXT] Validating and testing summary-bank routing..."
        if (-not (Invoke-ContextBankVerification)) { exit 1 }
        Write-Ok "[CONTEXT] Passed."
    }
    "verify" {
        Write-Info "[VERIFY] Lint coverage + lint + build + docs/context checks..."
        $ok = $true
        if (-not (Invoke-ContextBankVerification)) { $ok = $false }
        if (Test-Path $FrontendDir) {
            if (-not (Invoke-FrontendNpm @("run", "check:lint-coverage"))) { $ok = $false; Write-Warn "lint coverage check failed" }
            if (-not (Invoke-FrontendNpm @("run", "lint"))) { $ok = $false; Write-Warn "lint failed" }
            if (-not (Invoke-FrontendNpm @("run", "typecheck"))) { $ok = $false; Write-Warn "typecheck failed" }
            if (-not (Invoke-FrontendNpm @("run", "typecheck:test"))) { $ok = $false; Write-Warn "test typecheck failed" }
            if (-not (Invoke-FrontendNpm @("run", "check:production-any"))) { $ok = $false; Write-Warn "production any boundary check failed" }
            if (-not (Invoke-FrontendNpm @("run", "build"))) { $ok = $false; Write-Warn "build failed" }
            if (-not (Invoke-FrontendNpm @("run", "check:entry-chunks"))) { $ok = $false; Write-Warn "chunk check failed" }
            if (-not (Invoke-FrontendNpm @("run", "test:unit"))) { $ok = $false; Write-Warn "unit tests failed" }
        }
        if (Test-Path $SrcTauriDir) {
            Push-Location $SrcTauriDir
            & cargo fmt --all -- --check 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "cargo fmt check failed" }
            & cargo clippy --all-targets -- -D warnings 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "cargo clippy failed" }
            & cargo test 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "cargo test failed" }
            & cargo check 2>&1 | Out-String | Write-Host
            if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Warn "cargo check failed" }
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
        $genEyeRanProject = Invoke-GenEyePlaywright
        if (-not $genEyeRanProject) {
            if (-not (Invoke-FrontendNpm @("run", "test:e2e"))) { exit 1 }
        }
    }
    "test:unit" {
        Write-Info "[UNIT] Running frontend unit tests..."
        if (-not (Invoke-FrontendNpm @("run", "test:unit"))) { exit 1 }
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
                if (-not (Invoke-FrontendNpm @("run", "test:e2e", "--", "tests/native.spec.ts"))) {
                    throw "Playwright native IPC mock suite failed"
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

Default: opens a simple numbered menu. Use -Task help to print this help.

Menu:
  1. Fetch/Setup
  2. Run if already installed
  3. Compile
  4. Clean
  5. Verify
  6. Browser dev only
  7. Help
  0. Exit

Tasks:
  menu          - show the numbered menu
  setup         - npm + playwright + cargo check
  run           - Tauri desktop dev (same as tauri-dev)
  dev           - Vite web dev (frontend only)
  compile       - production desktop build
  clean         - stop dev servers and remove generated build artifacts
  verify        - lint coverage/lint/typecheck/build/chunk/unit/Rust fmt+clippy+test+check
  context       - validate and test summary-bank routing
  test:unit     - frontend unit tests only
  test:e2e      - Playwright (optional GenEye advisory wrapper; use -NoGenEye for browser-only)
  test:visual-strict - opt-in strict SMF visual snapshot checks
  test:visual-update - refresh opt-in strict SMF visual snapshots
  desktop-smoke - release build + Rust tests + native IPC browser checks

Launcher safety: run.ps1 (and run.bat) provide full orphan protection for dev servers (Job object for cmd X-close, tree kills, port/cmdline sweeps on entry, finally/traps). Direct 'tauri dev' (or npm run tauri:dev from source) has only the mjs wrapper (signals + poll + tree kill on its child). Prefer the launcher for clean close/re-launch on Windows.

Examples:
  .\run.ps1
  .\run.bat
  .\run.bat 2
  .\run.ps1 -Task run
  .\run.ps1 -Task verify
  .\run.ps1 -Task test:e2e -GenEyeRoot C:\DevStuff\Three-sisters\GenEye
  .\run.ps1 -Task test:e2e -NoGenEye

See docs/dev/TODO.md, docs/dev/APP_STATE.md and summary_bank.json for state, commands, gaps. Source/frontend and src-tauri fully populated (modular hook+components+loaders+Rust peeks).
"@
    }
}
