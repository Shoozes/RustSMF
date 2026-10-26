import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-game-ready-dependencies.mjs', import.meta.url));
const workspace = path.resolve(path.dirname(script), '..');
const importSource = specifier => ['import ', JSON.stringify(specifier), ';\n'].join('');

async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-standalone-'));
  t.after(() => {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
    return rm(temporary, { recursive: true, force: true });
  });
  const root = path.join(temporary, 'RustSMF'), sibling = path.join(temporary, 'separate-product');
  for (const relative of ['source/frontend/src', 'source/frontend/scripts', 'source/src-tauri', 'source/retarget-core', 'source/pose-contact', 'scripts']) await mkdir(path.join(root, relative), { recursive: true });
  await mkdir(sibling, { recursive: true });
  await writeFile(path.join(sibling, 'shared.mjs'), 'export {};');
  await writeFile(path.join(root, 'source/frontend/src/index.ts'), "export const schema = 'gaim.skeletal-asset.v1';\n");
  await writeFile(path.join(root, 'source/frontend/package.json'), JSON.stringify({ dependencies: { local: 'file:../../retarget-core' } }));
  await mkdir(path.join(root, 'source/scripts'), { recursive: true });
  await writeFile(path.join(root, 'source/package.json'), JSON.stringify({ scripts: { build: 'node ./scripts/build.mjs' } }));
  await writeFile(path.join(root, 'source/scripts/build.mjs'), 'export {};');
  await writeFile(path.join(root, 'source/pose-contact/Cargo.toml'), '[package]\nname="pose-contact"\n[dependencies]\n');
  await writeFile(path.join(root, 'source/src-tauri/tauri.conf.json'), JSON.stringify({ bundle: { icon: ['icons/icon.png'], resources: { '../../LICENSE': 'licenses/LICENSE' } }, build: { frontendDist: '../frontend/dist' } }));
  await writeFile(path.join(root, 'LICENSE'), 'local');
  await mkdir(path.join(root, 'source/src-tauri/icons'), { recursive: true });
  await writeFile(path.join(root, 'source/src-tauri/icons/icon.png'), 'icon');
  return { root, sibling, run: () => spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }) };
}

test('the real RustSMF checkout stays within its standalone boundary', () => {
  const result = spawnSync(process.execPath, [script], { cwd: workspace, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /owned source\/config files/);
});

test('allows exported schema identifiers and local first-party paths', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'source/frontend/tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@local/*': ['src/*'] } } }));
  await writeFile(path.join(f.root, 'source/frontend/vite.config.ts'), "export default { resolve: { alias: { '@local': './src' } } };\n");
  await writeFile(path.join(f.root, 'source/frontend/src/extra.ts'), importSource('./index'));
  const result = f.run(); assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('finds an external import added to a formerly unscanned file', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'source/frontend/src/new-feature.ts'), importSource('../../../../separate-product/shared.mjs'));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /outside the RustSMF checkout/);
});

test('checks root launchers and literal PowerShell or batch script entrypoints', async t => {
  const f = await fixture(t), launcher = path.join(f.root, 'run.ps1');
  await writeFile(launcher, '& "$PSScriptRoot/scripts/local.ps1"\n');
  assert.equal(f.run().status, 0);
  for (const command of ['& "../separate-product/build.ps1"', 'pwsh -NoProfile -File ../separate-product/build.ps1', 'node ../separate-product/build.mjs']) {
    await writeFile(launcher, command);
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /shell script entry/);
  }
  await writeFile(launcher, '& $ExplicitOptionalIntegration\n');
  await writeFile(path.join(f.root, 'run.bat'), 'call "%~dp0../separate-product/build.bat"\n');
  assert.notEqual(f.run().status, 0);
  await writeFile(path.join(f.root, 'run.bat'), 'call "%~dp0run.ps1"\n');
  assert.equal(f.run().status, 0);
});

test('distinguishes executable imports from documentation and fixture strings without filename exemptions', async t => {
  const f = await fixture(t), name = path.join(f.root, 'source/frontend/src/check-game-ready-dependencies.test.mjs');
  const injected = importSource('../../../../separate-product/shared.mjs');
  await writeFile(name, `const fixture = ${JSON.stringify(injected)}; // ${injected}`);
  assert.equal(f.run().status, 0);
  await writeFile(name, injected);
  assert.notEqual(f.run().status, 0);
  await writeFile(name, "import '/external-first-party/shared.mjs';\n");
  assert.notEqual(f.run().status, 0);
  await writeFile(name, "await page.evaluate(async () => import('/test-owned.mjs'));\n");
  assert.equal(f.run().status, 0);
});

test('follows a transitive local import into a sibling checkout', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'source/frontend/src/index.ts'), importSource('./adapter'));
  await writeFile(path.join(f.root, 'source/frontend/src/adapter.ts'), importSource('../../../../separate-product/shared.mjs'));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /separate-product/);
});

