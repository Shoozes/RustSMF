import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { browserTestEndpoint } from './scripts/browser-test-endpoint';

const endpoint = browserTestEndpoint(process.env.RUSTSMF_PLAYWRIGHT_PORT);

const quoteShellArgument = (value: string): string => (
  process.platform === 'win32'
    ? `"${value.split('"').join('""')}"`
    : `'${value.split("'").join("'\\''")}'`
);

const bundledNpmCli = path.join(
  path.dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);
const npmCommand = existsSync(bundledNpmCli)
  ? `${quoteShellArgument(process.execPath)} ${quoteShellArgument(bundledNpmCli)}`
  : 'npm';

const configuredExecutablePath = process.env.RUSTSMF_PLAYWRIGHT_EXECUTABLE?.trim();
if (
  configuredExecutablePath
  && (!path.isAbsolute(configuredExecutablePath) || !existsSync(configuredExecutablePath))
) {
  throw new Error(
    'RUSTSMF_PLAYWRIGHT_EXECUTABLE must be an existing absolute browser executable path',
  );
}

/**
 * Playwright config for RustSMF frontend e2e (Chrome-focused).
 * Runs against a production Vite preview server.
 * Screenshots on failure for visual checks of viewport, timeline, loaded models.
 * See tests/ for specs.
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: '**/*.journey.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['./scripts/compact-playwright-reporter.ts'],
    ['list']
  ],
  use: {
    baseURL: endpoint.baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(configuredExecutablePath
      ? { launchOptions: { executablePath: configuredExecutablePath } }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `${npmCommand} run build && ${npmCommand} run preview -- --host 127.0.0.1 --port ${endpoint.port} --strictPort`,
    url: endpoint.baseURL,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
