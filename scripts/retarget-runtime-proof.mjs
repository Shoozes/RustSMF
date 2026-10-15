import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRetargetWasm } from './build-retarget-wasm.mjs'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const crateManifest = resolve(root, 'source/retarget-core/Cargo.toml')
const output = resolve(root, 'output/retarget-runtime-proof')
const tolerance = 1e-6
const requiredCases = [
  'mixamo_to_unity_with_clip_and_helper_track',
  'ue4_to_rigify',
  'unity_to_mixamo',
  'rigify_finger_chains',
  'conflicting_side_context',
  'ambiguous_target_roles',
  'helper_ancestor_proportions',
  'invalid_manual_override',
  'duplicate_manual_target',
  'opaque_numeric_rigs',
  'opaque_bare_numeric_same_names',
  'opaque_smf_nodes_same_names',
  'opaque_explicit_numeric_maps',
  'near_numeric_names_legitimate',
  'proportion_mismatch',
  'invalid_reference_frame',
  'unmapped_clip_track',
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options })
  if (result.error) throw new Error(`Could not start ${command}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}\n${result.stderr}`)
  return result.stdout.trim()
}
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex') }

function compare(actual, expected, path = '$') {
  if (typeof actual === 'number' && typeof expected === 'number') {
    const delta = Math.abs(actual - expected)
    const limit = tolerance * Math.max(1, Math.abs(actual), Math.abs(expected))
    assert.ok(delta <= limit, `${path}: ${actual} differs from ${expected} by ${delta} (limit ${limit})`)
    return
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected array`)
    assert.equal(actual.length, expected.length, `${path}: array lengths differ`)
    expected.forEach((value, index) => compare(actual[index], value, `${path}[${index}]`))
    return
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `${path}: expected object`)
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: object keys differ`)
    for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${path}.${key}`)
    return
  }
  assert.equal(actual, expected, `${path} differs`)
}

function exactMappingShape(value) {
  return {
    ok: value.ok,
    map: value.map,
    decisions: value.decisions.map(({ source, target, canonical, method }) => ({ source, target, canonical, method })),
    diagnostics: value.diagnostics.map(({ level, code, sourceBone, targetBone }) => ({ level, code, sourceBone, targetBone })),
  }
}
function diagnosticShape(value) {
  return value.map(({ level, code, sourceBone, targetBone }) => ({ level, code, sourceBone, targetBone }))
}

async function main() {
  mkdirSync(output, { recursive: true })
  const built = buildRetargetWasm()
  const nativeLine = run('cargo', ['run', '--locked', '--release', '--manifest-path', crateManifest, '--target-dir', resolve(root, 'output/retarget-core/cargo-target'), '--example', 'retarget_receipt'])
  const native = JSON.parse(nativeLine)
  assert.ok(Array.isArray(native.cases) && native.cases.length >= 10, 'first-party parity fixture set is unexpectedly small')
  assert.equal(new Set(native.cases.map(({ name }) => name)).size, native.cases.length, 'fixture case names must be unique')
  const caseByName = new Map(native.cases.map((value) => [value.name, value]))
  for (const name of requiredCases) assert.ok(caseByName.has(name), `missing first-party fixture: ${name}`)
  for (const [name, code] of [
    ['conflicting_side_context', 'RIG_MAP_SIDE_AMBIGUOUS'],
    ['ambiguous_target_roles', 'RIG_MAP_ROLE_AMBIGUOUS'],
    ['invalid_manual_override', 'RIG_MAP_MANUAL_SOURCE_MISSING'],
    ['duplicate_manual_target', 'RIG_MAP_DUPLICATE_TARGET'],
    ['opaque_numeric_rigs', 'RIG_MAP_OPAQUE_REQUIRES_MANUAL'],
    ['opaque_bare_numeric_same_names', 'RIG_MAP_OPAQUE_REQUIRES_MANUAL'],
    ['opaque_smf_nodes_same_names', 'RIG_MAP_OPAQUE_REQUIRES_MANUAL'],
    ['proportion_mismatch', 'RIG_PROPORTION_MISMATCH'],
    ['invalid_reference_frame', 'RIG_REFERENCE_FRAME_INVALID'],
    ['unmapped_clip_track', 'RIG_MAP_UNMAPPED_TRACK'],
  ]) {
    assert.ok(caseByName.get(name).result.diagnostics.some((item) => item.code === code), `${name} no longer exercises ${code}`)
  }
  assert.deepEqual(caseByName.get('opaque_bare_numeric_same_names').result.mapping.map, {}, 'bare numeric names must not match automatically')
  assert.deepEqual(caseByName.get('opaque_smf_nodes_same_names').result.mapping.map, {}, 'SMF numeric node names must not match automatically')
  assert.deepEqual(caseByName.get('opaque_explicit_numeric_maps').result.mapping.map, { '0': '1', '1': '0' }, 'explicit numeric maps must remain authoritative')
  assert.deepEqual(caseByName.get('near_numeric_names_legitimate').result.mapping.map, {
    finger2: 'finger2',
    spine01: 'spine01',
    jointA: 'jointA',
    SMF_Node_0_extra: 'SMF_Node_0_extra',
  }, 'legitimate numeric-adjacent names must remain eligible for matching')
  const sampler = JSON.parse(run(process.execPath, ['--import', 'tsx', 'scripts/retarget-sampler-proof.ts'], { cwd: resolve(root, 'source/frontend') }))
  assert.ok(sampler.positives.length >= 14 && sampler.negatives.length >= 20, 'sampler corpus unexpectedly small')
  for (const name of ['linear','smooth','step','cubic','constant','antipodal','slerp','small','float32','helper','references','single','irregular','decoded-gltf-cubic']) {
    assert.ok(sampler.positives.some(c => c.name === name), `missing sampler case ${name}`)
  }
  const samplerInputs = [...sampler.positives.map(c => JSON.stringify(c.input)), ...sampler.negatives.map(c => JSON.stringify(c.request))]
  const nativeSampler = JSON.parse(run('cargo', ['run', '--locked', '--release', '--manifest-path', crateManifest, '--target-dir', resolve(root, 'output/retarget-core/cargo-target'), '--example', 'sampler_receipt'], { input: JSON.stringify(samplerInputs) }))
  assert.equal(nativeSampler.length, samplerInputs.length)
  sampler.positives.forEach((c, i) => compare(nativeSampler[i], c.expected, `sampler.${c.name}.typescript-native`))
  sampler.negatives.forEach((c, i) => {
    const result = nativeSampler[sampler.positives.length + i]
    assert.equal(result.status, 'error', c.name)
    assert.equal(result.error.code, c.code, c.name)
    assert.deepEqual(result.clips, [], `${c.name}: no partial result`)
  })
  const baking = JSON.parse(run(process.execPath, ['--import', 'tsx', 'scripts/retarget-bake-proof.ts'], { cwd: resolve(root, 'source/frontend') }))
  assert.equal(baking.coreOptions.length, 19)
  assert.equal(baking.coreReports.length, 26)
  assert.ok(baking.positives.length >= 25 && baking.negatives.length >= 32, 'core bake corpus unexpectedly small')
  const bakeInputs = [...baking.positives.map(c => JSON.stringify(c.input)), ...baking.negatives.map(c => JSON.stringify(c.request))]
  const nativeBakes = JSON.parse(run('cargo', ['run', '--locked', '--release', '--manifest-path', crateManifest, '--target-dir', resolve(root, 'output/retarget-core/cargo-target'), '--example', 'bake_receipt'], { input: JSON.stringify(bakeInputs) }))
  baking.positives.forEach((c, i) => {
    assert.equal(nativeBakes[i].status, 'baked', c.name)
    assert.ok(nativeBakes[i].clips.every(c => c.clip.tracks.length > 0), `${c.name}: actual baked tracks required`)
    compare(nativeBakes[i], c.expected, `bake.${c.name}.typescript-native`)
  })
  baking.negatives.forEach((c, i) => {
    const result = nativeBakes[baking.positives.length + i]
    assert.equal(result.status, 'error', c.name)
    assert.equal(result.error.code, c.code, c.name)
    assert.deepEqual(result.clips, [], `${c.name}: atomic batch`)
  })
  const { chromium } = createRequire(resolve(root, 'source/frontend/package.json'))('playwright')
  let browser
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (path === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><meta charset="utf-8"><title>Retarget WASM proof</title>')
      return
    }
    if (path === '/retarget_core.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      response.end(readFileSync(join(built.generated, 'retarget_core.js')))
      return
    }
    if (path === '/retarget_core_bg.wasm') {
      response.writeHead(200, { 'content-type': 'application/wasm', 'cache-control': 'no-store' })
      response.end(readFileSync(join(built.generated, 'retarget_core_bg.wasm')))
      return
    }
    response.writeHead(404)
    response.end('Not found')
  })
  try {
    await new Promise((resolveListen, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolveListen()))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/`)
    const wasmResults = await page.evaluate(async (cases) => {
      const module = await import('/retarget_core.js')
      await module.default('/retarget_core_bg.wasm')
      return cases.map(({ name, input }) => ({ name, result: JSON.parse(module.analyze_json_v1(JSON.stringify(input))) }))
    }, native.cases.map(({ name, input }) => ({ name, input })))
    assert.equal(wasmResults.length, native.cases.length)
    for (let index = 0; index < native.cases.length; index += 1) {
      const nativeCase = native.cases[index]
      const wasmCase = wasmResults[index]
      assert.equal(wasmCase.name, nativeCase.name, `case ordering differs at ${index}`)
      assert.deepEqual(exactMappingShape(wasmCase.result.mapping), exactMappingShape(nativeCase.result.mapping), `${nativeCase.name}: mapping and diagnostic codes must match exactly`)
      assert.deepEqual(diagnosticShape(wasmCase.result.diagnostics), diagnosticShape(nativeCase.result.diagnostics), `${nativeCase.name}: diagnostic codes must match exactly`)
      compare(wasmCase.result, nativeCase.result, `cases.${nativeCase.name}.result`)
    }
    const wasmSampler = await page.evaluate(async (inputs) => {
      const module = await import('/retarget_core.js')
      return inputs.map(input => JSON.parse(module.sample_json_v1(input)))
    }, samplerInputs)
    compare(wasmSampler, nativeSampler, 'sampler.native-wasm')
    sampler.positives.forEach((c, i) => compare(wasmSampler[i], c.expected, `sampler.${c.name}.typescript-wasm`))
    const wasmBakes = await page.evaluate(async (inputs) => {
      const module = await import('/retarget_core.js')
      return inputs.map(input => JSON.parse(module.bake_json_v1(input)))
    }, bakeInputs)
    compare(wasmBakes, nativeBakes, 'core-bake.native-wasm')
    baking.positives.forEach((c, i) => compare(wasmBakes[i], c.expected, `bake.${c.name}.typescript-wasm`))
    const workerProof = async (input, entry, status) => page.evaluate(async ({input, entry, status}) => {
      const code = `import init, { ${entry} as execute } from '${location.origin}/retarget_core.js';
        await init('${location.origin}/retarget_core_bg.wasm');
        self.onmessage = event => { self.postMessage({phase:'sampling'}); self.postMessage({phase:'result',result:JSON.parse(execute(event.data))}); };
        self.postMessage({phase:'ready'});`;
      const url = URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
      const run = (cancel) => new Promise((resolveRun,reject) => {
        const worker = new Worker(url,{type:'module'});
        const timer = setTimeout(() => finish(() => reject(new Error('Sampler worker timed out'))),10000);
        const finish = (done) => { clearTimeout(timer); worker.terminate(); done(); };
        let terminated = false;
        worker.onerror = event => finish(() => reject(new Error(event.message)));
        worker.onmessage = event => {
          if(event.data.phase === 'ready') {
            const request = structuredClone(input);
            if(cancel) {
              if(entry === 'bake_json_v1') { request.clips = Array.from({length:100}, () => structuredClone(request.clips[0])); request.clips.forEach(c => c.options.sampleRateHz=240); }
              else request.sampleTimes = Array(20000).fill(.5);
            }
            worker.postMessage(JSON.stringify(request));
          } else if(event.data.phase === 'sampling' && cancel) {
            terminated = true; worker.terminate();
            setTimeout(() => finish(() => resolveRun('terminated')),30);
          } else if(event.data.phase === 'result') {
            if(terminated || cancel) finish(() => reject(new Error('Cancelled WASM result escaped')));
            else if(event.data.result.status !== status) finish(() => reject(new Error('Fresh WASM worker refused valid input')));
            else finish(() => resolveRun(status));
          }
        };
      });
      try { return { cancelled: await run(true), replacement: await run(false) }; }
      finally { URL.revokeObjectURL(url); }
    }, {input, entry, status})
    const samplerWorker = await workerProof(sampler.positives[0].input, 'sample_json_v1', 'sampled')
    assert.deepEqual(samplerWorker, { cancelled: 'terminated', replacement: 'sampled' })
    const bakeWorker = await workerProof(baking.positives[0].input, 'bake_json_v1', 'baked')
    assert.deepEqual(bakeWorker, { cancelled: 'terminated', replacement: 'baked' })
    assert.deepEqual(errors, [])
    const allDiagnostics = native.cases.map(({ name }, index) => ({
      name,
      status: wasmResults[index].result.status,
      codes: wasmResults[index].result.diagnostics.map(({ code, level }) => ({ code, level })),
    }))
    const receipt = {
      schema: 'rustsmf.retarget-runtime-proof.v1',
      status: 'passed',
      apiVersion: 1,
      native: { command: 'cargo run --locked --release --example retarget_receipt', fixtureCount: native.cases.length, resultSha256: hash(Buffer.from(JSON.stringify(native.cases.map(({ result }) => result)))) },
      browserWasm: { browser: 'Chromium', wasmSha256: built.provenance.generatedWasmSha256, glueSha256: built.provenance.glueSha256 },
      comparison: { casesCompared: native.cases.length, toleranceRelativeAbsolute: tolerance, mappingsExact: true, diagnosticsExact: true, numericFieldsWithinTolerance: true },
      cases: allDiagnostics,
      sampler: { stage: 'sampler', fullBake: false, positiveCases: sampler.positives.length, refusalCases: sampler.negatives.length,
        nativeRust: true, actualBrowserWasm: true, threeReference: true, knownValueAnchors: true, workerCancellation: samplerWorker, toleranceRelativeAbsolute: tolerance,
        resultSha256: hash(Buffer.from(JSON.stringify(nativeSampler))),
        cases: [...sampler.positives.map(c => ({ name: c.name, status: 'sampled' })), ...sampler.negatives.map(c => ({ name: c.name, code: c.code }))] },
      coreBake: { stage: 'core-bake', productionCutover: false, positiveCases: baking.positives.length, refusalCases: baking.negatives.length,
        options: baking.coreOptions, reports: baking.coreReports, nativeRust: true, actualBrowserWasm: true, typescriptReference: true,
        actualBakedTracksAndReports: true, independentMotionAnchors: true, workerCancellation: bakeWorker, toleranceRelativeAbsolute: tolerance,
        resultSha256: hash(Buffer.from(JSON.stringify(nativeBakes))),
        cases: [...baking.positives.map(c => ({name:c.name,status:'baked'})), ...baking.negatives.map(c => ({name:c.name,code:c.code}))] },
      unexpectedBrowserErrors: errors,
    }
    writeFileSync(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(`Retarget native/WASM proof passed: ${native.cases.length} preflight, ${sampler.positives.length} sampler / ${sampler.negatives.length} refusals, ${baking.positives.length} core bakes / ${baking.negatives.length} refusals; exact structure and numbers within ${tolerance}.`)
  } finally {
    try {
      if (browser) await browser.close()
    } finally {
      if (server.listening) await new Promise((resolveClose) => server.close(() => resolveClose()))
    }
  }
}

main().catch((error) => {
  console.error(`Retarget runtime proof failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
