/* Renaming a hidden trait made it reappear.

   The shelf's hide/only control keeps a set of record keys, and a record key
   is rowId || id. For a trait that has never been to a server that is the id,
   which is built from the name, layer and status - so renaming it, moving it,
   or changing its status gives it a new key and the old entry matches nothing.

   Three of the four sites that do this already transfer the key. The bulk move
   says why in its own comment: "A hidden trait stays hidden ... without this
   the trait quietly reappears - which dragging it one at a time does not do,
   because commitShelfMove has always transferred the key." saveTrait, the
   fourth, did not.

   MEASURED, on a personal page, with cap hidden:

     the status chip, approved -> rejected
       hidden    ['t_cap_hats_rejected']      the key moved

     the editor, cap -> beanie
       hidden    []                           the key is gone

   And it does not come back: renderShelf drops any hidden key with no live
   trait behind it, so the entry is deleted on the next draw.

   THE CONTROLS ARE WHAT KEEP A TRANSFER FROM BECOMING A SECOND BUG. One that
   added rather than moved would hide traits nobody hid; one that dropped the
   entry when the key does not change would un-hide every synced trait on every
   save. Both are pinned, along with the sibling that was already right.
*/
import { test, expect } from '@playwright/test';

/* Two traits, cap hidden. `rowId` gives cap a server row, which is what makes
   its record key stop moving with its id. */
const seed = (page, rowId) => page.evaluate(async (row) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  for (const [n, l, o] of [['tan', 'skins', 1], ['cap', 'hats', 2]]) {
    const rec = { id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n, layer: l,
      status: 'approved', blob: new Blob([new Uint8Array(16)]), w: 160, h: 160,
      rarity: 1, at: 1, shelfOrder: o };
    if (row && n === 'cap') rec.rowId = row;
    await dbPut(rec);
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 350));
  const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
  const st = currentShelfVisibility();
  st.hide(shelfCore.recordKey(rec));
  st.setReveal(false);
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
  /* Asserted, not assumed: if cap were still on the shelf here, every check
     below would pass against a control that never hid anything. */
  const names = [...document.querySelectorAll('#projbody .item')]
    .map(e => (e.textContent || '').trim().split(/\s+/)[0]);
  if (names.length !== 1) throw new Error('cap is not hidden to begin with: ' + names.join(', '));
  return true;
}, rowId);

/* Opens cap in the editor and saves it under a new name. */
const renameInEditor = (page, to) => page.evaluate(async (name) => {
  const rec = (await dbAll()).find(r => r.id === 't_cap_hats_approved');
  const d = new Uint8ClampedArray(16 * 16 * 4);
  fileName = 'cap';
  startEditor(d, 16, 16, 16, 16, palette(d, 256, 24, 64), false);
  openRec = rec;                       // AFTER startEditor, which resets it
  document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
  $('tname').value = name; $('tlayer').value = 'hats';
  setChip('tstatus', 'approved');
  const realToast = window.toast;
  window.toast = () => {};
  try { await saveTrait(); } finally { window.toast = realToast; }
  await new Promise(r => setTimeout(r, 500));
}, to);

const state = (page) => page.evaluate(async () => ({
  hidden: [...currentShelfVisibility().hiddenKeys()],
  onShelf: [...document.querySelectorAll('#projbody .item')]
    .map(e => (e.textContent || '').trim().split(/\s+/)[0].replace(/approved.*$/, '')),
  ids: (await dbAll()).filter(r => r.kind === 'trait').map(r => r.id).sort(),
}));

test.describe('a hidden trait stays hidden when it is renamed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof saveTrait === 'function');
  });

  test('the card does not come back', async ({ page }) => {
    await seed(page, null);
    await renameInEditor(page, 'beanie');
    const r = await state(page);
    expect(r.ids, 'the rename happened').toContain('t_beanie_hats_approved');
    expect(r.onShelf, 'and only tan is drawn, as before').toEqual(['tan']);
  });

  test('and the hidden set names it by its new key', async ({ page }) => {
    // The card being absent is not enough on its own: an entry left pointing
    // at the old id is dropped by the next render, and the trait reappears a
    // draw later rather than immediately.
    await seed(page, null);
    await renameInEditor(page, 'beanie');
    const r = await state(page);
    expect(r.hidden).toEqual(['t_beanie_hats_approved']);
  });

  test('the status chip already did this, and still does', async ({ page }) => {
    /* THE SIBLING THAT WAS RIGHT. It is here because the fix is "do what the
       other three already do", and that claim needs one of them measured
       rather than read. */
    await seed(page, null);
    await page.evaluate(async () => {
      currentShelfVisibility().setReveal(true);   // or there is no card to press
      await renderShelf();
      await new Promise(r => setTimeout(r, 300));
      const card = [...document.querySelectorAll('#projbody .item')]
        .find(el => /cap/i.test(el.textContent || ''));
      if (!card) throw new Error('no cap card to press');
      const realToast = window.toast;
      window.toast = () => {};
      try { card.querySelector('button.cyc').click(); await new Promise(r => setTimeout(r, 700)); }
      finally { window.toast = realToast; }
    });
    const r = await state(page);
    expect(r.ids, 'the status changed').toContain('t_cap_hats_rejected');
    expect(r.hidden, 'and the key came with it').toEqual(['t_cap_hats_rejected']);
  });

  test('a trait with a server row keeps its key, and stays hidden', async ({ page }) => {
    /* A CONTROL. A synced trait's key is its rowId, which a rename does not
       touch - so the transfer is from a key to itself. A transfer that deleted
       before it added would un-hide every synced trait on every save. */
    await seed(page, 'row_cap');
    await renameInEditor(page, 'beanie');
    const r = await state(page);
    expect(r.hidden, 'still hidden, under the row id').toEqual(['row_cap']);
    expect(r.onShelf, 'and still not drawn').toEqual(['tan']);
  });

  test('a visible trait is not hidden by being renamed', async ({ page }) => {
    /* THE OTHER CONTROL. A transfer that ADDED rather than moved would hide
       traits nobody hid - worse than the defect, because there is no undo
       button for something you never did. */
    await seed(page, null);
    await page.evaluate(async () => {
      /* Rename TAN, which is visible, while cap stays hidden. */
      const rec = (await dbAll()).find(r => r.id === 't_tan_skins_approved');
      const d = new Uint8ClampedArray(16 * 16 * 4);
      fileName = 'tan';
      startEditor(d, 16, 16, 16, 16, palette(d, 256, 24, 64), false);
      openRec = rec;
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      $('tname').value = 'olive'; $('tlayer').value = 'skins';
      setChip('tstatus', 'approved');
      const realToast = window.toast;
      window.toast = () => {};
      try { await saveTrait(); } finally { window.toast = realToast; }
      await new Promise(r => setTimeout(r, 500));
    });
    const r = await state(page);
    expect(r.onShelf, 'the renamed trait is still on the shelf').toEqual(['olive']);
    expect(r.hidden, 'and only cap is hidden').toEqual(['t_cap_hats_approved']);
  });
});
