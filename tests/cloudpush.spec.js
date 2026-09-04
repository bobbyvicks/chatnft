/* What Save to cloud costs, and what it is allowed to destroy.

   Measured before this work, on 60 traits: 308 requests, 5.1 per trait, every
   single press. 61 of them fetched the user and 62 fetched the collection -
   answers that cannot change during a push, which cloudPush was already
   holding and cloudSyncOne re-derived per item. And the whole loop was
   sequential, while cloudPull had learned to run eight at once and said so in
   its own comment.

   Measured after: 189 on a first push, and EIGHT on a second press with
   nothing changed.

   THE SAFETY FIX MATTERS MORE THAN THE SPEED. On a personal page the push used
   to open by deleting every row in the collection and then re-upload one at a
   time. Measured with 60 rows on the server and the connection dropping after
   10 uploads, it left TEN. Stale rows are now worked out by comparison and
   removed AFTER the uploads land, so a push that dies leaves the server with
   more than it should rather than less.

   Every test drives the real cloudPush against a stubbed fetch. No
   credentials, no real server.

   THE STUB HONOURS limit AND offset. An earlier one did not, so cloudRows
   paged its full 500 and a push that uploaded nothing "cost" 506 requests -
   a fact about the stub, not the app. A stub that cannot read the request
   cannot measure it.
*/
import { test, expect } from '@playwright/test';

const N = 60;

/* Installs a fake server and returns a handle. `dieAfter` drops every upload
   past that many, the way a connection does. */
const withServer = (page, opts) => page.evaluate(async (o) => {
  const { count, dieAfter, group, preload } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = group ? 'ws1' : null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  for (let i = 0; i < count; i++) await dbPut({ id: 't_x' + i, kind: 'trait', name: 'x' + i,
    layer: 'skins', status: 'approved', blob: new Blob([new Uint8Array(64)]),
    w: 160, h: 160, rarity: 1, at: 1 });

  const state = { counts: {}, rows: [], uploads: 0, blanketDeletes: 0 };
  // Rows the server already holds, so a destructive push has something to destroy.
  for (let i = 0; i < (preload || 0); i++) state.rows.push({ id: 'pre' + i, path: 'pre/' + i + '.png' });

  const bump = (k) => { state.counts[k] = (state.counts[k] || 0) + 1; };
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) { bump('auth/user'); return json({ id: 'u1' }); }
    if (s.indexOf('/rpc/my_team') >= 0) { bump('rpc/my_team'); return json('team1'); }
    if (s.indexOf('/rest/v1/collections') >= 0) { bump('collections ' + m); return json([{ id: 'c1', layers: ['skins'] }]); }
    if (s.indexOf('/storage/v1/object/list') >= 0) { bump('storage/list'); return json([]); }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      state.uploads++; bump('storage/upload');
      if (dieAfter && state.uploads > dieAfter) return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      bump('traits POST');
      const b = JSON.parse(io.body)[0];
      const rec = { id: 'row_' + state.rows.length, path: b.path };
      const at = state.rows.findIndex(r => r.path === b.path);
      if (at >= 0) state.rows[at] = rec; else state.rows.push(rec);
      return json([rec]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      bump('traits DELETE');
      // A delete that names no ROW is the destructive one. Matched on the
      // parameter boundary, not by substring: the blanket delete's URL is
      // "?collection_id=eq.c1", and "collection_id=eq." CONTAINS "id=eq." - so
      // a substring test classified the destructive delete as a targeted one,
      // counted nothing, and this test could not see the very thing it exists
      // to catch. A mutation restoring the blanket delete survived because of it.
      const rowId = (s.match(/[?&]id=eq\.([^&]+)/) || [])[1];
      const byName = /[?&]name=eq\./.test(s);
      if (!rowId && !byName) {
        state.blanketDeletes++; state.rows.length = 0;
      } else if (rowId) {
        const id = decodeURIComponent(rowId);
        const at = state.rows.findIndex(r => r.id === id);
        if (at >= 0) state.rows.splice(at, 1);
      }
      return json([]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) {
      bump('traits GET');
      // \d, not d - and limit/offset are honoured, or cloudRows pages 500 times
      // and the request count becomes a fact about this stub.
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      return json(state.rows.slice(off, off + lim));
    }
    return real(u, io);
  };
  window.__srv = { state, real };
  return true;
}, opts);

/* Runs one push and reports what it cost. */
const push = (page) => page.evaluate(async () => {
  const s = window.__srv.state;
  for (const k in s.counts) delete s.counts[k];
  await cloudPush();
  return { requests: Object.values(s.counts).reduce((a, b) => a + b, 0),
           uploads: s.counts['storage/upload'] || 0,
           blanketDeletes: s.blanketDeletes,
           serverRows: s.rows.length,
           said: document.getElementById('toast').textContent };
});

const restore = (page) => page.evaluate(() => { window.fetch = window.__srv.real; });

