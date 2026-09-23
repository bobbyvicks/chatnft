/* THE TRAIT OPEN IN THE EDITOR FOLLOWS ITS RECORD WHEN THE SHELF MOVES IT.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with the
   hat twice - approved from the shelf, wip again from the save - and the
   second with the layer move undone the same way, and the third with a
   status picked in the editor written beside the shelf's copy rather than
   over it; the fourth likewise for a layer picked there. The last is the control that a save with nothing moved writes
   the one hat as before. */
import { test, expect } from '@playwright/test';

const openHat = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'heads', 'unsorted'];
  try { buildLayerSelect(); } catch (_) {}
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip',
    blob, w: 16, h: 16, rarity: 3, at: 1000, shelfOrder: 0 });
  await renderShelf();
  await openTraitRecord(await dbGet('t_hat_hats_wip'));
});
const traits = (page) => page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait')
  .map(i => i.layer + '/' + i.status + '/' + i.name + '/' + i.rarity).sort());
const save = (page) => page.evaluate(async () => {
  const t = window.toast; window.toast = () => {};
  try { await saveTrait(); } finally { window.toast = t; }
});

test.describe('a trait open in the editor while the shelf moves it', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof setTraitStatus === 'function');
    await openHat(page);
  });

  test('SET TO APPROVED ON THE SHELF, then saved from the editor: one hat, approved', async ({ page }) => {
    await page.evaluate(async () => { await setTraitStatus(await dbGet('t_hat_hats_wip'), 'approved'); });
    await save(page);
    const r = await traits(page);
    console.log('status: ' + JSON.stringify(r));
    expect(r).toEqual(['hats/approved/hat/3']);
  });

  test('MOVED TO ANOTHER LAYER ON THE SHELF, then saved: one hat, in the new layer', async ({ page }) => {
    await page.evaluate(async () => {
      const t = window.toast; window.toast = () => {};
      shelfPick.clear(); shelfPick.add(shelfCore.recordKey(await dbGet('t_hat_hats_wip')));
      try { await bulkMoveToLayer('heads'); } finally { window.toast = t; }
    });
    await save(page);
    const r = await traits(page);
    console.log('layer: ' + JSON.stringify(r));
    expect(r).toEqual(['heads/wip/hat/3']);
  });

  test('A STATUS PICKED IN THE EDITOR is kept, and replaces the moved copy', async ({ page }) => {
    await page.evaluate(async () => {
      setChip('tstatus', 'stfp');
      await setTraitStatus(await dbGet('t_hat_hats_wip'), 'approved');
    });
    await save(page);
    expect(await traits(page)).toEqual(['hats/stfp/hat/3']);
  });

  test('A LAYER PICKED IN THE EDITOR is kept while the status follows the shelf', async ({ page }) => {
    await page.evaluate(async () => {
      $('tlayer').value = 'heads';
      await setTraitStatus(await dbGet('t_hat_hats_wip'), 'approved');
    });
    await save(page);
    expect(await traits(page)).toEqual(['heads/approved/hat/3']);
  });

  test('the control: saved with nothing moved, the one hat as it was', async ({ page }) => {
    await save(page);
    expect(await traits(page)).toEqual(['hats/wip/hat/3']);
  });
});
