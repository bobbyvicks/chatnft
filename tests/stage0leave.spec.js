/* STAGE 0: LEAVE KEEPS WHAT IT CANNOT READ, AND NEVER DELETES A STORE
   ANOTHER TAB HOLDS (design D1: "a failed read counts as 'unknown: keep',
   and it never deletes while another tab holds the database").

   Before this, wsLeave's read of the store, on failing, set the count to
   nothing (its catch that set `unsent=[]; drawings=0`), so a store it could
   not read was "nothing to keep" and was deleted (its inline
   `indexedDB.deleteDatabase(dbName)`), and a tab holding the store only made
   that delete wait, queued, until that tab closed - and then destroyed
   whatever it had saved meanwhile. "Another tab" is two kinds: a stage-0
   tab, which holds the store's open lock, and a tab from before stage 0 -
   on the day this ships, every other open tab - which holds only a
   connection. leavegroup.spec.js keeps pinning the rest: the question names
   what is unsent, a clean leave clears the copy, a leave with something
   unsent keeps it.

   And what the controller's audit of this task found on the page Task 10
   left (anchor-audit/amend-task14.md), each measured on it first:
   - the count skipped a draft with no traitId: the canvas that is not a
     trait yet (an imported PNG, an extraction), the only copy of that
     picture, was deleted with "Your own page is untouched" (Finding 1);
   - a drawing's save still being written when Leave was pressed landed in
     the group's store after the count - wsSwitch waits for it before it
     moves - and was deleted with it (Finding 2);
   - a switch that finished during Leave's awaits had Leave ask about one
     project and send leave_team for another: measured, it asked about
     team7 and left team8, and deleted team7's copy (Finding 3);
   - Leave's own move off the project, overtaken by a move back to it,
     left the page on the project whose copy was then deleted (Finding 5);
   - a tab from before stage 0 that blocks the version-2 request leaves it
     queued, and every later open of that store waits behind it until that
     tab closes (Finding 7; measured, below). */
import { test, expect } from '@playwright/test';

/* Sets the page up on team7, holding one synced trait (and, with
   `picture`, the unattached canvas's draft), and puts in the stand-ins.
   The Leave itself runs in the test; `done` takes the stand-ins out and
   says what happened. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
  await dbClear();
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob: new Blob([new Uint8Array(16)]),
    w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-1', path: 'team7/c1/trait-cap-hats-approved.png', synced: true });
  /* The canvas that is not a trait yet drafts under one fixed key with no
     traitId (AUTO_ID, draftId). */
  if (o.picture) await dbPut({ id: 'autosave.working', kind: 'autosave', traitId: null, name: 'x.png', w: 16, h: 16, at: 2, blob: new Blob([new Uint8Array(16)]) });
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  /* No real reload here: only stage0reload.spec.js reloads the page. */
  sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1');
  if (o.flag) localStorage.setItem('pb.migrating.chatnft.ws.team7.u1', '1');
  const json = (x, st, h) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  const L = window.__L = { unknown: [], pteam: [], reads: 0, asked: null, said: [], left: false, onProto: null, onAsk: null, onLeft: null,
    real: { fetch: window.fetch, dbAll: window.dbAll, confirm: window.confirm, toast: window.toast } };
  window.__unknown = L.unknown;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('select=id,protocol,switching_at') >= 0) {
      L.reads++;
      const f = L.onProto; L.onProto = null; if (f) f();
      return o.protoFails ? json({ code: 'XX000', message: 'down' }, 500) : json([{ id: 'c1', protocol: 1, switching_at: null }]);
    }
    if (s.indexOf('/rpc/leave_team') >= 0) {
      L.left = true;
      /* Which project it left: the one counted and asked about (Finding 3). */
      try { L.pteam.push(JSON.parse(io.body).p_team); } catch (_) { L.pteam.push('unreadable'); }
      const f = L.onLeft; L.onLeft = null; if (f) f();
      return json(null);
    }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) {
      if (L.left && o.teamsFailAfter) return json({ code: 'XX000', message: 'down' }, 500);
      return json(L.left ? [{ id: 'me', name: 'Me', personal: true }, { id: 'team8', name: 'Eight', personal: false }]
        : [{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }, { id: 'team8', name: 'Eight', personal: false }]);
    }
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'GET') return json([], 200, { 'Content-Range': '0-0/0' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    L.unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, 501);
  };
  window.confirm = (m) => { L.asked = m; const f = L.onAsk; L.onAsk = null; if (f) f(); return true; };
  window.toast = (m) => L.said.push(m);
  if (o.readFails) {
    let first = true;
    window.dbAll = async (...a) => { if (first) { first = false; throw new Error('the store could not be read'); } return L.real.dbAll(...a); };
  }
}, o);

