/* Every size check in the app skipped the one image that is in every picture.

   sizeCensus is the shared answer to "is this collection one size", and it
   opened with `if(!t||t.kind!=="trait") continue;`. The base character is kind
   "ref". It is painted UNDER every generated character, it is in every combo,
   and it is named in every metadata file as trait_type "base".

   MEASURED. A collection whose grid is 160, two traits at 160x160 and a base
   at 200x200:

     the base is in the combo   ref:hero@200x200, trait:tan@160x160
     sizeCensus over all four   oddCount 0, detail ""
     the shelf said             "2 traits"        no warning
     the exported PNGs          200x200

   The whole collection ships at the base's size with every trait scaled to
   fit, and all three places that report mixed sizes say nothing - including
   the one that is on screen whenever the shelf is, which exists so that "a set
   holding two canvas sizes cannot be minted" is visible without thinking to
   open anything.

   THE CONTROLS ARE ABOUT WHAT MUST NOT START BEING COUNTED. A census that
   simply stopped filtering would count the settings records, which have no
   canvas, read as 0x0, and would put a permanent false warning on every
   project - a worse defect than the silence it replaced.
*/
import { test, expect } from '@playwright/test';

/* A project at grid 160 with two 160x160 traits and a base of the given size.
   Real PNGs, because the generator decodes them. */
const project = (page, baseSize) => page.evaluate(async (size) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  projectGrid = 160;
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'unsorted'], hidden: [] });
  await dbPut({ id: 'settings.grid', kind: 'settings', cells: 160, at: 1 });
  const mk = async (w, h, rgb) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = rgb; g.fillRect(0, 0, w, h);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  };
  if (size) {
    await dbPut({ id: 'ref_hero', kind: 'ref', name: 'hero',
      blob: await mk(size, size, '#204060'), w: size, h: size, at: 1 });
  }
  for (const n of ['tan', 'pale']) {
    await dbPut({ id: 't_' + n + '_skins_approved', kind: 'trait', name: n, layer: 'skins',
      status: 'approved', blob: await mk(160, 160, '#c08040'), w: 160, h: 160,
      rarity: 1, at: 1 });
  }
  await renderShelf();
  await new Promise(r => setTimeout(r, 700));
  return {
    count: document.getElementById('projcount').textContent.trim(),
    title: document.getElementById('projcount').title,
  };
}, baseSize);

test.describe('the base character counts towards one canvas size', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof sizeCensus === 'function');
  });

  test('an off-size base is counted on the shelf and named', async ({ page }) => {
    const r = await project(page, 200);
    expect(r.count, 'the count still counts traits').toContain('2 traits');
    expect(r.count, 'and the size warning is beside it').toContain('1 not 160');
    expect(r.title, 'naming the base, not a trait').toContain('hero');
    expect(r.title, 'with its size').toContain('200');
  });

  test('and a base that agrees says nothing', async ({ page }) => {
    // A CONTROL. A warning that always fires stops being read.
    const r = await project(page, 160);
    expect(r.count).toBe('2 traits');
    expect(r.title, 'no tooltip at all').toBe('');
  });

  test('a settings record is never counted', async ({ page }) => {
    /* A CONTROL, and the one that would be worst to get wrong. A census that
       simply stopped filtering would see settings.layers with no w or h, read
       it as 0x0, and put a permanent warning on every project ever opened. */
    const r = await page.evaluate(() => {
      const store = [
        { kind: 'trait', name: 'tan', w: 160, h: 160 },
        { kind: 'ref', name: 'hero', w: 200, h: 200 },
        { kind: 'settings', id: 'settings.layers', name: 'settings.layers' },
        { id: 'autosave.working' },
      ];
      projectGrid = 160;
      const c = sizeCensus(store);
      return { oddCount: c.oddCount, detail: c.detail };
    });
    expect(r.oddCount, 'the base and nothing else').toBe(1);
    expect(r.detail).toContain('hero');
    expect(r.detail, 'no settings record').not.toContain('settings');
  });

  test('an off-size trait is still named, with the base agreeing', async ({ page }) => {
    // The behaviour that already worked, pinned so that widening the census
    // cannot have narrowed it.
    const r = await page.evaluate(() => {
      projectGrid = 160;
      const c = sizeCensus([
        { kind: 'trait', name: 'tan', w: 48, h: 48 },
        { kind: 'ref', name: 'hero', w: 160, h: 160 }]);
      return { oddCount: c.oddCount, detail: c.detail };
    });
    expect(r.oddCount).toBe(1);
    expect(r.detail).toContain('tan');
    expect(r.detail, 'the base agrees and is not named').not.toContain('hero');
  });

  test('Download all says it too', async ({ page }) => {
    await project(page, 200);
    const said = await page.evaluate(async () => {
      const realZip = zip, realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click, realToast = window.toast;
      const out = [];
      zip = () => new Blob([]);
      URL.createObjectURL = () => 'blob:stub';
      HTMLAnchorElement.prototype.click = function () {};
      window.toast = (m) => { out.push(m); };
      try { await document.getElementById('dlzip').onclick(); await new Promise(r => setTimeout(r, 300)); }
      finally { zip = realZip; URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick; window.toast = realToast; }
      return out.join(' | ');
    });
    expect(said, 'the base is in the zip and its size is wrong').toContain('not 160');
    expect(said).toContain('hero');
  });

  test('and so does the sheet, which is the last look before a mint', async ({ page }) => {
    await project(page, 200);
    const note = await page.evaluate(async () => {
      await drawSheet(2);
      await new Promise(r => setTimeout(r, 500));
      return document.getElementById('cnote').textContent;
    });
    expect(note, 'the sheet reports the mismatch').toContain('Not all the same size');
    expect(note, 'naming the base').toContain('hero');
  });

  test('no message calls the base a trait', async ({ page }) => {
    /* The wording was true of what the check LOOKED at and false of what it is
       for. Both places that said it are checked, because the first draft of
       the fix changed one of them. */
    await project(page, 200);
    const r = await page.evaluate(async () => {
      await drawSheet(2);
      await new Promise(r => setTimeout(r, 400));
      const sheet = document.getElementById('cnote').textContent;
      /* And the character preview, which has always counted the base because
         cChosen includes the base row - so it was reporting an off-size base
         while calling it a trait. */
      await drawCompose();
      await new Promise(r => setTimeout(r, 200));
      return { sheet, tip: document.getElementById('projcount').title };
    });
    expect(r.sheet).not.toContain('Traits that layer have to share');
    expect(r.tip).not.toContain('every trait in a collection has to share');
    expect(r.tip).toContain('everything drawn into a character');
  });
});
