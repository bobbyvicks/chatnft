/* The buttons reach the functions.

   Every cloud test in this suite calls cloudPush() or cloudPull() directly,
   because that is where the behaviour is. None of them clicks the button. So
   deleting

     $('cloudpush').onclick=cloudPush;

   would leave Save to cloud completely dead and every one of those tests
   green. That is a whole feature behind a blind spot, and it is the shape the
   worklog calls "a control the tests always bypass" - the resize complaint of
   the same day lived in exactly that gap.

   THE EFFECT IS WHAT IS OBSERVED, NOT THE BINDING. The first probe written for
   this reassigned the global cloudPush to a recorder and clicked the button,
   and recorded nothing - because onclick captured the function VALUE at wiring
   time, so reassigning the name afterwards is invisible to it. That reads
   exactly like "the button is dead" and is not. These watch the network
   instead: a click has to produce the requests the operation is made of.
*/
import { test, expect } from '@playwright/test';

/* Signs in against a fake server and returns a recorder of what was requested. */
const ready = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null; activeWs = null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await dbPut({ id: 't_a', kind: 'trait', name: 'a', layer: 'skins', status: 'approved',
    blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await renderShelf();

  const seen = [];
  const rows = [];
  const real = window.fetch;
  const json = (o) => new Response(JSON.stringify(o),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (u, o) => {
    const s = String(u), m = (o && o.method) || 'GET';
    seen.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team1');
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/list') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0) return json({});
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      const b = JSON.parse(o.body)[0]; rows.push({ id: 'r' + rows.length, path: b.path });
      return json([rows[rows.length - 1]]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return json(rows);
    return real(u, o);
  };
  window.__seen = seen;
  window.__realFetch = real;
});

const clickAndWatch = (page, id) => page.evaluate(async (btnId) => {
  window.__seen.length = 0;
  const b = document.getElementById(btnId);
  if (!b) return { missing: true };
  b.hidden = false;
  b.disabled = false;
  b.click();
  await new Promise(r => setTimeout(r, 600));
  return { requests: window.__seen.slice() };
}, id);

const done = (page) => page.evaluate(() => { window.fetch = window.__realFetch; });

test.describe('the buttons are connected to the work', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function');
    await ready(page);
    await page.waitForTimeout(300);
  });

  test('Save to cloud uploads when clicked', async ({ page }) => {
    const r = await clickAndWatch(page, 'cloudpush');
    await done(page);
    expect(r.missing, 'the button exists').toBeFalsy();
    expect(r.requests.some(x => x.indexOf('/storage/v1/object/traits/') >= 0),
      'clicking it actually uploads a file').toBe(true);
  });

  test('Load from cloud reads the collection when clicked', async ({ page }) => {
    const r = await clickAndWatch(page, 'cloudpull');
    await done(page);
    expect(r.missing).toBeFalsy();
    expect(r.requests.some(x => x.indexOf('/rest/v1/traits?select=') >= 0),
      'clicking it actually reads the rows').toBe(true);
  });

  test('Sign out clears the session when clicked', async ({ page }) => {
    // No network to watch here, so the effect is the session going away -
    // which is the thing the button is for.
    const before = await page.evaluate(() => !!localStorage.getItem('chatnft.session'));
    await page.evaluate(() => {
      const b = document.getElementById('cloudout');
      b.hidden = false; b.click();
    });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => !!localStorage.getItem('chatnft.session'));
    await done(page);
    expect(before, 'there was a session to clear').toBe(true);
    expect(after, 'and clicking the button cleared it').toBe(false);
  });

  test('the Resize button resizes when clicked', async ({ page }) => {
    // resize.spec.js clicks #rsgo already, so this is not a gap - it is here as
    // the CONTROL for this file. If clicking a known-wired button did not show
    // an effect, the harness above would be what is broken, not the wiring.
    await page.evaluate(async () => {
      const w = 160, h = 160;
      const d = new Uint8ClampedArray(w * h * 4);
      const set = (x, y, c) => { const i = (y * w + x) * 4; d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = 255; };
      for (let y = 16; y < 72; y++) for (let x = 24; x < 136; x++) set(x, y, [226, 146, 116]);
      fileName = 'probe';
      startEditor(d, w, h, w, h, palette(d, w * h, 24, 64), false);
      document.querySelectorAll('.side section').forEach(s => s.classList.remove('folded'));
      document.querySelector('#rsmode button[data-v="art"]').click();
      const rw = document.getElementById('rsw');
      rw.value = '80';
      rw.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => document.getElementById('art').width);
    await page.click('#rsgo');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.getElementById('art').width);
    await done(page);
    expect(before, 'started at the full size').toBe(160);
    expect(after, 'and the click actually resized it').toBe(80);
  });
});
