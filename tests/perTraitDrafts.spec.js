/* A draft per trait, instead of one slot for the whole project.

   Autosave wrote a single record, autosave.working. Opening a second trait
   replaced it, so the first trait's unsaved work was gone and nothing said so.
   Fine while the app is "open a picture, edit it, save it"; fatal for a
   317-trait review pass, where moving between traits IS the gesture.

   THE TEST THAT MATTERS IS THE FIRST ONE: edit A, open B without saving, come
   back to A, and A's strokes are still there. Everything else here exists to
   stop that one being true by accident or at the cost of something worse.

   TWO RACES ARE PINNED, and neither is theoretical:

   The autosave debounce is 1.5s. Opening the next trait inside that window
   used to land the timer with the NEW trait open and the OLD pixels still on
   the canvas - filing one trait's work under another trait's name. Opening
   flushes first, and the destination key is captured before toBlob rather than
   read after it.

   And "Use the saved version" re-opens without flushing, because the canvas it
   is discarding IS the draft: flushing would write it straight back under the
   key just deleted.
*/
import { test, expect } from '@playwright/test';

/* Two saved traits with distinct, recognisable pixels. Greyscale so nothing in
   the open path reads them as a base render and cleans them away. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const make = async (v) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  for (const [n, v] of [['Alpha', 90], ['Beta', 150]])
    await dbPut({ id: 't_' + n + '_eyes_approved', kind: 'trait', name: n,
      layer: 'eyes', status: 'approved', blob: await make(v),
      w: 16, h: 16, at: 1000 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

const openByName = (page, name, opts) => page.evaluate(async (o) => {
  const rec = (await dbAll()).find(r => r.kind === 'trait' && r.name === o.name);
  await openTraitRecord(rec, o.opts);
  await new Promise(r => setTimeout(r, 150));
}, { name, opts });

/* Paints a recognisable mark and pushes it onto the undo stack the way a real
   stroke does - autosave only keeps a draft for a trait that was edited. */
const paint = (page, rgb) => page.evaluate(async (c) => {
  snapshot();
  ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
  ctx.fillRect(0, 0, 4, 4);
  await autosaveNow();
}, rgb);

/* The colour at 0,0 of whatever is on the editor canvas now. */
const corner = (page) => page.evaluate(() =>
  ctx.getImageData(0, 0, 1, 1).data[0]);

const drafts = (page) => page.evaluate(async () =>
  (await dbAll()).filter(r => r.kind === 'autosave')
    .map(r => r.id + (r.traitId ? '' : ' (working)')).sort());

