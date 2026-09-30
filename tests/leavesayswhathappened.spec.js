/* FOLLOW-UP D: LEAVE SAYS WHAT HAPPENED (patch612; the follow-up plan's
   S16, S17, S18 and S19).

   Each was measured on 91eb861's page first, by these tests:
   - S16. After a Leave that a tab from before this update blocked, opening
     the project again in this tab - a switch, a rejoin, db() - waited until
     that tab closed, with nothing said. The version-2 request cannot be
     withdrawn (stage0leave.spec.js pins the browser's side of that); this
     tab now remembers it and says "close or reload that tab" at once.
   - S17. This tab's own connection, closed by Leave's switch while one of
     its transactions still ran, blocked the version-2 request, and Leave
     said "a BuildaNFT tab from before this update has it open" - a tab that
     did not exist.
   - S18. A drawing's save that landed while Leave's question was open was
     named only by the toast; the question had said "Your own page is
     untouched". It is now asked about again, and Cancel leaves nothing.
   - S19. leave_team names the project the question was about
     (p_team:leaving). Nothing on the page can make it differ from the page
     shown while the move checks stand, so the test below can fail only with
     those checks gone too: the report records p_team:leaving removed alone,
     each move check removed alone, and all of them together.

   The stand-in is stage0leave.spec.js's, copied here (Ruling F-15: nobody
   edits tests/helpers.js, and a spec file is not a helper), with a confirm
   that answers from a list, a rejoin route, and an unsent trait. */
import { test, expect } from '@playwright/test';

const QUEUED = 'A BuildaNFT tab from before this update still has this project open, so this device cannot open it yet. Close or reload that tab, then open the project again.';
const OLD = 'from before this update has it open';
const STOPPED = 'Did not leave - the page moved to another project, or signed out, while Leave was checking';

/* The page on team7, holding one trait (synced unless `unsent`); fetch,
   confirm and toast are stand-ins until done(). Options: answers (the
   confirm's answers in turn; true after the list), joinable (join_team
   answers team7, and team7 is listed again once joined), readFails. */
const arm = (page, o = {}) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
  await dbClear();
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob: new Blob([new Uint8Array(16)]),
    w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-1', path: 'team7/c1/trait-cap-hats-approved.png', synced: !o.unsent });
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1');
  const json = (x, st, h) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  const L = window.__L = { unknown: [], pteam: [], reads: 0, asked: [], said: [], left: false, joined: false, onProto: null, onAsk: null, onLeft: null,
    answers: (o.answers || []).slice(),
    real: { fetch: window.fetch, dbAll: window.dbAll, confirm: window.confirm, toast: window.toast } };
  window.__unknown = L.unknown;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('select=id,protocol,switching_at') >= 0) {
      L.reads++;
      const f = L.onProto; L.onProto = null; if (f) f();
      return json([{ id: 'c1', protocol: 1, switching_at: null }]);
    }
    if (s.indexOf('/rpc/leave_team') >= 0) {
      L.left = true;
      try { L.pteam.push(JSON.parse(io.body).p_team); } catch (_) { L.pteam.push('unreadable'); }
      const f = L.onLeft; L.onLeft = null; if (f) f();
      return json(null);
    }
    if (o.joinable && s.indexOf('/rpc/join_team') >= 0) { L.joined = true; return json('team7'); }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) {
      return json(L.left && !L.joined ? [{ id: 'me', name: 'Me', personal: true }, { id: 'team8', name: 'Eight', personal: false }]
        : [{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }, { id: 'team8', name: 'Eight', personal: false }]);
    }
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'GET') return json([], 200, { 'Content-Range': '0-0/0' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    L.unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, 501);
  };
  window.confirm = (m) => { L.asked.push(m); const f = L.onAsk; L.onAsk = null; if (f) f(); return L.answers.length ? L.answers.shift() : true; };
  window.toast = (m) => L.said.push(m);
  if (o.readFails) {
    let first = true;
    window.dbAll = async (...a) => { if (first) { first = false; throw new Error('the store could not be read'); } return L.real.dbAll(...a); };
  }
}, o);

