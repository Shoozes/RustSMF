import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const crateRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const browserScript = fileURLToPath(new URL('./browser-transition.mjs', import.meta.url))
const nativeArtifact = resolve(crateRoot, 'target/debug/examples/transition_receipt' + (process.platform === 'win32' ? '.exe' : ''))
const wasmArtifact = resolve(crateRoot, 'target/wasm32-unknown-unknown/debug/examples/transition_probe.wasm')
const comparePaths = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

export function createTransitionRuntimePlan(cratePath = crateRoot) {
  return [
    {
      id: 'native-build',
      command: 'cargo',
      args: ['build', '--example', 'transition_receipt'],
      cwd: cratePath,
    },
    {
      id: 'wasm-build',
      command: 'cargo',
      args: ['build', '--target', 'wasm32-unknown-unknown', '--example', 'transition_probe'],
      cwd: cratePath,
    },
    {
      id: 'browser-parity',
      command: process.execPath,
      args: [browserScript],
      cwd: repositoryRoot,
      captureOutput: true,
      env: { ...process.env, RUSTSMF_TRANSITION_RUNTIME_PROOF: '1' },
    },
  ]
}

function runCommand(step) {
  return spawnSync(step.command, step.args, {
    cwd: step.cwd,
    env: step.env ?? process.env,
    encoding: 'utf8',
    stdio: step.captureOutput ? 'pipe' : 'inherit',
    windowsHide: true,
  })
}

export function executeTransitionRuntimePlan(plan, invoke = runCommand) {
  let browserResult
  for (const step of plan) {
    const result = invoke(step)
    const command = `${step.command} ${step.args.join(' ')}`
    if (result.error) {
      if (result.error.code === 'ENOENT' && step.command === 'cargo') {
        throw new Error(`Runtime proof requires Cargo, but 'cargo' was not found on PATH during ${step.id}. Install or repair the repository Rust toolchain.`)
      }
      throw new Error(`Could not start ${command} during ${step.id}: ${result.error.message}`)
    }
    if (result.status !== 0) {
      const status = result.status === null ? `signal ${result.signal ?? 'unknown'}` : `exit code ${result.status}`
      const output = [result.stdout, result.stderr]
        .filter((value) => typeof value === 'string' && value.trim())
        .join('\n')
        .trim()
      throw new Error(`Transition runtime proof failed during ${step.id}: ${command} returned ${status}.${output ? `\n${output}` : ''}`)
    }
    if (step.id === 'browser-parity') browserResult = result.stdout
  }

  try {
    return JSON.parse((browserResult ?? '').trim())
  } catch (error) {
    throw new Error(`Browser parity did not return a valid JSON receipt: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => comparePaths(left.name, right.name))
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        if (entry.name === 'target' || entry.name === '.git') return []
        return listSourceFiles(resolve(directory, entry.name))
      }
      if (!entry.isFile()) return []
      return [resolve(directory, entry.name)]
    })
}

function sourceSnapshot() {
  const files = listSourceFiles(crateRoot).sort(comparePaths)
  const hash = createHash('sha256')
  for (const path of files) {
    hash.update(relative(repositoryRoot, path).split(sep).join('/'))
    hash.update('\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return {
    sha256: hash.digest('hex'),
    files: files.map((path) => relative(repositoryRoot, path).split(sep).join('/')),
  }
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr?.trim() ?? `exit code ${result.status}`
    throw new Error(`Could not capture Git provenance (${args.join(' ')}): ${reason}`)
  }
  return result.stdout.trim()
}

function sha256File(path) {
  if (!statSync(path).isFile()) throw new Error(`Runtime proof artifact is not a file: ${path}`)
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function assertTransitionArtifactHashes(comparison, artifacts) {
  if (comparison?.status !== 'passed') {
    throw new Error('Browser parity did not report a passed comparison.')
  }
  for (const name of ['native', 'wasm32']) {
    if (comparison.artifacts?.[name]?.sha256 !== artifacts[name].sha256) {
      throw new Error(`${name} transition artifact changed between browser parity and receipt generation.`)
    }
  }
}

function main() {
  try {
    const before = sourceSnapshot()
    const sourceRevision = runGit(['rev-parse', 'HEAD'])
    const workingTree = runGit(['status', '--porcelain=v1', '--untracked-files=all', '--', 'source/pose-contact'])
      .split(/\r?\n/)
      .filter(Boolean)
    const plan = createTransitionRuntimePlan()
    const comparison = executeTransitionRuntimePlan(plan)
    const after = sourceSnapshot()
    if (before.sha256 !== after.sha256) {
      throw new Error('Pose-contact source changed while the native/WASM artifacts were being built and compared; rerun the proof against a stable source tree.')
    }

    const artifacts = {
      native: {
        path: relative(repositoryRoot, nativeArtifact).split(sep).join('/'),
        sha256: sha256File(nativeArtifact),
      },
      wasm32: {
        path: relative(repositoryRoot, wasmArtifact).split(sep).join('/'),
        sha256: sha256File(wasmArtifact),
      },
    }
    assertTransitionArtifactHashes(comparison, artifacts)

    const receipt = {
      status: 'passed',
      generatedAt: new Date().toISOString(),
      sourceRevision,
      sourceTreeSha256: after.sha256,
      sourceFiles: after.files,
      workingTree,
      buildCommands: plan.slice(0, 2).map(({ command, args }) => `${command} ${args.join(' ')}`),
      artifacts,
      comparison,
    }
    console.log(JSON.stringify(receipt, null, 2))
    return 0
  } catch (error) {
    console.error(`Transition runtime proof failed: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
