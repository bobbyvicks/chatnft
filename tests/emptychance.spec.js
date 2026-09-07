/* How often a layer is left empty was forgotten on every reload.

   `let emptyChance=0.35` was a plain variable. No settings record, absent from
   the project file, and the markup's value="35" was what a page load got.
   Every "of characters" figure in the app is scaled by it - traitChance
   multiplies by 1-emptyChance for any layer that is not always present - so it
   decides every percentage on every tile, in the sheet, in the zip message,
   and in the whole rarity plan.

   MEASURED before the fix, four eyes traits, set to 10% the way a person does:

     emptyChance 0.35   one trait read 16.3% of characters
     set to 10%         the same trait read 22.5%
     reload             back to 0.35, and 16.3% again

   The traits survived the reload; only the decision did not. So a plan made
   against 10% is read back against 35% the next morning and nothing says the
   number moved.

   THE TESTS THAT MATTER MOST are the two that check a PERCENTAGE rather than
   the setting. Storing the number and reading it back proves the record
   works; it does not prove the app uses it, and "the figure the owner will act
   on is the one they planned against" is the actual claim.
*/
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (const n of ['a', 'b', 'c', 'd'])
    await dbPut({ id: 't_' + n + '_eyes_approved', kind: 'trait', name: n,
      layer: 'eyes', status: 'approved', blob, w: 8, h: 8, at: 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
});

/* Driven through the control, not by assigning the variable - the point is
   that a person's choice survives, and a test that set emptyChance directly
   would skip the handler that has to save it. */
const setEmpty = (page, pct) => page.evaluate(async (v) => {
  const box = $('cempty');
  box.value = String(v);
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 350));
}, pct);

/* What one trait's share of CHARACTERS reads as, which is the figure this
   setting scales and the one somebody plans against. */
const share = (page) => page.evaluate(async () => {
  const items = await dbAll();
  const t = items.find(i => i.name === 'a');
  const ch = traitChance(t, items, false);
  return Math.round(ch.pct * 1000) / 10;
});

