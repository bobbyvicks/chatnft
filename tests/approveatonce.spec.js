/* A COLLECTION CAN BE APPROVED AT ONCE, AND THE WIP RULE IS SAID ONCE.

   An imported collection arrives as wip, wip is left out of the collection
   unless "include wip" is ticked, the tick reset on every load, every tile
   carried the reason in red, and approving took a chip press a trait. RUN
   AGAINST THE PAGE BEFORE THE FIX: the first three went red - no Set
   status on the pick bar, twenty reasons on twenty tiles, and the tick
   forgotten on reload; the fifth with no button to press. The fourth is
   the control that a reason other than the wip rule still says itself on
   its tile. The fifth holds Set status to the chip's refusal: a trait
   whose approved copy already exists is named and left alone. */
import { test, expect } from '@playwright/test';

const seed = (page, extra) => page.evaluate(async (extra) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  try { localStorage.removeItem('pb.cwip.' + wsDbName()); } catch (_) {}
  $('cwip').checked = false;
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < 20; i++) await dbPut({ id: 't_h' + i + '_hats_wip', kind: 'trait', name: 'h' + i, layer: 'hats',
    status: 'wip', blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1, shelfOrder: i });
  if (extra === 'rejected') await dbPut({ id: 't_bad_hats_rejected', kind: 'trait', name: 'bad', layer: 'hats',
    status: 'rejected', blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 20 });
  if (extra === 'clash') await dbPut({ id: 't_h3_hats_approved', kind: 'trait', name: 'h3', layer: 'hats',
    status: 'approved', blob: new Blob([new Uint8Array(9)]), w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 21 });
  try { showPage('project', false); } catch (_) {}
  await renderShelf();
}, extra || null);

test.describe('approving a collection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
  });

  test('PICK ALL SHOWN, SET STATUS approved, and all twenty are approved', async ({ page }) => {
    await seed(page);
    const r = await page.evaluate(async () => {
      $('shelfpickall').onclick();
      const go = document.getElementById('shelfpickstatusgo');
      if (!go) return { button: false };
      $('shelfpickstatus').value = 'approved';
      const t = window.toast; const said = []; window.toast = (x) => said.push(String(x));
      try { await go.onclick(); } finally { window.toast = t; }
      const all = (await dbAll()).filter(i => i.kind === 'trait');
      return { button: true, approved: all.filter(i => i.status === 'approved').length, total: all.length,
        whynot: document.querySelectorAll('#projbody .whynot').length, said: said.join(' | ') };
    });
    expect(r.button, 'the pick bar can set a status').toBe(true);
    expect(r.approved).toBe(20);
    expect(r.total, 'moved, not copied').toBe(20);
    expect(r.whynot).toBe(0);
    expect(r.said).toContain('20 set to approved');
  });

  test('TWENTY WIP TRAITS carry no reason each; it is said once above the shelf', async ({ page }) => {
    await seed(page);
    const r = await page.evaluate(() => ({
      whynot: document.querySelectorAll('#projbody .whynot').length,
      never: document.querySelectorAll('#projbody .pct.never').length,
      note: document.getElementById('wipnote') && !document.getElementById('wipnote').hidden
        ? document.getElementById('wipnotetext').textContent : null,
    }));
    expect(r.never, 'still never drawn, and still says so').toBe(20);
    expect(r.whynot, 'but not twenty times').toBe(0);
    expect(r.note).toContain('20 traits are wip');
  });

  test('INCLUDE WIP is remembered for the project across a reload', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => { const b = $('wipnoteinclude') || $('cwip'); if (b.id === 'cwip') { b.checked = true; b.onchange(); } else b.onclick(); });
    await page.reload();
    await page.waitForFunction(() => typeof renderShelf === 'function');
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      await renderShelf();
      return { ticked: $('cwip').checked, never: document.querySelectorAll('#projbody .pct.never').length };
    });
    expect(r.ticked).toBe(true);
    expect(r.never).toBe(0);
  });

  test('the control: a rejected trait still says why on its own tile', async ({ page }) => {
    await seed(page, 'rejected');
    const r = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#projbody .item')].find(e => (e.querySelector('b') || {}).textContent === 'bad');
      const w = el && el.querySelector('.whynot');
      return w ? w.textContent : null;
    });
    expect(r).toContain('Rejected');
  });

  test('SET STATUS REFUSES what the chip refuses: a trait whose approved copy exists is named and left alone', async ({ page }) => {
    await seed(page, 'clash');
    const r = await page.evaluate(async () => {
      for (const el of document.querySelectorAll('#projbody [data-shelf-card-key]'))
        if (/^h\d+$/.test((el.querySelector('b') || {}).textContent || '') && el.querySelector('.cyc').textContent === 'wip')
          shelfPick.add(el.dataset.shelfCardKey);
      shelfPickPaint();
      const go = document.getElementById('shelfpickstatusgo');
      if (!go) return { button: false };
      $('shelfpickstatus').value = 'approved';
      const t = window.toast; const said = []; window.toast = (x) => said.push(String(x));
      try { await go.onclick(); } finally { window.toast = t; }
      const all = (await dbAll()).filter(i => i.kind === 'trait');
      return { button: true, said: said.join(' | '), h3: all.filter(i => i.name === 'h3').map(i => i.status + ':' + i.blob.size).sort() };
    });
    expect(r.button).toBe(true);
    expect(r.said).toContain('19 set to approved');
    expect(r.said).toContain('h3');
    expect(r.h3, 'both copies kept, neither written over').toEqual(['approved:9', 'wip:8']);
  });
});
