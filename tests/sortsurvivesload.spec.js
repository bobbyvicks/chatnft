/* A SORT ON YOUR OWN PAGE SURVIVES LOAD FROM CLOUD.

   sortApply called cloudMoveOne - where a move the server has not got is
   marked unsent - only inside a group. On your own page a sorted trait kept
   claiming it was on the server, and the next Load from cloud put the old
   layer back. RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red
   with the trait back on hats after the Load, and the second with the edit
   time restamped by the sort. The third is the control that a trait the
   sort did not touch still takes the server's word. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'masks', 'unsorted'];
  const blob = new Blob([new Uint8Array(16)]);
  const rows = [];
  for (const [n, l, order] of [['cap', 'hats', 1], ['veil', 'masks', 2]]) {
    const p = 'me/c1/trait-' + n + '-' + l + '-approved.png';
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n, layer: l, status: 'approved', blob,
      w: 16, h: 16, rarity: 1, at: 1234, shelfOrder: order, rowId: 'row-' + n, rowAt: '2026-01-01T00:00:00Z', path: p, synced: true });
    rows.push({ id: 'row-' + n, kind: 'trait', name: n, layer: l, status: 'approved', path: p, w: 16, h: 16,
      rarity: n === 'veil' ? (o.veilRarity || 1) : 1, shelf_order: order, updated_at: n === 'veil' && o.veilRarity ? '2026-02-02T00:00:00Z' : '2026-01-01T00:00:00Z' });
  }
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__realFetch = window.fetch;
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats', 'masks'] }]);
    if (s.indexOf('/storage/') >= 0) return new Response(new Blob([new Uint8Array([9])]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      return json(rows.slice(off, off + 1000));
    }
    return json([]);
  };
}, o);

/* Sort cap from hats to masks, the way a sort file does. */
const sortCap = (page) => page.evaluate(async () => {
  return sortApply({ layers: [], both: [], rename: [],
    move: [{ id: 't_cap_hats_approved', name: 'cap', toName: 'cap', toLayer: 'masks', status: 'approved' }] });
});

const load = (page) => page.evaluate(async () => {
  const t = window.toast; window.toast = () => {};
  try { await cloudPull({ quiet: true }); } finally { window.toast = t; }
  const recs = (await dbAll()).filter(i => i.kind === 'trait').map(i => ({ name: i.name, layer: i.layer, at: i.at, rarity: i.rarity, synced: !!i.synced }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { recs, note: document.getElementById('cloudnote').textContent };
});

test.describe('a sort on your own page survives Load from cloud', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof sortApply === 'function' && typeof cloudPull === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; });
  });

  test('A TRAIT SORTED TO ANOTHER LAYER is still there after Load from cloud', async ({ page }) => {
    await arm(page, {});
    const r = await sortCap(page);
    expect(r.moved).toBe(1);
    const after = await load(page);
    expect(after.recs.find(x => x.name === 'cap').layer, 'still on masks').toBe('masks');
    expect(after.recs.find(x => x.name === 'cap').synced, 'and waiting for Save to cloud').toBe(false);
  });

  test('and sorting it did not restamp when it was last edited', async ({ page }) => {
    await arm(page, {});
    await sortCap(page);
    const at = await page.evaluate(async () => (await dbAll()).find(i => i.name === 'cap').at);
    expect(at).toBe(1234);
  });

  test('the control: a trait the sort did not touch still takes the server\'s word, said without a group', async ({ page }) => {
    await arm(page, { veilRarity: 4 });
    await sortCap(page);
    const after = await load(page);
    expect(after.recs.find(x => x.name === 'veil').rarity, 'the server\'s weight arrived').toBe(4);
    expect(after.note).toContain('1 changed in place on the server');
    expect(after.note).not.toContain('by the group');
  });
});
