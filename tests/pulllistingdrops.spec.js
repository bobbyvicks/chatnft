/* LOAD FROM CLOUD SAYS SO WHEN THE CONNECTION DROPS WHILE IT LISTS.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with the
   press rejecting and nothing said. The second is the control that a
   server which answers no is still "Could not read your collection".
   Placeholder token only. */
import { test, expect } from '@playwright/test';

const press = (page, listing) => page.evaluate(async (listing) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (u, opt) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'me', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits') >= 0) {
      if (listing === 'drop') throw new TypeError('Failed to fetch');
      return new Response('no', { status: 500 });
    }
    return json([]);
  };
  const said = []; window.toast = (m) => said.push(String(m));
  let threw = null;
  try { await cloudPull(); } catch (e) { threw = String(e); }
  return { threw, said: said.join(' | ') };
}, listing);

test.describe('Load from cloud when the listing fails', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function');
  });

  test('A CONNECTION THAT DROPS WHILE IT LISTS is said, not thrown', async ({ page }) => {
    const r = await press(page, 'drop');
    console.log('drop: ' + JSON.stringify(r));
    expect(r.threw).toBe(null);
    expect(r.said).toContain('Cannot reach the server just now');
  });

  test('the control: a server that answers no is still "Could not read your collection"', async ({ page }) => {
    const r = await press(page, 'refused');
    expect(r.threw).toBe(null);
    expect(r.said).toContain('Could not read your collection');
  });
});
