import { defineConfig } from '@playwright/test';

/* Every one of these tests exists because something shipped broken and was
   caught by hand afterwards. The ad-hoc browser checks that found them were
   thrown away each time; these are the same checks, kept.

   One browser and one worker on purpose: the suite drives the page's own
   globals and asserts on pixel counts, so a second worker racing a shared
   static server buys nothing and makes a flake look like a defect. */
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
    baseURL: 'http://127.0.0.1:5771',
    /* The canvas work is measured in device pixels, so the viewport and the
       scale factor have to be fixed or the numbers move under the test. */
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node tools/serve.cjs . 5771',
    url: 'http://127.0.0.1:5771/index.html',
    /* Never reuse. A leftover server from something else was squatting on the
       first port this used and answering 403, and the suite happily attached
       to it and tested nothing. Starting our own is the only way to know what
       is being served. */
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
