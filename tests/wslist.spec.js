/* One failed request threw you out of your group project.

   wsList returns the projects you are in, and it answered with an empty array
   for four different facts: you are not signed in, the server refused, the
   request never got out, and you genuinely are in no groups. wsRender read the
   absence of your project as the last one:

     if(activeWs && !teams.some(t=>t.id===activeWs)) await wsSwitch(null);

   under a comment saying "a project you have left, or were removed from, is no
   longer in the list" - right about the fact it was written for and wrong
   about the other three.

   MEASURED, with a group open and a custom draw order:

     the server is briefly unreachable   activeWs ws1 -> null, layers reset to
                                         the 13 defaults, "Back on your page"
     the server answers 500              identical
     you really were removed             identical
     you are still in it (control)       activeWs ws1, layers kept, silent

   wsRender runs from cloudRender, which runs on boot, so opening the page on a
   flaky connection moved you off the group and reset your draw order every
   time. Nothing is deleted - the group's work is in the group's database - but
   you are looking at the wrong project and nothing said the list could not be
   read.

   THE FALLBACK IS NOT THE BUG AND MUST SURVIVE. Somebody who really has left a
   project must still be moved off it, or the page stays pointed at something
   they cannot open. That is the third test here, and every mutant that reds
   the first two must leave it alone.

   THE DROPDOWN IS THE OTHER HALF. Keeping activeWs on a group that is not in
   the rendered list would show "My page" selected while you are in the group -
   the same lie pointing the other way - so the project goes back in under the
   name last read, marked offline, because "could not check" is what is true.
*/
import { test, expect } from '@playwright/test';

/* `teams` decides how the server answers /rest/v1/teams:
     'in'      the list, with your project in it
     'without' the list, without it
     'refuse'  500
     'dead'    the request never gets out */
const render = (page, opts) => page.evaluate(async (o) => {
  const { teams, forgetName } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = 'ws1';
  if (forgetName) { try { localStorage.removeItem('chatnft.wsname'); } catch (_) {} }
  LAYERS = ['skins', 'my-group-layer', 'unsorted'];
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));

  const json = (x, st) => new Response(JSON.stringify(x),
    { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rest/v1/teams') >= 0) {
      if (teams === 'dead') return Promise.reject(new TypeError('Failed to fetch'));
      if (teams === 'refuse') return json({}, 500);
      const rows = [{ id: 'personal', name: 'My page', personal: true }];
      if (teams === 'in') rows.push({ id: 'ws1', name: 'Crew Zero', personal: false });
      return json(rows);
    }
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'], updated_at: 'x' }]);
    if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    return json([]);
  };
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  await wsRender();
  window.toast = realToast;
  window.fetch = real;
  const sel = document.getElementById('wssel');
  return {
    activeWs: activeWs,
    layers: LAYERS.join(','),
    said: said.join(' | '),
    dropdown: [...sel.options].map(o => o.textContent),
    selected: sel.value,
  };
}, opts);

const KEPT = 'skins,my-group-layer,unsorted';

test.describe('being in a group project, and being told you are not', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof wsRender === 'function');
    // A good read first, so the project's name is on record for the offline
    // renders below - which is the state a person is actually in: they were
    // online once, then were not.
    await render(page, { teams: 'in' });
  });

  test('a server that cannot be reached does not remove you from anything', async ({ page }) => {
    const r = await render(page, { teams: 'dead' });
    expect(r.activeWs, 'you are still in the project').toBe('ws1');
    expect(r.layers, 'and your draw order is untouched').toBe(KEPT);
    expect(r.said, 'and nothing claimed you had gone back to your own page')
      .not.toContain('Back on your page');
  });

  test('and neither does one that refuses', async ({ page }) => {
    // A 500 is an ANSWER, but not an answer to "which projects am I in".
    const r = await render(page, { teams: 'refuse' });
    expect(r.activeWs, 'you are still in the project').toBe('ws1');
    expect(r.layers, 'and your draw order is untouched').toBe(KEPT);
  });

  test('a list that really lacks your project still moves you off it', async ({ page }) => {
    /* THE FALLBACK, which is not the bug. Somebody removed from a project must
       be taken off it, or the page stays pointed at something they cannot
       open. Every fix for the two tests above has to leave this alone. */
    const r = await render(page, { teams: 'without' });
    expect(r.activeWs, 'you are back on your own page').toBe(null);
    expect(r.said, 'and it says so').toContain('Back on your page');
    expect(r.dropdown, 'the project is not offered').toEqual(['My page']);
  });

  test('and the ordinary case is untouched', async ({ page }) => {
    const r = await render(page, { teams: 'in' });
    expect(r.activeWs).toBe('ws1');
    expect(r.selected, 'the dropdown is on it').toBe('ws1');
    expect(r.dropdown, 'under its real name').toEqual(['My page', 'Crew Zero']);
    expect(r.dropdown.join(' '), 'with nothing hedged').not.toContain('offline');
  });

  test('the dropdown names the project it could not check', async ({ page }) => {
    /* Otherwise the select falls back to "My page" while activeWs is still the
       group - the same lie the other way round, and harder to notice because
       it looks like the thing you asked for. */
    const r = await render(page, { teams: 'dead' });
    expect(r.selected, 'the selection matches where you actually are').toBe('ws1');
    expect(r.dropdown.join(' '), 'named from the last good read').toContain('Crew Zero');
    expect(r.dropdown.join(' '), 'and marked as unchecked').toContain('offline');
  });

  test('and says something sensible when it never learned the name', async ({ page }) => {
    // First run on a new device, offline: there is no remembered name, and a
    // blank option would be worse than a generic one.
    const r = await render(page, { teams: 'dead', forgetName: true });
    expect(r.activeWs, 'still in it').toBe('ws1');
    expect(r.selected).toBe('ws1');
    expect(r.dropdown, 'a plain label rather than an empty row')
      .toEqual(['My page', 'Group project (offline)']);
  });
});
