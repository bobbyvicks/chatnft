/* NOTHING THE SUITE OPENS CAN REACH SUPABASE.

   The plan said no test may reach the live project. Nothing enforced it. Some
   specs replace window.fetch, or route only some requests, and whatever got
   past them went to the real network. Measured in the live project's edge
   logs (read-only, 2026-09-27 10:05Z to 2026-09-28 10:05Z): from at least
   2026-09-27 14:09Z, HeadlessChrome pages served from 127.0.0.1 on ports
   5771, 5783, 5793, 5794, 5797 and 5799 reached it, suite-wide. Every
   request that was not a preflight was refused: GET /auth/v1/user 403
   (bad_jwt, "token is malformed") 22 times, and POST /rest/v1/rpc/my_team
   401 once. The rest were OPTIONS preflights, to /auth/v1/user,
   /rest/v1/rpc/my_team, /rest/v1/teams and /rest/v1/traits. No data was
   read or written from a test port.

   playwright.config.js now launches Chromium with a host-resolver rule that
   makes every *.supabase.co name fail to resolve, trailing dot or not, and
   a proxy bypass list so that a proxy set at launch cannot carry those
   names away unresolved. What it covers and what it does not (a proxy set
   on a context, measured) is written there. These tests hold it to that:

     1. an unrouted request to the page's own project fails at name
        resolution;
     2. so does one to another *.supabase.co host, realtime.supabase.co:
        Supabase's own infrastructure host, not anyone's project (no other
        project's name belongs in this file). Before the browser asks for it,
        the test asserts that the name resolves through Node's resolver,
        which Chromium's rule does not touch. That is the operating system's
        resolver, so the hosts file counts as well as DNS. So the browser
        failing to resolve it is the rule's doing, not the name's. This test
        first used a made-up name, guard-check.supabase.co. Measured
        2026-09-28, that name is NXDOMAIN (nslookup: "Non-existent domain";
        Node's lookup: ENOTFOUND), so the browser could not resolve it with
        or without the rule, and the test passed either way;
     2b. the same name with a trailing dot, realtime.supabase.co., fails the
        same way, with the same precondition. Review measured that a
        trailing-dot name slipped past the plain *.supabase.co entry;
     3. the same request as 1, answered by page.route, still works. It is
        1's control and differs from it by one variable, the route: the same
        attempt() call, with the same no-cors fetch, gets the stand-in's 200
        instead of a refused name. It then also reads the stand-in's status
        and body with a normal (cors) fetch, since an opaque answer hides
        both;
     4. the rule is in force, measured with no external traffic at all: a
        *.localhost name the rule names fails, and one it does not name loads
        from the page's own server. Chromium resolves *.localhost to loopback
        by itself, so only the rule can make the first one fail. It
        exercises only its own probe entry, so it cannot see a bypass of the
        *.supabase.co entries: 1, 2 and 2b are what would;
     5. nothing replaces the guard, as far as a check of text and of the
        config object can see. No file in the test directory writes
        launchOptions or proxy as an object key in its source text, and the
        config's exported object has launchOptions only at use.launchOptions
        and no proxy. A spec's or a project's launchOptions REPLACES the
        guard's rather than merging with it (measured by review: the probe
        loaded), and a proxy set on a context is not covered by it. Test 5
        does not see an assignment form (opts.launchOptions = {...}, then
        test.use(opts)), a spec's own chromium.launch({ args }),
        connectOptions or PW_TEST_CONNECT_WS_ENDPOINT, or a different
        browserName. Review measured the first two passing it with the guard
        gone.

   1, 2 and 2b are never run with the rule taken away to watch them fail:
   that run would be the leak itself. 4 shows the rule is in force at all;
   2's and 2b's DNS preconditions are what make their refusals mean
   something; 1's host demonstrably resolves (the logs above are it
   answering). That the *.supabase.co pattern holds for the real project is
   also read from the live project's logs. */
import { test, expect } from '@playwright/test';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

/* Node's lookup of a name, outside the browser and its rule: null if it
   resolves, else the error code. */
const unresolvedInNode = async (host) => {
  try { await dns.promises.lookup(host); return null; } catch (e) { return e.code || String(e); }
};
const mustResolve = (host) => host + ' must resolve through Node\'s resolver (the operating system\'s: DNS, '
  + 'or the hosts file), or the browser failing to resolve it proves nothing about the rule: pick another '
  + '*.supabase.co host that does resolve (never a project) and put it here';

