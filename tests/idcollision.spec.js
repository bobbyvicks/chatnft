/* A trait's id is name + layer + status, and nothing checked who already had it.

   MEASURED. Two traits, same name and layer, differing only in status:

     before   t_gold_skins_approved   4-byte artwork, rarity 7
              t_gold_skins_wip        1-byte artwork, rarity 1

   One click on the wip card's status chip:

     after    t_gold_skins_approved   1-byte artwork, rarity 1
     toast    "gold -> approved"
     shelf    two cards became one

   The finished trait's artwork and rarity are gone, there is no undo for the
   shelf, and the only thing said was a success message. Inside a group the
   same click propagates the delete to the server row and the PNG.

   Two sites, one shape: the status chip, and saveTrait - where renaming an open
   trait onto a name already in that layer and status did the same thing.

   THE FILE ALREADY HAD BOTH CONVENTIONS. duplicateTrait, importProject,
   retagLayer and cloudPull RENAME on a clash; planShelfMove REFUSES and names
   what it refused. These two did neither. Refusing is right here: both gestures
   are somebody naming a thing deliberately, and quietly renaming their trait to
   gold-2 answers a question they did not ask.

   THE CONTROLS MATTER AS MUCH AS THE REFUSALS. A guard that refuses too much
   would make an ordinary status change or an ordinary re-save impossible, which
   is worse than the defect. Both are pinned.
*/
import { test, expect } from '@playwright/test';

const two = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  await dbPut({ id: 't_gold_skins_approved', kind: 'trait', name: 'gold', layer: 'skins',
    status: 'approved', blob: new Blob(['AAAA']), w: 8, h: 8, at: Date.now(), shelfOrder: 1, rarity: 7 });
  await dbPut({ id: 't_gold_skins_wip', kind: 'trait', name: 'gold', layer: 'skins',
    status: 'wip', blob: new Blob(['B']), w: 8, h: 8, at: Date.now(), shelfOrder: 2, rarity: 1 });
  await renderShelf();
});

/* Clicks the status chip on the card showing `status`, and reports what
   happened to the records. */
const cycle = (page, status) => page.evaluate(async (want) => {
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  const card = [...document.querySelectorAll('#projbody .item')]
    .find(el => new RegExp(want, 'i').test(el.textContent || ''));
  if (!card) { window.toast = realToast; return { missing: true }; }
  card.querySelector('button.cyc').click();
  await new Promise(r => setTimeout(r, 500));
  window.toast = realToast;
  const golds = (await dbAll()).filter(r => r.name === 'gold');
  return {
    said,
    records: golds.map(r => ({ id: r.id, blobSize: r.blob.size, rarity: r.rarity })).sort((a, b) => a.id < b.id ? -1 : 1),
  };
}, status);

test.describe('one trait must not overwrite another', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await two(page);
    await page.waitForTimeout(400);
  });

  test('approving a wip trait does not destroy the approved one it collides with', async ({ page }) => {
    const r = await cycle(page, 'wip');
    expect(r.records.length, 'both traits are still there').toBe(2);
    const approved = r.records.find(x => x.id === 't_gold_skins_approved');
    expect(approved.blobSize, 'the finished artwork is untouched').toBe(4);
    expect(approved.rarity, 'and so is its rarity').toBe(7);
  });

  test('and it says which trait it refused, rather than failing quietly', async ({ page }) => {
    // A refusal nobody can see is only marginally better than the overwrite -
    // the person needs to know why their click did nothing.
    const r = await cycle(page, 'wip');
    expect(r.said.join(' '), 'names the status and the layer').toMatch(/already an approved gold in skins/);
    expect(r.said.join(' '), 'and does not claim success').not.toContain('-> approved');
  });

  test('an ordinary status change with nothing in the way still works', async ({ page }) => {
    // THE CONTROL. A guard that refuses too much would make the chip useless,
    // which is worse than the defect it fixes.
    await page.evaluate(async () => { await dbDel('t_gold_skins_approved'); await renderShelf(); });
    await page.waitForTimeout(300);
    const r = await cycle(page, 'wip');
    expect(r.said.join(' '), 'it went through').toContain('gold -> approved');
    expect(r.records.length).toBe(1);
    expect(r.records[0].id, 'and moved to the new status').toBe('t_gold_skins_approved');
  });

  test('cycling a trait right round returns it to itself', async ({ page }) => {
    // The other control: wip -> approved -> rejected -> wip lands back on the
    // id it started from, which must NOT be read as a collision with itself.
    await page.evaluate(async () => { await dbDel('t_gold_skins_approved'); await renderShelf(); });
    await page.waitForTimeout(300);
    await cycle(page, 'wip');
    await cycle(page, 'approved');
    const r = await cycle(page, 'rejected');
    expect(r.said.join(' '), 'the last step is allowed').toContain('gold -> wip');
    expect(r.records.length).toBe(1);
    expect(r.records[0].id).toBe('t_gold_skins_wip');
  });

  test('saving an open trait a second time still works', async ({ page }) => {
    /* The self-exception in the guard is ONLY load-bearing here. Removing both
       halves of it and running the rest of this file reds a single test - the
       direct one below - because the status chip always moves to a DIFFERENT
       id, so it never asks about a record against itself. saveTrait does, every
       time somebody presses Save on a trait they already saved.
       Without this, "the guard refuses too much" would look covered and the
       most ordinary action in the app would be broken. */
    await page.evaluate(async () => {
      await dbClear();
      await renderShelf();
      const w = 16, h = 16;
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) { d[i*4] = 200; d[i*4+3] = 255; }
      fileName = 'probe';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      $('tname').value = 'onlyone';
      $('tlayer').value = 'skins';
    });
    await page.waitForTimeout(300);
    const r = await page.evaluate(async () => {
      const said = [];
      const realToast = window.toast;
      window.toast = (m) => { said.push(m); };
      const first = await saveTrait();
      const second = await saveTrait();       // the same trait, again
      window.toast = realToast;
      const rows = (await dbAll()).filter(x => x.name === 'onlyone');
      return { first, second, said, count: rows.length };
    });
    expect(r.first, 'the first save works').toBe(true);
    expect(r.second, 'and so does saving it again').toBe(true);
    expect(r.count, 'still exactly one record').toBe(1);
    expect(r.said.join(' '), 'nothing was refused').not.toContain('There is already');
  });

  test('the guard sees a collision but not a trait saved over itself', async ({ page }) => {
    // saveTrait rewrites the record it is editing every time, so a guard that
    // treated that as a collision would make saving impossible.
    const r = await page.evaluate(async () => ({
      collides: !!(await idHolder('t_gold_skins_approved', 't_gold_skins_wip')),
      itself: !!(await idHolder('t_gold_skins_wip', 't_gold_skins_wip')),
      free: !!(await idHolder('t_gold_hats_wip', 't_gold_skins_wip')),
      brandNewOntoExisting: !!(await idHolder('t_gold_skins_wip', undefined)),
    }));
    expect(r.collides, 'a real collision is seen').toBe(true);
    expect(r.itself, 'saving over yourself is not one').toBe(false);
    expect(r.free, 'a free id is free').toBe(false);
    expect(r.brandNewOntoExisting, 'a new trait landing on an existing one is seen').toBe(true);
  });
});
