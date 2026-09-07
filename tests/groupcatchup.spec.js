/* A refresh never asked the group for anything.

   REPORTED: a teammate reordered traits and moved one to another layer, and
   after a refresh none of it was there.

   The work was on the server, and the code that applies it worked. cloudPull
   matches a row by its SERVER ID - which survives a rename and a layer move -
   and hands it to mergeRemoteShelfRecord, which takes the refreshed layer and
   shelf order without touching local artwork. test/trait-shelf-core.test.mjs
   has pinned that for weeks.

   NOTHING CALLED IT. On a signed-in page load cloudRender ran bootLocal(),
   which draws whatever this browser already had, and wsRender(), which fills
   the project dropdown. The only two things that fetched were wsSwitch -
   changing the dropdown, or joining - and the Load from cloud button. No
   interval, no focus handler, no visibilitychange handler.

   So three separate things were true at once: the group's work arrived, the
   code to show it was correct and tested, and the gesture a person actually
   makes ran neither. That is the shape worth remembering - every piece
   passing its own test while the path between them did not exist.
*/
import { test, expect } from '@playwright/test';

/* One local trait, one server row for the same trait, and a real
   groupCatchUp() between them. The fetch stub follows tests/cloudpull.spec.js:
   no credentials and no server, every request intercepted, so this exercises
   the client and nothing else. */
const catchUpWith = (page, o) => page.evaluate(async (c) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  activeWs = 'team1';
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));

  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const g = cv.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  /* A byte nobody else has, so "was the artwork replaced" is answerable
     rather than assumed - two 8x8 green squares would compare equal. */
  const mine = await blob.arrayBuffer();
  await dbPut(Object.assign({ kind: 'trait', blob: blob, w: 8, h: 8, at: 1 }, c.local));

  let storageHits = 0;
  const real = window.fetch;
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.fetch = (u, opt) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['hats', 'extras'] }]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0)
      return Promise.resolve(json([], { 'Content-Range': '0-0/' + c.rows.length }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      /* HONOURING offset AND limit IS NOT OPTIONAL. A stub that returns the
         same row for every request looks harmless and is not: cloudPull pages
         until the server runs out, so it read the one row five hundred times
         and the collision-rename gave the shelf cap-2 through cap-500. The
         first draft of this test did that and reported it as the app
         duplicating a teammate's trait. */
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = c.rows.slice(off, off + lim);
      return Promise.resolve(json(batch, { 'Content-Range':
        off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + c.rows.length }));
    }
    if (s.indexOf('/storage/') >= 0) {
      storageHits++;
      return Promise.resolve(new Response(new Blob([new Uint8Array([9, 9, 9])])));
    }
    return real(u, opt);
  };
  try { await groupCatchUp(); } finally { window.fetch = real; }

  const now = (await dbAll()).filter(i => i.kind === 'trait');
  const one = now[0] || null;
  let same = null;
  if (one && one.blob) {
    const b = new Uint8Array(await one.blob.arrayBuffer());
    const a = new Uint8Array(mine);
    same = b.length === a.length && b.every((v, i) => v === a[i]);
  }
  return { count: now.length, layer: one && one.layer, order: one && one.shelfOrder,
    name: one && one.name, artUntouched: same, storageHits: storageHits };
}, o);

