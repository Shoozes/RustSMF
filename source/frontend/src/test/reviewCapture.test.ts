import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page, TestInfo } from '@playwright/test';
import { captureReview } from '../../tests/helpers/review-capture';

test('routine review checks do not generate passing screenshots', async () => {
  const previous = process.env.RUSTSMF_CAPTURE_UI_REVIEW;
  try {
    delete process.env.RUSTSMF_CAPTURE_UI_REVIEW;
    const page = { screenshot: () => assert.fail('Routine run must not capture a file.') } as unknown as Page;
    const info = { outputPath: () => assert.fail('Routine run must not allocate an image path.') } as unknown as TestInfo;
    assert.equal(await captureReview(page, info, 'review.png'), undefined);
  } finally {
    if (previous === undefined) delete process.env.RUSTSMF_CAPTURE_UI_REVIEW; else process.env.RUSTSMF_CAPTURE_UI_REVIEW = previous;
  }
});

test('explicit review capture uses the current test owner and requested framing', async () => {
  const previous = process.env.RUSTSMF_CAPTURE_UI_REVIEW, captures: unknown[] = [];
  try {
    process.env.RUSTSMF_CAPTURE_UI_REVIEW = '1';
    const page = { screenshot: async (options: unknown) => { captures.push(options); } } as unknown as Page;
    const info = { outputPath: (name: string) => `current-run/${name}` } as unknown as TestInfo;
    assert.equal(await captureReview(page, info, 'review.png', true), 'current-run/review.png');
    assert.deepEqual(captures, [{ path: 'current-run/review.png', fullPage: true }]);
  } finally {
    if (previous === undefined) delete process.env.RUSTSMF_CAPTURE_UI_REVIEW; else process.env.RUSTSMF_CAPTURE_UI_REVIEW = previous;
  }
});
