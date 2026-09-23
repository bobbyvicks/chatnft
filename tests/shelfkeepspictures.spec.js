/* THE SHELF KEEPS ITS PICTURES, AND A QUIET GROUP OPEN DRAWS IT ONCE.

   Every render built every tile again and decoded each visible thumbnail
   again from its PNG, so the tiles a person was looking at went blank on
   every hide, status or weight press. And a group open rendered at the end
   of the pull and again at the end of the catch-up whatever had happened,
   so a quiet open blanked the visible shelf twice. RUN AGAINST THE PAGE
   BEFORE THE FIX: see the commit body for what each test showed. */
import { test, expect } from '@playwright/test';

/* Twelve traits, each a flat colour, so a painted tile is easy to tell from
   an empty one. */
const seedShelf = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < 12; i++) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'hsl(' + (i * 30) + ' 70% 50%)'; g.fillRect(0, 0, 16, 16);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await dbPut({ id: 't_h' + i + '_hats_approved', kind: 'trait', name: 'h' + i, layer: 'hats', status: 'approved',
      blob, w: 16, h: 16, rarity: 1, at: 1000 + i });
  }
  try { showPage('project', false); } catch (_) {}
  await renderShelf();
  /* In view: tiles are decoded as they come on screen. */
  document.getElementById('projbody').scrollIntoView();
});

/* What each tile in view shows right now: painted or empty. */
const visibleTiles = () => {
  const out = [];
  for (const cv of document.querySelectorAll('#projbody .item canvas')) {
    const r = cv.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
    const px = cv.getContext('2d').getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
    out.push(px[3] > 0 ? 'painted' : 'empty');
  }
  return out;
};

const waitPainted = (page) => page.waitForFunction(new Function('return (' + visibleTiles.toString() + ')().every(x => x === "painted") && (' + visibleTiles.toString() + ')().length >= 4'), null, { timeout: 10000 });

/* Counts thumbnail decodes - every tile and list row that draws a trait
   small - and not the compose preview, which decodes pictures of its own. */
const countDecodes = (page) => page.evaluate(() => {
  window.__decodes = 0; window.__shelfDecodes = 0;
  if (window.__wrapped) return;
  window.__wrapped = true;
  const real = thumbPaint;
  thumbPaint = (...a) => {
    window.__decodes++;
    if (a[0] && a[0].closest && a[0].closest('#projbody')) window.__shelfDecodes++;
    return real(...a);
  };
});

test.describe('the shelf keeps its pictures', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seedShelf(page);
    await waitPainted(page);
    await countDecodes(page);
  });

  test('A HIDE PRESS redraws the shelf with every picture in view already there', async ({ page }) => {
    const r = await page.evaluate(new Function('return (async () => { await renderShelf(true); return { tiles: (' + visibleTiles.toString() + ')(), decodes: window.__decodes }; })()'));
    expect(r.tiles.length).toBeGreaterThanOrEqual(4);
    expect(r.tiles.filter(t => t === 'empty'), 'no tile in view is empty after the redraw').toEqual([]);
    expect(r.decodes, 'and nothing was decoded again').toBe(0);
  });

  test('A WEIGHT EDIT, a full render, does the same, and redraws the last-edited list without decoding', async ({ page }) => {
    const r = await page.evaluate(new Function('return (async () => { const t = await dbGet("t_h3_hats_approved"); await setRarity(t, 4); await renderShelf(); return { tiles: (' + visibleTiles.toString() + ')(), decodes: window.__decodes }; })()'));
    expect(r.tiles.filter(t => t === 'empty')).toEqual([]);
    expect(r.decodes).toBe(0);
  });

  test('AN EDITED PICTURE is decoded fresh, and alone - the kept one is not shown', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const t = await dbGet('t_h0_hats_approved');
      /* THE SAME BYTE LENGTH as the picture it replaces, so only the edit
         time can tell them apart - the case the edit time is in the key for. */
      /* h2's picture: another flat colour the fixture made at this length. */
      const blob = (await dbGet('t_h2_hats_approved')).blob;
      if (blob.size !== t.blob.size) return { none: true };
      const bm = await createImageBitmap(blob);
      const oc = document.createElement('canvas'); oc.width = 16; oc.height = 16;
      oc.getContext('2d').drawImage(bm, 0, 0);
      const d = oc.getContext('2d').getImageData(8, 8, 1, 1).data;
      const rgb = [d[0], d[1], d[2]];
      await dbPut(Object.assign({}, t, { blob, at: Date.now() }));
      await renderShelf();
      await new Promise(res => setTimeout(res, 600));
      const el = [...document.querySelectorAll('#projbody .item')].find(e => (e.querySelector('b') || {}).textContent === 'h0');
      const cv = el.querySelector('canvas');
      const px = cv.getContext('2d').getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
      return { rgb: [px[0], px[1], px[2]], want: rgb, shelf: window.__shelfDecodes };
    });
    expect(r.none, 'a picture of the same length was found').toBeFalsy();
    expect(r.rgb, 'the edited picture').toEqual(r.want);
    expect(r.shelf, 'one shelf tile decoded, because it is a different picture').toBe(1);
  });

  test('A CLEARED STORE is never taken for an unchanged one', async ({ page }) => {
    /* The shelf decides it is current by the write sequence, and clearing
       the store was the one write that did not move it. */
    const r = await page.evaluate(async () => {
      await dbClear();
      await renderShelfIfStale();
      /* An empty project takes the shelf down rather than emptying it. */
      return document.getElementById('proj').hidden;
    });
    expect(r, 'the shelf of cleared traits is taken down').toBe(true);
  });

  test('WHAT IS KEPT stays inside its budget', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const per = [...thumbKept.values()][0];
      const one = per.width * per.height * 4;
      THUMB_KEEP_BYTES = one * 3;
      const t = await dbGet('t_h5_hats_approved');
      await dbPut(Object.assign({}, t, { at: Date.now() }));
      await renderShelf();
      await new Promise(res => setTimeout(res, 800));
      return { kept: thumbKept.size, bytes: thumbKeptBytes, budget: THUMB_KEEP_BYTES };
    });
    expect(r.kept, 'three fit').toBeLessThanOrEqual(3);
    expect(r.bytes).toBeLessThanOrEqual(r.budget);
  });
});

