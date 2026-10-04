import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))

const rustCrates = [
  { name: 'src-tauri', directory: join('source', 'src-tauri') },
  { name: 'pose-contact', directory: join('source', 'pose-contact'), wasm: true },
]

const nativeChecks = [
  { name: 'format', args: ['fmt', '--all', '--', '--check'] },
  { name: 'Clippy', args: ['clippy', '--all-targets', '--', '-D', 'warnings'] },
  { name: 'tests', args: ['test'] },
  { name: 'native check', args: ['check'] },
]

export function createRustVerificationPlan(root = repositoryRoot, fileExists = existsSync) {
  const crates = rustCrates.map((crate) => ({
    ...crate,
    path: resolve(root, crate.directory),
    manifest: resolve(root, crate.directory, 'Cargo.toml'),
  }))
  const missingManifests = crates.filter((crate) => !fileExists(crate.manifest))

  if (missingManifests.length > 0) {
    const missing = missingManifests
      .map((crate) => `${crate.name}: ${crate.manifest}`)
      .join('\n  ')
    throw new Error(`Required Rust crate manifest(s) are missing:\n  ${missing}\nRestore the complete repository checkout before running Rust verification.`)
  }

  return crates.flatMap((crate) => [
    ...nativeChecks.map((check) => ({
      crate: crate.name,
      name: check.name,
      args: check.args,
      cwd: crate.path,
    })),
    ...(crate.wasm
      ? [{
          crate: crate.name,
          name: 'wasm32-unknown-unknown check',
          args: ['check', '--target', 'wasm32-unknown-unknown'],
          cwd: crate.path,
        }]
      : []),
  ])
}

function runCargoCommand(command, args, cwd) {
  return spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true })
}

export function runRustVerification({
  root = repositoryRoot,
  fileExists = existsSync,
  runCommand = runCargoCommand,
} = {}) {
  const plan = createRustVerificationPlan(root, fileExists)

  for (const step of plan) {
    const result = runCommand('cargo', step.args, step.cwd)
    const command = `cargo ${step.args.join(' ')}`

    if (result.error) {
      if (result.error.code === 'ENOENT') {
        throw new Error(`Rust verification requires Cargo, but 'cargo' was not found on PATH while checking ${step.crate}. Install or repair the repository Rust toolchain, then rerun npm run verify:rust.`)
      }
      throw new Error(`Could not start ${command} for ${step.crate}: ${result.error.message}`)
    }

    if (result.status !== 0) {
      const status = result.status === null ? `signal ${result.signal ?? 'unknown'}` : `exit code ${result.status}`
      throw new Error(`Rust verification failed for ${step.crate} (${step.name}): ${command} returned ${status}.`)
    }
  }

  return plan
}

export function main() {
  try {
    const plan = runRustVerification()
    console.log(`Rust verification passed: ${plan.length} checks across src-tauri and pose-contact.`)
    return 0
  } catch (error) {
    console.error(`Rust verification failed: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
