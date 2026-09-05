/* The group's layer list only reached the server if somebody pressed Save to
   cloud.

   saveLayers wrote the list to this browser's store. The one PATCH that told
   the server lived in cloudPush. So renaming a layer, reordering one, adding
   one or removing one changed the list here and nowhere else.

   MEASURED, inside a group, renaming skins to helmets:

     requests to /rest/v1/collections   GET, GET
     PATCH                              none
     locally                            ['helmets','unsorted']
     said                               "Renamed to helmets, 1 trait moved"

   retagLayer moves the rows immediately, so the server was left holding traits
   on a layer its own collection did not list - the state that made those
   traits invisible to everybody else. The shelf now adopts a layer from the
   records, so they are no longer lost; but the DECLARATION is what carries the
   draw ORDER, and a new member still inherited the old one. Order is what
   composites a character, so that is not cosmetic.

   The list goes up when it changes, from saveLayers - the one function every
   route that changes a layer already goes through, including the two with no
   message of their own.

   TWO THINGS HERE ARE EASY TO GET WRONG IN OPPOSITE DIRECTIONS, and both are
   pinned: sending when nothing changed (turning a set off calls saveLayers and
   leaves the list identical), and remembering a send that failed, which would
   mean the next change never retried it.
*/
import { test, expect } from '@playwright/test';

const setup = (page, opts) => page.evaluate(async (o) => {
  const { group, patchWorks, uploadWorks } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; sharedLayerSig = null;
  activeWs = group ? 'ws1' : null;
  /* The database is per project, so it has to be reopened after activeWs
     moves or the clear below empties the wrong one. */
  try { if (dbp) { (await dbp).close(); } } catch (_) {}
  dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['skins', 'capes', 'unsorted'];
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  for (const [name, layer] of [['tan', 'skins'], ['cloak', 'capes']]) {
    await dbPut({ id: 't_' + name + '_' + layer + '_approved', kind: 'trait', name: name,
      layer: layer, status: 'approved', blob: new Blob([new Uint8Array(16)]),
      w: 160, h: 160, rarity: 1, at: 1, rowId: 'row_' + name, synced: true });
  }

  const state = { patches: [], uploads: 0 };
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/rest/v1/collections') >= 0) {
      if (m === 'PATCH') {
        state.patches.push(JSON.parse(io.body));
        return patchWorks ? json({}) : new Response('', { status: 500 });
      }
      return json([{ id: 'c1', layers: ['skins', 'capes', 'unsorted'], updated_at: 'x' }]);
    }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      state.uploads++;
      if (uploadWorks === false) return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row_new' }]);
    return json([]);
  };
  window.__srv = { state, real };
  return true;
}, opts);

const restore = (page) => page.evaluate(() => { window.fetch = window.__srv.real; });

/* Runs one layer action and reports what was said and what went up. */
const act = (page, what) => page.evaluate(async (w) => {
  const said = [];
  const realToast = window.toast, realConfirm = window.confirm;
  window.toast = (m) => { said.push(m); };
  window.confirm = () => true;
  if (w === 'rename') await renameLayer('skins', 'helmets');
  else if (w === 'remove') await removeLayer('capes');
  else if (w === 'move') await moveLayer('capes', -1);
  else if (w === 'add') { document.getElementById('newlayer').value = 'visors'; await addLayer(); }
  else if (w === 'toggle') await saveLayers();
  window.toast = realToast; window.confirm = realConfirm;
  return {
    said: said.join(' | '),
    patches: window.__srv.state.patches.map(p => (p.layers || []).join(',')),
    sentHidden: window.__srv.state.patches.some(p => 'hidden' in p),
    layers: LAYERS.slice(),
  };
}, what);

