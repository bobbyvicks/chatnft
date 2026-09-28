/* NOTHING THE SUITE OPENS CAN REACH SUPABASE.

   The plan said no test may reach the live project. Nothing enforced it. Some
   specs replace window.fetch, or route only some requests, and whatever got
   past them went to the real network. Measured in the live project's edge
   logs (read-only, 2026-09-27 10:05Z to 2026-09-28 10:05Z): from at least
   2026-09-27 14:09Z, HeadlessChrome pages served from 127.0.0.1 on ports
   5771, 5783, 5793, 5794, 5797 and 5799 reached it, suite-wide. The project
   refused everything they asked: GET /auth/v1/user 403 (bad_jwt, "token is
   malformed") 22 times, and POST /rest/v1/rpc/my_team 401 once. Everything
   else was an OPTIONS preflight, to /auth/v1/user, /rest/v1/rpc/my_team,
   /rest/v1/teams and /rest/v1/traits. No data was read or written from a
   test port.

   playwright.config.js now launches Chromium with a host-resolver rule that
   makes every *.supabase.co name fail to resolve. These tests hold it to
   that:

     1. an unrouted request to the page's own project fails at name
        resolution;
     2. so does one to any other *.supabase.co host (a made-up one: no real
        project's name belongs in this file);
     3. the same request as 1, answered by page.route, still works: a spec's
        own stand-in is untouched, because it answers before any name is
        looked up. It is 1's control, and differs from it by the route (and
        by the fetch mode, since an opaque answer has no status or body to
        compare);
     4. the rule is in force, measured with no external traffic at all: a
        *.localhost name the rule names fails, and one it does not name loads
        from the page's own server. Chromium resolves *.localhost to loopback
        by itself, so only the rule can make the first one fail.

   1 and 2 are never run with the rule taken away to watch them fail: that
   run would be the leak itself. 4 is how the rule is shown to be able to
   fail, and that the *.supabase.co pattern holds for the real project is
   also read from the live project's logs. */
import { test, expect } from '@playwright/test';

const SUPABASE_URL = /^https:\/\/[a-z0-9]+\.supabase\.co$/;

const open = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof SB_URL === 'string' && typeof sbLoadSession === 'function');
};

/* What became of one fetch, as both sides saw it: whether the page's fetch
   rejected, the network error the browser recorded if the request failed
   before any answer came back, and the status of the answer if one did.
   Waits until the browser has reported one or the other, so a request still
   in flight is never read as "nothing happened".

   A failure AFTER an answer is left out. Measured while writing this: a
   no-cors fetch of index.html from another *.localhost origin got its 200,
   the page's fetch resolved, and the browser then reported the request
   failed with net::ERR_ABORTED - most likely dropping a body it will never
   hand the page as an opaque response; the cause was not read. That is not
   what happened to the request, and whether it lands before or after this
   helper reads the outcome is a race. */
const attempt = async (page, url, init) => {
  const seen = { failure: null, status: null };
  const onFailed = async (r) => {
    if (r.url() !== url) return;
    const text = r.failure() ? r.failure().errorText : '(failed, no error text)';
    if (!(await r.response())) seen.failure = text;
  };
  const onResponse = (r) => { if (r.url() === url) seen.status = r.status(); };
  page.on('requestfailed', onFailed);
  page.on('response', onResponse);
  try {
    const rejected = await page.evaluate(async ([url, init]) => {
      try { await fetch(url, init); return false; } catch (_) { return true; }
    }, [url, init]);
    await expect.poll(() => seen.failure !== null || seen.status !== null,
      { message: 'the browser reports what became of ' + url }).toBe(true);
    return { rejected, failure: seen.failure, status: seen.status };
  } finally {
    page.off('requestfailed', onFailed);
    page.off('response', onResponse);
  }
};

const REFUSED = { rejected: true, failure: 'net::ERR_NAME_NOT_RESOLVED', status: null };

test.describe('the suite cannot reach Supabase', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('an unrouted request to the page\'s own Supabase host fails at name resolution', async ({ page }) => {
    const sb = await page.evaluate(() => SB_URL);
    expect(sb, 'the page names its project the way this test expects').toMatch(SUPABASE_URL);
    expect(await attempt(page, sb + '/auth/v1/user', { mode: 'no-cors' }),
      'the name never resolves, so nothing is sent').toEqual(REFUSED);
  });

  test('any other *.supabase.co host fails the same way', async ({ page }) => {
    expect(await attempt(page, 'https://guard-check.supabase.co/', { mode: 'no-cors' }),
      'the name never resolves, so nothing is sent').toEqual(REFUSED);
  });

  test('the same request, routed, still works', async ({ page }) => {
    const sb = await page.evaluate(() => SB_URL);
    expect(sb, 'the page names its project the way this test expects').toMatch(SUPABASE_URL);
    await page.route(sb + '/auth/v1/user', (route) => route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'routed-stand-in' }),
    }));
    const got = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return { status: r.status, body: await r.json() };
    }, sb + '/auth/v1/user');
    expect(got, 'a spec\'s own stand-in answers before any name is looked up')
      .toEqual({ status: 200, body: { id: 'routed-stand-in' } });
  });

  test('the guard is in force, measured locally', async ({ page }) => {
    const port = await page.evaluate(() => location.port);
    expect(port, 'the page was served from a port of its own').toMatch(/^[0-9]+$/);
    const probe = await attempt(page, 'http://pb-guard-probe.localhost:' + port + '/index.html', { mode: 'no-cors' });
    const control = await attempt(page, 'http://pb-guard-open.localhost:' + port + '/index.html', { mode: 'no-cors' });
    expect({ probe, control },
      'the name the rule names is refused; a *.localhost name it does not name reaches this page\'s own server')
      .toEqual({ probe: REFUSED, control: { rejected: false, failure: null, status: 200 } });
  });
});
