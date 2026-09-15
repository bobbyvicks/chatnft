/* A DRAFT FOLLOWS THE TRAIT IT BELONGS TO.

   Companion to rulesfollow.spec.js, and the same shape of defect: a thing keyed
   to a trait's identity, and a set of gestures that change that identity
   without telling it.

   An unsaved draft lives under "autosave."+the trait's local id, and that id is
   name, layer and status joined together. So pressing the status chip on a card
   files the work under an id nothing will ever ask for again. openTraitRecord
   looks it up by exact key, offerRestore only ever reads the single working
   key, and nothing sweeps it - so the strokes are simply not there, with no
   warning before and no message after.

   MEASURED, before the fix. Paint cap, close without saving, press the chip:

     drafts   ['autosave.t_cap_hats_approved']
     traits   ['t_cap_hats_wip']
     reopen   corner 90, the saved pixels, and no draft bar

   THE ASSERTION IS WHAT OPENING THE TRAIT GIVES YOU, not what key a row is
   under. A draft correctly re-keyed and then rejected as stale would pass a key
   check and still lose the work - and that is not hypothetical, because Sort
   unsorted stamps `at:Date.now()` onto the record it moves, and the open path
   only accepts a draft NEWER than its record. So every test here opens the
   trait the way a click does and reads the canvas.
*/
import { test, expect } from '@playwright/test';

/* One trait with saved pixels 90, and an unsaved draft holding 20. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats',
    status: 'approved', blob: await png(90), w: 16, h: 16, rarity: 1, at: 1000,
    shelfOrder: 1 });
  await dbPut({ id: 't_tan_skins_approved', kind: 'trait', name: 'tan', layer: 'skins',
    status: 'approved', blob: await png(150), w: 16, h: 16, rarity: 1, at: 1000,
    shelfOrder: 2 });
  /* The draft: newer than the record, which is the only kind the open path
     accepts - an older one is a leftover from before the last save. */
  await dbPut({ id: 'autosave.t_cap_hats_approved', kind: 'autosave',
    traitId: 't_cap_hats_approved', name: 'cap.png', w: 16, h: 16,
    blob: await png(20), at: 2000 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
});

/* Opens the trait the way clicking its card does, and says what came up. 20 is
   the unsaved work; 90 is the saved record with the work gone. */
const openedCorner = (page, name) => page.evaluate(async (n) => {
  const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === n);
  if (!rec) return 'the trait is gone';
  const realToast = window.toast; window.toast = () => {};
  try { await openTraitRecord(rec); } finally { window.toast = realToast; }
  await new Promise(r => setTimeout(r, 150));
  return ctx.getImageData(0, 0, 1, 1).data[0];
}, name);

const quietly = (page, fn) => page.evaluate(async (src) => {
  const realToast = window.toast, realConfirm = window.confirm;
  window.toast = () => {};
  window.confirm = () => true;
  try { await eval('(' + src + ')()'); }
  finally { window.toast = realToast; window.confirm = realConfirm; }
}, fn);

const draftKeys = (page) => page.evaluate(async () =>
  (await dbAll()).filter(r => r.kind === 'autosave').map(r => r.id).sort());

