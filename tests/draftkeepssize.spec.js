/* A TRAIT REOPENED FROM ITS DRAFT KEEPS THE SIZE IT OPENED AT.

   openWide is the floor that keeps a shrink a change to the artwork rather
   than to the file. startEditor sets it from whatever it opens, and a trait
   opened through its draft opened at the draft's shrunk size - so a 1280
   trait, shrunk on the canvas, left and reopened, was saved as a 160x160
   file. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with
   the record saved at 160. The second is the control that the same shrink
   saved without leaving keeps 1280, which it always did. */
import { test, expect } from '@playwright/test';

/* A 1280 trait drawn in 8px blocks, and a small second trait to switch to. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const big = document.createElement('canvas'); big.width = 1280; big.height = 1280;
  const g = big.getContext('2d');
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    g.fillStyle = ((x + y) % 2) ? '#223344' : '#cc8844'; g.fillRect(x * 8, y * 8, 8, 8);
  }
  const bigBlob = await new Promise(r => big.toBlob(r, 'image/png'));
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
    blob: bigBlob, w: 1280, h: 1280, rarity: 1, at: 1000 });
  const s = document.createElement('canvas'); s.width = 160; s.height = 160;
  s.getContext('2d').fillRect(0, 0, 160, 160);
  await dbPut({ id: 't_hat_hats_approved', kind: 'trait', name: 'hat', layer: 'hats', status: 'approved',
    blob: await new Promise(r => s.toBlob(r, 'image/png')), w: 160, h: 160, rarity: 1, at: 1000 });
});

const saved = (page) => page.evaluate(async () => {
  const r = await dbGet('t_cap_hats_approved');
  const bm = await createImageBitmap(r.blob);
  return { w: r.w, h: r.h, fileW: bm.width, fileH: bm.height };
});

test.describe('a trait reopened from its draft keeps the size it opened at', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof resizeTo === 'function');
    await seed(page);
  });

  test('SHRUNK, LEFT AND REOPENED THROUGH ITS DRAFT, a 1280 trait is still saved at 1280', async ({ page }) => {
    const opened = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_approved'));
      resizeTo(160, 160, 'scale');
      await openTraitRecord(await dbGet('t_hat_hats_approved'));
      await openTraitRecord(await dbGet('t_cap_hats_approved'));
      const ok = await saveTrait();
      return { ok, canvas: art.width };
    });
    expect(opened.canvas, 'the draft was what reopened').toBe(160);
    expect(opened.ok).toBe(true);
    expect(await saved(page)).toEqual({ w: 1280, h: 1280, fileW: 1280, fileH: 1280 });
  });

  test('the control: the same shrink saved without leaving keeps 1280', async ({ page }) => {
    await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_hats_approved'));
      resizeTo(160, 160, 'scale');
      await saveTrait();
    });
    expect(await saved(page)).toEqual({ w: 1280, h: 1280, fileW: 1280, fileH: 1280 });
  });
});
