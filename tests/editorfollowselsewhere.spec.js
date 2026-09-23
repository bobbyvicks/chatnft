/* THE EDITOR FOLLOWS A MOVE MADE IN ANOTHER TAB.

   Two tabs of one project: the hat open in the editor in one, its status
   or layer changed on the shelf in the other. RUN AGAINST THE PAGE BEFORE
   THE FIX: the first two tests went red with the hat twice after the
   editor tab saved, and the third with the editor tab's own latest
   drawing left under the old id. The last is the control that a move of
   some other trait leaves the editor alone. */
import { test, expect } from '@playwright/test';

const open = async (context) => {
  const page = await context.newPage();
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof setTraitStatus === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    gateShow(false); activeWs = null; cloudTeamId = null;
    LAYERS = ['hats', 'heads', 'unsorted'];
    try { buildLayerSelect(); } catch (_) {}
    window.toast = () => {};
  });
  return page;
};
const png = (w) => `(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${w};
  c.getContext('2d').fillRect(1, 1, ${w} - 2, ${w} - 2); return new Promise(r => c.toBlob(r, 'image/png')); })()`;
const traits = (page) => page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait')
  .map(i => i.layer + '/' + i.status + '/' + i.name + '/' + i.rarity).sort());

test.describe('a trait open in one tab while another tab moves it', () => {
  let ed, shelf;
  test.beforeEach(async ({ context }) => {
    ed = await open(context);
    shelf = await open(context);
    await ed.evaluate(async (mk) => {
      await dbClear();
      const blob = await eval(mk);
      await dbPut({ id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip',
        blob, w: 16, h: 16, rarity: 3, at: 1000, shelfOrder: 0 });
      await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip',
        blob, w: 16, h: 16, rarity: 2, at: 1000, shelfOrder: 1 });
      await openTraitRecord(await dbGet('t_hat_hats_wip'));
    }, png(16));
  });

  test('SET TO APPROVED IN THE OTHER TAB, then saved here: one hat, approved', async () => {
    await shelf.evaluate(async () => { await setTraitStatus(await dbGet('t_hat_hats_wip'), 'approved'); });
    await ed.waitForTimeout(700);
    await ed.evaluate(() => saveTrait());
    const r = await traits(ed);
    console.log('status: ' + JSON.stringify(r));
    expect(r).toEqual(['hats/approved/hat/3', 'hats/wip/cap/2']);
  });

  test('MOVED TO ANOTHER LAYER IN THE OTHER TAB, then saved here: one hat, in the new layer', async () => {
    await shelf.evaluate(async () => {
      shelfPick.clear(); shelfPick.add(shelfCore.recordKey(await dbGet('t_hat_hats_wip')));
      await bulkMoveToLayer('heads');
    });
    await ed.waitForTimeout(700);
    await ed.evaluate(() => saveTrait());
    const r = await traits(ed);
    console.log('layer: ' + JSON.stringify(r));
    expect(r).toEqual(['hats/wip/cap/2', 'heads/wip/hat/3']);
  });

  test('A DRAFT THIS TAB FILED UNDER THE OLD ID before the message is carried to the new one', async () => {
    /* The other tab moves the trait; this tab's autosave lands under the
       old id before the message does - written straight, the way an
       autosave already in flight would. */
    await shelf.evaluate(async () => { await setTraitStatus(await dbGet('t_hat_hats_wip'), 'approved'); });
    await ed.evaluate(async (mk) => {
      await dbPut({ id: 'autosave.t_hat_hats_wip', kind: 'autosave', traitId: 't_hat_hats_wip', name: 'hat',
        blob: await eval(mk), w: 24, h: 24, at: Date.now() + 5000 });
    }, png(24));
    await ed.waitForFunction(() => openRec && openRec.id === 't_hat_hats_approved');
    await ed.waitForFunction(async () => !(await dbGet('autosave.t_hat_hats_wip')));
    const d = await ed.evaluate(async () => { const r = await dbGet('autosave.t_hat_hats_approved'); return r && { w: r.w, traitId: r.traitId }; });
    expect(d).toEqual({ w: 24, traitId: 't_hat_hats_approved' });
  });

  test('MOVED TWICE BEFORE ONE MESSAGE - approved, then another layer - it follows to the end', async () => {
    await shelf.evaluate(async () => {
      await setTraitStatus(await dbGet('t_hat_hats_wip'), 'approved');
      shelfPick.clear(); shelfPick.add(shelfCore.recordKey(await dbGet('t_hat_hats_approved')));
      await bulkMoveToLayer('heads');
    });
    await ed.waitForTimeout(700);
    await ed.evaluate(() => saveTrait());
    expect(await traits(ed)).toEqual(['hats/wip/cap/2', 'heads/approved/hat/3']);
  });

  test('the control: another trait moved in the other tab leaves this editor alone', async () => {
    await shelf.evaluate(async () => { await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); });
    await ed.waitForTimeout(700);
    expect(await ed.evaluate(() => openRec.id)).toBe('t_hat_hats_wip');
    await ed.evaluate(() => saveTrait());
    expect(await traits(ed)).toEqual(['hats/approved/cap/2', 'hats/wip/hat/3']);
  });
});
