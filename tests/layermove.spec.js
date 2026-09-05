/* "3 traits moved" answered the wrong question.

   Renaming or removing a layer moves every trait on it, locally and - inside a
   group - on the server too, through cloudMoveOne. retagLayer threw that
   result away:

     await cloudMoveOne(t,rec);
     moved++;

   the same shape as the status chip, at the one call site the sweep for that
   shape did not reach.

   MEASURED, in a group with three traits on skins and the connection down:

     said           "Renamed to helmets, 3 traits moved"
     server rows    row_tan, row_pale, row_olive  (unchanged, still on skins)
     uploads        9 attempts, all failed
     locally        the layer is renamed and all three traits are on helmets

   Nothing was lost - the move now uploads before it removes - but this browser
   and the group disagreed about where three traits live and the only thing
   said was a success message. "3 moved" answers "how many did this browser
   change"; the question somebody in a group is asking is "does everyone else
   see it now", and that number existed inside the loop and was discarded.

   THE CONTROLS ARE WHAT KEEP THE WARNING HONEST. A count that always warned
   would fire on every successful rename and on every rename made outside a
   group at all - cloudMoveOne returns null when there is no group, because
   nothing was meant to leave the browser. Both are pinned, and so is the
   sibling caller, because a fix at one site and not the other is how this
   defect got here.
*/
import { test, expect } from '@playwright/test';

/* Three traits on skins, all already on the server. `uploadsWork` decides
   whether the group hears about the move. */
const withServer = (page, opts) => page.evaluate(async (o) => {
  const { uploadsWork, group } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = group ? 'ws1' : null;
  LAYERS = ['backgrounds', 'skins', 'clothing', 'unsorted'];
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  for (const n of ['tan', 'pale', 'olive']) {
    await dbPut({ id: 't_' + n + '_skins_approved', kind: 'trait', name: n, layer: 'skins',
      status: 'approved', blob: new Blob([new Uint8Array(16)]), w: 160, h: 160,
      rarity: 1, at: 1, rowId: 'row_' + n, synced: true });
  }
  /* ASSERTED, not assumed. The first run of this measurement was taken
     immediately after a reload with records from an earlier probe still in the
     store, and reported three traits renamed to avoid a clash that did not
     exist. A seed nobody checks is a result nobody can read. */
  const seeded = (await dbAll()).filter(r => r.kind === 'trait').map(r => r.id).sort();
  if (seeded.length !== 3 || seeded.some(id => id.indexOf('_skins_') < 0))
    throw new Error('the store is not what this test seeded: ' + seeded.join(', '));

  const state = { rows: ['row_tan', 'row_pale', 'row_olive'], uploads: 0 };
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m !== 'DELETE') {
      state.uploads++;
      if (!uploadsWork) return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row_new' }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      const id = (s.match(/[?&]id=eq\.([^&]+)/) || [])[1];
      if (!id) return json([]);
      const at = state.rows.indexOf(decodeURIComponent(id));
      if (at < 0) return json([]);
      state.rows.splice(at, 1);
      return json([{ id: decodeURIComponent(id), path: 'p.png' }]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits') >= 0) return json([]);
    return real(u, io);
  };
  window.__srv = { state, real };
  return true;
}, opts);

const restore = (page) => page.evaluate(() => { window.fetch = window.__srv.real; });

/* Runs one of the two real callers and reports what it said. */
const act = (page, what) => page.evaluate(async (w) => {
  const said = [];
  const realToast = window.toast, realConfirm = window.confirm;
  window.toast = (m) => { said.push(m); };
  window.confirm = () => true;
  if (w === 'rename') await renameLayer('skins', 'helmets');
  else await removeLayer('skins');
  window.toast = realToast; window.confirm = realConfirm;
  return {
    said: said.join(' | '),
    serverRows: window.__srv.state.rows.slice(),
    uploads: window.__srv.state.uploads,
    localLayers: (await dbAll()).filter(r => r.kind === 'trait').map(r => r.layer).sort(),
  };
}, what);

test.describe('renaming and removing a layer inside a group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof retagLayer === 'function');
  });

  test('a rename the group never got says so and names the fix', async ({ page }) => {
    await withServer(page, { group: true, uploadsWork: false });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.uploads, 'it really did try').toBeGreaterThan(0);
    expect(r.serverRows, 'and the group still has them where they were')
      .toEqual(['row_tan', 'row_pale', 'row_olive']);
    expect(r.said, 'the count that matters').toContain('3 not shared yet');
    expect(r.said, 'and what to press').toContain('Save to cloud');
  });

  test('the traits still move here, which is what the old count was about', async ({ page }) => {
    // The positive half. Without it, "3 not shared" would be satisfied by a
    // rename that did nothing at all.
    await withServer(page, { group: true, uploadsWork: false });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.localLayers, 'all three are on the new layer in this browser')
      .toEqual(['helmets', 'helmets', 'helmets']);
    expect(r.said, 'and it still says so').toContain('3 traits moved');
  });

  test('a rename the group did get says nothing about sharing', async ({ page }) => {
    // THE CONTROL. A warning that always fires is worse than none, because it
    // stops being read.
    await withServer(page, { group: true, uploadsWork: true });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.serverRows, 'the old rows are gone from the group').toEqual([]);
    expect(r.said, 'the ordinary message').toContain('Renamed to helmets');
    expect(r.said, 'with nothing hanging off it').not.toContain('not shared yet');
  });

  test('and neither does a rename on a personal page', async ({ page }) => {
    /* THE OTHER CONTROL. cloudMoveOne returns null with no group, because
       nothing left the browser and nothing was meant to. A bare `!shared`
       count reads that as three failures and warns about a group the person
       is not in - on every rename they ever make. */
    await withServer(page, { group: false, uploadsWork: false });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.uploads, 'nothing was even attempted').toBe(0);
    expect(r.said, 'the ordinary message').toContain('Renamed to helmets');
    expect(r.said, 'and no mention of a group').not.toContain('not shared yet');
  });

  test('removing a layer says it too, because it is the same event', async ({ page }) => {
    /* THE SIBLING. This whole defect exists because the status chip was fixed
       and its neighbour was not, so the neighbour is pinned here. */
    await withServer(page, { group: true, uploadsWork: false });
    const r = await act(page, 'remove');
    await restore(page);
    expect(r.localLayers, 'the traits went to unsorted here')
      .toEqual(['unsorted', 'unsorted', 'unsorted']);
    expect(r.said, 'and it says the group has not got them').toContain('3 not shared yet');
  });

  test('and stays quiet when the removal reached everyone', async ({ page }) => {
    await withServer(page, { group: true, uploadsWork: true });
    const r = await act(page, 'remove');
    await restore(page);
    expect(r.said, 'the ordinary message').toContain('3 moved to unsorted');
    expect(r.said, 'with nothing hanging off it').not.toContain('not shared yet');
  });
});