const done = (page) => page.evaluate(async () => {
  const L = window.__L;
  window.fetch = L.real.fetch; window.dbAll = L.real.dbAll; window.confirm = L.real.confirm; window.toast = L.real.toast;
  localStorage.removeItem('pb.migrating.chatnft.ws.team7.u1');
  const dbs = (await indexedDB.databases()).map(d => d.name);
  return { asked: L.asked, left: L.left, pteam: L.pteam, reads: L.reads, said: L.said.join(' | '), dbs, unknown: L.unknown };
});

const leave = async (page, o) => {
  await arm(page, o);
  await page.evaluate(() => wsLeave());
  return done(page);
};

/* The editor open on team7: the trait (`trait`) or the canvas that is not a
   trait yet, drawn on since it was opened, its encode held until
   window.__release() - then it hands over the picture, or nothing
   (`noBlob`: a save that writes nothing), or never (`never`). */
const drawOn = (page, o) => page.evaluate(async (o) => {
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'cap.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  openRec = o.trait ? await dbGet('t_cap_hats_approved') : null;
  savedSig = 'drawn on since it was opened';
  const encode = art.toBlob.bind(art);
  let open; const gate = new Promise(r => { open = r; });
  window.__release = open;
  art.toBlob = (cb, t) => { if (o.never) return; encode(b => { gate.then(() => cb(o.noBlob ? null : b)); }, t); };
}, o);

/* A record in team7's store, read after the Leave. */
const inTeam7 = (page, id) => page.evaluate(async (id) => {
  const was = activeWs;
  activeWs = 'team7'; dbp = null; dbpName = null;
  let got = null;
  try { got = await dbGet(id); } finally { if (dbp) { try { (await dbp).close(); } catch (_) {} } activeWs = was; dbp = null; dbpName = null; }
  return !!(got && got.blob);
}, id);

const openElsewhere = async (context) => {
  const other = await context.newPage();
  await other.goto('/index.html');
  await other.waitForFunction(() => typeof s0CloseAll === 'function');
  await other.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbAll(); });
  return other;
};
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
const versionOf = (page, name) => page.evaluate(async (name) => ((await indexedDB.databases()).find(d => d.name === name) || {}).version || null, name);

const MOVING = 'Did not leave - the page is still moving to another project';
const STOPPED = 'Did not leave - the page moved to another project, or signed out, while Leave was checking';

