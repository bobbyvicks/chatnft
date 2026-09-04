import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'probe.spec.js',
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5773', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'node tools/serve.cjs . 5773', url: 'http://127.0.0.1:5773/index.html',
               reuseExistingServer: false, stdout: 'ignore', stderr: 'pipe' },
});
