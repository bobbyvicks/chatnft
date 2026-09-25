/* THE FINAL PROJECT KEEPS BOTH, AND THE ADD TILES HAVE THE FIX BUTTON.

   Asked for: "allow me to put duplicate nemed things in the STFP so i can
   compare and chose from the 2 traits", and "i want the fix button to be
   available to press from the "add from" traits so i can work on the traits
   i want to add directly". A trait arriving in the final project beside one
   of the same name and layer is kept as "Name (2)", by every gesture that
   can put it there; its rules go with it; every other status still refuses.
   RUN AGAINST THE PAGE BEFORE THE FIX: every test not named a control went
   red. The controls - another status still refuses a clash, and a trait
   with no namesake keeps its name - held before and after. */
import { test, expect } from '@playwright/test';

const seed = (page, recs) => page.evaluate(async (recs) => {
  try { authed = true; } catch (_) {}
  gateShow(false); activeWs = null; await dbClear();
  LAYERS = ['hair', 'hats', 'unsorted'];
  RULES = []; DECISIONS = [];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  let n = 0;
  for (const r of recs) await dbPut(Object.assign({ kind: 'trait', blob, w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 1024 * (++n) },
    r, { id: 't_' + r.name + '_' + r.layer + '_' + r.status }));
  window.said = []; window.toast = (m) => window.said.push(String(m));
  window.fixed = [];
  fixFromRecords = async (rs) => { window.fixed.push(...rs.map(x => x.id)); return true; };
}, recs);
const ids = (page) => page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id).sort());
const NAVY = [{ name: 'Navy', layer: 'hair', status: 'stfp' }, { name: 'Navy', layer: 'hair', status: 'approved' }];
const CAP = [{ name: 'Cap', layer: 'hats', status: 'stfp' }, { name: 'Cap', layer: 'unsorted', status: 'stfp' }];

