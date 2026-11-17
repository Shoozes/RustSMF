import { defineConfig } from '@playwright/test';
import browserConfig, { endpoint, npmCommand } from './playwright.config';

const hosted = process.env.RUSTSMF_TEST_HOSTED_PAGES === '1';

export default defineConfig({
  ...browserConfig,
  testIgnore: [],
  testMatch: '**/web-edition.spec.ts',
  outputDir: hosted ? '../../output/web-edition/hosted-browser' : '../../output/web-edition/local-browser',
  use: {
    ...browserConfig.use,
    baseURL: hosted ? 'https://shoozes.github.io' : endpoint.baseURL,
  },
  webServer: hosted ? undefined : {
    command: `${npmCommand} run build:web && ${npmCommand} run preview -- --mode pages --host 127.0.0.1 --port ${endpoint.port} --strictPort`,
    url: `${endpoint.baseURL}/RustSMF/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