/* A group of twenty on a stubbed server with layers and a rule. */
const armGroup = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null;
  groupCaughtUp = false;
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const S = { rows: Array.from({ length: 20 }, (_, i) => ({ id: 'row' + i, kind: 'trait', name: 't' + i, layer: i < 10 ? 'hats' : 'hair',
    status: 'approved', path: 'team7/c1/t' + i + '.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' })),
    coll: { id: 'c1', layers: ['hair', 'hats'], rules: [['hair/t10', 'hats/t0']], decisions: [], empty_chance: 0.25, rules_at: 1 } };
  window.__S = S;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const png = await new Promise(r => c.toBlob(r, 'image/png'));
  const json = (x, extra) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) {
      if (m === 'PATCH') { (window.__patches = window.__patches || []).push(String(io.body || '')); return json([]); }
      return json(m === 'GET' ? [S.coll] : []);
    }
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) {
      /* Paged by offset, as the real listing is, ending on an empty page. */
      const off = (JSON.parse((io && io.body) || '{}').offset) || 0;
      return json(S.rows.map(r => ({ name: r.path.split('/').pop() })).slice(off, off + 100));
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) return new Response(png);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + S.rows.length });
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'GET') {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      return json(S.rows.slice(off, off + 1000));
    }
    return json([]);
  };
  window.__toast = window.toast; window.toast = () => {};
  /* The first open: everything arrives. */
  await groupCatchUp();
  await renderShelf();
});

/* Counts the renders a catch-up makes, and which records it wrote. */
const catchUpCounting = (page) => page.evaluate(async () => {
  let renders = 0;
  const real = renderShelf;
  renderShelf = async (v) => { renders++; return real(v); };
  const wrote = [];
  const t = touch;
  touch = (id) => { wrote.push(String(id)); return t(id); };
  try { await groupCatchUp(); } finally { renderShelf = real; touch = t; }
  return { renders, wrote, tiles: document.querySelectorAll('#projbody .item').length };
});

test.describe('a quiet group open draws the shelf once', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; if (window.__toast) window.toast = window.__toast; activeWs = null; });
  });

  test('OPENING A GROUP WHERE NOTHING CHANGED draws nothing more after the first render', async ({ page }) => {
    await armGroup(page);
    const r = await catchUpCounting(page);
    console.log('quiet catch-up: ' + r.renders + ' renders, wrote ' + JSON.stringify(r.wrote));
    expect(r.tiles, 'the twenty are on the shelf').toBe(20);
    expect(r.wrote, 'nothing was written, because nothing changed').toEqual([]);
    expect(r.renders, 'so nothing was drawn again').toBe(0);
  });

  test('the control: a teammate\'s new trait is written and drawn', async ({ page }) => {
    await armGroup(page);
    await page.evaluate(() => { window.__S.rows.push({ id: 'row20', kind: 'trait', name: 't20', layer: 'hats', status: 'approved',
      path: 'team7/c1/t20.png', w: 16, h: 16, rarity: 1, updated_at: '2026-02-01T00:00:00Z' }); });
    const r = await catchUpCounting(page);
    expect(r.renders).toBeGreaterThanOrEqual(1);
    expect(r.tiles, 'and it is on the shelf').toBe(21);
  });

  test('the control: an answer given here that the group has not got is still sent', async ({ page }) => {
    /* What the unconditional save on every pull was covering. */
    await armGroup(page);
    await page.evaluate(async () => {
      /* Answered here the way the review does it: recorded and applied, so
         the pull finds nothing to change locally and only the group lacks it. */
      DECISIONS = mergeDecisions(DECISIONS, [{ a: 'hair/t11', b: 'hats/t1', ok: false, at: Date.now() }]);
      applyDecision('hair/t11', 'hats/t1', false);
      await saveRulesHere();
      window.__patches = [];
    });
    await catchUpCounting(page);
    const sent = await page.evaluate(() => window.__patches.slice());
    expect(sent.some(b => b.indexOf('hair/t11') >= 0), 'the group is sent the answer').toBe(true);
  });

  test('the control: a trait a teammate removed is taken off the shelf', async ({ page }) => {
    await armGroup(page);
    await page.evaluate(() => { window.__S.rows = window.__S.rows.filter(r => r.id !== 'row3'); });
    const r = await catchUpCounting(page);
    expect(r.renders).toBeGreaterThanOrEqual(1);
    expect(r.tiles, 'and it is gone from the shelf').toBe(19);
  });
});
