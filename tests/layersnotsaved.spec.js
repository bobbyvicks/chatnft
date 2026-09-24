/* A LAYER LIST THAT DID NOT SAVE SAYS SO.

   The device is full only for the layer list's own write. RUN AGAINST THE
   PAGE BEFORE THE FIX: the first three went red - Add left the new layer
   in the list with nothing said and a rejection nobody caught, the arrows
   kept the new order with nothing said, and Rename said nothing. The last
   is the control that an Add with room still says "Added". */
import { test, expect } from '@playwright/test';

const arm = (page, full) => page.evaluate(async (full) => {
  try { authed = true; } catch (_) {}
  gateShow(false); activeWs = null; await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: LAYERS_ID, kind: 'settings', layers: LAYERS.slice(), hidden: [], at: 1 });
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
    blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1 });
  await renderShelf();
  window.said = []; window.toast = (m) => window.said.push(String(m));
  window.loose = 0; window.addEventListener('unhandledrejection', () => { window.loose++; });
  if (full) {
    const real = dbPut;
    dbPut = async (r) => { if (r && r.id === LAYERS_ID) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real(r); };
  }
  window.confirm = () => true;
}, full);
const after = (page) => page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 200));
  return { said: window.said.join(' | '), layers: LAYERS.slice(), loose: window.loose, box: document.getElementById('newlayer').value };
});

test.describe('the layer list on a full device', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof addLayer === 'function' && typeof renameLayer === 'function');
  });

  test('ADD says it could not, and the layer is not left in the list', async ({ page }) => {
    await arm(page, true);
    await page.evaluate(() => { document.getElementById('newlayer').value = 'eyes'; addLayer().catch(() => {}); });
    const r = await after(page);
    console.log('add: ' + JSON.stringify(r));
    expect(r.said).toContain('Could not add eyes - this device is out of storage space');
    expect(r.layers).toEqual(['skins', 'hats', 'unsorted']);
    expect(r.box, 'the name is back in the box to try again').toBe('eyes');
  });

  test('THE ARROWS say it could not, and the order goes back', async ({ page }) => {
    await arm(page, true);
    await page.evaluate(() => { moveLayer('hats', -1).catch(() => {}); });
    const r = await after(page);
    expect(r.said).toContain('Could not save the new order');
    expect(r.layers).toEqual(['skins', 'hats', 'unsorted']);
  });

  test('RENAME says the traits moved but the list did not save', async ({ page }) => {
    await arm(page, true);
    await page.evaluate(() => { renameLayer('hats', 'headwear').catch(() => {}); });
    const r = await after(page);
    expect(r.said).toContain('1 trait moved to headwear, but the layer list could not be saved');
  });

  test('the control: with room, Add says Added', async ({ page }) => {
    await arm(page, false);
    await page.evaluate(async () => { document.getElementById('newlayer').value = 'eyes'; await addLayer(); });
    const r = await after(page);
    expect(r.said).toContain('Added eyes');
    expect(r.layers).toContain('eyes');
    expect(r.loose).toBe(0);
  });
});
