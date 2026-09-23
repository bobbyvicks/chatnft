/* AN IMPORTED PROJECT KEEPS ITS EDIT TIMES.

   Export writes each trait's edit time and Import threw it away, so a
   restored collection read "edited just now" everywhere. RUN AGAINST THE
   PAGE BEFORE THE FIX: the first test went red with every time replaced by
   the moment of import. The second is the control that a file with no
   time - older than the field - still imports, stamped now. */
import { test, expect } from '@playwright/test';

const roundTrip = (page, withTime) => page.evaluate(async (withTime) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < 5; i++) await dbPut({ id: 't_k' + i + '_hats_approved', kind: 'trait', name: 'k' + i, layer: 'hats',
    status: 'approved', blob: new Blob([new Uint8Array([i, 1, 2])]), w: 16, h: 16, rarity: 1, at: 1700000000000 + i, shelfOrder: i });
  let got = null;
  const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (b) => { got = b; return 'blob:probe'; };
  HTMLAnchorElement.prototype.click = function () {};
  const t = window.toast; window.toast = () => {};
  try {
    await exportProject();
    let text = await got.text();
    if (!withTime) { const doc = JSON.parse(text); for (const it of doc.items) delete it.at; text = JSON.stringify(doc); }
    await dbClear();
    const before = Date.now();
    await importProject(new File([text], 'p.json', { type: 'application/json' }));
    const all = (await dbAll()).filter(i => i.kind === 'trait').sort((a, b) => a.name < b.name ? -1 : 1);
    return { at: all.map(i => i.at), before };
  } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; window.toast = t; }
}, withTime);

test.describe('an imported project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importProject === 'function');
  });

  test('KEEPS EACH TRAIT\'S EDIT TIME', async ({ page }) => {
    const r = await roundTrip(page, true);
    expect(r.at).toEqual([1700000000000, 1700000000001, 1700000000002, 1700000000003, 1700000000004]);
  });

  test('the control: a file with no edit time still imports, stamped now', async ({ page }) => {
    const r = await roundTrip(page, false);
    expect(r.at.length).toBe(5);
    expect(r.at.every(a => a >= r.before)).toBe(true);
  });
});