test.describe('every trait keeps its own draft', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function');
    await seed(page);
  });

  test('EDITING A, OPENING B AND COMING BACK KEEPS A', async ({ page }) => {
    /* The whole point. One slot meant B's open destroyed A's unsaved work. */
    await openByName(page, 'Alpha');
    await paint(page, 20);
    await openByName(page, 'Beta');
    expect(await corner(page), 'B opened as itself, not as A').toBe(150);
    await openByName(page, 'Alpha');
    expect(await corner(page), "A's unsaved stroke survived").toBe(20);
  });

  test('and both drafts exist side by side', async ({ page }) => {
    await openByName(page, 'Alpha');
    await paint(page, 20);
    await openByName(page, 'Beta');
    await paint(page, 200);
    expect(await drafts(page)).toEqual([
      'autosave.t_Alpha_eyes_approved', 'autosave.t_Beta_eyes_approved']);
  });

  test('and it says the canvas is a draft, not the saved trait',
    async ({ page }) => {
      /* Restoring silently would be the worse half of honest: the canvas would
         not match the shelf and nothing would explain why. */
      await openByName(page, 'Alpha');
      await paint(page, 20);
      await openByName(page, 'Beta');
      await openByName(page, 'Alpha');
      const bar = await page.evaluate(() => ({
        shown: !document.getElementById('draftbar').hidden,
        text: document.getElementById('drafttext').textContent,
      }));
      expect(bar.shown).toBe(true);
      expect(bar.text).toContain('not saved yet');
    });

  test('and Use the saved version really goes back', async ({ page }) => {
    await openByName(page, 'Alpha');
    await paint(page, 20);
    await openByName(page, 'Beta');
    await openByName(page, 'Alpha');
    expect(await corner(page), 'the draft first').toBe(20);
    await page.click('#draftdiscard');
    await page.waitForTimeout(400);
    expect(await corner(page), 'and now the saved pixels').toBe(90);
    expect(await drafts(page), 'the draft is gone, not merely hidden').toEqual([]);
  });

  test('AND DISCARDING DOES NOT WRITE THE DRAFT BACK', async ({ page }) => {
    /* THE SECOND RACE. Re-opening through the flushing path would autosave the
       canvas being discarded - which is the draft - straight back under the
       key just deleted, and the next open would offer it again. */
    await openByName(page, 'Alpha');
    await paint(page, 20);
    await openByName(page, 'Beta');
    await openByName(page, 'Alpha');
    await page.click('#draftdiscard');
    await page.waitForTimeout(400);
    await openByName(page, 'Beta');
    await openByName(page, 'Alpha');
    expect(await corner(page), 'still the saved version').toBe(90);
    expect(await page.evaluate(() =>
      document.getElementById('draftbar').hidden), 'and no bar').toBe(true);
  });

  test('a trait opened and closed without a stroke leaves no draft',
    async ({ page }) => {
      /* Without this every open would leave a draft identical to the record,
         and the next open would announce unsaved changes that do not exist -
         317 false alarms in one pass. */
      await openByName(page, 'Alpha');
      await page.evaluate(async () => { await autosaveNow(); });
      expect(await drafts(page)).toEqual([]);
    });

  test('and saving clears the draft it just made permanent', async ({ page }) => {
    await openByName(page, 'Alpha');
    await paint(page, 20);
    await page.evaluate(async () => { await saveTrait(); });
    await page.waitForTimeout(400);
    expect(await drafts(page), 'nothing left to offer').toEqual([]);
    await openByName(page, 'Beta');
    await openByName(page, 'Alpha');
    expect(await corner(page), 'and the stroke is in the saved trait now').toBe(20);
    expect(await page.evaluate(() =>
      document.getElementById('draftbar').hidden),
    'so there is nothing unsaved to announce').toBe(true);
  });

  test('a draft older than the trait is not offered', async ({ page }) => {
    /* A leftover from before the last save is not unsaved work. */
    await page.evaluate(async () => {
      const rec = (await dbAll()).find(r => r.name === 'Alpha');
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d'); g.fillStyle = 'rgb(5,5,5)'; g.fillRect(0, 0, 16, 16);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await dbPut({ id: 'autosave.' + rec.id, kind: 'autosave', traitId: rec.id,
        name: 'Alpha', w: 16, h: 16, blob, at: 500 });   // older than at:1000
    });
    await openByName(page, 'Alpha');
    expect(await corner(page), 'the saved trait, not the stale draft').toBe(90);
  });

  test('and clearing the project takes the drafts with the traits',
    async ({ page }) => {
      /* A draft naming a trait that no longer exists can never be opened and
         would still be offered. */
      await openByName(page, 'Alpha');
      await paint(page, 20);
      expect((await drafts(page)).length).toBe(1);
      await page.evaluate(async () => {
        for (const rec of await dbAll())
          if (rec.kind === 'trait' || rec.kind === 'ref') await dbDel(rec.id);
          else if (rec.kind === 'autosave' && rec.traitId) await dbDel(rec.id);
      });
      expect(await drafts(page)).toEqual([]);
    });

  test('the unattached canvas still uses the working slot', async ({ page }) => {
    /* An imported PNG that is not a saved trait keeps the single key it always
       used, so nothing needed migrating and the boot restore bar still finds
       what it always found. */
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      const g = c.getContext('2d'); g.fillStyle = '#404040'; g.fillRect(0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8);
      fileName = 'imported.png';
      startEditor(d.data, 8, 8, 8, 8, palette(d.data, 64, 24, 64), false);
      await autosaveNow();
    });
    expect(await drafts(page)).toEqual(['autosave.working (working)']);
  });
});