const done = (page) => page.evaluate(async () => {
  const L = window.__L;
  window.fetch = L.real.fetch; window.dbAll = L.real.dbAll; window.confirm = L.real.confirm; window.toast = L.real.toast;
  const dbs = (await indexedDB.databases()).map(d => d.name);
  return { asked: L.asked, left: L.left, pteam: L.pteam, said: L.said.join(' | '), dbs, unknown: L.unknown };
});

const leave = async (page, o) => {
  await arm(page, o);
  await page.evaluate(() => wsLeave());
  return done(page);
};

/* The editor open on team7's trait, drawn on since it was opened, its
   encode held until window.__release(). */
const drawOn = (page) => page.evaluate(async () => {
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'cap.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  openRec = await dbGet('t_cap_hats_approved');
  savedSig = 'drawn on since it was opened';
  const encode = art.toBlob.bind(art);
  let open; const gate = new Promise(r => { open = r; });
  window.__release = open;
  art.toBlob = (cb, t) => { encode(b => { gate.then(() => cb(b)); }, t); };
});

const inTeam7 = (page, id) => page.evaluate(async (id) => {
  const was = activeWs;
  activeWs = 'team7'; dbp = null; dbpName = null;
  let got = null;
  try { got = await dbGet(id); } finally { if (dbp) { try { (await dbp).close(); } catch (_) {} } activeWs = was; dbp = null; dbpName = null; }
  return !!(got && got.blob);
}, id);

/* A tab from before stage 0: it has the store open and holds no lock. */
const openTheOldWay = async (context) => {
  const other = await context.newPage();
  await other.goto('/index.html');
  await other.waitForFunction(() => typeof dbAll === 'function');
  await other.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('chatnft.ws.team7', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' }); };
    r.onsuccess = () => { window.__raw = r.result; res(); };
    r.onerror = () => rej(r.error);
  }));
  return other;
};
const closeOld = async (old) => { await old.evaluate(() => window.__raw.close()); await old.close(); };
const versionOf = (page, name) => page.evaluate(async (name) => ((await indexedDB.databases()).find(d => d.name === name) || {}).version || null, name);

/* A readwrite transaction on team7's own connection (the one db() gave this
   tab), kept running for `ms` by a chain of reads, then writing the trait
   back as it was, synced - the shape of any write of this tab still going
   when Leave's switch closes the connection. */
const writeFor = (ms) => {
  window.__tx = (async () => {
    const d = await dbp;
    const t = d.transaction('items', 'readwrite'), s = t.objectStore('items');
    const t0 = performance.now();
    const step = () => {
      const q = s.get('t_cap_hats_approved');
      q.onsuccess = () => { if (performance.now() - t0 < ms) step(); else s.put(Object.assign({}, q.result, { at: 2 })); };
    };
    step();
    return new Promise(r => { t.oncomplete = () => r('complete'); t.onabort = () => r('abort'); t.onerror = () => r('error'); });
  })();
};

