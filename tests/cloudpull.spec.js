/* Load from cloud has to bring back all of it.

   Reported as "it only loads some". Measured against a stand-in server holding
   2,500 traits that answers with 1,000 - which is what PostgREST does at its
   default max-rows, and it says so in the Content-Range header:

     server holds            2,500
     server answered with    1,000   Content-Range: 0-999/2500
     row requests made           1
     Range header sent        none
     traits loaded           1,000
     what the app said       "Loaded 1000 items."

   AND THE COUNT AGREED. cloudStatus counted the server's rows with the same
   unpaginated select, so it was capped at the same number: the panel said
   1,000 here and 1,000 on the server and looked healthy while 1,500 rows were
   missing from both figures. Two instruments sharing one origin corroborate
   each other and prove nothing.

   Every test here drives the real cloudPull against a stubbed fetch. No
   credentials and no real server: the token is a string and every request is
   intercepted, so these test the client's paging and nothing else.

   THE CASE THAT MATTERS MOST is the server capping BELOW the page size. Ask
   for 1,000 from a server that will only ever give 500 and every full page
   looks short - so the obvious "stop when the batch is smaller than I asked
   for" loop stops after one page and rebuilds this bug in a form that is
   harder to see. That is its own test.
*/
import { test, expect } from '@playwright/test';

/* A stubbed collection of `total` rows, served `cap` at a time. */
const pullFrom = (page, total, cap) => page.evaluate(async ([TOTAL, CAP]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));

  const all = [];
  for (let i = 0; i < TOTAL; i++) all.push({
    id: 'row' + String(i).padStart(5, '0'), name: 'trait' + i, kind: 'trait',
    layer: 'skins', status: 'approved', path: 'p/' + i + '.png', w: 160, h: 160, rarity: 1 });

  let rowRequests = 0, countRange = null, countPrefer = null;
  const real = window.fetch;
  const json = (o, extra) => new Response(JSON.stringify(o),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.fetch = (u, o) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0) return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) {
      // The COUNT path. Record what it asked for and answer the way PostgREST
      // does for count=exact: no rows, the total in Content-Range.
      countPrefer = (o && o.headers && o.headers.Prefer) || null;
      countRange = (o && o.headers && o.headers.Range) || null;
      return Promise.resolve(json([], { 'Content-Range': '0-0/' + TOTAL }));
    }
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      rowRequests++;
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = all.slice(off, off + Math.min(lim, CAP));
      return Promise.resolve(json(batch,
        { 'Content-Range': off + '-' + (off + batch.length - 1) + '/' + TOTAL }));
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0)
      return Promise.resolve(new Response(new Blob([new Uint8Array([0])]), { status: 200 }));
    return real(u, o);
  };
  try { await cloudPull({ quiet: true }); } finally { window.fetch = real; }

  const stored = (await dbAll()).filter(i => i.kind === 'trait');
  const names = new Set(stored.map(t => t.name));
  return { rowRequests, countPrefer, countRange,
           loaded: stored.length, distinct: names.size,
           hasFirst: names.has('trait0'), hasLast: names.has('trait' + (TOTAL - 1)),
           note: document.getElementById('cloudnote').textContent };
}, [total, cap]);


/* Like pullFrom, but the FILE downloads misbehave: every `dropEvery`th one is
   dropped like a flaky connection, or every one 404s if `mode` says so. */
const pullWithBadFiles = (page, total, dropEvery, mode) => page.evaluate(async ([TOTAL, DROP, MODE]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const all = [];
  for (let i = 0; i < TOTAL; i++) all.push({
    id: 'row' + String(i).padStart(4, '0'), name: 'trait' + i, kind: 'trait',
    layer: 'skins', status: 'approved', path: 'p/' + i + '.png', w: 160, h: 160, rarity: 1 });
  let attempts = 0;
  const real = window.fetch;
  const json = (o, x) => new Response(JSON.stringify(o),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  window.fetch = (u, o) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0) return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return Promise.resolve(json([], { 'Content-Range': '0-0/' + TOTAL }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      // \d, not d. Written through a shell string the first time, which ate the
      // backslash: the offset never parsed, every page returned the same rows,
      // the pager ran its full 500 and asked for 25,000 downloads of 50 files.
      // A stub that cannot read the request measures nothing about it.
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      return Promise.resolve(json(all.slice(off, off + lim)));
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      attempts++;
      if (MODE === 'missing') return Promise.resolve(new Response('', { status: 404 }));
      // Deterministic, so the numbers are repeatable rather than flaky.
      if (attempts % DROP === 0) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(new Blob([new Uint8Array([0])]), { status: 200 }));
    }
    return real(u, o);
  };
  try { await cloudPull({ quiet: true }); } finally { window.fetch = real; }
  const stored = (await dbAll()).filter(i => i.kind === 'trait').length;
  return { loaded: stored, missing: TOTAL - stored, attempts,
           note: document.getElementById('cloudnote').textContent };
}, [total, dropEvery, mode]);