test.describe('the suite cannot reach Supabase', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('an unrouted request to the page\'s own Supabase host fails at name resolution', async ({ page }) => {
    const sb = await page.evaluate(() => SB_URL);
    expect(sb, 'the page names its project the way this test expects').toMatch(SUPABASE_URL);
    expect(await attempt(page, sb + '/auth/v1/user', { mode: 'no-cors' }),
      'the name never resolves, so nothing is sent').toEqual(REFUSED);
  });

  test('any other *.supabase.co host fails the same way', async ({ page }) => {
    const host = 'realtime.supabase.co';
    expect(await unresolvedInNode(host), mustResolve(host)).toBeNull();
    expect(await attempt(page, 'https://' + host + '/', { mode: 'no-cors' }),
      'the name never resolves, so nothing is sent').toEqual(REFUSED);
  });

  test('a *.supabase.co name with a trailing dot fails the same way', async ({ page }) => {
    const host = 'realtime.supabase.co.';
    expect(await unresolvedInNode(host), mustResolve(host)).toBeNull();
    expect(await attempt(page, 'https://' + host + '/', { mode: 'no-cors' }),
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
    expect(await attempt(page, sb + '/auth/v1/user', { mode: 'no-cors' }),
      'test 1\'s own call, and the route answers it before any name is looked up')
      .toEqual({ rejected: false, failure: null, status: 200 });
    const got = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return { status: r.status, body: await r.json() };
    }, sb + '/auth/v1/user');
    expect(got, 'and a normal fetch gets the stand-in\'s own status and body')
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

/* 5. NOTHING REPLACES THE GUARD. Read from the files and the config object,
   with no browser.

   The specs: every source file in the directory this run loads specs from
   (so a scratch run against another directory checks that one), this file
   aside. A file fails if it sets launchOptions or proxy as an object key -
   `launchOptions: ...`, `{ launchOptions }`, or the name quoted - which is
   how test.use, test.extend, browser.newContext and a context option set
   them when the key is written out. It is a text match on that syntax. It
   does not see an assignment (opts.launchOptions = ..., then
   test.use(opts)) or any key built at runtime. It knows nothing of a
   spec's own chromium.launch({ args }), of connectOptions or
   PW_TEST_CONNECT_WS_ENDPOINT, or of a project's browserName (see
   playwright.config.js).

   The config: the file this run was started with, imported, and every
   place in its object a key of either name appears. launchOptions must be
   exactly at use.launchOptions, and proxy nowhere. */
const setsKey = (name) => new RegExp('\\b' + name + '\\s*:|[{,]\\s*' + name + '\\s*[,}]|[\'"`]' + name + '[\'"`]', 'g');

const sourcesUnder = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'node_modules' ? [] : sourcesUnder(p);
  return /\.[cm]?[jt]sx?$/.test(d.name) ? [p] : [];
});

const keyPaths = (o, name, at = '') => {
  const plain = (v) => Array.isArray(v) || Object.prototype.toString.call(v) === '[object Object]';
  if (!plain(o)) return [];
  return Object.keys(o).flatMap((k) => {
    const here = at ? at + '.' + k : k;
    return (k === name ? [here] : []).concat(keyPaths(o[k], name, here));
  });
};

test.describe('nothing replaces the guard', () => {
  test('no spec sets launchOptions or a proxy, and the config sets launchOptions only in its top-level use', async () => {
    const info = test.info();
    const dir = info.project.testDir;
    const self = path.resolve(info.file);
    const files = sourcesUnder(dir).map((f) => path.resolve(f));
    expect(files, 'the scan reads the directory this run loads specs from, this file included').toContain(self);
    const found = [];
    for (const f of files) {
      if (f === self) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const name of ['launchOptions', 'proxy']) {
        for (const m of text.matchAll(setsKey(name))) {
          found.push(path.relative(dir, f).split(path.sep).join('/') + ':'
            + text.slice(0, m.index).split('\n').length + ' ' + m[0].trim());
        }
      }
    }
    expect(found, 'a spec that sets launchOptions replaces the guard\'s rather than merging with it, and a proxy '
      + 'set on a context is not covered by the guard: see playwright.config.js').toEqual([]);

    const config = (await import(pathToFileURL(info.config.configFile).href)).default;
    expect({ launchOptions: keyPaths(config, 'launchOptions'), proxy: keyPaths(config, 'proxy') },
      'the config\'s launchOptions are the top-level use\'s alone (a project\'s would replace them), and it sets no proxy')
      .toEqual({ launchOptions: ['use.launchOptions'], proxy: [] });
  });
});
