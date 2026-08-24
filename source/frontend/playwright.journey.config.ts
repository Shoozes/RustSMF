import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: '**/*.journey.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: '../../output/playwright/hand-wave-journey/test-results',
  reporter: [['list']],
  use: {
    ...baseConfig.use,
    screenshot: 'off',
    trace: 'retain-on-failure',
    video: 'off',
  },
});