test.describe('telling the group what the layer list is', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof saveLayers === 'function');
  });

  test('a rename inside a group sends the new list', async ({ page }) => {
    await setup(page, { group: true, patchWorks: true });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.patches, 'exactly one, carrying the new order')
      .toEqual(['helmets,capes,unsorted']);
    expect(r.said, 'and nothing is hedged').not.toContain('has not got the layer list');
  });

  test('and says so when the server will not take it', async ({ page }) => {
    await setup(page, { group: true, patchWorks: false });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.patches.length, 'it tried').toBe(1);
    expect(r.said, 'and said the group has not got it').toContain('has not got the layer list');
    expect(r.said, 'naming the one thing that fixes it').toContain('Save to cloud');
  });

  test('a personal page sends nothing and says nothing', async ({ page }) => {
    /* A CONTROL. There is no group to tell, and a page warning about one
       would be wrong on every rename somebody ever makes alone. */
    await setup(page, { group: false, patchWorks: true });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.patches, 'no collection was touched').toEqual([]);
    expect(r.said, 'and no group was mentioned').not.toContain('has not got the layer list');
  });

  test('an unchanged list costs no request', async ({ page }) => {
    /* A CONTROL. Turning a set off calls saveLayers and leaves the list
       identical; without this every toggle would spend a request saying
       nothing. */
    await setup(page, { group: true, patchWorks: true });
    await act(page, 'rename');
    const r = await act(page, 'toggle');
    await restore(page);
    expect(r.patches.length, 'still just the one from the rename').toBe(1);
    expect(r.said, 'and nothing is claimed to have failed').not.toContain('has not got the layer list');
  });

  test('a send that failed is retried rather than assumed done', async ({ page }) => {
    /* The other side of remembering. If a refused send were recorded as
       delivered, the list would stay stale until something else happened to
       change it - the defect this whole file is about, one layer down.

       THE SECOND ACTION HAS TO LEAVE THE LIST THE SAME. A first draft renamed
       and then ADDED a layer, so the list differed from the failed one and
       would have been sent again even by code that remembered the failure -
       the test passed against the mutant and measured nothing. Mutation
       testing is what found that; the suite could not. */
    await setup(page, { group: true, patchWorks: false });
    await act(page, 'rename');
    const r = await act(page, 'toggle');
    await restore(page);
    expect(r.patches.length, 'it tried the same list again').toBe(2);
    expect(r.patches[1], 'the one that had not landed').toBe('helmets,capes,unsorted');
  });

  test('the set you have turned off is not sent to anybody', async ({ page }) => {
    // Which layers you are drawing today is how one person is working, not a
    // property of the project.
    await setup(page, { group: true, patchWorks: true });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.sentHidden, 'no hidden field went up').toBe(false);
  });

  test('it does not say press Save to cloud twice in one line', async ({ page }) => {
    /* When the traits did not reach the group either, one press fixes both,
       and the two sentences together read as two separate problems. */
    await setup(page, { group: true, patchWorks: false, uploadWorks: false });
    const r = await act(page, 'rename');
    await restore(page);
    expect(r.said, 'the traits are reported').toContain('not shared yet');
    expect(r.said, 'and the list sentence stands down')
      .not.toContain('has not got the layer list');
    expect(r.said.split('Save to cloud').length - 1, 'said once').toBe(1);
  });

  test('nor does removing one, which is the sibling of the rename', async ({ page }) => {
    /* The same suppression, at the other call site. Mutation testing had
       nothing to say about this one until the test existed: a mutant removing
       the removal's guard survived, because every case in the file until now
       renamed. Covering one site and not its sibling is the exact shape of
       defect this file keeps finding. */
    await setup(page, { group: true, patchWorks: false, uploadWorks: false });
    const r = await act(page, 'remove');
    await restore(page);
    expect(r.said, 'the trait on it is reported').toContain('not shared yet');
    expect(r.said, 'and the list sentence stands down')
      .not.toContain('has not got the layer list');
    expect(r.said.split('Save to cloud').length - 1, 'said once').toBe(1);
  });

  test('adding a layer says it too', async ({ page }) => {
    // The sibling sites, because a fix at one and not the others is how the
    // stale list survived in the first place.
    await setup(page, { group: true, patchWorks: false });
    const r = await act(page, 'add');
    await restore(page);
    expect(r.said, 'the layer was added').toContain('Added visors');
    expect(r.said, 'and the group has not got the list').toContain('has not got the layer list');
  });

  test('and reordering says it only when it failed', async ({ page }) => {
    /* Reordering is a rapid, repeated gesture, so it stays silent on success -
       but a reorder the group never got is worth saying, because order is
       what composites a character. */
    await setup(page, { group: true, patchWorks: false });
    const bad = await act(page, 'move');
    expect(bad.said, 'the failure is spoken').toContain('has not got the layer list');

    await setup(page, { group: true, patchWorks: true });
    const good = await act(page, 'move');
    await restore(page);
    expect(good.layers, 'the reorder happened').toEqual(['capes', 'skins', 'unsorted']);
    expect(good.said, 'and said nothing at all').toBe('');
  });
});