test('rejects external file and link npm dependencies but permits local first-party packages', async t => {
  const f = await fixture(t), manifest = path.join(f.root, 'source/frontend/package.json');
  await writeFile(manifest, JSON.stringify({ dependencies: { local: 'file:../../retarget-core' } }));
  assert.equal(f.run().status, 0);
  for (const protocol of ['file', 'link']) {
    await writeFile(manifest, JSON.stringify({ dependencies: { external: `${protocol}:../../../separate-product` } }));
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /dependencies\.external/);
  }
});

test('rejects Cargo path dependencies that escape the repository', async t => {
  const f = await fixture(t), manifest = path.join(f.root, 'source/pose-contact/Cargo.toml');
  await writeFile(manifest, '[package]\nname="pose-contact"\n[dependencies]\nhelper={path="../../../separate-product"}\n');
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Cargo path dependency/);
});

test('checks the source workspace manifest and its local script entries', async t => {
  const f = await fixture(t), manifest = path.join(f.root, 'source/package.json');
  await writeFile(manifest, JSON.stringify({ scripts: { build: 'node ./scripts/build.mjs' } }));
  assert.equal(f.run().status, 0);
  await writeFile(manifest, JSON.stringify({ scripts: { build: 'node ../../separate-product/helper.mjs' } }));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /script build entry/);
  await writeFile(manifest, JSON.stringify({ dependencies: { external: 'file:../../separate-product' } }));
  const packageResult = f.run(); assert.notEqual(packageResult.status, 0); assert.match(packageResult.stderr, /dependencies\.external/);
});

test('rejects an external TypeScript compiler alias', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'source/frontend/tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['../../../../separate-product/*'] } } }));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /compiler alias/);
});

test('rejects an external Vite compiler alias', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'source/frontend/vite.config.ts'), "export default { resolve: { alias: [{ find: '@shared', replacement: '../../../../separate-product/src' }] } };\n");
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Vite compiler alias/);
});

test('checks compiler extends and project references', async t => {
  const f = await fixture(t), config = path.join(f.root, 'source/frontend/tsconfig.json');
  await writeFile(config, JSON.stringify({ extends: '../base.json', references: [{ path: '../retarget-core' }] }));
  assert.equal(f.run().status, 0);
  await writeFile(config, JSON.stringify({ extends: '../../../../separate-product/tsconfig.json' }));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /compiler config extends/);
});

test('rejects external Tauri bundle resources, icons, and frontend output', async t => {
  const f = await fixture(t), config = path.join(f.root, 'source/src-tauri/tauri.conf.json');
  for (const value of [
    { bundle: { resources: { '../../../separate-product/data': 'data' } } },
    { bundle: { resources: ['../../../separate-product/data'] } },
    { bundle: { icon: ['../../../separate-product/icon.png'] } },
    { bundle: { externalBin: ['../../../separate-product/bin/tool'] } },
    { build: { frontendDist: '../../../separate-product/dist' } },
  ]) {
    await writeFile(config, JSON.stringify(value));
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Tauri/);
  }
});

test('rejects an external worker URL and Rust compile inclusion', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'source/frontend/src/index.ts'), "new Worker('https://engine.example/worker.js');\n");
  let result = f.run(); assert.notEqual(result.status, 0, result.stderr || result.stdout); assert.match(result.stderr, /external worker URL/);
  await writeFile(path.join(f.root, 'source/frontend/src/index.ts'), "export const schema = 'gaim.skeletal-asset.v1';\n");
  const rust = path.join(f.root, 'source/pose-contact/src'); await mkdir(rust, { recursive: true });
  await writeFile(path.join(rust, 'lib.rs'), 'include!("../../../../separate-product/shared.rs");\n');
  result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Rust included file/);
});

test('rejects a source symlink into a sibling checkout when supported', async t => {
  const f = await fixture(t), link = path.join(f.root, 'source/frontend/src/external');
  try { await symlink(f.sibling, link, 'junction'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('The host does not permit test symlink creation.'); throw error; }
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /source symlink resolves outside/);
});

test('rejects an absolute local import outside the checkout without banning consumer names', async t => {
  const f = await fixture(t), absolute = path.join(f.sibling, 'shared.mjs').replaceAll('\\', '/');
  await writeFile(path.join(f.root, 'source/frontend/src/index.ts'), `import '${absolute}';\nconst documentation = 'GaimEngine and fight-game-study; gaim.skeletal-asset.v1';\n`);
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /outside the RustSMF checkout/);
});

test('rejects file URL imports and literal build inputs into sibling repositories', async t => {
  const f = await fixture(t), absolute = pathToFileURL(path.join(f.sibling, 'shared.mjs')).href;
  await writeFile(path.join(f.root, 'source/frontend/src/index.ts'), `import '${absolute}';\n`);
  let result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /file:/);
  await writeFile(path.join(f.root, 'scripts/check-input.mjs'), `readFileSync(${JSON.stringify(path.join(f.sibling, 'shared.mjs'))});\n`);
  result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /literal build input/);
});
