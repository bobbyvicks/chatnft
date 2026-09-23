/* A FIX PIXELS SAVE WRITES WHAT IT SAVED AND NOTHING ELSE, AND AN IMPORT
   WITH NO NEW NAME HASHES NOTHING.

   A fixer save goes through bulkImport, whose moved-file check reads a
   same-named trait of another status as the file's old self and deletes
   it. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with the
   wip hat deleted, and the second with every trait in the project hashed
   for a one-file import. The rest are controls that a folder import still
   does what a folder import is for: a file moved from wip to approved
   still replaces its old record, and a rename carrying the same picture is
   still merged. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'skins', 'unsorted'];
  window.png = async (colour) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = colour; g.fillRect(2, 2, 12, 12);
    return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  };
  const put = async (name, layer, status, colour, rarity) => dbPut({ id: 't_' + name + '_' + layer + '_' + status,
    kind: 'trait', name, layer, status, blob: new Blob([await png(colour)], { type: 'image/png' }),
    w: 16, h: 16, rarity, at: 1000, shelfOrder: 0 });
  await put('hat', 'hats', 'wip', '#ff0000', 2);
  await put('hat', 'hats', 'approved', '#00ff00', 5);
  for (let i = 0; i < 30; i++) await put('skin' + i, 'skins', 'approved', 'hsl(' + i * 12 + ' 60% 50%)', 1);
  window.hashes = 0;
  const real = sha256Of;
  sha256Of = async (b) => { window.hashes++; return real(b); };
});
const traits = (page) => page.evaluate(async () => (await dbAll()).filter(r => r.kind === 'trait')
  .filter(r => r.layer === 'hats').map(r => r.name + '/' + r.status + '/' + r.rarity).sort());

test.describe('saving from Fix pixels, and importing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof fixSaveFiles === 'function' && typeof bulkImport === 'function');
    await seed(page);
  });

  test('A FIXED APPROVED HAT is saved without deleting the wip hat beside it', async ({ page }) => {
    const said = await page.evaluate(async () => {
      let m = ''; await fixSaveFiles([fileWithPath(await png('#0000ff'), 'hats/approved/hat.png')], (x) => { m = x; });
      return m;
    });
    const hats = await traits(page);
    console.log('fix save: ' + JSON.stringify(hats) + ' | ' + said);
    expect(hats).toEqual(['hat/approved/5', 'hat/wip/2']);
    expect(said).toContain('1 sent to the project');
    expect(await page.evaluate(() => document.getElementById('bulknote').textContent),
      'and the wip hat is not reported missing from a folder there was none of').not.toContain('not in this folder');
  });

  test('AN IMPORT THAT BRINGS NO NEW NAME hashes nothing already in the project', async ({ page }) => {
    const n = await page.evaluate(async () => {
      await bulkImport([fileWithPath(await png('#0000ff'), 'hats/approved/hat.png'), fileWithPath(await png('#ff0000'), 'hats/wip/hat.png')]);
      return window.hashes;
    });
    console.log('hashes: ' + n);
    /* Four: each file, and the record each would replace - that pair is
       how an unchanged file is left alone. First written as two, before
       reading that check; none of the thirty skins in either count. */
    expect(n, 'the two files and the two hats they replace, none of the thirty skins').toBeLessThanOrEqual(4);
  });

  test('the control: a folder import that moves a file from wip to approved still replaces the old record', async ({ page }) => {
    await page.evaluate(async () => {
      await dbDel('t_hat_hats_approved');
      await bulkImport([fileWithPath(await png('#ff0000'), 'hats/approved/hat.png')]);
    });
    expect(await traits(page), 'moved, keeping its weight').toEqual(['hat/approved/2']);
  });

  test('the control: a rename carrying the same picture is still merged', async ({ page }) => {
    const r = await page.evaluate(async () => {
      await bulkImport([fileWithPath(await png('#ff0000'), 'hats/wip/hat v2.png')]);
      return { names: (await dbAll()).filter(x => x.kind === 'trait' && x.layer === 'hats').map(x => x.name + '/' + x.status).sort(),
        hashes: window.hashes };
    });
    expect(r.names).toEqual(['hat v2/wip', 'hat/approved']);
    expect(r.hashes, 'the hats compared, not the thirty skins').toBeLessThan(10);
  });
});
