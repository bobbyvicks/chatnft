/* THE PICK AND THE HIDDEN SET FOLLOW THE TRAIT.

   Same family as draftfollows.spec.js: state keyed to a trait's identity, and
   gestures that change that identity without telling it. Here the key is
   recordKey - rowId || id - and two sets use it.

   THE PICK. The status chip rewrites the local id, and the render that follows
   deletes any pick whose key names no live trait. That purge is right for a
   trait that is gone and wrong for the same trait under a new key. Measured:
   pick two tiles, press the chip on one, and Move moves one trait. In the pass
   this feature exists for - pick a batch out of unsorted, fix a status you
   noticed on the way, then Move - one trait is left behind, and it is not even
   named: bulkMoveToLayer goes out of its way to name the traits it REFUSES,
   but a trait dropped from the selection before the move never reaches that
   path.

   THE HIDDEN SET, in the case the pick defect excludes. For a synced trait the
   key IS the rowId, so the chip's transfer is a no-op from the old rowId to
   itself - right at that instant. Then the move uploads the trait as a NEW row
   and writes the returned id back onto the local record, so by the time the
   shelf redraws, both keys name a row that no longer exists and the purge
   discards them. Hide a synced trait, press its chip, and the card comes back.

   THE ASSERTION IS WHAT THE NEXT GESTURE DOES, not what a Set contains. A pick
   that survives in the data and not on the card, or the other way round, is
   still a trait that does not move when you press Move.
*/
import { test, expect } from '@playwright/test';

const seed = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null;
  activeWs = o.ws || null;
  dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  let n = 0;
  for (const nm of ['cap', 'tan']) {
    const rec = { id: 't_' + nm + '_hats_wip', kind: 'trait', name: nm, layer: 'hats',
      status: 'wip', blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: n++ };
    /* A server row, or not: recordKey is rowId || id, so this is exactly what
       decides whether the key moves when the local id does. */
    if (o.synced) { rec.rowId = 'row_' + nm; rec.synced = true; rec.path = 'p/' + nm + '.png'; }
    await dbPut(rec);
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
}, opts || {});

const quietly = (page, fn) => page.evaluate(async (src) => {
  const realToast = window.toast, realConfirm = window.confirm;
  const said = [];
  window.toast = (m) => said.push(String(m));
  window.confirm = () => true;
  try {
    await eval('(' + src + ')()');
    /* INSIDE the try, before the stub is put back. A tile button's onclick is
       async and .click() does not await it, so the handler toasts after this
       function returns - and an earlier version restored window.toast in the
       finally BEFORE waiting, which collected nothing at all. The assertion
       that the status actually changed is what caught that. */
    await new Promise(r => setTimeout(r, 900));
  }
  finally { window.toast = realToast; window.confirm = realConfirm; }
  return said;
}, fn);

const pickBoth = (page) => page.evaluate(async () => {
  shelfPick.clear();
  for (const t of (await dbAll()).filter(x => x.kind === 'trait'))
    shelfPick.add(shelfCore.recordKey(t));
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
  return shelfPick.size;
});

const where = (page) => page.evaluate(async () =>
  (await dbAll()).filter(x => x.kind === 'trait')
    .map(t => t.layer + '/' + t.name).sort());

test.describe('the pick follows the trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
  });

  test('A STATUS CHANGE DOES NOT DROP THE TILE OUT OF THE SELECTION',
    async ({ page }) => {
      expect(await pickBoth(page), 'two are picked to begin with').toBe(2);
      const said = await quietly(page, `async () => {
        document.querySelector('.item[title="cap"] .cyc').click();
      }`);
      expect(said.join(' '), 'the status really changed').toContain('cap ->');
      /* Through the gesture that suffers, not through the Set. */
      await quietly(page, `async () => { await bulkMoveToLayer('skins'); }`);
      expect(await where(page), 'both traits moved').toEqual(
        ['skins/cap', 'skins/tan']);
    });

  test('and neither does dragging one of them to another layer',
    async ({ page }) => {
      expect(await pickBoth(page)).toBe(2);
      await quietly(page, `async () => {
        const rec = (await dbAll()).find(r => r.name === 'cap');
        await commitShelfMove({ recordKey: shelfCore.recordKey(rec), toLayer: 'unsorted', beforeKey: null });
      }`);
      await quietly(page, `async () => { await bulkMoveToLayer('skins'); }`);
      expect(await where(page)).toEqual(['skins/cap', 'skins/tan']);
    });

  test('but a trait that was never picked is not picked by being moved - the control',
    async ({ page }) => {
      /* pickTransfer returns early when there is nothing at the old key. If it
         did not, moving a trait would select it, and the next Move would take
         traits nobody chose - which is worse than the defect being fixed. */
      await page.evaluate(async () => {
        shelfPick.clear();
        const cap = (await dbAll()).find(r => r.name === 'cap');
        shelfPick.add(shelfCore.recordKey(cap));
        await renderShelf();
        await new Promise(r => setTimeout(r, 200));
      });
      await quietly(page, `async () => {
        document.querySelector('.item[title="tan"] .cyc').click();
      }`);
      await quietly(page, `async () => { await bulkMoveToLayer('skins'); }`);
      expect(await where(page), 'only the picked one moved').toEqual(
        ['hats/tan', 'skins/cap']);
    });
});

test.describe('and so does the hidden set, inside a group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page, { ws: 'team7', synced: true });
  });

  test('A HIDDEN TRAIT STAYS HIDDEN WHEN ITS STATUS CHANGES', async ({ page }) => {
    /* The move is stubbed at cloudMoveOne, which is the boundary: what matters
       is that the local record comes back with a NEW rowId, exactly as a real
       upload leaves it. No server, no credentials. */
    const out = await page.evaluate(async () => {
      const cap = (await dbAll()).find(r => r.name === 'cap');
      currentShelfVisibility().hide(shelfCore.recordKey(cap));
      await renderShelf();
      await new Promise(r => setTimeout(r, 200));
      const before = currentShelfVisibility().count;
      window.cloudMoveOne = async (oldRec, newRec) => {
        /* What cloudSyncOne does on the way back: a different row. */
        await dbPut(Object.assign({}, newRec, { synced: true, rowId: 'row_cap_2' }));
        return true;
      };
      return { before };
    });
    expect(out.before, 'it really was hidden').toBe(1);
    await quietly(page, `async () => {
      /* Show hidden first, because that is how the card is reached. */
      currentShelfVisibility().setReveal(true);
      await renderShelf();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('.item[title="cap"] .cyc').click();
    }`);
    const after = await page.evaluate(async () => {
      const cap = (await dbAll()).find(r => r.name === 'cap');
      return { hidden: currentShelfVisibility().count,
        key: cap && shelfCore.recordKey(cap),
        holds: currentShelfVisibility().hiddenKeys ? [...currentShelfVisibility().hiddenKeys()] : null };
    });
    expect(after.key, 'the upload really did move the row id').toBe('row_cap_2');
    expect(after.hidden, 'and it is still hidden, under the key it has now').toBe(1);
    expect(after.holds).toContain('row_cap_2');
  });
});
