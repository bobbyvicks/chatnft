/* A SAVE, A WEIGHT, A STATUS CHANGE AND A DELETE ACT ON THE RECORD AS IT IS
   STORED.

   In a group a save gives the trait a new row and writes its id to the
   store only. The editor kept the old id, and so did a card drawn before
   the send landed. So a second save in the editor was refused (its insert
   met the trait's own row), a status change left the server holding the
   trait twice, a weight PATCHed nothing, and a delete removed nothing.
   See patch593.

   A stub server with the identity index (a second row of one name, layer
   and status is a 409), a placeholder token and no real server, in the
   style of tests/groupsavekeepsthetrait.spec.js. RUN AGAINST THE PAGE
   BEFORE THE FIX: every test not named a control went red. The control -
   the same gestures with no send in between - held before and after. */
import { test, expect } from '@playwright/test';

const P = (n, st) => 'team7/c1/trait-' + n + '-skins-' + (st || 'approved') + '.png';

const arm = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  await dbClear();
  LAYERS = ['skins', 'unsorted'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(2, 2, 12, 12);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
    blob, w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z',
    path: 'team7/c1/trait-cap-skins-approved.png', synced: true });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const S = { rows: [{ id: 'row-1', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved',
    path: 'team7/c1/trait-cap-skins-approved.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }],
    next: 12, conflicts: 0, log: [] };
  window.__S = S;
  window.said = []; window.toast = (m) => window.said.push(String(m));
  window.__realFetch = window.__realFetch || window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return m === 'PATCH' ? new Response(null, { status: 204 }) : json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') return json({ Key: 'ok' });
    if (s.indexOf('/storage/') >= 0) return new Response(new Blob([new Uint8Array([9, 9, 9])]));
    const idq = decodeURIComponent((s.match(/[?&]id=eq\.([^&]+)/) || [])[1] || '');
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      S.log.push('DELETE ' + (idq || 'by identity'));
      const hit = idq ? S.rows.filter(r => r.id === idq) : [];
      for (const r of hit) S.rows.splice(S.rows.indexOf(r), 1);
      return json(hit);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'PATCH') {
      S.log.push('PATCH ' + idq);
      const hit = S.rows.filter(r => r.id === idq);
      for (const r of hit) Object.assign(r, JSON.parse(io.body), { updated_at: '2026-05-05T00:00:00Z' });
      return json(hit);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      const b = JSON.parse(io.body)[0];
      if (S.rows.find(r => r.name === b.name && r.layer === b.layer && r.status === b.status)) {
        S.conflicts++; S.log.push('POST 409'); return json({ code: '23505' }, 409);
      }
      const r = { id: 'row-' + (S.next++), kind: b.kind, name: b.name, layer: b.layer, status: b.status, path: b.path,
        w: b.w, h: b.h, rarity: b.rarity, updated_at: '2026-03-03T00:00:00Z' };
      S.rows.push(r); S.log.push('POST ' + r.id);
      return json([{ id: r.id, updated_at: r.updated_at }]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return json(S.rows);
    return json([]);
  };
});

/* A group send lands after the card was drawn: the card's copy keeps row-1,
   the store and the server move on to a new row. */
const cardThenSend = (page) => page.evaluate(async () => {
  window.card = await dbGet('t_cap_skins_approved');
  const rec = await dbGet('t_cap_skins_approved');
  await cloudSyncOne(Object.assign({}, rec, { synced: false }), null, {});
  return (await dbGet('t_cap_skins_approved')).rowId;
});
const server = (page) => page.evaluate(() => ({ rows: window.__S.rows.map(r => r.id + ':' + r.name + '/' + r.status + ':' + r.rarity),
  conflicts: window.__S.conflicts, log: window.__S.log }));

test.describe('acting on the record as it is stored', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudSyncOne === 'function' && typeof saveTraitNow === 'function');
    await arm(page);
  });

  test('SAVE, KEEP DRAWING, SAVE AGAIN: both reach the group, on one row', async ({ page }) => {
    const said = await page.evaluate(async () => {
      await openTraitRecord(await dbGet('t_cap_skins_approved'));
      await saveTraitNow();
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 2, 2);
      await saveTraitNow();
      return window.said;
    });
    const s = await server(page);
    console.log('two saves: ' + JSON.stringify({ said, log: s.log }));
    expect(s.conflicts, 'no save met its own row').toBe(0);
    expect(said.filter(x => /shared it with the group/.test(x)).length, JSON.stringify(said)).toBe(2);
    expect(s.rows.filter(r => r.indexOf(':cap/') >= 0).length, 'one cap on the server').toBe(1);
  });

  test('A STATUS CHANGE from a card drawn before a send leaves the group one cap, not two', async ({ page }) => {
    const fresh = await cardThenSend(page);
    expect(fresh).not.toBe('row-1');
    await page.evaluate(async () => { await setTraitStatus(window.card, 'stfp'); });
    const s = await server(page);
    console.log('status: ' + JSON.stringify(s));
    expect(s.rows.filter(r => r.indexOf(':cap/') >= 0).map(r => r.split(':')[1]), JSON.stringify(s.log)).toEqual(['cap/stfp']);
  });

  test('A WEIGHT from such a card reaches the live row', async ({ page }) => {
    await cardThenSend(page);
    const r = await page.evaluate(async () => { await setRarity(window.card, 3); const now = await dbGet('t_cap_skins_approved'); return { synced: now.synced, rarity: now.rarity }; });
    const s = await server(page);
    expect(s.rows.filter(x => x.indexOf(':cap/') >= 0).map(x => x.split(':')[2]), JSON.stringify(s.log)).toEqual(['3']);
    expect(r).toEqual({ synced: true, rarity: 3 });
  });

  test('A DELETE from such a card removes the live row', async ({ page }) => {
    await cardThenSend(page);
    const gone = await page.evaluate(async () => await dbDelShared(window.card));
    const s = await server(page);
    expect(gone, JSON.stringify(s.log)).toBe(true);
    expect(s.rows.filter(x => x.indexOf(':cap/') >= 0)).toEqual([]);
  });

  test('the control: with no send in between, a delete from the card removes the row, before and after', async ({ page }) => {
    const gone = await page.evaluate(async () => await dbDelShared(await dbGet('t_cap_skins_approved')));
    expect(gone).toBe(true);
    expect((await server(page)).rows).toEqual([]);
  });
});
