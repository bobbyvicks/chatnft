/* ONE CATCH-UP AT A TIME.

   Entering a group from your own page ran two catch-ups at once - one
   started by cloudRender and not awaited, and wsSwitch's own - and both
   downloaded every picture. RUN AGAINST THE PAGE BEFORE THE FIX, through
   the real wsSwitch against a stubbed server of 20 traits: the first test
   went red with 40 picture downloads and a note saying 20 changed while
   loading. The second is the control that single-flight joins only a
   catch-up that is still running: one after it has finished still asks
   the server again. */
import { test, expect } from '@playwright/test';

const enter = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  groupCaughtUp = false;
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: 'row' + i, kind: 'trait', name: 't' + i, layer: 'hats',
    status: 'approved', path: 'team7/c1/t' + i + '.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
  const json = (x, extra) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  let pictures = 0;
  window.__rowReads = 0;
  window.__realFetch = window.fetch;
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json(activeWs || 'me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0) { pictures++; await new Promise(r => setTimeout(r, 20)); return new Response(new Blob([new Uint8Array([1, 2, 3])])); }
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits') >= 0) {
      window.__rowReads++;
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      return json(rows.slice(off, off + 1000));
    }
    return json([]);
  };
  const t = window.toast; window.toast = () => {};
  try { await wsSwitch('team7'); await new Promise(r => setTimeout(r, 800)); }
  finally { window.toast = t; }
  const traits = (await dbAll()).filter(i => i.kind === 'trait').length;
  const note = document.getElementById('cloudnote').textContent;
  return { pictures, traits, note };
});

test.describe('one catch-up at a time', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof wsSwitch === 'function' && typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('ENTERING A GROUP FROM YOUR OWN PAGE downloads each picture once', async ({ page }) => {
    const r = await enter(page);
    expect(r.traits, 'the whole collection arrived').toBe(20);
    expect(r.pictures, 'each picture once').toBe(20);
    expect(r.note).not.toContain('changed here while loading');
  });

  test('the control: a catch-up after the first has finished still asks the server again', async ({ page }) => {
    await enter(page);
    const r = await page.evaluate(async () => {
      const before = window.__rowReads;
      const t = window.toast; window.toast = () => {};
      try { await groupCatchUp(); } finally { window.toast = t; }
      return { before, after: window.__rowReads };
    });
    expect(r.after, 'a later catch-up is not swallowed by the first').toBeGreaterThan(r.before);
  });
});
