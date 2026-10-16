import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
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
  const production = buildRetargetWasm()
  const built = buildRetargetWasm({ advanced: true })
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
  const advanced = JSON.parse(run(process.execPath, ['--import', 'tsx', 'scripts/retarget-advanced-proof.ts'], { cwd: resolve(root, 'source/frontend') }))
  assert.equal(advanced.advancedOptions.length, 9)
  assert.equal(advanced.advancedReports.length, 8)
  assert.ok(advanced.positives.length >= 33 && advanced.negatives.length >= 30, 'advanced corpus unexpectedly small')
  assert.ok(advanced.negatives.some(c => c.name === 'natural-aggregate-anchor-limit'), 'missing aggregate contact-storage regression')
  const advancedInputs = [...advanced.positives.map(c => JSON.stringify(c.input)), ...advanced.negatives.map(c => JSON.stringify(c.request))]
  const nativeAdvanced = JSON.parse(run('cargo', ['run', '--locked', '--release', '--manifest-path', crateManifest, '--target-dir', resolve(root, 'output/retarget-core/cargo-target'), '--example', 'bake_receipt', '--', '--advanced'], { input: JSON.stringify(advancedInputs) }))
  const productionCoreInputs = baking.positives.map(c => JSON.stringify(c.input))
  const nativeProductionCore = JSON.parse(run('cargo', ['run', '--locked', '--release', '--manifest-path', crateManifest, '--target-dir', resolve(root, 'output/retarget-core/cargo-target'), '--example', 'bake_receipt', '--', '--advanced'], {input: JSON.stringify(productionCoreInputs)}))
  nativeProductionCore.forEach((value, i) => compare({...value, stage:'core-bake', capabilities:['core-bake-v1'], clips:value.clips.map(c => ({clip:c.clip,
    report:Object.fromEntries(Object.entries(c.report).filter(([key]) => baking.coreReports.includes(key)))}))}, baking.positives[i].expected, `production.core-native.${baking.positives[i].name}`))
  assert.equal(nativeAdvanced.length, advancedInputs.length)
  advanced.positives.forEach((c, i) => compare(nativeAdvanced[i], c.expected, `advanced.${c.name}.typescript-native`))
  advanced.negatives.forEach((c, i) => {
    const result = nativeAdvanced[advanced.positives.length + i]
    assert.equal(result.status, 'error', c.name)
    assert.equal(result.error.code, c.code, c.name)
    assert.deepEqual(result.clips, [], `${c.name}: atomic advanced batch`)
  })
  const { chromium } = createRequire(resolve(root, 'source/frontend/package.json'))('playwright')
  let browser
  const probe = join(output, `mime-probe-${process.pid}.mjs`)
  writeFileSync(probe, 'export const ready = true;\n', {flag: 'wx'})
  const routes = new Map([
    ['/retarget_core.js', [join(built.generated, 'retarget_core.js'), 'application/javascript; charset=utf-8']],
    ['/retarget_core.mjs', [join(built.generated, 'retarget_core.js'), 'application/javascript; charset=utf-8']],
    ['/retarget_core_bg.wasm', [join(built.generated, 'retarget_core_bg.wasm'), 'application/wasm']],
    ['/production/retarget_core.js', [join(production.generated, 'retarget_core.js'), 'application/javascript; charset=utf-8']],
    ['/production/retarget_core.mjs', [join(production.generated, 'retarget_core.js'), 'application/javascript; charset=utf-8']],
    ['/production/retarget_core_bg.wasm', [join(production.generated, 'retarget_core_bg.wasm'), 'application/wasm']],
    ['/mime-probe.mjs', [probe, 'application/javascript; charset=utf-8']],
  ])
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    response.setHeader('x-content-type-options', 'nosniff')
    if (path === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><meta charset="utf-8"><title>Retarget WASM proof</title>')
      return
    }
    const route = routes.get(path)
    if (route) {
      response.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' })
      response.end(readFileSync(route[0]))
      return
    }
    response.writeHead(404, {'content-type': 'application/octet-stream'})
    response.end('Not found')
  })
  try {
    await new Promise((resolveListen, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolveListen()))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const origin = `http://127.0.0.1:${address.port}`
    const probeResponse = await fetch(`${origin}/mime-probe.mjs`)
    assert.equal(probeResponse.status, 200)
    assert.match(probeResponse.headers.get('content-type'), /^application\/javascript;/)
    const unknownResponse = await fetch(`${origin}/unknown.mjs`)
    assert.equal(unknownResponse.status, 404)
    assert.equal(unknownResponse.headers.get('content-type'), 'application/octet-stream')
    assert.equal(unknownResponse.headers.get('x-content-type-options'), 'nosniff')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/`)
    assert.equal(await page.evaluate(async () => (await import('/mime-probe.mjs')).ready), true)
    const productionResults = await page.evaluate(async ({cases, sampleInputs, bakeInputs, fullInputs}) => {
      const module = await import('/production/retarget_core.mjs')
      await module.default('/production/retarget_core_bg.wasm')
      return {advancedExport: typeof module.bake_advanced_json_v1 !== 'undefined',
        preflight: cases.map(({input}) => JSON.parse(module.analyze_json_v1(JSON.stringify(input)))),
        sampler: sampleInputs.map(input => JSON.parse(module.sample_json_v1(input))),
        baking: bakeInputs.map(input => JSON.parse(module.bake_json_v1(input))),
        fullBakes:fullInputs.map(input => JSON.parse(module.bake_with_progress_json_v1(input, () => {}))),
        callbackFailure:JSON.parse(module.bake_with_progress_json_v1(fullInputs[0], () => {throw new Error('closed channel')}))}
    }, {cases: native.cases.map(({input}) => ({input})), sampleInputs: samplerInputs, bakeInputs, fullInputs:[...advancedInputs,...productionCoreInputs]})
    assert.equal(productionResults.advancedExport, true)
    compare(productionResults.preflight, native.cases.map(c => c.result), 'production.preflight')
    compare(productionResults.sampler, nativeSampler, 'production.sampler')
    compare(productionResults.baking, nativeBakes, 'production.core-bake')
    compare(productionResults.fullBakes, [...nativeAdvanced,...nativeProductionCore], 'production.complete-bake')
    assert.equal(productionResults.callbackFailure.error.code, 'BAKE_CANCELLED')
    assert.deepEqual(productionResults.callbackFailure.clips, [])
    assert.ok(readFileSync(join(production.generated, 'retarget_core_bg.wasm')).byteLength <= 1024 * 1024, 'production WASM exceeds unchanged 1 MiB guard')
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
    const wasmAdvanced = await page.evaluate(async inputs => {
      const module = await import('/retarget_core.js')
      return inputs.map(input => JSON.parse(module.bake_advanced_json_v1(input)))
    }, advancedInputs)
    compare(wasmAdvanced, nativeAdvanced, 'advanced.native-wasm')
    advanced.positives.forEach((c, i) => compare(wasmAdvanced[i], c.expected, `advanced.${c.name}.typescript-wasm`))
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
              if(entry.startsWith('bake_')) { request.clips = Array.from({length:100}, () => structuredClone(request.clips[0])); request.clips.forEach(c => c.options.sampleRateHz=240); }
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
    const advancedWorker = await workerProof(advanced.positives.find(c => c.name === 'twist').input, 'bake_advanced_json_v1', 'baked')
    assert.deepEqual(advancedWorker, { cancelled: 'terminated', replacement: 'baked' })
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
      browserWasm: { browser: 'Chromium', features: built.provenance.features, wasmSha256: built.provenance.generatedWasmSha256, glueSha256: built.provenance.glueSha256 },
      productionWasm: {features: production.provenance.features, wasmSha256: production.provenance.generatedWasmSha256,
        bytes: readFileSync(join(production.generated, 'retarget_core_bg.wasm')).byteLength, preflightSamplerCoreParity: true, advancedExport: true,
        completeBakeParity:true, coreOptionsThroughAdvanced:productionCoreInputs.length, progressCallbackFailureAtomic:true},
      staticRoutes: {mjsHttp: 'passed', mjsBrowserImport: 'passed', unknown: '404 application/octet-stream nosniff'},
      comparison: { casesCompared: native.cases.length, toleranceRelativeAbsolute: tolerance, mappingsExact: true, diagnosticsExact: true, numericFieldsWithinTolerance: true },
      cases: allDiagnostics,
      advancedBake: { stage: 'advanced-bake', productionCutover: true, positiveCases: advanced.positives.length, refusalCases: advanced.negatives.length,
        options: advanced.advancedOptions, reports: advanced.advancedReports, nativeRust: true, actualBrowserWasm: true, typescriptReference: true,
        actualBakedTracksAndReports: true, borrowedInputCancellation: true, workerCancellation: advancedWorker, toleranceRelativeAbsolute: tolerance,
        resultSha256: hash(Buffer.from(JSON.stringify(nativeAdvanced))), cases: [...advanced.positives.map(c => ({name: c.name, status: 'baked'})), ...advanced.negatives.map(c => ({name: c.name, code: c.code}))] },
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
    console.log(`Retarget native/WASM proof passed: ${native.cases.length} preflight, ${sampler.positives.length} sampler / ${sampler.negatives.length} refusals, ${baking.positives.length} core bakes / ${baking.negatives.length} refusals, ${advanced.positives.length} advanced / ${advanced.negatives.length} refusals; exact structure and numbers within ${tolerance}.`)
  } finally {
    try {
      if (browser) await browser.close()
    } finally {
      try {
        if (server.listening) await new Promise((resolveClose) => server.close(() => resolveClose()))
      } finally { unlinkSync(probe) }
    }
  }
}

main().catch((error) => {
  console.error(`Retarget runtime proof failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
