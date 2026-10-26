import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';

const repository = resolve(import.meta.dirname, '..');
const windows = process.platform === 'win32';

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'rustsmf-standalone-'));
  t.after(() => {
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + '\\') || resolve(parent).startsWith(resolve(tmpdir()) + '/'));
    rmSync(parent, {recursive: true, force: true});
  });
  const root = join(parent, 'RustSMF'), frontend = join(root, 'source/frontend');
  mkdirSync(frontend, {recursive: true});
  mkdirSync(join(root, 'scripts'));
  copyFileSync(join(repository, 'run.ps1'), join(root, 'run.ps1'));
  copyFileSync(join(repository, 'scripts/dev-process-ownership.ps1'), join(root, 'scripts/dev-process-ownership.ps1'));
  writeFileSync(join(frontend, 'package.json'), JSON.stringify({scripts: {
    'test:e2e': 'node direct.cjs e2e', 'test:journey': 'node direct.cjs journey',
  }}));
  writeFileSync(join(frontend, 'direct.cjs'), "require('fs').appendFileSync('direct.txt', process.argv[2]+'\\n'); console.log('DIRECT-PROJECT-PLAYWRIGHT');");
  for (const name of ['geneye-playwright.json', 'geneye-journey.json']) writeFileSync(join(frontend, name), '{}');
  const invoke = (args = [], env = {}) => spawnSync('pwsh', ['-NoProfile', '-File', join(root, 'run.ps1'), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    env: {...process.env, ...env},
  });
  return {root, parent, frontend, invoke};
}

test('ordinary browser and journey routing ignores ambient integrations and sibling directories', t => {
  const f = fixture(t);
  for (const task of ['test:e2e', 'test:journey']) {
    const ordinary = f.invoke(['-Task', task]);
    assert.equal(ordinary.status, 0, ordinary.stderr + ordinary.stdout);
    assert.match(ordinary.stdout, /DIRECT-PROJECT-PLAYWRIGHT/);
  }
  const sibling = join(f.parent, 'GenEye');mkdirSync(sibling);
  writeFileSync(join(sibling, 'run.bat'), '@echo off\r\nexit /b 99\r\n');
  mkdirSync(join(f.parent, 'GaimEngine'));
  const env = {GENEYE_ROOT: sibling, GENEYE_RUN_BAT: join(sibling, 'run.bat'), GAIM_ROOT: join(f.parent, 'GaimEngine'), RUSTSMF_NO_GENEYE: '0'};
  for (const task of ['test:e2e', 'test:journey']) for (const suffix of [[], ['-NoGenEye']]) {
    const result = f.invoke(['-Task', task, ...suffix], env);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /DIRECT-PROJECT-PLAYWRIGHT/);
    assert.doesNotMatch(result.stdout, /\[GENEYE\]/);
  }
  assert.equal(readFileSync(join(f.frontend, 'direct.txt'), 'utf8').trim().split('\n').length, 6);
  assert.equal(existsSync(join(f.root, 'runtime-data/geneye-playwright-runs')), false);
});

test('an explicitly requested missing integration fails without running ordinary tests', t => {
  const f = fixture(t), result = f.invoke(['-Task', 'test:e2e', '-GenEyeRoot', join(f.parent, 'missing')]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Requested GenEye integration is unavailable/);
  assert.equal(existsSync(join(f.frontend, 'direct.txt')), false);
});

test('explicit integration success, failure and conflicting switches remain observable', {skip: !windows}, t => {
  const f = fixture(t), integration = join(f.parent, 'chosen integration');mkdirSync(integration);
  writeFileSync(join(integration, 'run.bat'), '@echo off\r\nnode "%~dp0runner.cjs" %*\r\n');
  writeFileSync(join(integration, 'runner.cjs'), "const fs=require('fs'),p=require('path'),a=process.argv.slice(2),out=a[a.indexOf('-Out')+1];fs.writeFileSync(p.join(out,'summary.json'),JSON.stringify({project_tests:{status:'passed',exit_code:0}}));");
  const passed = f.invoke(['-Task', 'test:e2e', '-GenEyeRoot', integration], {GENEYE_RUN_BAT: 'Z:\\unrequested\\run.bat'});
  assert.equal(passed.status, 0, passed.stderr + passed.stdout);
  assert.match(passed.stdout, /Requested integration evidence ready/);
  assert.equal(existsSync(join(f.frontend, 'direct.txt')), false);
  writeFileSync(join(integration, 'runner.cjs'), 'process.exit(7);');
  const failed = f.invoke(['-Task', 'test:journey', '-GenEyeRoot', integration]);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /Requested GenEye integration failed/);
  const conflict = f.invoke(['-Task', 'test:e2e', '-GenEyeRoot', integration, '-NoGenEye']);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stdout + conflict.stderr, /not both/);
  assert.equal(existsSync(join(f.frontend, 'direct.txt')), false);
});
