import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createRustVerificationPlan, runRustVerification } from './verify-rust.mjs'
import {
  assertTransitionArtifactHashes,
  createTransitionRuntimePlan,
  executeTransitionRuntimePlan,
} from '../source/pose-contact/tests/transition-runtime-proof.mjs'

function makeRustRepository({ includeTauri = true, includePoseContact = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rustsmf-rust-verification-'))
  for (const [include, directory] of [
    [includeTauri, join(root, 'source', 'src-tauri')],
    [includePoseContact, join(root, 'source', 'pose-contact')],
  ]) {
    if (include) {
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'Cargo.toml'), '[package]\nname = "fixture"\n')
    }
  }
  return root
}

describe('shared Rust verification gate', () => {
  it('checks both native crates and the pose-contact WASM target', () => {
    const root = makeRustRepository()
    try {
      const plan = createRustVerificationPlan(root)
      assert.deepEqual(
        plan.map(({ crate, name }) => `${crate}:${name}`),
        [
          'src-tauri:format',
          'src-tauri:Clippy',
          'src-tauri:tests',
          'src-tauri:native check',
          'pose-contact:format',
          'pose-contact:Clippy',
          'pose-contact:tests',
          'pose-contact:native check',
          'pose-contact:wasm32-unknown-unknown check',
        ],
      )
      assert.deepEqual(plan.at(-1).args, ['check', '--target', 'wasm32-unknown-unknown'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails before running Cargo when either required crate is missing', () => {
    const root = makeRustRepository({ includePoseContact: false })
    let calls = 0
    try {
      assert.throws(
        () => runRustVerification({ root, runCommand: () => { calls += 1; return { status: 0 } } }),
        /pose-contact: .*source[\\/]pose-contact[\\/]Cargo\.toml[\s\S]*Restore the complete repository checkout/,
      )
      assert.equal(calls, 0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('propagates a pose-contact test failure and stops the gate', () => {
    const root = makeRustRepository()
    const plan = createRustVerificationPlan(root)
    const failingIndex = plan.findIndex((step) => step.crate === 'pose-contact' && step.name === 'tests')
    const calls = []
    try {
      assert.throws(
        () => runRustVerification({
          root,
          runCommand: (_command, args, cwd) => {
            calls.push({ args, cwd })
            return calls.length - 1 === failingIndex ? { status: 101 } : { status: 0 }
          },
        }),
        /pose-contact \(tests\): cargo test returned exit code 101/,
      )
      assert.equal(calls.length, failingIndex + 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('propagates a failed wasm32 check', () => {
    const root = makeRustRepository()
    const plan = createRustVerificationPlan(root)
    const calls = []
    try {
      assert.throws(
        () => runRustVerification({
          root,
          runCommand: (_command, args, cwd) => {
            calls.push({ args, cwd })
            return calls.length === plan.length ? { status: 101 } : { status: 0 }
          },
        }),
        /pose-contact \(wasm32-unknown-unknown check\): cargo check --target wasm32-unknown-unknown returned exit code 101/,
      )
      assert.equal(calls.length, plan.length)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports a missing Cargo executable as an actionable tool error', () => {
    const root = makeRustRepository()
    try {
      assert.throws(
        () => runRustVerification({
          root,
          runCommand: () => ({ status: null, error: Object.assign(new Error('not found'), { code: 'ENOENT' }) }),
        }),
        /Cargo, but 'cargo' was not found on PATH[\s\S]*Install or repair the repository Rust toolchain/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('routes both public verification entrypoints through the shared gate', async () => {
    const { readFile } = await import('node:fs/promises')
    const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
    const sourcePackage = JSON.parse(await readFile(join(repositoryRoot, 'source/package.json'), 'utf8'))
    const launcher = await readFile(join(repositoryRoot, 'run.ps1'), 'utf8')
    const verifyBlock = launcher.split(/"verify"\s*\{/)[1]?.split(/"test:e2e"\s*\{/)[0] ?? ''

    assert.match(sourcePackage.scripts['verify:rust'], /node --test \.\.\/scripts\/rust-verification\.test\.mjs/)
    assert.match(sourcePackage.scripts['verify:rust'], /node \.\.\/scripts\/verify-rust\.mjs/)
    assert.equal(
      sourcePackage.scripts['transition:runtime-proof'],
      'node pose-contact/tests/transition-runtime-proof.mjs',
    )
    assert.match(sourcePackage.scripts.verify, /npm run verify:rust/)
    assert.match(verifyBlock, /Invoke-SourceNpm\s+@\("run",\s*"verify:rust"\)/)
    assert.doesNotMatch(verifyBlock, /\bcargo\s+(?:fmt|clippy|test|check)\b/)
  })
})

describe('transition runtime-proof command', () => {
  it('builds native and wasm artifacts before invoking browser parity', () => {
    const plan = createTransitionRuntimePlan('C:/fixture/pose-contact')
    assert.deepEqual(plan.map((step) => step.id), ['native-build', 'wasm-build', 'browser-parity'])
    assert.deepEqual(plan[0].args, ['build', '--example', 'transition_receipt'])
    assert.deepEqual(plan[1].args, [
      'build', '--target', 'wasm32-unknown-unknown', '--example', 'transition_probe',
    ])
    assert.equal(plan[2].env.RUSTSMF_TRANSITION_RUNTIME_PROOF, '1')
  })

  it('does not report browser parity when either artifact build fails', () => {
    const plan = createTransitionRuntimePlan('C:/fixture/pose-contact')
    for (const failingId of ['native-build', 'wasm-build']) {
      const calls = []
      assert.throws(
        () => executeTransitionRuntimePlan(plan, (step) => {
          calls.push(step.id)
          return { status: step.id === failingId ? 101 : 0 }
        }),
        new RegExp(`${failingId}.*exit code 101`),
      )
      assert.ok(!calls.includes('browser-parity'))
    }
  })

  it('rejects standalone browser execution that could consume stale artifacts', () => {
    const browserScript = fileURLToPath(new URL('../source/pose-contact/tests/browser-transition.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [browserScript], {
      encoding: 'utf8',
      env: { ...process.env, RUSTSMF_TRANSITION_RUNTIME_PROOF: '' },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Run npm run transition:runtime-proof/)
  })

  it('rejects artifact drift between browser parity and the final receipt', () => {
    const artifacts = {
      native: { sha256: 'native-build-hash' },
      wasm32: { sha256: 'wasm-build-hash' },
    }
    const comparison = {
      status: 'passed',
      artifacts: {
        native: { sha256: 'native-build-hash' },
        wasm32: { sha256: 'wasm-build-hash' },
      },
    }
    assert.doesNotThrow(() => assertTransitionArtifactHashes(comparison, artifacts))
    assert.throws(
      () => assertTransitionArtifactHashes({ ...comparison, status: 'failed' }, artifacts),
      /did not report a passed comparison/,
    )
    assert.throws(
      () => assertTransitionArtifactHashes({ ...comparison, artifacts: { ...comparison.artifacts, wasm32: { sha256: 'changed' } } }, artifacts),
      /wasm32 transition artifact changed/,
    )
    assert.throws(
      () => assertTransitionArtifactHashes({ status: 'passed' }, artifacts),
      /native transition artifact changed/,
    )
  })
})
