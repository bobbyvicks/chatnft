import { defineConfig } from '@playwright/test';

/* One browser, one worker: the specs read pixels off the preview canvases,
   and a second worker racing a shared static server buys nothing and makes
   a flake look like a defect. (The same reasoning as the pixel editor's
   suite, which this is modelled on.) */
const PORT = Number(process.env.CB_PORT) || 5611;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /* Pinned to the Chromium the environment ships when PLAYWRIGHT_CHROMIUM
       is set; otherwise Playwright's own download is used. */
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node tools/serve.cjs . ' + PORT,
    url: 'http://127.0.0.1:' + PORT + '/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
