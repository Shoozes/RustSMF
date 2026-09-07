import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function runPowerShell(command) {
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', command], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, RUSTSMF_PROCESS_TEST_ROOT: repoRoot },
  })
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'))
}

test('process ownership matches normalized script arguments, not ports, names, or substrings', () => {
  runPowerShell(String.raw`
    $ErrorActionPreference = 'Stop'
    . ./scripts/dev-process-ownership.ps1
    $root = $env:RUSTSMF_PROCESS_TEST_ROOT
    $cli = Join-Path $root 'source/frontend/node_modules/vite/bin/vite.js'
    $dotCli = Join-Path $root 'source/frontend/node_modules/.bin/../vite/bin/vite.js'
    $foreign = Join-Path (Split-Path $root -Parent) 'other-app/vite/bin/vite.js'
    $cases = @(
        @{ Command = ('node "' + $cli + '" --host 127.0.0.1'); Owned = $true },
        @{ Command = ('"C:\Program Files\nodejs\node.exe" "' + $dotCli + '"'); Owned = $true },
        @{ Command = ('node "' + $cli.ToUpperInvariant().Replace('\', '/') + '"'); Owned = $true },
        @{ Command = ('node "' + $foreign + '" --port 5173'); Owned = $false },
        @{ Command = ('node "' + $cli + '.backup"'); Owned = $false },
        @{ Command = ('node other.js "' + $cli + '"'); Owned = $false },
        @{ Command = ('node --eval "' + $cli + '"'); Owned = $false },
        @{ Command = ('python "' + $cli + '"'); Owned = $false },
        @{ Command = 'node vite.js'; Owned = $false },
        @{ Command = ''; Owned = $false }
    )
    foreach ($case in $cases) {
        $actual = Test-RepoOwnedProcessCommandLine $case.Command @($cli)
        if ($actual -ne $case.Owned) { throw "Wrong ownership for $($case.Command)" }
    }
  `)
})

test('launcher cleanup selects only this checkout from a mixed process inventory', () => {
  runPowerShell(String.raw`
    $ErrorActionPreference = 'Stop'
    . ./scripts/dev-process-ownership.ps1
    $parseErrors = $null
    $tokens = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $env:RUSTSMF_PROCESS_TEST_ROOT 'run.ps1'), [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
    $cleanup = $ast.Find({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Stop-DevServers'
    }, $true)
    . ([scriptblock]::Create($cleanup.Extent.Text))
    $SourceDir = Join-Path $env:RUSTSMF_PROCESS_TEST_ROOT 'source'
    $FrontendDir = Join-Path $SourceDir 'frontend'
    $script:stopped = [System.Collections.Generic.List[int]]::new()
    function Write-Warn([string]$Message) {}
    function Stop-ProcessTree([int]$ProcessId) { $script:stopped.Add($ProcessId) }
    function Get-CimInstance {
        @(
            [pscustomobject]@{ ProcessId = 11; CommandLine = ('node "' + (Join-Path $FrontendDir 'node_modules/.bin/../vite/bin/vite.js') + '"') },
            [pscustomobject]@{ ProcessId = 12; CommandLine = ('node "' + (Join-Path $SourceDir 'node_modules/vite/bin/vite.js') + '"') },
            [pscustomobject]@{ ProcessId = 13; CommandLine = ('node "' + (Join-Path $SourceDir 'node_modules/@tauri-apps/cli/tauri.js') + '"') },
            [pscustomobject]@{ ProcessId = 14; CommandLine = 'node C:\foreign\vite\bin\vite.js --port 5173' },
            [pscustomobject]@{ ProcessId = 15; CommandLine = ('node unrelated.js "' + (Join-Path $FrontendDir 'scripts/start-vite-dev.mjs') + '"') }
        )
    }
    Stop-DevServers
    if (($script:stopped -join ',') -ne '11,12,13') {
        throw "Cleanup selected wrong processes: $($script:stopped -join ',')"
    }
  `)
})
