import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import type { FullResult, Suite } from '@playwright/test/reporter';
import { compactSummary } from '../../scripts/compact-playwright-reporter';
import browserConfig from '../../playwright.config';
import journeyConfig from '../../playwright.journey.config';

const require = createRequire(import.meta.url);
const reporter = resolve('scripts/compact-playwright-reporter.ts');
function run(content: string, check: (summary: ReturnType<typeof compactSummary>, status: number | null, files: string[]) => void) {
  const temporaryRoot = resolve(tmpdir()), directory = mkdtempSync(join(temporaryRoot, 'rustsmf-reporter-'));
  try {
    writeFileSync(join(directory, 'playwright.config.cjs'), `module.exports={testDir:'.',testMatch:'case.spec.cjs',workers:1,retries:1,outputDir:'results',reporter:[[${JSON.stringify(reporter)}]]};`);
    writeFileSync(join(directory, 'case.spec.cjs'), `const {test,expect}=require(${JSON.stringify(require.resolve('@playwright/test'))});\n${content}`);
    const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', join(directory, 'playwright.config.cjs')],
      { cwd: directory, encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 });
    assert.ifError(result.error);
    const summary = JSON.parse(readFileSync(join(directory, 'results', 'summary.json'), 'utf8'));
    check(summary, result.status, readdirSync(directory));
  } finally {
    assert.ok(directory.startsWith(temporaryRoot + sep));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('default browser and journey configs select compact reports without HTML', () => {
  assert.deepEqual(browserConfig.reporter, [['./scripts/compact-playwright-reporter.ts'], ['list']]);
  assert.deepEqual(journeyConfig.reporter, browserConfig.reporter);
});

test('native reporter preserves expected, skipped and flaky results with no HTML', () => {
  run(`test('pass',()=>{}); test.skip('skip',()=>{});
test('expected failure',()=>{test.fail();expect(1).toBe(2);});
test('flaky',({},info)=>{expect(info.retry).toBe(1);});`, (summary, status, files) => {
    assert.equal(status, 0); assert.equal(summary.status, 'passed');
    assert.deepEqual(summary.counts, { tests: 4, expected: 2, unexpected: 0, flaky: 1, skipped: 1, notRun: 0, attempts: 5,
      finalResults: { passed: 2, failed: 1, timedOut: 0, skipped: 1, interrupted: 0 }, globalErrors: 0 });
    assert.equal(summary.failures.length, 1); assert.equal(summary.failures[0].retry, 0);
    assert.ok(!files.includes('playwright-report'));
  });
});

test('native failures and discovery errors retain real failure status and bounded details', () => {
  run(`test('failure',()=>expect(1).toBe(2));`, (summary, status) => {
    assert.equal(status, 1); assert.equal(summary.status, 'failed'); assert.equal(summary.counts.unexpected, 1);
    assert.equal(summary.counts.attempts, 2); assert.equal(summary.failures.length, 2);
    assert.match(summary.failures[0].error, /toBe/);
  });
  run(`this is invalid JavaScript ???`, (summary, status) => {
    assert.equal(status, 1); assert.equal(summary.status, 'failed'); assert.equal(summary.counts.tests, 0);
    assert.ok(summary.counts.globalErrors > 0); assert.ok(summary.errors[0].length > 0);
  });
});

test('compact report bounds encoded diagnostic bytes and preserves omitted counts', () => {
  const huge = '界'.repeat(100_000);
  const testCase = { titlePath: () => [huge], expectedStatus: 'passed', outcome: () => 'unexpected',
    results: [{ status: 'failed', retry: 0, error: { stack: huge }, attachments: [] }] };
  const suite = { allTests: () => Array.from({ length: 100 }, () => testCase) } as unknown as Suite;
  const summary = compactSummary(suite, { status: 'interrupted', duration: 10 } as FullResult, Array(8).fill(huge), 100);
  assert.equal(summary.status, 'interrupted'); assert.equal(summary.counts.unexpected, 100);
  assert.equal(summary.failures.length, 8); assert.equal(summary.omittedFailures, 92); assert.equal(summary.omittedErrors, 92);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 64 * 1024);
});
