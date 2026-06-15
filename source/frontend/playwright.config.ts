import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for RustSMF frontend e2e (Chrome-focused).
 * Runs against Vite dev server.
 * Screenshots on failure for visual checks of viewport, timeline, loaded models.
 * See tests/ for specs.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
