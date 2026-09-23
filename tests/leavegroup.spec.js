/* LEAVING A GROUP SAYS WHAT IT STRANDS, AND FREES WHAT IT DOES NOT.

   The leave question was one fixed sentence whatever this device held for
   the group, and after leaving the group's database could not be opened
   from any screen - nor was it ever deleted. RUN AGAINST THE PAGE BEFORE
   THE FIX: the first test went red (the question never mentioned the
   unsent trait) and the second went red (the group's database was still on
   the device after a clean leave). The third is the control that a leave
   with something unsent keeps it, and says so. */
import { test, expect } from '@playwright/test';

const leave = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  const blob = new Blob([new Uint8Array(16)]);
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob,
    w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-1', path: 'team7/c1/trait-cap-hats-approved.png', synced: !o.unsent });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let left = false;
  window.__realFetch = window.fetch;
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/rpc/leave_team') >= 0) { left = true; return json(null); }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json(left ? [{ id: 'me', name: 'Me', personal: true }]
      : [{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
    return json([]);
  };
  let asked = null;
  const realConfirm = window.confirm; window.confirm = (m) => { asked = m; return o.answer; };
  const said = []; const t = window.toast; window.toast = (m) => said.push(m);
  try { await wsLeave(); } finally { window.confirm = realConfirm; window.toast = t; window.fetch = window.__realFetch; }
  const dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : null;
  return { asked, left, said: said.join(' | '), dbs };
}, o);

test.describe('leaving a group says what it strands, and frees what it does not', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof wsLeave === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; });
  });

  test('THE QUESTION NAMES WHAT THE GROUP HAS NOT GOT, and Cancel leaves nothing', async ({ page }) => {
    const r = await leave(page, { unsent: true, answer: false });
    expect(r.asked).toContain('1 change the group has not got (cap)');
    expect(r.asked).toContain('Save to cloud first');
    expect(r.left, 'Cancel left nothing').toBe(false);
  });

  test('A CLEAN LEAVE clears the group\'s copy from this device', async ({ page }) => {
    const r = await leave(page, { unsent: false, answer: true });
    expect(r.left).toBe(true);
    expect(r.asked).toContain('Your own page is untouched');
    expect(r.dbs, 'the group\'s database is gone').not.toContain('chatnft.ws.team7');
    expect(r.said).toContain('cleared its copy from this device');
  });

  test('the control: leaving with something unsent keeps it, and says so', async ({ page }) => {
    const r = await leave(page, { unsent: true, answer: true });
    expect(r.left).toBe(true);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('what the group has not got is kept on this device');
  });
});
