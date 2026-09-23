/* SAVE TO CLOUD NEVER WRITES AN OLD COPY BACK OVER AN EDIT.

   The run read every record once and, as each upload landed, wrote the
   copy it had read back to the store marked synced. RUN AGAINST THE PAGE
   BEFORE THE FIX: an edit made while its upload was in flight came back
   at the old weight and marked synced; an edit made before its turn sent
   the old picture; and a trait removed before its turn was uploaded and
   written back into the store. The last test is the control that a run
   nothing interferes with marks everything sent, as before.

   Eight traits, so two wait for a turn behind the six that go at once.
   Each picture's size is its version: the store and the server stub can
   both be read for which one they hold. Placeholder token only. */
import { test, expect } from '@playwright/test';

const arm = (page, light) => page.evaluate(async (light) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: ['skins', 'unsorted'], hidden: [] });
  for (let i = 0; i < 8; i++)
    await dbPut({ id: 't_a' + i + '_skins_approved', kind: 'trait', name: 'a' + i, layer: 'skins', status: 'approved',
      blob: new Blob([new Uint8Array(100)], { type: 'image/png' }), w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: i });
  /* A weight changed here and not yet sent: the row and picture stand, so
     the run patches the row rather than uploading. */
  if (light) await dbPut({ id: 't_a0_skins_approved', kind: 'trait', name: 'a0', layer: 'skins', status: 'approved',
    blob: new Blob([new Uint8Array(100)], { type: 'image/png' }), w: 16, h: 16, rarity: 3, at: 1000, shelfOrder: 0,
    rowId: 'row-a0', path: 'me/c1/trait-a0-skins-approved.png', synced: false, unsent: 'meta' });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  /* Uploads named here wait for release(); what each upload carried is kept. */
  window.__hold = new Set(); window.__waiting = new Map(); window.__sent = {};
  window.release = () => { for (const f of window.__waiting.values()) f(); window.__waiting.clear(); window.__hold.clear(); };
  window.fetch = async (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'me', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') {
      const name = (s.match(/trait-(a\d+)-/) || [])[1];
      if (window.__hold.has(name)) await new Promise(r => window.__waiting.set(name, r));
      window.__sent[name] = opt.body.size;
      return json({ Key: 'ok' });
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      if (window.__hold.has('a0')) await new Promise(r => window.__waiting.set('a0', r));
      window.__patched = JSON.parse(opt.body);
      return json([{ id: 'row-a0', updated_at: '2026-03-03T00:00:00Z' }]);
    }
    if (s.indexOf('/storage/') >= 0) return json([]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/0' });
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      const row = JSON.parse(opt.body)[0];
      return json([{ id: 'row-' + row.name, updated_at: '2026-03-03T00:00:00Z' }]);
    }
    return json([]);
  };
}, !!light);

/* Starts a push with the named uploads held, and waits until they are. */
const pushHolding = async (page, names) => {
  await page.evaluate((names) => {
    for (const n of names) window.__hold.add(n);
    window.said = [];
    window.toast = (m) => { window.said.push(String(m)); };
    window.pushDone = cloudPush().then(() => true);
  }, names);
  await page.waitForFunction((names) => names.every(n => window.__waiting.has(n)), names);
};
const finish = (page) => page.evaluate(async () => { window.release(); await window.pushDone; return window.said.join(' | '); });
const stored = (page, name) => page.evaluate(async (name) => {
  const r = await dbGet('t_' + name + '_skins_approved');
  return r && { rarity: r.rarity, size: r.blob.size, synced: !!r.synced, rowId: r.rowId || null, path: r.path || null };
}, name);
/* An edit, the shape saveTrait writes: a new record with no sync fields. */
const edit = (page, name) => page.evaluate(async (name) => {
  await dbPut({ id: 't_' + name + '_skins_approved', kind: 'trait', name, layer: 'skins', status: 'approved',
    blob: new Blob([new Uint8Array(222)], { type: 'image/png' }), w: 16, h: 16, rarity: 7, at: Date.now(), shelfOrder: 0 });
}, name);

test.describe('Save to cloud while the project is being edited', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function' && typeof dbGet === 'function');
    await arm(page);
  });

  test('AN EDIT MADE WHILE ITS UPLOAD IS IN FLIGHT is kept, and left to send', async ({ page }) => {
    await pushHolding(page, ['a0']);
    await edit(page, 'a0');
    await finish(page);
    const r = await stored(page, 'a0');
    console.log('in flight: ' + JSON.stringify(r));
    expect(r.size, 'the edited picture').toBe(222);
    expect(r.rarity, 'and its weight').toBe(7);
    expect(r.synced, 'not marked as on the server').toBe(false);
    expect(r.rowId, 'but the row the upload made is noted, so the next send replaces it').toBe('row-a0');
    expect(r.path, 'and no path, which would say the picture there is this one').toBe(null);
  });

  test('AN EDIT MADE BEFORE ITS TURN is what gets sent', async ({ page }) => {
    await pushHolding(page, ['a0', 'a1', 'a2', 'a3', 'a4', 'a5']);
    await edit(page, 'a7');
    await finish(page);
    const sent = await page.evaluate(() => window.__sent.a7);
    const r = await stored(page, 'a7');
    console.log('before its turn: sent ' + sent + ', ' + JSON.stringify(r));
    expect(sent, 'the edited picture went').toBe(222);
    expect(r).toEqual({ rarity: 7, size: 222, synced: true, rowId: 'row-a7', path: 'me/c1/trait-a7-skins-approved.png' });
  });

  test('A TRAIT REMOVED BEFORE ITS TURN is not sent, nor written back', async ({ page }) => {
    await pushHolding(page, ['a0', 'a1', 'a2', 'a3', 'a4', 'a5']);
    await page.evaluate(() => dbDel('t_a7_skins_approved'));
    const said = await finish(page);
    expect(await page.evaluate(() => window.__sent.a7), 'not uploaded').toBeUndefined();
    expect(await stored(page, 'a7'), 'still removed').toBe(null);
    expect(said).toContain('1 moved or removed while this ran');
  });

  test('A WEIGHT CHANGED WHILE ITS PATCH IS IN FLIGHT is kept, and left to send', async ({ page }) => {
    await arm(page, true);
    await pushHolding(page, ['a0']);
    await page.evaluate(async () => {
      const r = await dbGet('t_a0_skins_approved');
      await dbPut(Object.assign({}, r, { rarity: 9 }));
    });
    await finish(page);
    expect(await page.evaluate(() => window.__patched.rarity), 'the patch sent the weight it read').toBe(3);
    const r = await stored(page, 'a0');
    expect(r.rarity, 'the newer weight').toBe(9);
    expect(r.synced, 'not marked as on the server').toBe(false);
  });

  test('the control: a run nothing interferes with marks everything sent', async ({ page }) => {
    await pushHolding(page, ['a0']);
    const said = await finish(page);
    const all = await page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait').map(r => !!r.synced));
    expect(all).toEqual([true, true, true, true, true, true, true, true]);
    expect(said).toContain('Saved 8 to the cloud');
    expect(said).not.toContain('moved or removed');
  });
});
