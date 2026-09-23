/* A SECOND SAVE PRESS JOINS THE FIRST.

   Two presses of Save after a rename ran two saves at once, and the second
   found the first's new record in its name check and said "There is
   already". RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red
   with that message. The second is the control that a real clash - a
   different trait already holding the name - is still refused. */
import { test, expect } from '@playwright/test';

const open = (page, clash) => page.evaluate(async (clash) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', blob, w: 16, h: 16, rarity: 1, at: 1 });
  if (clash) await dbPut({ id: 't_beret_hats_wip', kind: 'trait', name: 'beret', layer: 'hats', status: 'wip',
    blob: new Blob([new Uint8Array(5)]), w: 16, h: 16, rarity: 1, at: 1 });
  await renderShelf();
  await openTraitRecord(await dbGet('t_cap_hats_wip'));
  $('tname').value = 'beret';
}, clash);

const pressTwice = (page) => page.evaluate(async () => {
  const said = []; const t = window.toast; window.toast = (x) => said.push(String(x));
  let r;
  try { r = await Promise.all([saveTrait(), saveTrait()]); } finally { window.toast = t; }
  const all = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort();
  return { said: said.join(' | '), all, r };
});

test.describe('pressing Save twice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof saveTrait === 'function' && typeof openTraitRecord === 'function');
  });

  test('AFTER A RENAME never says the new name is taken by itself', async ({ page }) => {
    await open(page, false);
    const r = await pressTwice(page);
    console.log('twice: ' + JSON.stringify(r));
    expect(r.said).not.toContain('There is already');
    expect(r.all, 'one trait, renamed').toEqual(['beret']);
  });

  test('the control: a name another trait holds is still refused', async ({ page }) => {
    await open(page, true);
    const r = await page.evaluate(async () => {
      const said = []; const t = window.toast; window.toast = (x) => said.push(String(x));
      try { await saveTrait(); } finally { window.toast = t; }
      return said.join(' | ');
    });
    expect(r).toContain('There is already');
  });
});
