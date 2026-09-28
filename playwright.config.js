import { defineConfig } from '@playwright/test';

/* Every one of these tests exists because something shipped broken and was
   caught by hand afterwards. The ad-hoc browser checks that found them were
   thrown away each time; these are the same checks, kept.

   One browser and one worker on purpose: the suite drives the page's own
   globals and asserts on pixel counts, so a second worker racing a shared
   static server buys nothing and makes a flake look like a defect. */
/* ONE PORT PER CLONE. Two checkouts of this repo on one machine - a second
   Claude session, a colleague's worktree - each start their own server, and
   with the port fixed the second one finds it taken and refuses (correctly,
   see reuseExistingServer below) or worse, tests the other clone's page.
   5771 stays the default so nothing about a single-clone setup changes. */
const PORT = Number(process.env.PB_PORT) || 5771;

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
    /* The canvas work is measured in device pixels, so the viewport and the
       scale factor have to be fixed or the numbers move under the test. */
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /* NOTHING THE SUITE OPENS CAN REACH SUPABASE. No test was meant to reach
       the live project, and nothing enforced it: some specs replace
       window.fetch or route only some requests, and whatever got past them
       went to the real network. Measured in the live project's edge logs
       (read-only, 2026-09-27 10:05Z to 2026-09-28 10:05Z): from at least
       2026-09-27 14:09Z, HeadlessChrome pages on 127.0.0.1 ports 5771, 5783,
       5793, 5794, 5797 and 5799 reached it, suite-wide. It refused all of it -
       GET /auth/v1/user 403 (bad_jwt, "token is malformed") 22 times, POST
       /rest/v1/rpc/my_team 401 once - and the rest were OPTIONS preflights
       to /auth/v1/user, /rest/v1/rpc/my_team, /rest/v1/teams and
       /rest/v1/traits. No data was read or written from a test port.

       So every *.supabase.co name now fails to resolve inside the browser,
       and nothing is sent. page.route handlers and window.fetch stubs are
       untouched: both answer a request before it is sent, so no name is
       looked up for it (tests/networkguard.spec.js pins that too).

       The rule is Chromium's (--host-resolver-rules). A WebKit or Firefox
       project added below would not have it, and would need its own guard.

       pb-guard-probe.localhost exists only so tests/networkguard.spec.js can
       prove the rule is in force without any external traffic: Chromium
       resolves every *.localhost name to loopback by itself, so that name
       failing while pb-guard-open.localhost still loads is the rule's doing. */
    launchOptions: { args: ['--host-resolver-rules=MAP *.supabase.co ~NOTFOUND, MAP pb-guard-probe.localhost ~NOTFOUND'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node tools/serve.cjs . ' + PORT,
    url: 'http://127.0.0.1:' + PORT + '/index.html',
    /* Never reuse. A leftover server from something else was squatting on the
       first port this used and answering 403, and the suite happily attached
       to it and tested nothing. Starting our own is the only way to know what
       is being served. */
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