test.describe('what a page load asks the group for', () => {
  test('the catch-up runs on load, not only when the dropdown changes',
    async ({ page }) => {
      /* THE DEFECT, stated as the smallest thing that would have caught it:
         a page load has to reach the function that fetches. Asserted on the
         wiring rather than on a whole synced shelf, because the machinery
         underneath already has its own tests and this is the one link that
         was missing. */
      await page.goto('/index.html');
      const r = await page.evaluate(() => ({
        catchUp: typeof groupCatchUp === 'function',
        /* cloudRender is what a page load runs, and it must be the thing that
           calls it - not wsSwitch, which only a dropdown reaches. */
        calledFromLoad: /groupCaughtUp=true; groupCatchUp\(\)/.test(String(cloudRender)),
        calledFromSwitch: /groupCatchUp\(\)/.test(String(wsSwitch)),
      }));
      expect(r.catchUp, 'the catch-up exists as one function').toBe(true);
      expect(r.calledFromLoad, 'and a page load reaches it').toBe(true);
      expect(r.calledFromSwitch, 'and so does a workspace switch').toBe(true);
    });

  test('a teammate moving a trait to another layer arrives, with their order',
    async ({ page }) => {
      /* THE REPORTED SYMPTOM, end to end through the real cloudPull: a trait
         this device has on hats, which the group has since moved to extras and
         put third in the draw order.

         Matched by SERVER ROW ID, which is what survives a layer move - the
         local id is built from name, layer and status, so it no longer
         describes the row at all once somebody moves the trait. */
      await page.goto('/index.html');
      const r = await catchUpWith(page, {
        local: { id: 't_cap_hats_approved', name: 'cap', layer: 'hats',
          status: 'approved', synced: true, rowId: 'row1', shelfOrder: 10,
          path: 'p/cap.png' },
        rows: [{ id: 'row1', name: 'cap', kind: 'trait', layer: 'extras',
          status: 'approved', path: 'p/cap.png', w: 8, h: 8, rarity: 1,
          shelf_order: 3, updated_at: '2026-09-07T21:44:08Z' }],
      });
      expect(r.count, 'still one trait, not a second copy beside it').toBe(1);
      expect(r.name).toBe('cap');
      expect(r.layer, 'the layer they moved it to').toBe('extras');
      expect(r.order, 'and the position they gave it').toBe(3);
      /* AND THE ARTWORK IS THE LOCAL ONE, byte for byte. Only the shared
         position changed, so re-downloading every picture on every page load
         would be the cost of this feature paid over and over for nothing. */
      expect(r.artUntouched, 'the picture was not replaced').toBe(true);
      expect(r.storageHits, 'and not re-downloaded either').toBe(0);
    });

  test('and a trait nobody moved is left exactly alone', async ({ page }) => {
    // A CONTROL. If the merge rewrote every record it saw, the test above
    // would pass for the wrong reason and every load would churn the store.
    await page.goto('/index.html');
    const r = await catchUpWith(page, {
      local: { id: 't_cap_hats_approved', name: 'cap', layer: 'hats',
        status: 'approved', synced: true, rowId: 'row1', shelfOrder: 10,
        path: 'p/cap.png' },
      rows: [{ id: 'row1', name: 'cap', kind: 'trait', layer: 'hats',
        status: 'approved', path: 'p/cap.png', w: 8, h: 8, rarity: 1,
        shelf_order: 10, updated_at: '2026-09-07T21:44:08Z' }],
    });
    expect(r.count).toBe(1);
    expect(r.layer).toBe('hats');
    expect(r.order).toBe(10);
    expect(r.artUntouched).toBe(true);
    expect(r.storageHits).toBe(0);
  });

  test('and it asks the server once per page, not once per auth event',
    async ({ page }) => {
      /* cloudRender runs again on every auth change, and pulling the whole
         collection each time would re-download a teammate's edits for
         nothing. */
      await page.goto('/index.html');
      const n = await page.evaluate(async () => {
        let calls = 0;
        const real = window.cloudPull;
        window.cloudPull = async () => { calls++; return new Set(); };
        try {
          groupCaughtUp = false;
          activeWs = 'team1';
          /* Three auth events, which is an ordinary sign-in handshake. */
          for (let i = 0; i < 3; i++) {
            if (!groupCaughtUp) { groupCaughtUp = true; await groupCatchUp(); }
          }
        } finally { window.cloudPull = real; }
        return calls;
      });
      expect(n, 'one fetch, however many times the page re-renders').toBe(1);
    });

  test('an empty answer from the server deletes nothing', async ({ page }) => {
    /* THE GUARD THIS CHANGE NEEDED. The deletion pass is right - anything this
       device holds that the group no longer has was removed by somebody, and
       without it one person's delete is undone by the next person to open the
       project. But cloudPull returns an EMPTY set when the collection reads as
       zero rows, and moving the catch-up onto every page load turned a rare
       switch-time risk into a standing offer to erase everything on one odd
       read. A server reporting nothing at all, beside records this device
       believes it SENT, is a bad read far more often than an emptied
       collection. */
    await page.goto('/index.html');
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      c.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      for (const n of ['a', 'b', 'c'])
        await dbPut({ id: 't_' + n + '_eyes_approved', kind: 'trait', name: n,
          layer: 'eyes', status: 'approved', blob, w: 8, h: 8, at: 1,
          synced: true, rowId: 'row_' + n });
      const before = (await dbAll()).filter(i => i.kind === 'trait').length;
      const real = window.cloudPull;
      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(m); };
      window.cloudPull = async () => new Set();
      try { await groupCatchUp(); }
      finally { window.cloudPull = real; window.toast = realToast; }
      const after = (await dbAll()).filter(i => i.kind === 'trait').length;
      return { before, after, said: said.join(' | ') };
    });
    expect(r.before).toBe(3);
    expect(r.after, 'nothing was thrown away on an empty answer').toBe(3);
    expect(r.said, 'and it says why, rather than doing it silently')
      .toContain('came back empty');
  });

  test('but a server that really lost one still removes it', async ({ page }) => {
    /* THE CONTROL, and the reason the guard above is scoped to EMPTY rather
       than to "fewer than I have". A delete has to propagate or the group's
       bin does not work; the guard only declines the one answer that cannot
       be told apart from a failed read. */
    await page.goto('/index.html');
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await dbClear();
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      c.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      for (const n of ['a', 'b', 'c'])
        await dbPut({ id: 't_' + n + '_eyes_approved', kind: 'trait', name: n,
          layer: 'eyes', status: 'approved', blob, w: 8, h: 8, at: 1,
          synced: true, rowId: 'row_' + n });
      const keep = (await dbAll()).filter(i => i.kind === 'trait' && i.name !== 'b')
        .map(i => shelfCore.recordKey(i));
      const real = window.cloudPull;
      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(m); };
      window.cloudPull = async () => new Set(keep);
      try { await groupCatchUp(); }
      finally { window.cloudPull = real; window.toast = realToast; }
      const left = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort();
      return { left, said: said.join(' | ') };
    });
    expect(r.left, 'the one the group no longer has is gone').toEqual(['a', 'c']);
    expect(r.said).toContain('1 removed by someone else');
  });

  test('and work that never reached the server is never removed',
    async ({ page }) => {
      /* The other half of the deletion rule, pinned because it is the one that
         costs somebody their work if it goes wrong. A record that is not
         synced is absent from the server BECAUSE it never got there, and
         deleting it would be the opposite of what is wanted. */
      await page.goto('/index.html');
      const left = await page.evaluate(async () => {
        try { authed = true; } catch (_) {}
        gateShow(false);
        await dbClear();
        const c = document.createElement('canvas'); c.width = 8; c.height = 8;
        c.getContext('2d').fillRect(0, 0, 8, 8);
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        await dbPut({ id: 't_sent_eyes_approved', kind: 'trait', name: 'sent',
          layer: 'eyes', status: 'approved', blob, w: 8, h: 8, at: 1,
          synced: true, rowId: 'row_sent' });
        await dbPut({ id: 't_mine_eyes_approved', kind: 'trait', name: 'mine',
          layer: 'eyes', status: 'approved', blob, w: 8, h: 8, at: 1 });
        const real = window.cloudPull;
        /* The server has something, so the guard does not fire - and it has
           neither of these, so the rule alone decides. */
        window.cloudPull = async () => new Set(['eyes/other']);
        try { await groupCatchUp(); } finally { window.cloudPull = real; }
        return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort();
      });
      expect(left, 'the unsent one stays, the sent one goes').toEqual(['mine']);
    });
});
