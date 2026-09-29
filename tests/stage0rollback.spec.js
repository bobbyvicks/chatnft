/* E1: "Rollback: the previous page. A0 stays." The page before stage 0
   must run over a store stage 0 wrote - records carrying by, wk and lid, a
   record carrying s0Replaces, a draft with its maker, settings.attempts
   and settings.gonemarks - and still draw its shelf, pull, Save to cloud
   and open a trait from its draft. It is served from the same origin
   (page.route answers /index.html with the old file, read from git), so
   it opens the same IndexedDB. PB_ROLLBACK_SHA names the previous page if
   main moved past 4f1bc2d before shipping (Task 16 Step 4).

   Nothing reaches the network: the in-page stand-in (armStage0) answers,
   and every request to the project's host that gets past it is aborted.
   The control runs the same old page over an empty store, so an error the
   old page makes on its own is not blamed on stage 0's records.

   WHAT THE STORE HOLDS IS ASSERTED BEFORE THE OLD PAGE OPENS IT (the
   controller's audit, Finding 6): s0Stamp drops by when no uid is known,
   so without this a regression in stamping would leave the real test
   passing over a store with none of the fields it is about. */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { armStage0 } from './helpers.js';

const SHA = process.env.PB_ROLLBACK_SHA || '4f1bc2d';
const OLD = execFileSync('git', ['show', SHA + ':index.html'], { maxBuffer: 256 * 1024 * 1024 });

async function oldPageOver(page, fill) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message)));
  await page.route('https://dpracoavrcqyenfieksi.supabase.co/**', r => r.abort());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof s0Moved === 'function');
  await armStage0(page, { ws: null });
  await page.evaluate(async () => { await dbClear(); });
  let stored = null;
  if (fill) {
    await page.evaluate(fill);
    stored = await page.evaluate(async () => (await dbAll()).map(x => ({ id: x.id, kind: x.kind, by: x.by === undefined ? null : x.by,
      wk: x.wk === undefined ? null : x.wk, lid: !!x.lid, s0Replaces: x.s0Replaces || null,
      n: Array.isArray(x.entries) ? x.entries.length : Array.isArray(x.marks) ? x.marks.map(k => k.what).sort().join(',') : null })).sort((a, b) => (a.id < b.id ? -1 : 1)));
  }
  await page.evaluate(() => { localStorage.removeItem('chatnft.session'); });
  errors.length = 0;
  await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: OLD }));
  await page.reload();
  await page.waitForFunction(() => typeof cloudSyncOne === 'function');
  expect(await page.evaluate(() => typeof s0Check), 'this is the page before stage 0').toBe('undefined');
  await armStage0(page, { ws: null });
  const r = await page.evaluate(async () => {
    LAYERS = ['hats', 'skins', 'unsorted'];
    await renderShelf();
    await cloudPull({ quiet: true });
    await cloudPush();
    const all = await dbAll();
    /* And a trait opened from the draft stage 0 wrote for it, if there is one. */
    let opened = null;
    const t = all.find(x => x.id === 't_cap_hats_approved');
    if (t && all.some(x => x.id === 'autosave.t_cap_hats_approved')) {
      const ok = await openTraitRecord(t);
      opened = { ok, w: art.width, h: art.height, px: ok ? Array.from(ctx.getImageData(2, 2, 1, 1).data) : null };
    }
    return { ids: all.map(x => x.id).sort(), synced: all.filter(x => x.kind === 'trait').map(x => x.id + ':' + !!x.synced).sort(), opened };
  });
  return { r, stored, errors, unknown: await page.evaluate(() => window.__s0.unknown), log: await page.evaluate(() => window.__s0.log) };
}

test.describe('stage 0: the rollback page', () => {
  test('THE CONTROL: the page before stage 0, over an empty store, makes no error', async ({ page }) => {
    const { errors, unknown } = await oldPageOver(page, null);
    expect(errors).toEqual([]);
    expect(unknown).toEqual([]);
  });

  test('the page before stage 0 runs over a store stage 0 wrote: its shelf, a pull, Save to cloud, and a trait opened from its draft', async ({ page }) => {
    const { r, stored, errors, unknown, log } = await oldPageOver(page, async () => {
      LAYERS = ['hats', 'skins', 'unsorted'];
      const blob = new Blob([new Uint8Array(8)], { type: 'image/png' });
      await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 1, blob });
      await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved');
      await dbPut({ id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, rarity: 1, blob,
        s0Replaces: '00000000-0000-4000-8000-0000000000e1' });
      await s0Attempt({ at: Date.now(), id: 'x', lid: null, rowId: null, ident: null });
      await s0Removed({ id: 't_gone_hats_wip', kind: 'trait', name: 'gone', layer: 'hats', status: 'wip' }, 'person');
      /* A draft of the approved trait, as autosaveNow writes one: a real
         picture, newer than its trait, with its maker. */
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d'); g.fillStyle = 'rgb(0,128,255)'; g.fillRect(0, 0, 16, 16);
      const png = await new Promise(res => c.toBlob(res, 'image/png'));
      await dbPut({ id: 'autosave.t_cap_hats_approved', kind: 'autosave', traitId: 't_cap_hats_approved', name: 'cap.png', w: 16, h: 16,
        blob: png, at: Date.now() + 60000 }, 'person', 'u1');
    });
    expect(stored, 'what stage 0 wrote, before the old page opens it').toEqual([
      { id: 'autosave.t_cap_hats_approved', kind: 'autosave', by: 'u1', wk: 'person', lid: false, s0Replaces: null, n: null },
      { id: 'settings.attempts', kind: 'settings', by: null, wk: null, lid: false, s0Replaces: null, n: 1 },
      /* The status change renamed t_cap_hats_wip, which Task 13 marks as a move. */
      { id: 'settings.gonemarks', kind: 'settings', by: null, wk: null, lid: false, s0Replaces: null, n: 'moved,removed' },
      { id: 't_cap_hats_approved', kind: 'trait', by: 'u1', wk: 'person', lid: true, s0Replaces: null, n: null },
      { id: 't_hat_hats_wip', kind: 'trait', by: 'u1', wk: 'person', lid: true, s0Replaces: '00000000-0000-4000-8000-0000000000e1', n: null },
    ]);
    expect(errors, 'the old page threw nothing over stage 0\'s records').toEqual([]);
    expect(unknown).toEqual([]);
    expect(r.ids).toEqual(expect.arrayContaining(['settings.attempts', 'settings.gonemarks', 't_cap_hats_approved', 't_hat_hats_wip']));
    expect(r.synced, 'Save to cloud sent both').toEqual(['t_cap_hats_approved:true', 't_hat_hats_wip:true']);
    expect(log.filter(l => l.startsWith('POST /rest/v1/traits')).length).toBe(2);
    expect(r.opened, 'the old page opened the trait from stage 0\'s draft').toEqual({ ok: true, w: 16, h: 16, px: [0, 128, 255, 255] });
  });
});
