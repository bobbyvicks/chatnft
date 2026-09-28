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
       5793, 5794, 5797 and 5799 reached it, suite-wide. Every request that
       was not a preflight was refused: GET /auth/v1/user 403 (bad_jwt,
       "token is malformed") 22 times, and POST /rest/v1/rpc/my_team 401
       once. The rest were OPTIONS preflights, to /auth/v1/user,
       /rest/v1/rpc/my_team, /rest/v1/teams and /rest/v1/traits. No data
       was read or written from a test port.

       WHAT THE RULE COVERS. Names Chromium resolves itself: every
       *.supabase.co name, with or without a trailing dot (a trailing-dot
       name slipped past the plain entry, measured by review), fails to
       resolve, and nothing is sent. A proxy set at launch (a --proxy-server
       arg, or Playwright's launch option proxy) would otherwise take the
       name to the proxy unresolved: the bypass list makes Chromium resolve
       *.supabase.co names itself even then. Measured 2026-09-28 with a
       local listener standing in for the proxy and made-up *.supabase.co
       names only: without the bypass list, http requests reached it as GET
       and https as CONNECT; with *.supabase.co alone in the list, a
       trailing-dot name still reached it; with both entries below, every
       *.supabase.co request was refused while a name outside the list
       still went through the listener. With Playwright's launch option,
       this list comes after the one Playwright adds, and it is the one in
       force (measured: the names were refused). So that option's own
       bypass entries are dropped (inferred from that, not measured).

       NOT COVERED, measured the same way: a proxy set on a context
       (browser.newContext({ proxy }), or proxy in a test's use). Chromium
       gives that context its own proxy settings, the launch bypass list
       does not reach them, and every *.supabase.co request, trailing dot or
       not, went to the listener. Not measured: a proxy from the operating
       system or a PAC script. A --proxy-pac-url (data: or served locally)
       was not applied at all by this headless Chromium, so it measured
       nothing. And a launchOptions set by a spec's test.use or by a
       project's use REPLACES this one rather than merging with it (measured
       by review), so the guard is gone wherever that is done. Test 5 in
       tests/networkguard.spec.js catches only part of this. It fails on a
       launchOptions or proxy key written out as an object key in a spec's
       source text, and on either key anywhere in this config's exported
       object except launchOptions at use.launchOptions. It does not see an
       assignment form (opts.launchOptions = {...}, then test.use(opts)), a
       spec's own chromium.launch({ args }), a remote browser through
       connectOptions or PW_TEST_CONNECT_WS_ENDPOINT, or a project with a
       different browserName, which never gets this Chromium switch. Review
       measured the first two passing test 5 with the guard gone.

       page.route handlers and window.fetch stubs are untouched: a route
       answers a request before any name is looked up, and a stub never
       makes one. tests/networkguard.spec.js pins the page.route half.

       In tests/networkguard.spec.js, tests 1 and 2 and the trailing-dot
       test are what detect a bypass of the *.supabase.co entries. Test 4
       does not: it exercises only its own probe entry, to show that the
       rule is in force at all.

       The rule is Chromium's (--host-resolver-rules). A WebKit or Firefox
       project added below would not have it, and would need its own guard.

       pb-guard-probe.localhost exists only so tests/networkguard.spec.js can
       prove the rule is in force without any external traffic: Chromium
       resolves every *.localhost name to loopback by itself, so that name
       failing while pb-guard-open.localhost still loads is the rule's doing. */
    launchOptions: { args: [
      '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND, MAP *.supabase.co. ~NOTFOUND, MAP pb-guard-probe.localhost ~NOTFOUND',
      '--proxy-bypass-list=*.supabase.co;*.supabase.co.',
    ] },
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