test.describe('loading a collection bigger than one response', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function');
  });

  test('a collection bigger than one response arrives whole', async ({ page }) => {
    // 250 behind a cap of 100, not the 2,500 behind 1,000 that was measured:
    // the property is "more than one page", and it is identical at either
    // size. The big numbers cost 22 seconds a test in IndexedDB writes and
    // proved nothing the small ones do not.
    const r = await pullFrom(page, 250, 100);
    expect(r.loaded, 'every row').toBe(250);
    expect(r.distinct, 'and none of them duplicated').toBe(250);
    expect(r.hasLast, 'including the very last one').toBe(true);
    expect(r.rowRequests, 'which takes more than one request').toBeGreaterThan(1);
    expect(r.note).toContain('250');
  });

  test('and a server that caps BELOW the page size does not truncate', async ({ page }) => {
    // The case the obvious implementation gets wrong. The client asks for 1,000
    // and this server never gives more than 40, so EVERY page looks short - a
    // loop that stops on a short batch would take 40 of 250 and report success.
    const r = await pullFrom(page, 250, 40);
    expect(r.loaded, 'still every row').toBe(250);
    expect(r.distinct).toBe(250);
    expect(r.hasFirst && r.hasLast, 'from the first to the last').toBe(true);
  });

  test('a collection that fits in one response still works', async ({ page }) => {
    // The control at the other end: paging must not break the ordinary case,
    // and must not spin.
    const r = await pullFrom(page, 40, 1000);
    expect(r.loaded).toBe(40);
    expect(r.rowRequests, 'one page of rows and one to find the end').toBeLessThanOrEqual(2);
  });

  test('an empty collection loads nothing and terminates', async ({ page }) => {
    const r = await pullFrom(page, 0, 1000);
    expect(r.loaded).toBe(0);
    expect(r.rowRequests).toBe(1);
  });

  test('the rows are asked for in a fixed order', async ({ page }) => {
    // Without an explicit order, limit/offset over an unordered result is not
    // stable: the server may order two responses differently, and then paging
    // skips some rows and repeats others. The 2,500 test would catch that only
    // by luck, so the request itself is checked.
    const asked = await page.evaluate(async () => {
      const seen = [];
      const real = window.fetch;
      window.fetch = (u, o) => {
        const s = String(u);
        if (s.indexOf('/rest/v1/traits?select=*') >= 0) seen.push(s);
        return Promise.resolve(new Response(JSON.stringify([]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      try { await cloudRows({ id: 'c1' }, { apikey: 'k' }); } finally { window.fetch = real; }
      return seen;
    });
    expect(asked.length, 'it asked for rows').toBeGreaterThan(0);
    expect(asked[0], 'ordered, so paging is stable').toContain('order=id.asc');
    expect(asked[0], 'and paged').toContain('limit=');
    expect(asked[0]).toContain('offset=');
  });

  test('the server count comes from the server, not from the response length', async ({ page }) => {
    // This is what made the defect invisible: the count used the same
    // unpaginated select, so it was capped identically and agreed with the
    // short pull. It now asks the database to count and reads the total out of
    // Content-Range, which is a number no row cap can change.
    const r = await pullFrom(page, 250, 100);
    expect(r.countPrefer, 'it asks the server to count').toContain('count=exact');
    expect(r.countRange, 'and carries no rows back to do it').toBe('0-0');
  });

  test('a file dropped by a flaky connection is retried, not abandoned', async ({ page }) => {
    // Measured before the retry: 200 traits with one download in ten failing
    // loaded 180 and left 20 missing until somebody pressed the button again -
    // which is another 200 requests over the connection that just dropped 20.
    const r = await pullWithBadFiles(page, 200, 10, 'flaky');
    expect(r.loaded, 'all of them arrive').toBe(200);
    expect(r.missing).toBe(0);
    expect(r.attempts, 'at the cost of a few repeats').toBeGreaterThan(200);
    expect(r.note, 'and nothing is reported unread').not.toContain('could not be read');
  });

  test('but a file that is genuinely gone costs ONE request, not three', async ({ page }) => {
    // THE CONTROL, and the reason the retry is scoped. A 404 is an answer: the
    // object is not in the bucket and asking twice more will not put it there.
    // Retrying it would turn a fast clear failure into a slow one, and this is
    // what proves the retry only covers transient failures.
    const r = await pullWithBadFiles(page, 50, 1, 'missing');
    expect(r.attempts, 'exactly one attempt each').toBe(50);
    expect(r.loaded).toBe(0);
    expect(r.note, 'and it says so plainly').toContain('could not be read');
  });

  test('a genuinely bad connection still loses some, and still says so', async ({ page }) => {
    // Three tries is not magic and must not pretend to be. At one drop in
    // three it recovers nearly everything, and whatever it cannot get is
    // counted rather than quietly left out.
    const r = await pullWithBadFiles(page, 200, 3, 'flaky');
    expect(r.loaded, 'nearly all of them').toBeGreaterThan(190);
    if (r.missing) expect(r.note).toContain('could not be read');
  });
});
