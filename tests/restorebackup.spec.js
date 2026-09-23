/* A PROJECT FILE DOES NOT DUPLICATE WHAT IS ALREADY HERE.

   importProject renamed on every id collision, so restoring a backup onto
   the project it came from made a byte-identical "-2" copy of every trait
   still here - outside every never-together rule. RUN AGAINST THE PAGE
   BEFORE THE FIX: the first test went red with 9 traits where 5 belong (4
   copies), and the third with 15 after two imports. The second went red
   too, because the old code renamed all five; what it guards now is the
   other side of the fix - a trait with the same name but a different
   picture is still a different trait and still renamed, so "same id" did
   not become "skip". */
import { test, expect } from '@playwright/test';

/* Five traits with five different pictures, then the project file. */
const backup = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + (40 * i) + ',80,120)'; g.fillRect(0, 0, 16, 16);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await dbPut({ id: 't_h' + i + '_hats_approved', kind: 'trait', name: 'h' + i, layer: 'hats', status: 'approved',
      blob, w: 16, h: 16, rarity: 1, at: 1 });
  }
  const realCreate = URL.createObjectURL; let doc = null;
  URL.createObjectURL = (b) => { doc = b; return 'blob:stub'; };
  const realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
  try { await exportProject(); } finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
  window.__backup = await doc.text();
  return true;
});

const restore = (page) => page.evaluate(async () => {
  const said = []; const t = window.toast; window.toast = (m) => said.push(m);
  try { await importProject(new File([window.__backup], 'p.json', { type: 'application/json' })); } finally { window.toast = t; }
  const names = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort();
  return { names, said: said.join(' | ') };
});

test.describe('a project file does not duplicate what is already here', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportProject === 'function' && typeof importProject === 'function');
    await backup(page);
  });

  test('RESTORING A BACKUP after deleting one brings that one back and copies nothing', async ({ page }) => {
    await page.evaluate(async () => { await dbDel('t_h2_hats_approved'); });
    const r = await restore(page);
    expect(r.names).toEqual(['h0', 'h1', 'h2', 'h3', 'h4']);
    expect(r.said).toContain('Imported 1 item');
    expect(r.said).toContain('4 already here');
    expect(r.said).not.toContain('renamed');
  });

  test('the same name with a different picture is still a different trait, and renamed', async ({ page }) => {
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillStyle = '#ff00ff'; c.getContext('2d').fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const rec = await dbGet('t_h1_hats_approved'); rec.blob = blob; await dbPut(rec);
    });
    const r = await restore(page);
    expect(r.names).toEqual(['h0', 'h1', 'h1-2', 'h2', 'h3', 'h4']);
    expect(r.said).toContain('1 renamed');
  });

  test('and importing the same file twice more adds nothing either time', async ({ page }) => {
    await restore(page);
    const r = await restore(page);
    expect(r.names).toEqual(['h0', 'h1', 'h2', 'h3', 'h4']);
    expect(r.said).toContain('5 already here');
  });
});
