/* AN UNSAVED DRAWING OUTLIVES A TEAMMATE'S NEWER SAVE.

   A draft is offered on open only if it is newer than the record, and a
   teammate's save pulled after you drew rewrote the record with a newer
   stamp. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with
   the teammate's pixels on the canvas and no draft offered. The second is
   the control that a trait with no drawing here simply takes the teammate's
   version and says nothing about drafts. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const png = async (v) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png')); };
  const path = 'team7/c1/trait-cap-hats-approved.png';
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
    blob: await png(90), w: 16, h: 16, rarity: 1, at: 1000, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path, synced: true });
  if (o.draft) await dbPut({ id: draftKey('t_cap_hats_approved'), kind: 'autosave', traitId: 't_cap_hats_approved',
    name: 'cap.png', w: 16, h: 16, blob: await png(20), at: 2000 });
  const theirs = await png(150);
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  /* A teammate's save: a NEW row, same name, layer and status, newer. */
  const rows = [{ id: 'row-5', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', path, w: 16, h: 16, rarity: 1,
    updated_at: '2026-09-22T12:00:00Z' }];
  window.__realFetch = window.fetch;
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) return json([{ name: 'trait-cap-hats-approved.png' }]);
    if (s.indexOf('/storage/') >= 0) return new Response(theirs);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/1' });
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      return json(rows.slice(off, off + 1000));
    }
    return json([]);
  };
  const t = window.toast; window.toast = () => {};
  try { await groupCatchUp(); } finally { window.toast = t; window.fetch = window.__realFetch; }
  const note = document.getElementById('cloudnote').textContent;
  const rec = await dbGet('t_cap_hats_approved');
  await openTraitRecord(rec);
  const px = ctx.getImageData(2, 2, 1, 1).data[0];
  return { note, px, rowId: rec.rowId };
}, o);

test.describe('an unsaved drawing outlives a teammate\'s newer save', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof groupCatchUp === 'function' && typeof openTraitRecord === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; });
  });

  test('A DRAWING NOT YET SAVED is what opens after the teammate\'s version arrives, and the note says both exist', async ({ page }) => {
    const r = await arm(page, { draft: true });
    expect(r.rowId, 'the teammate\'s version did arrive').toBe('row-5');
    expect(r.px, 'the drawing, not their pixels').toBe(20);
    expect(r.note).toContain('1 updated by the group while you had an unsaved drawing of it - your drawing is kept as a draft (cap)');
  });

  test('the control: with no drawing here, the teammate\'s version is what opens, and nothing is said about drafts', async ({ page }) => {
    const r = await arm(page, { draft: false });
    expect(r.rowId).toBe('row-5');
    expect(r.px).toBe(150);
    expect(r.note).not.toContain('unsaved drawing');
  });
});
