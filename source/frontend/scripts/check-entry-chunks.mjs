// Minimal entry chunk guard (inspired by TulpaWeaver)
// Ensures three-vendor etc are not in the initial html entry for perf.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const dist = join(process.cwd(), 'dist');
try {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));
  const entry = manifest['index.html'];
  const tauriEntry = manifest['src/backend-client/tauri.ts'];
  if (!html.includes('three-vendor')) {
    throw new Error('three vendor chunk split missing - check vite.config');
  }
  if (!entry?.isEntry || !entry.dynamicImports?.includes('src/backend-client/tauri.ts')) {
    throw new Error('Tauri bridge must remain a dynamic import of the browser entry');
  }
  if (!tauriEntry?.isDynamicEntry || entry.imports?.includes('src/backend-client/tauri.ts')) {
    throw new Error('Tauri bridge leaked into the static browser entry graph');
  }
  if (html.includes(tauriEntry.file)) {
    throw new Error('Tauri bridge asset is eagerly loaded by the HTML entry');
  }

  const workerAssets = readdirSync(join(dist, 'assets'))
    .filter((name) => /^modelWorker-[^.]+\.js$/.test(name));
  if (workerAssets.length !== 1) {
    throw new Error(
      `expected one dedicated modelWorker asset, found ${workerAssets.length}`,
    );
  }
  if (html.includes(workerAssets[0])) {
    throw new Error('modelWorker asset is eagerly loaded by the HTML entry');
  }

  const workerBytes = statSync(join(dist, 'assets', workerAssets[0])).size;
  if (workerBytes > 512 * 1024) {
    throw new Error(`modelWorker asset exceeds 512 KiB (${workerBytes} bytes)`);
  }
  const retargetWorkers = readdirSync(join(dist, 'assets')).filter(name => /^retargetWorker-[^.]+\.js$/.test(name));
  const archiveWorkers = readdirSync(join(dist, 'assets')).filter(name => /^modelArchive\.worker-[^.]+\.js$/.test(name));
  if (archiveWorkers.length !== 1 || html.includes(archiveWorkers[0]) || statSync(join(dist, 'assets', archiveWorkers[0])).size > 64 * 1024) {
    throw new Error('expected one lazy ZIP worker below 64 KiB');
  }
  const retargetWasm = readdirSync(join(dist, 'assets')).filter(name => /^retarget_core_bg-[^.]+\.wasm$/.test(name));
  if (retargetWorkers.length !== 1 || retargetWasm.length !== 1) throw new Error('expected one lazy retarget worker and one Rust WASM module');
  for (const asset of [...retargetWorkers, ...retargetWasm]) {
    if (html.includes(asset)) throw new Error(`retarget runtime asset is eagerly loaded: ${asset}`);
    if (statSync(join(dist, 'assets', asset)).size > 1024 * 1024) throw new Error(`retarget runtime asset exceeds 1 MiB: ${asset}`);
  }
  const wasmExports = WebAssembly.Module.exports(new WebAssembly.Module(readFileSync(join(dist, 'assets', retargetWasm[0]))));
  if (wasmExports.some(entry => entry.name === 'bake_advanced_json_v1')) {
    throw new Error('experimental advanced baking must stay out of the production analysis/core WASM build until cutover');
  }

  console.log(
    `Entry chunk check passed (three-vendor split; Tauri bridge lazy; ${workerAssets[0]} lazy, ${workerBytes} bytes).`,
  );
} catch (error) {
  console.error(`ERROR: entry chunk check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
