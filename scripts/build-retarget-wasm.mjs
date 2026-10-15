import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const manifest = resolve(root, 'source/retarget-core/Cargo.toml')
const lockfile = resolve(root, 'source/src-tauri/Cargo.lock')
const outputRoot = resolve(root, 'output/retarget-core')
const toolRoot = resolve(root, 'output/toolchains/retarget-wasm')
const generated = resolve(root, 'source/frontend/src/generated/retarget-core')
const version = '0.2.126'
const targetDir = join(outputRoot, 'cargo-target')
const wasmArtifact = join(targetDir, 'wasm32-unknown-unknown', 'release', 'rustsmf_retarget_core.wasm')
const bindgen = join(toolRoot, 'bin', process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options })
  if (result.error) throw new Error(`Could not start ${command}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}\n${result.stderr}`)
  return result.stdout.trim()
}

function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }
function treeHash(directory) {
  const files = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'target') visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  visit(directory)
  files.sort()
  const hash = createHash('sha256')
  for (const path of files) hash.update(relative(directory, path).split(sep).join('/')).update('\0').update(readFileSync(path)).update('\0')
  return hash.digest('hex')
}

function ensureTool(install) {
  mkdirSync(dirname(bindgen), { recursive: true })
  if (!existsSync(bindgen)) {
    if (!install) throw new Error(`Pinned wasm-bindgen ${version} is missing. Run node scripts/build-retarget-wasm.mjs --install-tools.`)
    run('cargo', ['install', 'wasm-bindgen-cli', '--version', version, '--locked', '--root', toolRoot])
  }
  const actual = run(bindgen, ['--version'])
  if (!actual.includes(version)) throw new Error(`Expected wasm-bindgen ${version} under output/toolchains/retarget-wasm; found '${actual}'.`)
}

export function buildRetargetWasm({ installTools = process.argv.includes('--install-tools') } = {}) {
  mkdirSync(outputRoot, { recursive: true })
  mkdirSync(generated, { recursive: true })
  ensureTool(installTools)
  const sourceHash = treeHash(resolve(root, 'source/retarget-core'))
  const lockHash = sha256(lockfile)
  run('cargo', ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', manifest, '--target-dir', targetDir])
  if (!existsSync(wasmArtifact)) throw new Error(`Cargo did not produce the expected retarget-core WASM artifact: ${wasmArtifact}`)
  for (const name of ['retarget_core.js', 'retarget_core.d.ts', 'retarget_core_bg.wasm', 'retarget_core_bg.wasm.d.ts', '.build-info.json']) {
    const path = resolve(generated, name)
    if (!path.startsWith(`${generated}${sep}`)) throw new Error('Refusing to remove a generated file outside its output directory.')
    rmSync(path, { force: true })
  }
  run(bindgen, [wasmArtifact, '--target', 'web', '--out-dir', generated, '--out-name', 'retarget_core'])
  const wasmCopy = resolve(generated, 'retarget_core_bg.wasm')
  const glue = resolve(generated, 'retarget_core.js')
  if (!existsSync(wasmCopy) || !existsSync(glue)) throw new Error('wasm-bindgen did not produce the expected web-target glue and module.')
  const provenance = {
    schema: 'rustsmf.retarget-core-wasm-build.v1',
    apiVersion: 1,
    crateVersion: '0.1.0',
    wasmBindgenVersion: version,
    sourceTreeSha256: sourceHash,
    lockfileSha256: lockHash,
    cargoArtifactSha256: sha256(wasmArtifact),
    generatedWasmSha256: sha256(wasmCopy),
    glueSha256: sha256(glue),
  }
  writeFileSync(resolve(generated, '.build-info.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  return { provenance, wasmArtifact, generated }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = buildRetargetWasm()
    console.log(`Retarget WASM built: API v1, wasm-bindgen ${version}; artifact ${result.provenance.generatedWasmSha256.slice(0, 12)}…`)
  } catch (error) {
    console.error(`Retarget WASM build failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
