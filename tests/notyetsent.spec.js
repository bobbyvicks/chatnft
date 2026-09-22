/* THE STATUS LINE COUNTS WHAT IS CHANGED HERE AND NOT YET SENT.

   cloudStatus compares the two copies by file path and says "They match."
   when the sets are equal. Since patch525 a record can be changed here and
   unsent while its file is on the server under the same path - a reweight
   or reorder on a personal page, a weight whose live patch failed, an old
   failed picture upload a pull once put a path on. RUN AGAINST THE PAGE
   BEFORE THE FIX, the second test went red: one reweight on a personal
   page, and the panel said "They match." - the sentence that stops
   somebody looking, in the case it should not be said.

   The last test is the whole loop through the real cloudPush: after Save
   to cloud the count is gone and the panel says they match again. The
   first is the control that an untouched pair still matches. */
import { test, expect } from '@playwright/test';

/* One synced skin from server row "row-1" on a personal page, with a stub
   server holding that row; `shape` seeds it differently. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const rec = { id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
    blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: 10, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z',
    path: 'me/c1/trait-cap-skins-approved.png', synced: true };
  if (o.shape === 'oldFailedPicture') { rec.synced = false; }
  await dbPut(rec);
  /* A trait drawn here and never sent: no row, no path, and a name the
     server has not got, so its file is genuinely only here. */
  if (o.shape === 'neverUploaded') await dbPut({ id: 't_newone_skins_approved', kind: 'trait', name: 'newone',
    layer: 'skins', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1000, shelfOrder: 11 });
  if (o.extraLocal) await dbPut(Object.assign({}, rec, { id: 't_hat_skins_approved', name: 'hat', rowId: 'row-9',
    path: 'me/c1/trait-hat-skins-approved.png' }));
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const rows = [{ id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
    path: 'me/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 1, shelf_order: 10, updated_at: '2026-01-01T00:00:00Z' }];
  if (o.extraRemote) rows.push({ id: 'row-7', kind: 'trait', name: 'visor', layer: 'skins', status: 'approved',
    path: 'me/c1/trait-visor-skins-approved.png', w: 16, h: 16, rarity: 1, shelf_order: 12, updated_at: '2026-01-01T00:00:00Z' });
  window.__realFetch = window.fetch;
  window.fetch = async (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET')
      return json([{ id: 'c1', layers: ['skins'], updated_at: '2026-01-01T00:00:00Z' }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') return json({ Key: 'ok' });
    if (s.indexOf('/storage/') >= 0) return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      const id = decodeURIComponent((s.match(/id=eq\.([^&]+)/) || [])[1] || '');
      return json([{ id, updated_at: '2026-04-04T00:00:00Z' }]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row-2', updated_at: '2026-03-03T00:00:00Z' }]);
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      return json(rows.slice(off, off + lim), { 'Content-Range': '0-0/' + rows.length });
    }
    return json([]);
  };
}, o);

const status = (page) => page.evaluate(async () => {
  await cloudStatus({ id: 'u1' });
  return document.getElementById('cloudnote').textContent;
});

test.describe('the status line counts what is changed here and not yet sent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudStatus === 'function' && typeof setRarity === 'function' && typeof cloudPush === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('the control: an untouched pair still matches', async ({ page }) => {
    await arm(page, {});
    const note = await status(page);
    expect(note).toContain('They match.');
    expect(note).not.toContain('not yet sent');
  });

  test('A REWEIGHT ON A PERSONAL PAGE: the files match, and the panel says what is still to send', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 'cap'); await setRarity(t, 3); });
    const note = await status(page);
    expect(note, 'the sentence that stops somebody looking is not said').not.toContain('They match.');
    expect(note).toContain('Files match, but 1 changed here and not yet sent - Save to cloud sends it.');
  });

  test('an older failed picture upload with a path is counted the same way - keyed on the flag, not the word',
    async ({ page }) => {
      await arm(page, { shape: 'oldFailedPicture' });
      const note = await status(page);
      expect(note).toContain('1 changed here and not yet sent');
    });

  test('a record that was never uploaded is already counted as only here, not twice', async ({ page }) => {
    await arm(page, { shape: 'neverUploaded' });
    const note = await status(page);
    expect(note).toContain('Save to cloud to upload the 1 that is only here.');
    expect(note).not.toContain('not yet sent');
  });

  test('folded into the sentence that names the button when files differ too', async ({ page }) => {
    await arm(page, { extraLocal: true });
    await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 'cap'); await setRarity(t, 3); });
    const note = await status(page);
    expect(note).toContain('Save to cloud to upload the 1 that is only here and send the 1 changed here and not yet sent.');
    await arm(page, { extraRemote: true });
    await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 'cap'); await setRarity(t, 3); });
    const n2 = await status(page);
    expect(n2).toContain('Load from cloud to fetch the 1 that is only there; 1 changed here and not yet sent - Save to cloud sends it.');
  });

  test('AND AFTER SAVE TO CLOUD the count is gone and they match again', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => { const t = (await dbAll()).find(i => i.name === 'cap'); await setRarity(t, 3); });
    expect(await status(page)).toContain('not yet sent');
    await page.evaluate(async () => { const realToast = window.toast; window.toast = () => {}; try { await cloudPush(); } finally { window.toast = realToast; } });
    const note = await status(page);
    expect(note).toContain('They match.');
    expect(note).not.toContain('not yet sent');
  });
});