test.describe('two of one name in the final project', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setTraitStatus === 'function' && typeof renderFinal === 'function');
  });

  test('A STATUS CHANGE INTO THE FINAL PROJECT beside one of the same name keeps both, as "Name (2)"', async ({ page }) => {
    await seed(page, NAVY);
    const r = await page.evaluate(async () => {
      const r = await setTraitStatus(await dbGet('t_Navy_hair_approved'), 'stfp');
      return { ok: !!r.ok, clash: !!r.clash, renamed: r.renamed || null };
    });
    expect(r).toEqual({ ok: true, clash: false, renamed: 'Navy (2)' });
    expect(await ids(page)).toEqual(['t_Navy (2)_hair_stfp', 't_Navy_hair_stfp']);
  });

  test('AND A THIRD IS "Name (3)"', async ({ page }) => {
    await seed(page, [...NAVY, { name: 'Navy (2)', layer: 'hair', status: 'stfp' }]);
    const r = await page.evaluate(async () => (await setTraitStatus(await dbGet('t_Navy_hair_approved'), 'stfp')).renamed || null);
    expect(r).toBe('Navy (3)');
  });

  test('THE FINAL PAGE\'S ADD says which one is which', async ({ page }) => {
    await seed(page, NAVY);
    const said = await page.evaluate(async () => { await finalMove(await dbGet('t_Navy_hair_approved'), 'stfp'); return window.said.join(' | '); });
    expect(said).toContain('both are kept and this one is Navy (2)');
    expect(await ids(page)).toEqual(['t_Navy (2)_hair_stfp', 't_Navy_hair_stfp']);
  });

  test('THE SHELF\'S STATUS CHIP keeps both too', async ({ page }) => {
    await seed(page, NAVY);
    await page.evaluate(async () => { showPage('project', false); await renderShelf(); });
    const tile = page.locator('#projbody .item[data-shelf-card-key="t_Navy_hair_approved"]');
    await tile.scrollIntoViewIfNeeded();
    await tile.locator('button.cyc').click();
    await page.waitForFunction(() => window.said.length > 0);
    expect(await page.evaluate(() => window.said.join(' | '))).toContain('both are kept');
    expect(await ids(page)).toEqual(['t_Navy (2)_hair_stfp', 't_Navy_hair_stfp']);
  });

  test('A LAYER MOVE into a final-project layer that has one of the name keeps both', async ({ page }) => {
    await seed(page, CAP);
    const r = await page.evaluate(async () => {
      const ok = await commitShelfMove({ recordKey: 't_Cap_unsorted_stfp', toLayer: 'hats', beforeKey: null });
      return { ok, said: window.said.join(' | ') };
    });
    expect(r.ok).toBe(true);
    expect(r.said).toContain('both are kept and this one is Cap (2)');
    expect(await ids(page)).toEqual(['t_Cap (2)_hats_stfp', 't_Cap_hats_stfp']);
  });

  test('THE BULK LAYER MOVE keeps both', async ({ page }) => {
    await seed(page, CAP);
    const said = await page.evaluate(async () => {
      shelfPick = new Set(['t_Cap_unsorted_stfp']);
      await bulkMoveToLayer('hats');
      return window.said.join(' | ');
    });
    expect(said).toContain('kept beside one of the same name: Cap (2)');
    expect(await ids(page)).toEqual(['t_Cap (2)_hats_stfp', 't_Cap_hats_stfp']);
  });

  test('A SAVE FROM THE EDITOR into the final project keeps both, and the name field says so', async ({ page }) => {
    await seed(page, [{ name: 'Cap', layer: 'hats', status: 'stfp' }, { name: 'Cap', layer: 'unsorted', status: 'approved' }]);
    const r = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_Cap_unsorted_approved'));
      const sel = $('tlayer');
      if (![...sel.options].some(o => o.value === 'hats')) { const o = document.createElement('option'); o.value = o.textContent = 'hats'; sel.appendChild(o); }
      sel.value = 'hats';
      setChip('tstatus', 'stfp');
      const ok = await saveTraitNow();
      return { ok, name: $('tname').value, said: window.said.join(' | ') };
    });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Cap (2)');
    expect(r.said).toContain('both are kept');
    expect(await ids(page)).toEqual(['t_Cap (2)_hats_stfp', 't_Cap_hats_stfp']);
  });

  test('THE RULES GO WITH IT: the copy is never-together with what the original is', async ({ page }) => {
    await seed(page, [...NAVY, { name: 'Crown', layer: 'hats', status: 'stfp' }]);
    const r = await page.evaluate(async () => {
      RULES = [ruleGroup(['hair/Navy', 'hats/Crown'])];
      DECISIONS = [{ a: 'hair/Navy', b: 'hats/Crown', ok: false, at: 1 }];
      await setTraitStatus(await dbGet('t_Navy_hair_approved'), 'stfp');
      return { rules: RULES.map(g => g.slice().sort()), answers: DECISIONS.map(d => [d.a, d.b].sort().join(' + ') + (d.ok ? ' yes' : ' no')).sort() };
    });
    expect(r.rules.some(g => g.includes('hair/Navy (2)') && g.includes('hats/Crown')), JSON.stringify(r.rules)).toBe(true);
    expect(r.rules.some(g => g.includes('hair/Navy') && g.includes('hats/Crown')), 'and the original keeps its own').toBe(true);
    expect(r.answers).toContain('hair/Navy (2) + hats/Crown no');
  });

  test('the control: every other status still refuses a clash', async ({ page }) => {
    await seed(page, [{ name: 'Navy', layer: 'hair', status: 'approved' }, { name: 'Navy', layer: 'hair', status: 'wip' }]);
    const r = await page.evaluate(async () => {
      const r = await setTraitStatus(await dbGet('t_Navy_hair_wip'), 'approved');
      return { ok: !!r.ok, clash: !!r.clash };
    });
    expect(r).toEqual({ ok: false, clash: true });
    expect(await ids(page)).toEqual(['t_Navy_hair_approved', 't_Navy_hair_wip']);
  });

  test('the control: a trait with no namesake in the final project keeps its name', async ({ page }) => {
    await seed(page, [{ name: 'Navy', layer: 'hair', status: 'approved' }]);
    const r = await page.evaluate(async () => (await setTraitStatus(await dbGet('t_Navy_hair_approved'), 'stfp')).renamed || null);
    expect(r).toBe(null);
    expect(await ids(page)).toEqual(['t_Navy_hair_stfp']);
  });
});

test.describe('the add-from traits on the final page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function' && typeof openTraitRecord === 'function');
    await seed(page, [{ name: 'crown', layer: 'hats', status: 'stfp' }, { name: 'cap', layer: 'hats', status: 'approved' }]);
    await page.evaluate(async () => {
      window.opens = [];
      const real = openTraitRecord;
      openTraitRecord = async (t, o) => { window.opens.push(t.id); return real(t, o); };
      showPage('final', false); await renderFinal();
      const d = [...document.querySelectorAll('#finallayers details')].find(x => x.querySelector('summary').textContent.includes('hats'));
      d.open = true; d.dispatchEvent(new Event('toggle'));
      await new Promise(r => setTimeout(r, 300));
    });
  });
  const addTile = (page) => page.locator('#finallayers details .item', { has: page.locator('b', { hasText: /^cap$/ }) }).first();

  test('AN ADD-FROM TRAIT HAS THE FIX BUTTON, and it sends that trait to Fix pixels', async ({ page }) => {
    const tile = addTile(page);
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const fx = tile.locator('button.fx');
    expect(await fx.count()).toBe(1);
    await fx.click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.fixed)).toEqual(['t_cap_hats_approved']);
  });

  test('AND A DOUBLE-CLICK ON IT opens it in the editor', async ({ page }) => {
    const tile = addTile(page);
    await tile.scrollIntoViewIfNeeded();
    await tile.locator('canvas').first().dblclick();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.opens)).toEqual(['t_cap_hats_approved']);
  });
});
