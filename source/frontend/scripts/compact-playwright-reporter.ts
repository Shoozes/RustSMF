import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { FullConfig, FullResult, Reporter, Suite, TestError } from '@playwright/test/reporter';

const MAX_DETAILS = 8;
const text = (value: string, bytes = 2048): string => Buffer.from(stripVTControlCharacters(value)).subarray(0, bytes).toString('utf8');

export function compactSummary(suite: Suite | null, result: FullResult, errors: string[], errorCount: number) {
  const tests = suite?.allTests() ?? [];
  const counts = { tests: tests.length, expected: 0, unexpected: 0, flaky: 0, skipped: 0, notRun: 0, attempts: 0,
    finalResults: { passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 }, globalErrors: errorCount };
  const failures = [];
  let failureCount = 0;
  for (const test of tests) {
    counts[test.outcome()]++;
    counts.attempts += test.results.length;
    const final = test.results.at(-1);
    if (final) counts.finalResults[final.status]++; else counts.notRun++;
    for (const attempt of test.results) {
      if (attempt.status === test.expectedStatus || attempt.status === 'skipped') continue;
      failureCount++;
      if (failures.length < MAX_DETAILS) failures.push({
        test: text(test.titlePath().join(' > '), 512), status: attempt.status, retry: attempt.retry,
        error: text(attempt.error?.stack ?? attempt.error?.message ?? `Expected ${test.expectedStatus}; received ${attempt.status}.`),
        artifacts: attempt.attachments.filter(item => item.path).slice(0, 3).map(item => text(relative(process.cwd(), item.path!), 512)),
      });
    }
  }
  return { schema: 'rustsmf.playwright-summary.v1', status: result.status, durationMs: result.duration, counts,
    failures, omittedFailures: failureCount - failures.length, errors: errors.slice(0, MAX_DETAILS).map(error => text(error)),
    omittedErrors: Math.max(0, errorCount - MAX_DETAILS) };
}

/** Routine DOM tests retain counts and bounded failure details; HTML is opt-in. */
export default class CompactPlaywrightReporter implements Reporter {
  private suite: Suite | null = null;
  private outputFile = '';
  private errors: string[] = [];
  private errorCount = 0;
  constructor(private readonly options: { outputFile?: string } = {}) {}

  onConfigure(config: FullConfig): void {
    this.outputFile = resolve(this.options.outputFile ?? join(config.projects[0]?.outputDir ?? join(config.rootDir, 'test-results'), 'summary.json'));
  }
  onBegin(config: FullConfig, suite: Suite): void { this.onConfigure(config); this.suite = suite; }
  onError(error: TestError): void {
    this.errorCount++;
    if (this.errors.length < MAX_DETAILS) this.errors.push(text(error.stack ?? error.message ?? error.value ?? 'Unknown Playwright error.'));
  }
  onEnd(result: FullResult): void {
    if (!this.outputFile) throw new Error('Playwright did not configure the compact report destination.');
    const json = JSON.stringify(compactSummary(this.suite, result, this.errors, this.errorCount)) + '\n';
    if (Buffer.byteLength(json) > 64 * 1024) throw new Error('Compact Playwright summary exceeded 64 KiB.');
    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, json, 'utf8');
  }
  printsToStdio(): boolean { return false; }
}
