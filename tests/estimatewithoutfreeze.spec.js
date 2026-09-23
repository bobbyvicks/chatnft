/* THE SHARE ESTIMATE NEVER FREEZES THE PAGE.

   With a Never-together rule the shelf's percentages come from 20,000
   drawn characters, and that ran as one task at the end of every render
   whose inputs had changed: 2.0-2.9 s on the real collection on every
   open and after every weight edit, and about ten seconds on a phone.

   The fixture is the real one: the 271 trait names of strict-fit-v7 and
   its rules file, imported through the button a person uses (176 rules
   here), each trait a real 16-pixel PNG. Long tasks are observed from the
   first script of the page. RUN AGAINST THE PAGE BEFORE THE FIX, the first
   five went red: a single task of about 1.5 s on opening, the figures
   still being counted after the render on a reopen, three full estimates
   for three quick edits, the old decide order's figures after the order
   changed, and a 1.5 s task in Generate set's report. Long-task entries
   arrive after their task, so each reading waits for them. The last
   is the control that the figures are exactly what one uninterrupted
   estimate gives, and that the rules move them. */
import { test, expect } from '@playwright/test';
import fs from 'fs';

const COL = JSON.parse(fs.readFileSync('rules/strict-fit-v7-collection.json', 'utf8'));

const watchLongTasks = (page, forget) => page.addInitScript((forget) => {
  window.__long = [];
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); })
      .observe({ type: 'longtask', buffered: true });
  } catch (_) {}
  /* A first open on this device: nothing worked out here before. */
  if (forget) for (const k of Object.keys(localStorage)) if (k.indexOf('pb.dist.') === 0) localStorage.removeItem(k);
}, forget);

/* The collection, then its rules through the import button. */
const seed = async (page, statusOf) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planRuleImport === 'function');
  await page.evaluate(async ({ col, statusOf }) => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    activeWs = null; dbp = null; dbpName = null;
    await dbClear();
    await dbPut({ id: 'settings.layers', kind: 'settings', layers: col.order.concat(['unsorted']), hidden: [], at: 1 });
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#c08040'; g.fillRect(2, 2, 12, 12);
    const png = await new Promise(r => c.toBlob(r, 'image/png'));
    const recs = [];
    for (const l of col.order) for (const f of col.names[l]) {
      const name = f.replace(/\.png$/i, '');
      const status = (statusOf && statusOf[l]) || 'approved';
      recs.push({ id: 't_' + name + '_' + l + '_' + status, kind: 'trait', name, layer: l, status,
        blob: png, w: 16, h: 16, rarity: 1 + (recs.length % 5), at: 1 });
    }
    await dbApplyShelfRecords([], recs);
    await renderShelf();
  }, { col: COL, statusOf: statusOf || null });
  await page.setInputFiles('#rulefile', { name: 'strict-fit-v7-collection.json', mimeType: 'application/json',
    buffer: fs.readFileSync('rules/strict-fit-v7-collection.json') });
  await page.waitForFunction(() => {
    const n = document.getElementById('ruleimportnote');
    return n && !n.hidden && n.textContent && n.textContent.indexOf('Reading') !== 0;
  }, null, { timeout: 30000 });
  expect(await page.evaluate(() => RULES.length), 'the rules came in').toBeGreaterThan(100);
};

const settled = (page) => page.waitForFunction(() => {
  const p = [...document.querySelectorAll('#projbody .item .pct')];
  return p.length > 200 && !p.some(e => (e.title || '').indexOf('still being counted') >= 0);
}, null, { timeout: 20000 });

const reopen = async (page) => {
  await page.reload();
  await page.waitForFunction(() => typeof renderShelf === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); });
};

/* Every draw the estimate makes goes through randomCombo. */
const countDraws = (page) => page.evaluate(() => {
  window.__draws = 0;
  const real = randomCombo;
  randomCombo = (p) => { window.__draws++; return real(p); };
});