test.describe('Leave says what happened', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0DeleteIfAlone === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); }).catch(() => {});
  });

  /* ---- S16 ---------------------------------------------------------------- */
  test('S16: after a Leave an old tab blocked, opening the project again here says why at once, and opens once that tab has closed', async ({ page, context }) => {
    const old = await openTheOldWay(context);
    const r = await leave(page, {});
    expect(r.said).toContain(OLD);
    const sw = await page.evaluate(async () => {
      const said = [], t = window.toast;
      window.toast = (m) => said.push(m);
      const t0 = Date.now();
      let got;
      try { got = await Promise.race([wsSwitch('team7').then(v => ({ v: v === undefined ? 'undefined' : v })), new Promise(res => setTimeout(() => res('still waiting after 2s'), 2000))]); }
      finally { window.toast = t; }
      return { got, ms: Date.now() - t0, activeWs, sel: document.getElementById('wssel').value, said };
    });
    expect(sw.got, 'the switch answers at once, and says it did not move').toEqual({ v: false });
    expect(sw.ms).toBeLessThan(1000);
    expect(sw.activeWs, 'the page stays where it was').toBe(null);
    expect(sw.sel, 'and so does the dropdown').toBe('');
    expect(sw.said).toEqual([QUEUED]);
    const opened = await page.evaluate(async () => {
      activeWs = 'team7'; dbp = null; dbpName = null;
      const got = await Promise.race([db().then(() => 'opened', e => 'refused: ' + (e && e.message)), new Promise(res => setTimeout(() => res('still waiting after 2s'), 2000))]);
      activeWs = null; dbp = null; dbpName = null;
      return got;
    });
    expect(opened, 'db() refuses at once, with the reason').toBe('refused: ' + QUEUED);
    await closeOld(old);
    /* The request runs once that tab has gone, is aborted, and is forgotten. */
    await expect.poll(() => page.evaluate(() => s0IsQueued('chatnft.ws.team7'))).toBe(false);
    const v = await page.evaluate(async () => {
      activeWs = 'team7'; dbp = null; dbpName = null;
      const d = await db(); const v = d.version;
      d.close(); dbp = null; dbpName = null; activeWs = null;
      return v;
    });
    expect(v, 'and then the store opens, at version 1').toBe(1);
  });

  test('S16: a rejoin while that tab still has it open says it joined, and why the project cannot open yet', async ({ page, context }) => {
    const old = await openTheOldWay(context);
    await arm(page, { joinable: true });
    await page.evaluate(() => wsLeave());
    const r = await page.evaluate(async () => {
      const L = window.__L;
      L.said.length = 0;
      joinKeep('not-a-real-invite'); joinFresh = true;
      const got = await Promise.race([joinIfPending().then(() => 'settled'), new Promise(res => setTimeout(() => res('still waiting after 3s'), 3000))]);
      return { got, joined: L.joined, activeWs, said: L.said.slice() };
    });
    const d = await done(page);
    expect(r.joined, 'the join was sent').toBe(true);
    expect(r.got, 'the rejoin does not wait for that tab').toBe('settled');
    expect(r.activeWs).toBe(null);
    expect(r.said).toContain('You have joined the project. ' + QUEUED);
    expect(d.unknown).toEqual([]);
    await closeOld(old);
  });

  /* A tab from before this update that opens the store between the check
     and the delete blocks the delete (stage0leave.spec.js), which is queued
     the same way: every later open waits behind it until it runs. */
  test('S16: a delete another connection blocked is remembered too, until it has run', async ({ page }) => {
    const r = await page.evaluate(async () => {
      activeWs = 'team7'; dbp = null; dbpName = null;
      await dbAll();
      activeWs = null; dbp = null; dbpName = null;
      const check = window.s0OthersOpen;
      let raw = null;
      window.s0OthersOpen = async (n) => {
        const got = await check(n);
        raw = await new Promise((res, rej) => { const q = indexedDB.open(n, 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        return got;
      };
      let got;
      try { got = await s0DeleteIfAlone('chatnft.ws.team7'); } finally { window.s0OthersOpen = check; }
      const queued = s0IsQueued('chatnft.ws.team7');
      activeWs = 'team7'; dbp = null; dbpName = null;
      const opened = await Promise.race([db().then(() => 'opened', e => 'refused: ' + (e && e.message)), new Promise(res => setTimeout(() => res('waiting'), 1000))]);
      activeWs = null; dbp = null; dbpName = null;
      raw.close();
      const t0 = Date.now();
      while (s0IsQueued('chatnft.ws.team7') && Date.now() - t0 < 3000) await new Promise(res => setTimeout(res, 50));
      const after = s0IsQueued('chatnft.ws.team7');
      const gone = !(await indexedDB.databases()).some(d => d.name === 'chatnft.ws.team7');
      return { got, queued, opened, after, gone };
    });
    expect(r).toEqual({ got: 'blocked', queued: true, opened: 'refused: ' + QUEUED, after: false, gone: true });
  });

  test('S16 control: after a Leave nothing blocked, opening the project again is not refused', async ({ page }) => {
    const r = await leave(page, {});
    expect(r.said).toContain('cleared its copy from this device');
    const got = await page.evaluate(async () => {
      activeWs = 'team7'; dbp = null; dbpName = null;
      const g = await Promise.race([db().then(d => d.version, e => 'refused: ' + (e && e.message)), new Promise(res => setTimeout(() => res('still waiting after 2s'), 2000))]);
      if (dbp) { try { (await dbp).close(); } catch (_) {} }
      activeWs = null; dbp = null; dbpName = null;
      return g;
    });
    expect(got).toBe(1);
  });

  /* ---- S17 ---------------------------------------------------------------- */
  test('S17: this tab\'s own write still running when Leave deletes its copy is waited for - never "a tab from before this update"', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async (fn) => {
      window.__writeFor = new Function('return (' + fn + ')')();
      window.__L.onLeft = () => window.__writeFor(1500);
      await wsLeave();
    }, writeFor.toString());
    const tx = await page.evaluate(() => window.__tx);
    const r = await done(page);
    expect(tx, 'the write ran to its end').toBe('complete');
    expect(r.left).toBe(true);
    expect(r.said).not.toContain(OLD);
    expect(r.said).toContain('cleared its copy from this device');
    expect(r.dbs).not.toContain('chatnft.ws.team7');
    expect(r.unknown).toEqual([]);
  });

  test('S17: one that outlasts the wait is kept, and said as this device\'s own write', async ({ page }) => {
    test.setTimeout(45_000);
    await arm(page, {});
    await page.evaluate(async (fn) => {
      window.__writeFor = new Function('return (' + fn + ')')();
      window.__L.onLeft = () => window.__writeFor(7000);
      await wsLeave();
    }, writeFor.toString());
    const said = await page.evaluate(() => window.__L.said.join(' | '));
    await page.evaluate(() => window.__tx);
    const r = await done(page);
    expect(said).not.toContain(OLD);
    expect(said).toContain('this device was still writing to its copy, so it is kept here for now');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.unknown).toEqual([]);
  });

  /* ---- S18 ---------------------------------------------------------------- */
  test('S18: a save that lands while the question is open is asked about again, and Cancel leaves nothing', async ({ page }) => {
    await arm(page, { answers: [true, false] });
    await drawOn(page);
    await page.evaluate(async () => {
      closeEditor();
      if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
      window.__L.onAsk = () => window.__release();
      await wsLeave();
    });
    const r = await done(page);
    expect(r.asked.length, 'asked twice').toBe(2);
    expect(r.asked[0]).toContain('Your own page is untouched');
    expect(r.asked[1], 'the second question names what landed').toContain('1 unsaved drawing');
    expect([r.left, r.pteam], 'Cancel on the second question leaves nothing').toEqual([false, []]);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(await inTeam7(page, 'autosave.t_cap_hats_approved'), 'the drawing is in the group\'s copy').toBe(true);
    expect(r.unknown).toEqual([]);
  });

  test('S18: the same, answered OK: left, the copy kept, and the toast says what is kept', async ({ page }) => {
    await arm(page, { answers: [true, true] });
    await drawOn(page);
    await page.evaluate(async () => {
      closeEditor();
      window.__L.onAsk = () => window.__release();
      await wsLeave();
    });
    const r = await done(page);
    expect(r.asked.length).toBe(2);
    expect(r.asked[1]).toContain('1 unsaved drawing');
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('what the group has not got is kept on this device');
    expect(r.unknown).toEqual([]);
  });

  test('S18 control: nothing lands while the question is open - asked once, and the clean leave clears the copy', async ({ page }) => {
    const r = await leave(page, {});
    expect(r.asked.length).toBe(1);
    expect(r.said).toContain('cleared its copy from this device');
    expect(r.dbs).not.toContain('chatnft.ws.team7');
  });

  test('S18: a read that failed before the question and works after it - not asked again, and still kept, as the question said', async ({ page }) => {
    const r = await leave(page, { readFails: true });
    expect(r.asked.length).toBe(1);
    expect(r.asked[0]).toContain('could not read what it holds for the group');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('could not read its copy, so it is kept here');
  });

  /* ---- S19 ---------------------------------------------------------------- */
  test('S19: leave_team never names a project other than the one the question was about, even when the page moves during the question', async ({ page }) => {
    await arm(page, {});
    const moved = await page.evaluate(async () => {
      const L = window.__L;
      L.onAsk = () => { window.__sw = wsSwitch('team8'); L.movedTo = activeWs; };
      await wsLeave();
      if (window.__sw) await window.__sw;
      return L.movedTo;
    });
    const r = await done(page);
    expect(r.asked.length, 'the question was asked, about team7').toBe(1);
    expect(moved, 'and the page moved to team8 while it was open').toBe('team8');
    expect(r.pteam.filter(t => t !== 'team7'), 'leave_team named no other project').toEqual([]);
  });
});