test.describe('how often a layer is left empty', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof applyEmptyChance === 'function');
    await seed(page);
  });

  test('survives a reload, and so does the percentage it decides',
    async ({ page }) => {
      /* THE DEFECT. Both halves asserted: the setting AND the figure, because
         a record that round-trips while nothing reads it would pass the first
         and leave the app exactly as broken. */
      expect(await share(page), 'four traits at 35% empty').toBe(16.3);
      await setEmpty(page, 10);
      expect(await share(page), 'and at 10%').toBe(22.5);

      await page.reload();
      await page.waitForFunction(() => typeof applyEmptyChance === 'function');
      await page.evaluate(async () => {
        try { authed = true; } catch (_) {}
        gateShow(false);
        await renderShelf();
        await new Promise(r => setTimeout(r, 250));
      });
      expect(await page.evaluate(() => emptyChance), 'the choice is still there').toBe(0.1);
      expect(await page.evaluate(() => $('cempty').value), 'and the control shows it').toBe('10');
      expect(await share(page), 'and the figure it decides is unchanged').toBe(22.5);
    });

  test('it is a settings record, next to the others', async ({ page }) => {
    await setEmpty(page, 20);
    const r = await page.evaluate(async () =>
      (await dbAll()).filter(i => i.kind === 'settings').map(i => i.id).sort());
    expect(r, 'stored where every other project decision is')
      .toContain('settings.emptychance');
  });

  test('and a value no control could produce is refused when it is read back',
    async ({ page }) => {
      /* A project file can be edited by hand, and a chance of 1 empties every
         optional layer - every trait in the project would read 0% and nothing
         would say why. Clamped on the way OUT of the store, not only on the
         way in. */
      await page.evaluate(async () => {
        await dbPut({ id: 'settings.emptychance', kind: 'settings', chance: 1, at: 1 });
        await renderShelf();
        await new Promise(r => setTimeout(r, 200));
      });
      expect(await page.evaluate(() => emptyChance), 'the impossible value is ignored')
        .toBe(0.35);
      expect(await share(page), 'so the figures are still real').toBe(16.3);
    });

  test('typing does not write a record per keystroke', async ({ page }) => {
    /* The input handler re-renders the whole shelf already; a database write
       on every keystroke of a number field would be worse. Live while you move
       it, saved when you let go. */
    const writes = await page.evaluate(async () => {
      let n = 0;
      const real = window.saveEmptyChance;
      window.saveEmptyChance = async () => { n++; return real(); };
      try {
        const box = $('cempty');
        for (const v of ['1', '15', '5']) {
          box.value = v;
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 250));
        box.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
      } finally { window.saveEmptyChance = real; }
      return n;
    });
    expect(writes, 'three keystrokes and one release is one write').toBe(1);
  });

  test('it travels in the project file', async ({ page }) => {
    await setEmpty(page, 25);
    const doc = await page.evaluate(async () => {
      let blob = null;
      const realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (b) => { blob = b; return 'blob:stub'; };
      HTMLAnchorElement.prototype.click = function () {};
      try { await exportProject(); await new Promise(r => setTimeout(r, 300)); }
      finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
      return blob ? JSON.parse(await blob.text()) : null;
    });
    expect(doc, 'something was exported').toBeTruthy();
    expect(doc.emptyChance, 'the choice is in the file').toBe(0.25);
    expect(doc.version, 'and the file says which version carries it').toBe(4);
  });

  test('and comes back out of one, without disturbing a project that has work',
    async ({ page }) => {
      /* The same guard the grid has: a file only restores a project setting
         into a project that had nothing of its own to overwrite. Importing
         somebody's file must not silently rewrite a decision you made. */
      const r = await page.evaluate(async () => {
        const file = (o) => new File([JSON.stringify(o)], 'p.json', { type: 'application/json' });
        const doc = { format: 'chatnft-project', version: 4, layers: ['eyes', 'unsorted'],
          hidden: [], grid: 160, emptyChance: 0.05, rules: [], decisions: [],
          decideOrder: [], baseColours: [], items: [] };
        /* Into a project that already holds work: the setting must be left. */
        await importProject(file(doc));
        await new Promise(r2 => setTimeout(r2, 400));
        const kept = emptyChance;
        /* And into an empty one, where there is nothing to overwrite. */
        await dbClear();
        await renderShelf();
        await importProject(file(doc));
        await new Promise(r2 => setTimeout(r2, 400));
        return { kept: kept, taken: emptyChance };
      });
      expect(r.kept, 'a project with traits keeps its own setting').toBe(0.35);
      expect(r.taken, 'an empty one takes the file\'s').toBe(0.05);
    });

  test('Clear offers to remove it, and does', async ({ page }) => {
    /* IT DID NOT, AND THIS TEST IS WHY IT DOES NOW. Clear only asks "also
       remove these?" when it has something to name, and it built that list
       from the rules, the answers, the draw order, the base colour and a grid
       that is not 160. The empty chance was not in it - so on a project where
       it is the ONLY thing changed, Clear never asked, never removed it, and
       the next import read its percentages against the leftover number.

       The question itself is asserted, not just the outcome: without it the
       removal would be happening silently, which is the opposite of what the
       question is there for. */
    await setEmpty(page, 20);
    const r = await page.evaluate(async () => {
      const asked = [];
      const realConfirm = window.confirm;
      window.confirm = (m) => { asked.push(m); return true; };
      try { await $('clearproj').onclick(); await new Promise(res => setTimeout(res, 600)); }
      finally { window.confirm = realConfirm; }
      return { asked: asked.join(' | '), left: (await dbAll()).map(i => i.id),
        now: emptyChance, field: $('cempty').value };
    });
    expect(r.asked, 'it names the setting it is about to remove')
      .toContain('20% empty chance');
    expect(r.left, 'gone with the grid and the rules')
      .not.toContain('settings.emptychance');
    expect(r.now, 'and the project is back to the default').toBe(0.35);
    expect(r.field, 'with the control showing it').toBe('35');
  });

  test('and a project still on the default is not asked about it',
    async ({ page }) => {
      /* THE CONTROL. "Always offer" would pass the test above and put a line
         in the question about a setting nobody changed - which is how a
         confirmation stops being read. */
      const asked = await page.evaluate(async () => {
        const out = [];
        const realConfirm = window.confirm;
        window.confirm = (m) => { out.push(m); return true; };
        try { await $('clearproj').onclick(); await new Promise(res => setTimeout(res, 600)); }
        finally { window.confirm = realConfirm; }
        return out.join(' | ');
      });
      expect(asked, 'nothing about an empty chance nobody moved')
        .not.toContain('empty chance');
    });
});
