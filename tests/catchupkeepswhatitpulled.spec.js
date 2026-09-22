/* THE CATCH-UP NEVER DELETES WHAT ITS OWN PULL JUST WROTE.

   A teammate's save arrives as a NEW server row; the pull downloads it over
   the same local id with the new rowId. Since ec67915 the deletion pass read
   the store before the pull, so its copy still named the old row, which the
   server no longer has - and it deleted the record the pull had just
   written. RUN AGAINST THE PAGE BEFORE THE FIX, through the real
   groupCatchUp and cloudPull: the first test went red with no trait left
   after the open, "1 removed by someone else" beside "1 updated by the
   group". teammateedit.spec.js drives cloudPull alone and never reached it.

   The second test is the control that the deletion pass still works: a row
   the server really lost is removed. The third is a teammate's in-place
   move to another layer, which re-ids the local record inside the pull. */
import { test, expect } from '@playwright/test';

const open = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: LAYERS.slice(), hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
    blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: 10, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z',
    path: 'team7/c1/trait-cap-skins-approved.png', synced: true });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const rows = o.rows;
  const said = [];
  const realToast = window.toast; window.toast = (m) => { said.push(m); };
  window.__realFetch = window.fetch;
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins', 'hats'] }]);
    if (s.indexOf('/storage/') >= 0) return new Response(new Blob([new Uint8Array([9, 9, 9])]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const batch = rows.slice(off, off + lim);
      return json(batch, { 'Content-Range': off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + rows.length });
    }
    return json([]);
  };
  try { await groupCatchUp(); } finally { window.toast = realToast; window.fetch = window.__realFetch; }
  const recs = (await dbAll()).filter(i => i.kind === 'trait').map(x => x.id + ':' + x.rowId);
  return { recs, said: said.join(' | '), note: document.getElementById('cloudnote').textContent };
}, o);

const ROW = { kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
  path: 'team7/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 1, shelf_order: 10 };

test.describe('the catch-up never deletes what its own pull just wrote', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; });
  });

  test('A TEAMMATE\'S SAVE, which arrives as a new row, is still on the shelf after the open', async ({ page }) => {
    const r = await open(page, { rows: [Object.assign({ id: 'row-2', updated_at: '2026-02-02T00:00:00Z' }, ROW)] });
    expect(r.recs, 'the trait, on the teammate\'s new row').toEqual(['t_cap_skins_approved:row-2']);
    expect(r.said).not.toContain('removed by someone else');
    expect(r.note).toContain('1 updated by the group');
  });

  test('the control: a row the server really lost is still removed', async ({ page }) => {
    const r = await open(page, { rows: [Object.assign({}, ROW, { id: 'row-5', name: 'hat', layer: 'hats',
      path: 'team7/c1/trait-hat-hats-approved.png', updated_at: '2026-01-01T00:00:00Z' })] });
    expect(r.recs).toEqual(['t_hat_hats_approved:row-5']);
    expect(r.said).toContain('1 removed by someone else');
  });

  test('and a teammate\'s in-place move to another layer re-ids the trait and keeps it', async ({ page }) => {
    const r = await open(page, { rows: [Object.assign({}, ROW, { id: 'row-1', layer: 'hats', updated_at: '2026-02-02T00:00:00Z' })] });
    expect(r.recs).toEqual(['t_cap_hats_approved:row-1']);
    expect(r.said).not.toContain('removed by someone else');
  });
});
