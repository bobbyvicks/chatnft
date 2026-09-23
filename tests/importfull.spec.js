/* IMPORT PROJECT ON A FULL DEVICE SAYS SO, AND A PROJECT IT COULD NOT READ
   IS NOT TREATED AS EMPTY.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with "3
   could not be read" after trying every item, and the second with the file
   imported over a project that was never read. The third is the control
   that an ordinary import still says what it imported. */
import { test, expect } from '@playwright/test';

/* Five traits exported to a project file, then the store emptied. */
const fileOf = (page) => page.evaluate(async () => {
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
  try { await exportProject(); } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; window.toast = t; }
  window.projectText = await got.text();
  await dbClear();
});

/* o.fullAfter: trait writes refused as over quota after this many.
   o.readFails: the project's first read throws. */
const importWith = (page, o) => page.evaluate(async (o) => {
  const said = [], t = window.toast; window.toast = (m) => said.push(String(m));
  const realPut = dbPut, realAll = dbAll;
  let tries = 0, reads = 0;
  dbPut = async (r) => {
    if (r && r.kind === 'trait') {
      tries++;
      if (o.fullAfter != null && tries > o.fullAfter) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return realPut(r);
  };
  dbAll = async () => { if (o.readFails && reads++ === 0) throw new Error('read failed'); return realAll(); };
  try { await importProject(new File([window.projectText], 'p.json', { type: 'application/json' })); }
  finally { dbPut = realPut; dbAll = realAll; window.toast = t; }
  return { said: said.join(' | '), tries, traits: (await dbAll()).filter(i => i.kind === 'trait').length };
}, o);

test.describe('Import project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importProject === 'function' && typeof exportProject === 'function');
    await fileOf(page);
  });

  test('ON A FULL DEVICE says the device is full, and stops at the first refusal', async ({ page }) => {
    const r = await importWith(page, { fullAfter: 2 });
    console.log('full: ' + JSON.stringify(r));
    expect(r.said).toContain('out of storage space - 2 of 5 imported before it filled');
    expect(r.said).not.toContain('could not be read');
    expect(r.tries, 'two landed, the third refused, none tried after').toBe(3);
  });

  test('A PROJECT IT COULD NOT READ is not imported into as if it were empty', async ({ page }) => {
    const r = await importWith(page, { readFails: true });
    console.log('unread: ' + JSON.stringify(r));
    expect(r.said).toContain('Could not read this project');
    expect(r.tries).toBe(0);
  });

  test('the control: an ordinary import says what it imported', async ({ page }) => {
    const r = await importWith(page, {});
    expect(r.said).toContain('Imported 5 items');
    expect(r.traits).toBe(5);
  });
});
