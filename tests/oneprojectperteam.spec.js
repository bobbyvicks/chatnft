/* ONE PROJECT PER TEAM, THE SAME ONE EVERY TIME, AND A PICTURE LOOKED FOR
   WHERE IT IS.

   Reported 2026-09-24: "we just lost a bunch of traits in our project ...
   only the new stuff i did today is". Measured on the server: the team had
   three projects, two of them made after a refused lookup, the page picked
   one with an unordered "limit=1", the pick changed when a project was
   saved, and a page load judged the device's old traits against today's
   project and looked for their pictures in the current project's folder -
   not the folder their paths name - and deleted every old trait from the
   device. See patch591.

   Every test drives the page's own functions against a stubbed fetch, the
   way tests/groupcatchup.spec.js does: a placeholder token, no real server.
   RUN AGAINST THE PAGE BEFORE THE FIX: every test not named a control went
   red. The controls - a team with no project still gets one, a trait a
   teammate really removed still goes, and a listing that fails still keeps
   everything - held before and after. */
import { test, expect } from '@playwright/test';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/* The stubbed server. `o.collections(url, n)` answers the n-th lookup of the
   team's project; `o.rows` are the traits of whichever project the pull
   reads; `o.folders` maps a storage folder to the picture names in it, and
   `o.listFails` makes every listing answer 500. Records every request. */
