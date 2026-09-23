/* A SIGN-IN REVOKED MID-VISIT IS SHOWN AT ONCE.

   The server refusing this device's sign-in cleared the stored session and
   drew nothing, so the page went on showing the name and Sign out while
   every action said to sign in. RUN AGAINST THE PAGE BEFORE THE FIX: the
   first test went red with the sign-in form hidden and the name still up.
   The second is the control that a server that only failed to answer - a
   500 - signs nobody out. */
import { test, expect } from '@playwright/test';

const press = (page, status) => page.evaluate(async (status) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'ws1'; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  $('cloudwho').textContent = 'Robin'; $('cloudout').hidden = false;
  const t = { id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip',
    blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1, rowId: 'row_hat', synced: true };
  await dbPut(t);
  const real = window.fetch;
  window.fetch = async (u) => {
    if (String(u).indexOf('/auth/v1/user') >= 0) return new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const said = []; const tt = window.toast; window.toast = (x) => said.push(String(x));
  try { await setTraitStatus(t, 'approved'); } finally { window.fetch = real; window.toast = tt; activeWs = null; }
  return { signinShown: !$('signin').hidden, who: $('cloudwho').textContent, signOutShown: !$('cloudout').hidden,
    authed, said: said.join(' | '), stored: !!localStorage.getItem('chatnft.session') };
}, status);

test.describe('a sign-in the server refuses mid-visit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setTraitStatus === 'function');
  });

  test('RAISES THE SIGN-IN FORM AND TAKES THE NAME DOWN, without another click', async ({ page }) => {
    const r = await press(page, 401);
    console.log('401: ' + JSON.stringify(r));
    expect(r.stored, 'the session was cleared, as before').toBe(false);
    expect(r.signinShown).toBe(true);
    expect(r.who).toBe('not signed in');
    expect(r.signOutShown).toBe(false);
  });

  test('the control: a server that only failed to answer signs nobody out', async ({ page }) => {
    const r = await press(page, 500);
    expect(r.stored).toBe(true);
    expect(r.signinShown).toBe(false);
    expect(r.authed).toBe(true);
  });
});
