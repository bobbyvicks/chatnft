/* A comment describing the safe order, above code doing the unsafe one.

   cloudMoveOne runs when a trait is renamed, restatused, or moved between
   layers inside a group. A trait's identity on the server is its name, layer
   and status, so all three of those are a removal of the old copy and an
   arrival of the new one. The comment above it said:

     "Doing it in that order means a failure halfway leaves the old copy
      rather than nothing at all."

   And the code did:

     await cloudDropOne(oldRec);        <- removal
     return await cloudSyncOne(fresh);  <- arrival

   Removal first, so a failure halfway left NOTHING at all - the exact opposite
   of the promise directly above it. The reasoning was right and the order was
   backwards, which is the worst combination: anyone reading this to check
   whether a move is safe was told that it is.

   MEASURED before the fix, inside a group with the upload failing the way a
   dropped connection does:

     server rows before   ['row_hat']
     server rows after    []
     cloudMoveOne         returned null

   The group had lost the trait. And the status chip that calls this discarded
   the return value, so it said "hat -> approved" either way.

   These tests drive the REAL cloudMoveOne, cloudSyncOne and cloudDropOne
   against a stubbed fetch. No credentials, no real server. Stubbing the two
   helpers would have measured only that this file calls them in some order;
   what is at stake is which rows exist on the server afterwards, so the stub
   sits at the network and the rows are counted.

   THE CONTROLS ARE HALF THE FILE. An order that never removes the old copy
   would pass "the old copy survives a failure" and leave every rename
   duplicated forever; a chip that always says "here only" would pass "it does
   not claim success" and lie on every successful move and on every move made
   outside a group at all. Both are pinned.
*/
import { test, expect } from '@playwright/test';

/* A fake server. `uploadFails` rejects every PNG upload the way a dropped
   connection does - all three attempts, since cloudSyncOne retries. */
const withServer = (page, opts) => page.evaluate(async (o) => {
  const { uploadFails, group } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = group ? 'ws1' : null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));

  /* One trait, already on the server as row_hat, the way a pulled or pushed
     copy is. rowId is what makes the delete of the old copy targeted. */
  await dbPut({ id: 't_hat_skins_wip', kind: 'trait', name: 'hat', layer: 'skins',
    status: 'wip', blob: new Blob([new Uint8Array(64)]), w: 160, h: 160,
    rarity: 1, at: 1, shelfOrder: 1, rowId: 'row_hat', synced: true });

  const state = { rows: [{ id: 'row_hat', path: 'ws1/c1/skins/wip/hat.png' }], log: [], uploads: 0 };
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/traits') >= 0 && m === 'DELETE') {
      state.log.push('image-delete'); return json([]);
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      state.uploads++; state.log.push('upload');
      if (uploadFails) return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      const b = JSON.parse(io.body)[0];
      const rec = { id: 'row_new', path: b.path, name: b.name, status: b.status, layer: b.layer };
      state.rows.push(rec);
      state.log.push('row-create');
      return json([rec]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      /* Matched on the parameter boundary. "collection_id=eq." contains
         "id=eq.", so a substring test reads a blanket delete as a targeted
         one - a mistake this suite has already made once, and it hid the
         exact behaviour the file was written to catch. */
      const rowId = (s.match(/[?&]id=eq\.([^&]+)/) || [])[1];
      const gone = [];
      if (rowId) {
        const id = decodeURIComponent(rowId);
        state.log.push('row-delete:' + id);
        const at = state.rows.findIndex(r => r.id === id);
        if (at >= 0) gone.push(state.rows.splice(at, 1)[0]);
      } else {
        /* cloudSyncOne clears rowId on the new copy, so its own tidy-up delete
           is by name+layer+status - the NEW identity, which nothing holds. */
        const name = decodeURIComponent((s.match(/[?&]name=eq\.([^&]+)/) || [])[1] || '');
        const status = decodeURIComponent((s.match(/[?&]status=eq\.([^&]+)/) || [])[1] || '');
        const layer = decodeURIComponent((s.match(/[?&]layer=eq\.([^&]+)/) || [])[1] || '');
        state.log.push('row-delete-by-name:' + name + '/' + layer + '/' + status);
        for (let i = state.rows.length - 1; i >= 0; i--) {
          const r = state.rows[i];
          if (r.name === name && r.status === status && r.layer === layer) gone.push(state.rows.splice(i, 1)[0]);
        }
      }
      return json(gone);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return json(state.rows);
    return real(u, io);
  };
  window.__srv = { state, real };
  await renderShelf();
  await new Promise(r => setTimeout(r, 500));
  /* The shelf only draws traits whose layer is in LAYERS, so a trait filed
     under a layer this browser does not have is not on it at all. "skins" is a
     default one. Asserted rather than assumed: a first draft used "hats",
     every chip test found no card, and the helper reported that as a result
     instead of as a broken instrument. */
  if (!document.querySelector('#projbody button.cyc'))
    throw new Error('the seeded trait is not on the shelf, so nothing below measures anything');
  return true;
}, opts);