const armServer = (o) => {
  window.__req = [];
  const json = (x, status, extra) => new Response(JSON.stringify(x),
    { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  let lookups = 0;
  const real = window.__realFetch || (window.__realFetch = window.fetch);
  window.fetch = async (u, opt) => {
    const s = String(u), method = (opt && opt.method) || 'GET';
    window.__req.push(method + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team1');
    if (s.indexOf('/rest/v1/collections') >= 0) {
      if (method === 'POST') return json([{ id: 'cMade', layers: ['hair'] }], 201);
      if (method === 'PATCH') return new Response(null, { status: 204 });
      if (s.indexOf('select=decisions') >= 0) return json([{ decisions: [] }]);
      return o.collections(s, ++lookups);
    }
    if (s.indexOf('/rest/v1/traits?select=id') >= 0 && s.indexOf('select=id%2Cpath') < 0 && s.indexOf('select=id,path') < 0)
      return json([], 200, { 'Content-Range': '0-0/' + (o.rows || []).length });
    if (s.indexOf('/rest/v1/traits?select=') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      const rows = o.rows || [], batch = rows.slice(off, off + lim);
      return json(batch, 200, { 'Content-Range': off + '-' + (off + Math.max(0, batch.length - 1)) + '/' + rows.length });
    }
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) {
      if (o.listFails) return json({ error: 'no' }, 500);
      const b = JSON.parse(opt.body);
      const names = (o.folders || {})[b.prefix] || [];
      return json(b.offset ? [] : names.map(n => ({ name: n })));
    }
    if (s.indexOf('/storage/') >= 0) return new Response(Uint8Array.from(atob(window.__png), c => c.charCodeAt(0)));
    return real(u, opt);
  };
};

const signIn = () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
};

/* cloudCollection on its own. */
const pick = (page, how) => page.evaluate(async ({ how, png }) => {
  window.__png = png;
  signIn();
  activeWs = 'team1'; cloudTeamId = null;
  const answers = {
    /* Two projects. Asked in no order, the server gives the later one first -
       where an update had moved the first one on disk. */
    twoProjects: (url) => new Response(JSON.stringify(url.indexOf('order=created_at.asc') >= 0
      ? [{ id: 'cFirst' }] : [{ id: 'cLater' }]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    /* Refused once, as right after a token refresh, then answered. */
    refusedOnce: (url, n) => n === 1 ? new Response('{"code":"PGRST303"}', { status: 401 })
      : new Response(JSON.stringify([{ id: 'cFirst' }]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    err500: () => new Response('{"message":"boom"}', { status: 500 }),
    err401: () => new Response('{"message":"JWT expired"}', { status: 401 }),
    notAList: () => new Response('{"message":"odd"}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    none: () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  };
  armServer({ collections: answers[how] });
  let c = null;
  try { c = await cloudCollection({ id: 'u1' }); } finally { window.fetch = window.__realFetch; }
  return { id: c && c.id, made: window.__req.filter(r => r.startsWith('POST /rest/v1/collections')).length,
    asked: window.__req.filter(r => r.startsWith('GET /rest/v1/collections')).length,
    lookup: window.__req.find(r => r.startsWith('GET /rest/v1/collections')) || '' };
}, { how, png: PNG });

/* A page load's catch-up over a device holding `o.local`. */
const catchUp = (page, o) => page.evaluate(async ({ o, png }) => {
  window.__png = png;
  signIn();
  activeWs = 'team1'; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  const blob = new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' });
  for (const r of o.local) await dbPut(Object.assign({ kind: 'trait', blob, w: 1, h: 1, rarity: 1, at: 1, synced: true }, r));
  const seq = o.lookups;
  armServer({
    rows: o.rows, folders: o.folders, listFails: o.listFails,
    collections: (url, n) => new Response(JSON.stringify([{ id: seq[Math.min(n, seq.length) - 1], layers: ['hair'] }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  try { await groupCatchUp(); } finally { window.fetch = window.__realFetch; }
  const left = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort();
  return { left, listed: window.__req.filter(r => r.indexOf('/storage/v1/object/list/') >= 0).length };
}, { o, png: PNG });

const OLD = ['old1', 'old2', 'old3'].map(n => ({ id: 't_' + n + '_hair_wip', name: n, layer: 'hair', status: 'wip',
  rowId: 'row_' + n, path: 'team1/cOld/trait-' + n + '-hair-wip.png' }));
const TODAY = { id: 't_new_hair_stfp', name: 'new', layer: 'hair', status: 'stfp', rowId: 'row_new',
  path: 'team1/cNew/trait-new-hair-stfp.png' };
const TODAY_ROW = { id: 'row_new', name: 'new', kind: 'trait', layer: 'hair', status: 'stfp', path: TODAY.path,
  w: 1, h: 1, rarity: 1, shelf_order: 1, updated_at: '2026-09-24T20:00:51Z' };
const FOLDERS = {
  'team1/cOld': OLD.map(r => r.path.split('/')[2]),
  'team1/cNew': [TODAY.path.split('/')[2]],
  'team1/cEmpty': [],
};

test.describe('a team\'s project', () => {
  test.beforeEach(async ({ page }) => {
    /* The two helpers run inside the page. */
    await page.addInitScript({ content: 'window.armServer = ' + armServer.toString() + ';\nwindow.signIn = ' + signIn.toString() + ';' });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudCollection === 'function' && typeof groupCatchUp === 'function');
  });

  test('IS THE ONE IT WAS GIVEN FIRST, whatever order the server keeps them in', async ({ page }) => {
    const r = await pick(page, 'twoProjects');
    expect(r.lookup, 'asked for oldest first').toContain('order=created_at.asc');
    expect(r.id).toBe('cFirst');
    expect(r.made).toBe(0);
  });

  test('A LOOKUP THAT WAS NOT ANSWERED MAKES NO SECOND PROJECT', async ({ page }) => {
    for (const how of ['err500', 'err401', 'notAList']) {
      const r = await pick(page, how);
      expect(r.made, how + ': nothing made').toBe(0);
      expect(r.id, how + ': no project').toBe(null);
    }
  });

  test('A LOOKUP REFUSED ONCE, as right after a token refresh, is asked again and finds the project', async ({ page }) => {
    const r = await pick(page, 'refusedOnce');
    expect(r.asked, 'asked twice').toBe(2);
    expect(r.id).toBe('cFirst');
    expect(r.made, 'and nothing made').toBe(0);
  });

  test('the control: a team the server says has none still gets one', async ({ page }) => {
    const r = await pick(page, 'none');
    expect(r.made).toBe(1);
    expect(r.id).toBe('cMade');
  });

  test('the control: a trait a teammate really removed - row and picture gone - still goes', async ({ page }) => {
    const r = await catchUp(page, {
      local: [OLD[0], TODAY], rows: [TODAY_ROW], lookups: ['cNew'],
      folders: { 'team1/cOld': [], 'team1/cNew': FOLDERS['team1/cNew'] },
    });
    expect(r.left).toEqual(['new']);
  });

  test('the control: when no listing can be had, nothing is removed', async ({ page }) => {
    const r = await catchUp(page, { local: [...OLD, TODAY], rows: [TODAY_ROW], lookups: ['cNew', 'cEmpty'], listFails: true });
    expect(r.left).toEqual(['new', 'old1', 'old2', 'old3']);
  });

  test('THE LOAD AT 20:30: the pull reads one project, the next lookup gets another, and the old traits whose pictures are still there STAY', async ({ page }) => {
    /* As measured: the pull read today's project (one row), the project
       lookup then returned the empty one, and the old traits' pictures were
       all in the original project's folder. */
    const r = await catchUp(page, { local: [...OLD, TODAY], rows: [TODAY_ROW], lookups: ['cNew', 'cEmpty'], folders: FOLDERS });
    console.log('20:30: ' + JSON.stringify(r));
    expect(r.left).toEqual(['new', 'old1', 'old2', 'old3']);
  });

  test('AND WITHOUT THE SECOND FLIP: the pull and the listing on the same project, the old traits still STAY', async ({ page }) => {
    /* The flip at 20:30:20 was not needed for the loss: the check listed the
       current project's folder, and the old pictures are in another. */
    const r = await catchUp(page, { local: [...OLD, TODAY], rows: [TODAY_ROW], lookups: ['cNew'], folders: FOLDERS });
    expect(r.left).toEqual(['new', 'old1', 'old2', 'old3']);
  });

  test('AND A PICTURE IN A FOLDER OUTSIDE THIS TEAM is not judged from an empty listing', async ({ page }) => {
    const away = { id: 't_away_hair_wip', name: 'away', layer: 'hair', status: 'wip', rowId: 'row_away',
      path: 'teamX/cZ/trait-away-hair-wip.png' };
    const r = await catchUp(page, { local: [away, TODAY], rows: [TODAY_ROW], lookups: ['cNew'], folders: FOLDERS });
    expect(r.left).toEqual(['away', 'new']);
  });
});
