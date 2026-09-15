/* A PULL DOES NOT DECIDE YOUR WORK WAS SENT.

   mergeRemoteShelfRecord refreshed a local record from the server row it came
   from and returned `synced: true` unconditionally. A save that could not reach
   the group leaves exactly the record that branch matches - saveTrait keeps the
   rowId, because that is how a delete finds the row, and deliberately does not
   set synced when the upload comes back null. So the next page load, which runs
   a quiet pull, told the record it had reached the server.

   Then Save to cloud skipped it: its test is

     if(it.synced && it.rowId && it.path===p){ unchangedSkipped++; ... }

   and for a pixel-only edit the path it computes is the path the merge just
   copied in. Pressing the button the failed save told you to press did nothing,
   and every later open re-asserted the same flag, so it never drifted back.

   THE TEST THAT MATTERS IS THE SECOND ONE. A flag being right in the database
   is not the point; the point is that the retry works. So it runs the real
   cloudPush afterwards and counts what actually went up the wire.

   Both halves drive the real functions against a stubbed fetch, the way
   cloudpull.spec.js does: no credentials and no server.
*/
import { test, expect } from '@playwright/test';

/* A group project holding one trait that came from the server row "row-1", and
   a stub that keeps serving that same row unchanged. `synced` is what each test
   sets: absent is a save that failed, true is one that landed. */
const arm = (page, synced) => page.evaluate(async (wasSynced) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const rec = { id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins',
    status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1000,
    /* THE PATH cloudPath ACTUALLY COMPUTES:
       team + / + collection + /trait- + name + - + layer + - + status + .png.
       A made-up shape here made the control fail for the wrong reason - the
       skip test is an AND on the path, so a path that never matches means
       nothing is ever skipped and the control cannot tell the fix from the
       defect. */
    rowId: 'row-1', path: 'team7/c1/trait-cap-skins-approved.png' };
  /* THE WHOLE DIFFERENCE. A save that reached the group sets this; one that
     could not, does not - and keeps the rowId either way. */
  if (wasSynced) rec.synced = true;
  await dbPut(rec);
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));

  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (o, extra) => new Response(JSON.stringify(o),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__uploads = [];
  window.__realFetch = window.fetch;
  window.fetch = (u, o) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team7'));
    if (s.indexOf('/rest/v1/teams') >= 0)
      return Promise.resolve(json([{ id: 'team7', name: 'Seven', personal: false }]));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
    /* The storage PUT is the upload. Counting it is the only way to tell a
       real send from a skip that says it was already up to date. */
    if (s.indexOf('/storage/v1/object/') >= 0) {
      window.__uploads.push(s.split('/object/')[1]);
      return Promise.resolve(json({ Key: 'ok' }));
    }
    const row = { id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins',
      status: 'approved', path: 'team7/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 1,
      updated_at: '2026-01-01T00:00:00Z' };
    if (s.indexOf('/rest/v1/traits?select=id') >= 0)
      return Promise.resolve(json([], { 'Content-Range': '0-0/1' }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0)
      return Promise.resolve(json([row], { 'Content-Range': '0-0/1' }));
    if (s.indexOf('/rest/v1/traits') >= 0) return Promise.resolve(json([{ id: 'row-2' }]));
    return Promise.resolve(json([]));
  };
}, synced);

const pull = (page) => page.evaluate(async () => {
  const realToast = window.toast; window.toast = () => {};
  try { await cloudPull({ quiet: true, keepMine: true }); }
  finally { window.toast = realToast; }
  await new Promise(r => setTimeout(r, 300));
  const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === 'cap');
  return { synced: !!(rec && rec.synced), rowId: rec && rec.rowId };
});

const push = (page) => page.evaluate(async () => {
  window.__uploads = [];
  const realToast = window.toast; const said = [];
  window.toast = (m) => said.push(String(m));
  try { await cloudPush(); } finally { window.toast = realToast; }
  await new Promise(r => setTimeout(r, 400));
  return { uploads: window.__uploads.length, said: said.join(' | '),
    note: $('cloudnote').textContent };
});

test.describe('a pull does not decide your work was sent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function');
  });

  test('A SAVE THAT NEVER REACHED THE GROUP IS STILL UNSENT AFTER A PULL',
    async ({ page }) => {
      await arm(page, false);
      const after = await pull(page);
      /* The precondition: the pull really did go through the repair branch,
         which needs the rowId to still be there. */
      expect(after.rowId, 'it is still the same server row').toBe('row-1');
      expect(after.synced, 'and it has not been told it was sent').toBe(false);
    });

  test('SO SAVE TO CLOUD ACTUALLY UPLOADS IT', async ({ page }) => {
    /* The one that matters. A flag being right in the database is not the
       point - the point is that pressing the button the failed save told you
       to press does something. */
    await arm(page, false);
    await pull(page);
    const out = await push(page);
    expect(out.uploads, 'the picture went up the wire').toBe(1);
    /* ON THE TOAST, NOT THE NOTE. cloudStatus runs after the push and
       rewrites #cloudnote with its own sentence, so asserting there is
       asserting on whatever spoke last. */
    expect(out.said, 'and it was not counted as already up to date')
      .not.toContain('already up to date');
  });

  test('and a trait that really did reach the group is still skipped - the control',
    async ({ page }) => {
      /* The other direction, and the reason this is a carried flag rather than
         a removed one. If the merge simply stopped saying synced, every trait
         in the project would re-upload on every push - 324 uploads to change
         nothing, which is worse than the defect. */
      await arm(page, true);
      const after = await pull(page);
      expect(after.synced, 'a synced record stays synced').toBe(true);
      const out = await push(page);
      expect(out.uploads, 'nothing was re-uploaded').toBe(0);
      /* And it SAYS it skipped, so a push that silently did nothing at all
         cannot pass this by uploading nothing. */
      expect(out.said).toContain('already up to date');
    });
});