test.describe('a draft follows the trait it belongs to', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await seed(page);
  });

  test('the draft binds before any move - the precondition', async ({ page }) => {
    /* Every test below asserts that opening the moved trait gives 20. If the
       draft did not bind even standing still, they would all be measuring
       nothing. It is a test rather than a line in seed because opening leaves
       the editor open, and the others need a clean page. */
    expect(await openedCorner(page, 'cap')).toBe(20);
  });

  test('WHEN ITS STATUS IS CHANGED FROM THE SHELF', async ({ page }) => {
    /* The reported gesture. The handler carries the hidden-set key across on
       the line above; the draft was the one id-keyed thing it did not. */
    await quietly(page, `async () => {
      /* BY TITLE, not the first .cyc on the page. The shelf lists skins
         before hats, so the first chip belongs to tan and an earlier version
         of this test cycled the wrong trait and asserted nothing. */
      const cyc = document.querySelector('.item[title=\"cap\"] .cyc');
      cyc.click();
      await new Promise(r => setTimeout(r, 300));
    }`);
    /* approved -> stfp: the cycle is wip, approved, stfp, rejected. */
    expect(await draftKeys(page)).toEqual(['autosave.t_cap_hats_stfp']);
    expect(await openedCorner(page, 'cap')).toBe(20);
  });

  test('when its layer is renamed', async ({ page }) => {
    await quietly(page, `async () => { await renameLayer('hats','headwear'); }`);
    expect(await draftKeys(page)).toEqual(['autosave.t_cap_headwear_approved']);
    expect(await openedCorner(page, 'cap')).toBe(20);
  });

  test('when its layer is removed and it lands in unsorted', async ({ page }) => {
    await quietly(page, `async () => { await removeLayer('hats'); }`);
    expect(await openedCorner(page, 'cap')).toBe(20);
  });

  test('when its card is dragged to another layer', async ({ page }) => {
    await quietly(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      await commitShelfMove({ recordKey: shelfCore.recordKey(rec), toLayer: 'skins', beforeKey: null });
    }`);
    expect(await openedCorner(page, 'cap')).toBe(20);
  });

  test('when it is part of a selection moved at once', async ({ page }) => {
    await quietly(page, `async () => {
      const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      shelfPick.clear();
      shelfPick.add(shelfCore.recordKey(rec));
      await bulkMoveToLayer('skins');
    }`);
    expect(await openedCorner(page, 'cap')).toBe(20);
  });

  test('AND WHEN SORT UNSORTED MOVES AND RENAMES IT AT ONCE', async ({ page }) => {
    /* The one that needs the re-stamp. sortApply writes at:Date.now() onto the
       record, so a draft carried across with its original timestamp arrives
       correctly keyed and is then thrown away as stale by the open path - it
       would pass a key check and lose the work anyway. */
    await quietly(page, `async () => {
      const items = (await dbAll()).filter(x => x.kind === 'trait');
      /* An inventory row, which is what planSort reads: layer, trait and the
         name it used to have. skins rather than a new layer, because planSort
         refuses a destination the project has never had. */
      await sortApply(planSort(items, [
        { layer: 'skins', trait: 'Cap.png', previousName: 'cap.png' }]));
    }`);
    expect(await draftKeys(page)).toEqual(['autosave.t_Cap_skins_approved']);
    expect(await openedCorner(page, 'Cap')).toBe(20);
  });

  test('a duplicate does NOT inherit the original unsaved work - the control',
    async ({ page }) => {
      /* Duplicate builds a new record from the SAVED blob, so the copy must
         open at 90 while the original still opens at 20. A fix that moved the
         draft at every dbDel/dbPut pair would get this wrong. */
      await quietly(page, `async () => {
        const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
        await duplicateTrait(rec);
      }`);
      const keys = await draftKeys(page);
      expect(keys, 'the original keeps its draft and the copy has none')
        .toEqual(['autosave.t_cap_hats_approved']);
      expect(await openedCorner(page, 'cap-copy')).toBe(90);
    });

  test('and a trait with no draft is not given one - the other control',
    async ({ page }) => {
      /* tan has never been edited. Moving it must leave it with nothing, or
         draftsFollow is inventing rows rather than carrying them. */
      await quietly(page, `async () => {
        const rec = (await dbAll()).find(r => r.id === 't_tan_skins_approved');
        await commitShelfMove({ recordKey: shelfCore.recordKey(rec), toLayer: 'hats', beforeKey: null });
      }`);
      expect(await draftKeys(page)).toEqual(['autosave.t_cap_hats_approved']);
      expect(await openedCorner(page, 'tan')).toBe(150);
    });

  test('AND WHEN A CLOUD PULL RE-IDS IT TO MATCH THE SERVER', async ({ page }) => {
    /* The sixth path, and the only one that is not a gesture somebody made
       here: the pull finds the row this record came from and the server says
       it lives somewhere else now, so the local id is rewritten to match. A
       teammate moving a trait between layers then costs whoever had it open
       their unsaved work.

       Against a stubbed fetch. No credentials and no server - the token is a
       string and every request is intercepted, the same way cloudpull.spec.js
       does it. */
    const out = await page.evaluate(async () => {
      const cap = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
      await dbPut(Object.assign({}, cap, { rowId: 'row1', synced: true, path: 'p/cap.png' }));
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const json = (o, extra) => new Response(JSON.stringify(o),
        { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
      const real = window.fetch;
      window.fetch = (u, o) => {
        const t = String(u);
        if (t.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
        if (t.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
        if (t.indexOf('/rest/v1/collections') >= 0)
          return Promise.resolve(json([{ id: 'c1', layers: ['skins', 'hats', 'unsorted'] }]));
        if (t.indexOf('/rest/v1/traits?select=id') >= 0)
          return Promise.resolve(json([], { 'Content-Range': '0-0/1' }));
        if (t.indexOf('/rest/v1/traits?select=*') >= 0)
          /* The SAME row the local record came from - held by rowId - but the
             server now says skins. That is what makes this the repair path. */
          return Promise.resolve(json([{ id: 'row1', kind: 'trait', name: 'cap', layer: 'skins',
            status: 'approved', path: 'p/cap.png', w: 16, h: 16, rarity: 1,
            updated_at: '2026-01-01T00:00:00Z' }],
            { 'Content-Range': '0-0/1' }));
        return Promise.resolve(json([]));
      };
      const realToast = window.toast; window.toast = () => {};
      try { await cloudPull(); } finally { window.fetch = real; window.toast = realToast; }
      await new Promise(r => setTimeout(r, 300));
      const rows = await dbAll();
      return {
        traits: rows.filter(r => r.kind === 'trait').map(r => r.id).sort(),
        drafts: rows.filter(r => r.kind === 'autosave').map(r => r.id).sort(),
      };
    });
    /* The precondition: if the pull did not actually re-id the record, this
       test proves nothing about drafts. */
    expect(out.traits, 'the pull moved the trait to skins')
      .toContain('t_cap_skins_approved');
    expect(out.drafts).toEqual(['autosave.t_cap_skins_approved']);
    expect(await openedCorner(page, 'cap')).toBe(20);
  });
});