const restore = (page) => page.evaluate(() => { window.fetch = window.__srv.real; });

const snapshot = (page) => page.evaluate(() => ({
  rows: window.__srv.state.rows.map(r => r.id).sort(),
  log: window.__srv.state.log.slice(),
}));

/* Drives the real cloudMoveOne: wip -> approved, which is a new identity. */
const move = (page) => page.evaluate(async () => {
  const t = (await dbAll()).find(r => r.id === 't_hat_skins_wip');
  const moved = Object.assign({}, t, { id: 't_hat_skins_approved', status: 'approved' });
  const ret = await cloudMoveOne(t, moved);
  return { ret: ret === null ? null : !!ret };
});

/* Presses the real status chip and reports what it said. */
const chip = (page) => page.evaluate(async () => {
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  const card = [...document.querySelectorAll('#projbody .item')]
    .find(el => /hat/i.test(el.textContent || ''));
  if (!card) { window.toast = realToast; throw new Error('no card to press'); }
  card.querySelector('button.cyc').click();
  await new Promise(r => setTimeout(r, 2500));   // three upload attempts, backed off
  window.toast = realToast;
  return { said: said.join(' | ') };
});

test.describe('moving a trait inside a group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudMoveOne === 'function');
  });

  test('the new copy is created before the old one is removed', async ({ page }) => {
    await withServer(page, { group: true });
    const r = await move(page);
    const s = await snapshot(page);
    await restore(page);
    expect(r.ret, 'the move reports that it landed').toBe(true);
    const created = s.log.indexOf('row-create');
    const removed = s.log.indexOf('row-delete:row_hat');
    expect(created, 'the new row is created').toBeGreaterThanOrEqual(0);
    expect(removed, 'and the old one is removed').toBeGreaterThanOrEqual(0);
    expect(created, 'in that order - this is the whole defect').toBeLessThan(removed);
  });

  test('and the group ends up holding exactly the new copy', async ({ page }) => {
    // The counterweight to the ordering test: an order that never gets round
    // to the removal would satisfy "created before removed" trivially and
    // leave every rename duplicated on the server forever.
    await withServer(page, { group: true });
    await move(page);
    const s = await snapshot(page);
    await restore(page);
    expect(s.rows, 'the old row is gone and the new one is there').toEqual(['row_new']);
  });

  test('a failed upload leaves the old copy rather than nothing at all', async ({ page }) => {
    await withServer(page, { group: true, uploadFails: true });
    const r = await move(page);
    const s = await snapshot(page);
    await restore(page);
    expect(r.ret, 'and says it did not land').toBeFalsy();
    expect(s.rows, 'the group still has the trait under its old identity').toEqual(['row_hat']);
    expect(s.log.join(' '), 'nothing deleted the old row').not.toContain('row-delete:row_hat');
    expect(s.log.join(' '), 'and nothing deleted its picture').not.toContain('image-delete');
  });

  test('the status chip does not claim a move the group never got', async ({ page }) => {
    await withServer(page, { group: true, uploadFails: true });
    const r = await chip(page);
    await restore(page);
    expect(r.said, 'it says where the change actually is').toContain('here only');
    expect(r.said, 'and names what the group still has').toContain('still has the old one');
  });

  test('but it says the plain thing when the move worked', async ({ page }) => {
    // THE CONTROL. A chip that always warned would pass the test above and be
    // wrong on every successful move, which is most of them.
    await withServer(page, { group: true });
    const r = await chip(page);
    await restore(page);
    expect(r.said, 'the ordinary message').toContain('hat -> approved');
    expect(r.said, 'with no warning attached').not.toContain('here only');
  });

  test('and on a personal page, where there is no group to reach', async ({ page }) => {
    /* THE OTHER CONTROL, and the one that would break the most. cloudMoveOne
       returns null when activeWs is null - nothing left the browser and
       nothing was meant to. A bare `!shared` check would read that as a
       failure and warn about a group the person is not in, on every single
       status change made outside one. */
    await withServer(page, { group: false });
    const r = await chip(page);
    await restore(page);
    expect(r.said, 'the ordinary message').toContain('hat -> approved');
    expect(r.said, 'and no mention of a group').not.toContain('here only');
  });
});