test.describe('what Save to cloud costs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function');
  });

  test('a first push uploads everything', async ({ page }) => {
    await withServer(page, { count: N });
    const r = await push(page);
    await restore(page);
    expect(r.uploads, 'every trait goes up').toBe(N);
    expect(r.said).toContain('Saved ' + N);
    // The control for the test below: a first push really is expensive, so
    // "cheap" there means something.
    expect(r.requests, 'and it costs real requests').toBeGreaterThan(100);
  });

  test('pressing it again with nothing changed is nearly free', async ({ page }) => {
    // Measured before this: a second press re-uploaded all 60 images and cost
    // the same 308 requests as the first.
    await withServer(page, { count: N });
    await push(page);
    const again = await push(page);
    await restore(page);
    expect(again.uploads, 'nothing is re-uploaded').toBe(0);
    expect(again.requests, 'and it costs almost nothing').toBeLessThan(20);
    expect(again.said).toContain('already up to date');
  });

  test('but an edited trait is still sent', async ({ page }) => {
    // THE CONTROL. "Skip everything" would pass the test above and silently
    // stop saving work, which is far worse than being slow.
    await withServer(page, { count: N });
    await push(page);
    await page.evaluate(async () => {
      const one = (await dbAll()).find(i => i.name === 'x7');
      await dbPut(Object.assign({}, one, { synced: false, at: Date.now() }));
    });
    const r = await push(page);
    await restore(page);
    expect(r.uploads, 'exactly the one that changed').toBe(1);
    expect(r.said).toContain('Saved 1');
    expect(r.said).toContain('already up to date');
  });

  test('a push that dies half way does not destroy the server copy', async ({ page }) => {
    // Measured before this: an unfiltered delete ran BEFORE the first upload,
    // so 60 rows on the server became 10 when the connection dropped after 10
    // uploads. The local copy still had all 60, but the server's did not.
    await withServer(page, { count: N, dieAfter: 10, preload: N });
    const r = await push(page);
    await restore(page);
    expect(r.blanketDeletes, 'nothing wipes the collection').toBe(0);
    expect(r.serverRows, 'and the rows that were there are still there').toBeGreaterThanOrEqual(N);
    expect(r.said, 'and it says what failed').toContain('failed');
  });

  test('a trait deleted here is removed there', async ({ page }) => {
    // The blanket delete existed for this reason, and removing it must not
    // lose the behaviour - only the ordering.
    await withServer(page, { count: N });
    await push(page);
    await page.evaluate(async () => { await dbDel('t_x3'); });
    const r = await push(page);
    await restore(page);
    expect(r.said, 'the row goes').toContain('no longer here');
    expect(r.serverRows, 'leaving exactly what is here').toBe(N - 1);
  });

  test('inside a group it never removes anybody else\'s rows', async ({ page }) => {
    // A row that is not on this device may be somebody else's work. The old
    // comment said so about the blanket delete, and it is just as true of a
    // comparison-based removal.
    await withServer(page, { count: N, group: true, preload: 5 });
    const r = await push(page);
    await restore(page);
    expect(r.blanketDeletes).toBe(0);
    expect(r.said, 'nothing is reported removed').not.toContain('no longer here');
    expect(r.serverRows, 'the five that were not ours survive').toBeGreaterThanOrEqual(N + 5);
  });

  test('a skipped trait still keeps its image', async ({ page }) => {
    // THE SILENT ONE. cloudSweep deletes every file in the bucket that is not
    // in the list it is handed. Skipping an upload without adding its path to
    // that list would delete the image of every trait that was up to date -
    // no error, no toast, and only noticed the next time somebody pulled.
    await withServer(page, { count: N });
    await push(page);
    const swept = await page.evaluate(async () => {
      // Watch what the sweep is told to KEEP on a push that uploads nothing.
      let keep = null;
      const s = window.__srv.state;
      // Cleared, or this reads the FIRST push's sixty uploads and the assertion
      // below is about a push that already happened.
      for (const k in s.counts) delete s.counts[k];
      const real = window.fetch;
      window.fetch = async (u, o) => {
        if (String(u).indexOf('/storage/v1/object/list') >= 0) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(u).indexOf('/storage/v1/object/traits') >= 0 && (o && o.method) === 'DELETE') {
          keep = JSON.parse(o.body).prefixes;
        }
        return real(u, o);
      };
      const before = window.cloudSweep;
      // Wrap cloudSweep to capture the keep-list it is given.
      let given = null;
      window.cloudSweep = async (team, c, keepPaths) => { given = keepPaths; return before(team, c, keepPaths); };
      try { await cloudPush(); } finally { window.fetch = real; window.cloudSweep = before; }
      return { given: given ? given.length : null, uploads: s.counts['storage/upload'] || 0 };
    });
    await restore(page);
    expect(swept.uploads, 'nothing was uploaded this time').toBe(0);
    expect(swept.given, 'yet all sixty paths are still protected from the sweep').toBe(N);
  });

  test('the uploads actually overlap', async ({ page }) => {
    // The sequential loop is the other half of the cost, and a request count
    // cannot see it - six requests one after another look the same as six at
    // once. This watches how many are in flight together.
    await withServer(page, { count: N });
    const peak = await page.evaluate(async () => {
      const real = window.fetch;
      let inFlight = 0, peak = 0;
      window.fetch = async (u, o) => {
        const isUpload = String(u).indexOf('/storage/v1/object/traits/') >= 0;
        if (isUpload) { inFlight++; peak = Math.max(peak, inFlight); }
        try { return await real(u, o); } finally { if (isUpload) inFlight--; }
      };
      try { await cloudPush(); } finally { window.fetch = real; }
      return peak;
    });
    await restore(page);
    expect(peak, 'more than one upload at a time').toBeGreaterThan(1);
    expect(peak, 'and bounded, not all sixty at once').toBeLessThanOrEqual(6);
  });
});
