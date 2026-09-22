/* EVERY DOOR A NEW LAYER ARRIVES THROUGH PUTS IT BEFORE THE CATCH-ALL.

   'unsorted' stays last. The file says so four times - "Inserted before
   unsorted, which is the catch-all and stays last" (bulkImport), "after it the
   catch-all would draw underneath a real layer" (applyLayers), applyLayers
   pushes it back to the end if a saved list lacks it, and the Layers panel
   disables its delete button. Last in LAYERS is the FRONT of the paint order,
   so a layer that lands after it is painted over everything.

   Four doors adopt a layer name this project has not got. Two of them
   spliced before unsorted. Two of them - a project file and a cloud pull -
   did `LAYERS.push(l)`, which is after it. So a layer that arrived in a
   project file or from the team was drawn over every other layer, including
   the catch-all, and nothing said so.

   THIS FILE WAS RUN AGAINST THE BROKEN PAGE FIRST. Two of the four cases went
   red on d25c6a8 and two stayed green; that is the positive control that the
   ordering assertion can fail, recorded here because once the doors are fixed
   the broken instance is gone and cannot be recovered. The creation is
   asserted BEFORE the ordering in every case: indexOf returns -1 for a layer
   that was never made, and -1 is less than any index, so an ordering
   assertion on its own is satisfied by absence. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bulkImport === 'function' && typeof importProject === 'function'
    && typeof cloudPull === 'function' && typeof planSort === 'function');
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    activeWs = null; cloudTeamId = null;
    await dbClear();
    LAYERS = ['backgrounds', 'skins', 'unsorted'];
    await saveLayers();
    await renderShelf();
  });
};

/* What every case asserts, in the order that makes the second one mean
   something: the layer exists, unsorted is still last, the layer is before it. */
const check = (layers, name, door) => {
  expect(layers, door + ': the layer was actually created').toContain(name);
  expect(layers[layers.length - 1], door + ': unsorted is still the catch-all at the end').toBe('unsorted');
  expect(layers.indexOf(name), door + ': and the new layer sits before it')
    .toBeLessThan(layers.indexOf('unsorted'));
};

test.describe('a new layer lands before the catch-all, whichever door it came through', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('a folder import', async ({ page }) => {
    const layers = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1; c.height = 1;
      c.getContext('2d').fillRect(0, 0, 1, 1);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const f = new File([blob], 'x.png', { type: 'image/png' });
      Object.defineProperty(f, 'webkitRelativePath', { value: 'UPLOAD/visors/x.png' });
      await bulkImport([f]);
      return LAYERS.slice();
    });
    check(layers, 'visors', 'folder import');
  });

  test('A PROJECT FILE', async ({ page }) => {
    /* The smallest file importProject accepts: the format tag, an empty item
       list, and a layer this project has not got. */
    const layers = await page.evaluate(async () => {
      const doc = { format: PROJECT_FORMAT, version: PROJECT_VERSION, items: [], layers: ['visors'] };
      await importProject(new File([JSON.stringify(doc)], 'p.json', { type: 'application/json' }));
      return LAYERS.slice();
    });
    check(layers, 'visors', 'project file');
  });

  test('A CLOUD PULL', async ({ page }) => {
    /* The real cloudPull against a stubbed fetch, the way cloudpull.spec.js
       drives it: one row on the server, and a collection whose layer list
       names a layer this browser has not got. */
    const layers = await page.evaluate(async () => {
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const real = window.fetch;
      const json = (o, extra) => new Response(JSON.stringify(o),
        { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
      const row = { id: 'row1', name: 'visor', kind: 'trait', layer: 'visors', status: 'approved',
        path: 'p/1.png', w: 160, h: 160, rarity: 1 };
      window.fetch = (u, o) => {
        const s = String(u);
        if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
        if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
        if (s.indexOf('/rest/v1/collections') >= 0) return Promise.resolve(json([{ id: 'c1', layers: ['skins', 'visors'] }]));
        if (s.indexOf('/rest/v1/traits?select=id') >= 0) return Promise.resolve(json([], { 'Content-Range': '0-0/1' }));
        if (s.indexOf('/rest/v1/traits?select=*') >= 0) return Promise.resolve(json([row], { 'Content-Range': '0-0/1' }));
        if (s.indexOf('/storage/v1/object/traits/') >= 0)
          return Promise.resolve(new Response(new Blob([new Uint8Array([0])]), { status: 200 }));
        return real(u, o);
      };
      try { await cloudPull({ quiet: true }); } finally { window.fetch = real; }
      return LAYERS.slice();
    });
    check(layers, 'visors', 'cloud pull');
  });

  test('a sort by inventory', async ({ page }) => {
    const layers = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      c.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await dbPut({ id: 't_Visor_skins_approved', kind: 'trait', name: 'Visor', layer: 'skins',
        status: 'approved', blob, w: 8, h: 8, at: 1 });
      const items = await dbAll();
      sortOrder = null;
      sortPlan = planSort(items.filter(i => i.kind === 'trait'),
        asInventory({ revision: 'x', order: [], rules: [], names: { visors: ['Visor.png'] } }));
      document.getElementById('sortgo').click();
      await new Promise(r => setTimeout(r, 900));
      return LAYERS.slice();
    });
    check(layers, 'visors', 'sort by inventory');
  });
});