test.describe('the share estimate never freezes the page', () => {
  test.setTimeout(120000);

  test('THE FIRST OPEN ON A DEVICE never holds the page for more than 200 ms, and every figure settles', async ({ page }) => {
    await seed(page);
    await watchLongTasks(page, true);
    await reopen(page);
    await page.evaluate(() => renderShelf());
    await settled(page);
    await page.waitForTimeout(800);
    const long = await page.evaluate(() => window.__long.slice());
    console.log('long tasks on opening: ' + JSON.stringify(long));
    expect(Math.max(0, ...long), 'the longest task on opening').toBeLessThan(200);
  });

  test('AN UNCHANGED COLLECTION reopens with its figures already there, drawing nothing', async ({ page }) => {
    await seed(page);
    await settled(page);
    await reopen(page);
    await countDraws(page);
    const r = await page.evaluate(async () => {
      await renderShelf();
      const p = [...document.querySelectorAll('#projbody .item .pct')];
      return { tiles: p.length, counting: p.filter(e => (e.title || '').indexOf('still being counted') >= 0).length,
        estimated: p.filter(e => (e.textContent || '').indexOf('~') === 0).length };
    });
    await page.waitForTimeout(1500);
    const draws = await page.evaluate(() => window.__draws);
    expect(r.tiles).toBeGreaterThan(200);
    expect(r.estimated, 'the figures are estimates, so this is the rules path').toBe(r.tiles);
    expect(r.counting, 'none is still being counted when the shelf is drawn').toBe(0);
    expect(draws, 'and nothing was drawn to get them').toBe(0);
  });

  test('THREE QUICK WEIGHT EDITS cost one estimate, not three, and never hold the page', async ({ page }) => {
    await watchLongTasks(page, false);
    await seed(page);
    await settled(page);
    await countDraws(page);
    await page.evaluate(async () => {
      window.__long.length = 0;
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      for (const [n, w] of [[0, 7], [1, 8], [2, 9]]) {
        await setRarity(items[n], w);
        await renderShelf();
        await new Promise(r => setTimeout(r, 100));
      }
    });
    await settled(page);
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ draws: window.__draws, long: window.__long.slice() }));
    console.log('three edits: ' + r.draws + ' draws, long tasks ' + JSON.stringify(r.long));
    expect(r.draws, 'one full estimate is 20,000 draws').toBeLessThan(30000);
    expect(r.draws, 'and it did make one').toBeGreaterThanOrEqual(20000);
    expect(Math.max(0, ...r.long), 'the longest task after the edits').toBeLessThan(200);
  });

  test('THE DECIDE ORDER is part of the estimate, so changing it changes the figures', async ({ page }) => {
    await seed(page);
    await settled(page);
    const r = await page.evaluate(async () => {
      const items = await dbAll();
      const fp = d => JSON.stringify([...d].sort());
      const before = fp(distributionOf(items, false));
      DECIDE_ORDER = decideOrder().slice().reverse();
      const after = fp(distributionOf(items, false));
      /* What that order gives when worked out from nothing. */
      distCache = null; distKey = null;
      try { distMemo.clear(); localStorage.removeItem(distStoreKey()); } catch (_) {}
      const fresh = fp(distributionOf(items, false));
      return { same: before === after, right: after === fresh };
    });
    expect(r.same, 'the old order\'s figures are not reused').toBe(false);
    expect(r.right, 'and the new ones are the new order\'s').toBe(true);
  });

  test('GENERATE SET with the rules loaded does not hold the page to report drift', async ({ page }) => {
    /* The final set is every layer but the backgrounds, so its estimate is a
       different one from the shelf's and is worked out cold. */
    await watchLongTasks(page, false);
    await seed(page, Object.fromEntries(COL.order.filter(l => l !== 'backgrounds').map(l => [l, 'stfp'])));
    await settled(page);
    const r = await page.evaluate(async () => {
      window.__long.length = 0;
      const realCreate = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = () => 'blob:probe';
      HTMLAnchorElement.prototype.click = function () {};
      const t = window.toast; window.toast = () => {};
      $('cgen').value = '2';
      try { await $('cgenzip').onclick(); }
      finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; window.toast = t; }
      /* Long-task entries are delivered after the task, not during it. */
      await new Promise(r => setTimeout(r, 800));
      return { note: $('cnote').textContent, long: window.__long.slice() };
    });
    console.log('generate: long tasks ' + JSON.stringify(r.long));
    expect(r.note, 'it built the set').toContain('Built 2 different characters');
    expect(Math.max(0, ...r.long), 'the longest task while it built and reported').toBeLessThan(200);
  });

  test('a run whose inputs change underneath it is not remembered', async ({ page }) => {
    /* The draws are spread over time now, so an input can move between two
       slices. Such a run answers nothing, rather than filing a mixture of two
       collections under the first one's name. */
    await seed(page);
    await settled(page);
    const r = await page.evaluate(async () => {
      const items = await dbAll();
      const was = emptyChance;
      emptyChance = 0.37;
      const key = distKeyOf(items, false);
      const run = distributionLater(items, false, 'probe');
      await new Promise(res => setTimeout(res, 30));
      emptyChance = 0.21;
      const got = await run;
      emptyChance = 0.37;
      const kept = distMemo.has(key);
      emptyChance = was;
      return { got: got === null ? 'nothing' : 'an estimate', kept };
    });
    expect(r.got).toBe('nothing');
    expect(r.kept, 'and nothing is remembered for the inputs it started with').toBe(false);
  });

  test('the control: the figures are exactly what one uninterrupted estimate gives, and the rules move them', async ({ page }) => {
    await seed(page);
    await settled(page);
    const r = await page.evaluate(async () => {
      const items = await dbAll();
      const shown = [...document.querySelectorAll('#projbody .item')].map(el => ({
        name: (el.querySelector('b') || {}).textContent, text: (el.querySelector('.pct') || {}).textContent }));
      distCache = null; distKey = null;
      try { distMemo.clear(); localStorage.removeItem(distStoreKey()); } catch (_) {}
      const d = distributionOf(items, false);
      let checked = 0, differ = 0, wrong = [];
      for (const s of shown) {
        const rec = items.find(i => i.kind === 'trait' && i.name === s.name);
        if (!rec) continue;
        const want = '~' + pctLabel(traitChance(rec, items, false, d).pct);
        const plain = '~' + pctLabel(traitChance(rec, items, false, 'defer').plain);
        checked++;
        if (want !== plain) differ++;
        if (s.text !== want) wrong.push(s.name + ': ' + s.text + ' not ' + want);
      }
      return { checked, differ, wrong: wrong.slice(0, 5) };
    });
    expect(r.checked).toBeGreaterThan(200);
    expect(r.wrong, 'every tile shows the uninterrupted estimate').toEqual([]);
    expect(r.differ, 'and the rules move some figures, so this compared something').toBeGreaterThan(10);
  });
});