test.describe('stage 0: Leave', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0DeleteIfAlone === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); });
  });

  test('a read that fails keeps the copy, and the question and the toast say so', async ({ page }) => {
    const r = await leave(page, { readFails: true });
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.asked).toContain('could not read what it holds for the group');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('could not read its copy, so it is kept here');
    expect(r.unknown).toEqual([]);
  });

  test('a protocol read that does not answer keeps the copy too: "unknown: keep"', async ({ page }) => {
    const r = await leave(page, { protoFails: true });
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.asked).toContain('could not check the project with the server');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('could not check the project, so its copy is kept here');
    expect(r.unknown).toEqual([]);
  });

  test('another stage-0 tab with the project open: the copy is kept, and the toast says why', async ({ page, context }) => {
    const other = await openElsewhere(context);
    const r = await leave(page, {});
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('another BuildaNFT tab has it open');
    expect(r.unknown).toEqual([]);
    await other.close();
  });

  test('a tab from before this update with the project open: the copy is kept, and stays at version 1', async ({ page, context }) => {
    const old = await openTheOldWay(context);
    const r = await leave(page, {});
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('from before this update has it open, so its copy is kept');
    /* The version-2 request stays queued until that tab closes, and holds
       every later open of the store behind it (next test), so the person
       is told what ends it (Finding 7). */
    expect(r.said).toContain('Close or reload that tab');
    expect(r.unknown).toEqual([]);
    await old.evaluate(() => window.__raw.close());
    await old.close();
    /* The version-2 request that saw it was waiting for that tab; now it
       runs, and is aborted before it changes anything. */
    await expect.poll(() => versionOf(page, 'chatnft.ws.team7')).toBe(1);
  });

  /* Ruling F-14: measured before the version-2 request was accepted. A
     third open of the store, after it was blocked, does not answer while
     that tab lives - in this tab and in any other (measured 2026-09-28,
     with an open of our own). Nothing a page can do withdraws the queued
     request: removing an iframe that made it, terminating a worker that
     made it, and closing or reloading the page that made it each left the
     third open waiting (measured). What ends it is that tab closing or
     reloading, as the toast says; then the request runs, is aborted, and
     the open goes ahead at version 1. This pins that, so a browser that
     changes it is noticed. */
  test('after that, opening the project in this tab waits for that tab, and goes ahead at version 1 once it closes', async ({ page, context }) => {
    const old = await openTheOldWay(context);
    const r = await leave(page, {});
    expect(r.said).toContain('from before this update has it open');
    await page.evaluate(() => {
      window.__opened = null;
      activeWs = 'team7'; dbp = null; dbpName = null;
      db().then(d => { window.__opened = d.version; }, e => { window.__opened = 'error ' + (e && e.name); });
    });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__opened), 'the open waits behind the version-2 request, which waits for that tab').toBe(null);
    await old.evaluate(() => window.__raw.close());
    await old.close();
    await expect.poll(() => page.evaluate(() => window.__opened)).toBe(1);
    await page.evaluate(async () => { if (dbp) (await dbp).close(); dbp = null; dbpName = null; });
  });

  /* And a version-2 request whose page has gone does not upgrade the store
     when it finally runs: an upgrade with nobody to abort it would leave
     the store at 2, which the page's own open, at 1, can never open again.
     Measured with the page reloaded before that tab closed. */
  test('the page that asked reloads before that tab closes: the store stays at version 1, and opens', async ({ page, context }) => {
    const old = await openTheOldWay(context);
    const r = await leave(page, {});
    expect(r.said).toContain('from before this update has it open');
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('chatnft.ws'); });
    await page.reload();
    await page.waitForFunction(() => typeof s0DeleteIfAlone === 'function');
    await old.evaluate(() => window.__raw.close());
    await old.close();
    await expect.poll(() => versionOf(page, 'chatnft.ws.team7')).toBe(1);
    const v = await page.evaluate(async () => {
      activeWs = 'team7'; dbp = null; dbpName = null;
      const d = await db(); const v = d.version;
      d.close(); dbp = null; dbpName = null; activeWs = null;
      return v;
    });
    expect(v).toBe(1);
  });

  test('THE CONTROL: with that tab closed, the same clean leave clears the copy', async ({ page, context }) => {
    const other = await openElsewhere(context);
    await other.close();
    const r = await leave(page, {});
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).not.toContain('chatnft.ws.team7');
    expect(r.said).toContain('cleared its copy from this device');
    expect(r.unknown).toEqual([]);
  });

  test('this tab\'s own open handle never refuses its own Leave', async ({ page }) => {
    const r = await page.evaluate(async () => {
      activeWs = 'team7'; dbp = null; dbpName = null;
      await dbAll();
      activeWs = null; dbp = null; dbpName = null;
      return s0DeleteIfAlone('chatnft.ws.team7');
    });
    expect(r, 'closed, its lock waited out, then deleted - not "other"').toBe(true);
  });

  /* A tab from before this update that opens the store in the moment
     between the check and the delete blocks the delete, which cannot be
     withdrawn either: it runs when that tab closes. Said as what it is. */
  test('a connection opened between the check and the delete: "blocked", and the delete runs when it closes', async ({ page }) => {
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
      const before = (await indexedDB.databases()).map(d => d.name);
      raw.close();
      await new Promise(r => setTimeout(r, 300));
      const after = (await indexedDB.databases()).map(d => d.name);
      return { got, before: before.includes('chatnft.ws.team7'), after: after.includes('chatnft.ws.team7') };
    });
    expect(r).toEqual({ got: 'blocked', before: true, after: false });
  });

  test('while held, Leave asks nothing and leaves nothing', async ({ page }) => {
    const r = await leave(page, { flag: true });
    expect([r.asked, r.left]).toEqual([null, false]);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.unknown).toEqual([]);
  });

  /* Finding 1. The only copy of a picture that has never been saved
     anywhere: the question named nothing, and the store went (measured). */
  test('an unsaved picture - the canvas that is not a trait yet - keeps the copy, and the question names it', async ({ page }) => {
    const r = await leave(page, { picture: true });
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.asked).toContain('an unsaved picture (open it from the restore bar and Save to project)');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('what the group has not got is kept on this device');
    expect(r.unknown).toEqual([]);
  });

  /* Finding 2 (a). A drawing's save still being written when Leave is
     pressed - the editor's closing save - is waited for, bounded as a
     switch waits, before the count, so the question can name it. */
  test('a drawing\'s save still being written when Leave is pressed is waited for, and the question names it', async ({ page }) => {
    await arm(page, {});
    await drawOn(page, { trait: true });
    await page.evaluate(async () => {
      closeEditor();
      if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
      setTimeout(() => window.__release(), 300);
      await wsLeave();
    });
    const r = await done(page);
    expect(r.asked).toContain('1 unsaved drawing');
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('what the group has not got is kept on this device');
    expect(r.unknown).toEqual([]);
  });

  /* Finding 2 (b). One that lands only after the question - past the wait's
     bound, or started after the count (a tab hidden during the leave) - is
     filed in the group's store by the switch off it, which waits for it.
     The delete is decided on the store as it is then: holding the lock,
     with no other connection open, inside the version-2 request, before it
     is aborted. Measured before this: the draft was deleted with "cleared". */
  test('a drawing\'s save that lands only after the question: the store is judged as it is when deleted, and kept', async ({ page }) => {
    await arm(page, {});
    await drawOn(page, { trait: true });
    await page.evaluate(async () => {
      closeEditor();
      if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
      window.__L.onAsk = () => window.__release();
      await wsLeave();
    });
    const r = await done(page);
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('something was saved to its copy while leaving, so it is kept on this device');
    expect(r.said).not.toContain('cleared');
    expect(await inTeam7(page, 'autosave.t_cap_hats_approved'), 'the drawing is still in the group\'s copy').toBe(true);
    expect(r.unknown).toEqual([]);
  });

  /* Finding 3. Leave is for the project it was pressed on. */
  test('a switch still waiting for a save when Leave is pressed: Leave does nothing, at once', async ({ page }) => {
    await arm(page, {});
    await drawOn(page, {});
    const stillSaving = await page.evaluate(async () => {
      closeEditor();
      window.__sw = wsSwitch('team8');
      if (s0WsWant !== 'team8') throw new Error('the switch is not waiting');
      await wsLeave();
      const still = { saving: !!s0SaveInFlight, reads: window.__L.reads };
      window.__release();
      await window.__sw;   /* the switch's own reads, of team8, come after */
      return still;
    });
    const r = await done(page);
    expect(stillSaving.saving, 'Leave answered while the save was still being written').toBe(true);
    expect(stillSaving.reads, 'not even the protocol read').toBe(0);
    expect([r.asked, r.left]).toEqual([null, false]);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain(MOVING);
    expect(r.unknown).toEqual([]);
  });

  /* The count is checked after it is taken: a switch asked for during it,
     still waiting for a save the count did not wait for (one started
     after Leave's own wait - a tab hidden, say), has the dropdown on the
     other project already. */
  test('a switch asked for during Leave\'s count, waiting for a save: it asks nothing and leaves nothing', async ({ page }) => {
    await arm(page, {});
    await drawOn(page, {});
    await page.evaluate(async () => {
      const L = window.__L;
      let first = true;
      window.dbAll = async (...a) => {
        const got = await L.real.dbAll(...a);
        if (first) {
          first = false;
          autosaveNow();
          window.__sw = wsSwitch('team8');
          if (s0WsWant !== 'team8') throw new Error('the switch is not waiting');
        }
        return got;
      };
      await wsLeave();
      window.__L.after = activeWs;
      window.__release();
      await window.__sw;
    });
    const r = await done(page);
    expect([r.asked, r.left]).toEqual([null, false]);
    expect(await page.evaluate(() => window.__L.after), 'the page had not moved yet when Leave ended').toBe('team7');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain(STOPPED);
    expect(r.unknown).toEqual([]);
  });

  test('a switch during Leave\'s protocol read: it asks nothing and leaves nothing', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => {
      window.__L.onProto = () => { window.__sw = wsSwitch('team8'); };
      await wsLeave();
      await window.__sw;
    });
    const r = await done(page);
    expect([r.asked, r.left]).toEqual([null, false]);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain(STOPPED);
    expect(r.unknown).toEqual([]);
  });

  test('a sign-out during Leave\'s protocol read: it asks nothing and leaves nothing', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => {
      window.__L.onProto = () => { cloudSignOut(); };
      await wsLeave();
    });
    const r = await done(page);
    expect([r.asked, r.left]).toEqual([null, false]);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain(STOPPED);
    expect(r.unknown).toEqual([]);
  });

  /* A sign-out waits, bounded, for the drawing's save, with the session
     already gone and the project still the one left; Leave, waiting for the
     same save from before the sign-out, comes out of its wait first. */
  test('a sign-out while Leave waits for a save that never lands: it asks nothing and leaves nothing', async ({ page }) => {
    await arm(page, {});
    await drawOn(page, { never: true });
    await page.evaluate(async () => {
      closeEditor();
      if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
      setTimeout(() => { cloudSignOut(); }, 500);
      await wsLeave();
      window.__L.leftAt = activeWs;
      await new Promise(r => setTimeout(r, 800));   /* past the sign-out's own wait */
    });
    const r = await done(page);
    expect([r.asked, r.left]).toEqual([null, false]);
    expect(await page.evaluate(() => window.__L.leftAt), 'Leave ended while the sign-out was still waiting').toBe('team7');
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain(STOPPED);
    expect(r.unknown).toEqual([]);
  });

  /* Finding 5. Leave's switch off the project, overtaken while it waits for
     a save by a switch away and back, ends where it began; with the team
     list unreadable the page stays on the project it has left. */
  test('Leave\'s own move off the project is overtaken back onto it: the copy the page shows is kept', async ({ page }) => {
    await arm(page, { teamsFailAfter: true });
    await drawOn(page, { noBlob: true });
    await page.evaluate(async () => {
      const L = window.__L;
      L.onAsk = () => { autosaveNow(); };   /* a save that starts after the count: a tab hidden, say */
      L.onLeft = () => setTimeout(() => { wsSwitch('team8'); wsSwitch('team7'); window.__release(); }, 50);
      await wsLeave();
    });
    const r = await done(page);
    expect(await page.evaluate(() => activeWs)).toBe('team7');
    expect(r.left).toBe(true);
    expect(r.pteam).toEqual(['team7']);
    expect(r.dbs).toContain('chatnft.ws.team7');
    expect(r.said).toContain('the page is still showing it, so its copy is kept on this device');
    expect(r.said).not.toContain('cleared');
    expect(r.unknown).toEqual([]);
  });
});
