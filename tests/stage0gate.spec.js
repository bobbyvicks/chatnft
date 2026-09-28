/* STAGE 0: THE PROTOCOL READ, AND WHAT IT HOLDS BACK (design D1).

   While a project is being switched, or has switched, or this account's
   migration flag is set, the page keeps every change on the device, marked
   unsent through the failure paths it already has, and sends, pulls, removes,
   clears, imports and leaves nothing. Each hold here is beside a control that
   the same action goes through when nothing is held, because a gate that
   refuses everything reads exactly like caution. */
import { test, expect } from '@playwright/test';
import { armStage0, seedTrait, findTrait, S0_SWITCHING, S0_SWITCHED } from './helpers.js';

const log = (page) => page.evaluate(() => window.__s0.log);
const sends = async (page) => (await log(page)).filter(l => /^(POST|PATCH|DELETE) /.test(l) && l.indexOf('/rpc/my_team') < 0);
const bar = (page) => page.evaluate(() => ({ shown: !document.getElementById('s0bar').hidden, text: document.getElementById('s0text').textContent }));
const save = (page) => page.evaluate(async () => {
  const why = {};
  const ok = await cloudSyncOne(await dbGet('t_cap_hats_wip'), null, why);
  return { ok: !!ok, reason: why.reason || null, words: cloudWhyNot(why) };
});
const pngFile = (page, rel) => page.evaluate(async (rel) => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16);
  window.__png = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer());
  window.__rel = rel;
}, rel);

test.describe('stage 0: the protocol read and what it holds back', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Check === 'function');
    await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbClear(); });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => {
      if (window.__s0real) window.fetch = window.__s0real;
      for (const k of Object.keys(localStorage)) if (k.indexOf('pb.migrating.') === 0) localStorage.removeItem(k);
      activeWs = null; localStorage.removeItem('chatnft.session');
    });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  test('THE CONTROL: a row without the two fields is protocol 1, and a save goes up', async ({ page }) => {
    await armStage0(page, { row: 'missing' });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).ok).toBe(true);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
    expect((await bar(page)).shown).toBe(false);
  });

  test('a read that fails counts as protocol 1, and a save goes up', async ({ page }) => {
    await armStage0(page, { protoStatus: 500 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).ok).toBe(true);
  });

  test('no project row counts as protocol 1, and a save goes up', async ({ page }) => {
    await armStage0(page, { row: 'none' });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).ok).toBe(true);
  });

  test('switching: a weight is kept here as unsent, nothing is sent, and the bar says why', async ({ page }) => {
    await armStage0(page, { switching: '2026-09-27T12:00:00+00:00' });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => { await setRarity(await dbGet('t_cap_hats_wip'), 50); });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.rarity, r.synced, r.unsent]).toEqual([50, false, 'meta']);
    expect(await sends(page)).toEqual([]);
    expect(await bar(page)).toEqual({ shown: true, text: S0_SWITCHING });
  });

  test('protocol 2: a status change is kept here, unsent, nothing is sent, and the bar says reload', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => { await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'approved');
    expect(r.synced).toBeFalsy();
    expect(await sends(page)).toEqual([]);
    const b = await bar(page);
    expect(b.shown).toBe(true);
    expect(b.text).toContain(S0_SWITCHED);
  });

  test('a save while held is reported with the held words, not as a failure to reach the group', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    const r = await save(page);
    expect([r.ok, r.reason]).toEqual([false, 'held']);
    expect(r.words.toLowerCase()).toContain(S0_SWITCHED.toLowerCase());
    expect(await sends(page)).toEqual([]);
  });

  test('a pull while held asks for no traits, after one read', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await page.evaluate(() => cloudPull({ quiet: true }));
    expect((await log(page)).filter(l => l.indexOf('/rest/v1/traits') >= 0)).toEqual([]);
    expect(await page.evaluate(() => window.__s0.reads)).toBe(1);
  });

  test('THE CONTROL: with nothing held, the same pull asks for the traits', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await page.evaluate(() => cloudPull({ quiet: true }));
    expect((await log(page)).some(l => l.indexOf('/rest/v1/traits') >= 0)).toBe(true);
  });

  test('an editor Save while held keeps the trait here, unsent, and sends nothing', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    const r = await page.evaluate(async () => {
      LAYERS = ['hats', 'unsorted'];
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d').fillRect(2, 2, 12, 12);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await dbPut({ id: 't_cap_hats_wip', kind: 'trait', name: 'cap', layer: 'hats', status: 'wip', blob, w: 16, h: 16, rarity: 1, at: 1,
        rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-hats-wip.png', synced: true });
      await openTraitRecord(await dbGet('t_cap_hats_wip'));
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 2, 2);
      await saveTraitNow();
      const rec = await dbGet('t_cap_hats_wip');
      return rec ? { synced: !!rec.synced, at: rec.at } : null;
    });
    expect(r, 'the trait is still here, under its own id').not.toBeNull();
    expect(r.synced, 'kept as unsent').toBe(false);
    expect(r.at, 'and it is the new save').toBeGreaterThan(1);
    expect(await sends(page)).toEqual([]);
  });

  test('two accounts on one browser: A saw protocol 2 on the personal store; B, signed in after, still saves', async ({ page }) => {
    await armStage0(page, { ws: null, uid: 'u1', protocol: 2 });
    expect(await page.evaluate(async () => { await s0Check(true); return s0Held(); })).toBe('switched');
    await armStage0(page, { ws: null, uid: 'u2', protocol: 1, keepState: true });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await page.evaluate(() => s0Held()), 'A\'s switched project is not B\'s').toBeNull();
    expect((await save(page)).ok).toBe(true);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
  });

  test('a switch called off: what was kept here goes up after the next read, unasked', async ({ page }) => {
    await armStage0(page, { switching: '2026-09-27T12:00:00+00:00', after: { switching: null } });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => { await setRarity(await dbGet('t_cap_hats_wip'), 50); });
    expect(await sends(page), 'held while switching').toEqual([]);
    await page.evaluate(() => s0Check(true));
    await expect.poll(async () => (await sends(page)).filter(l => /^(PATCH|POST) \/rest\/v1\/traits/.test(l)).length,
      { timeout: 10000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => s0Held())).toBeNull();
  });

  test('a read that hangs gives up: a save, a folder import and Clear still finish', async ({ page }) => {
    await armStage0(page, { protoHang: true });
    await page.evaluate(() => { S0_READ_MS = 300; });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await pngFile(page, 'col/hats/wip/hat.png');
    const r = await page.evaluate(async () => {
      const t0 = Date.now();
      const saved = !!(await cloudSyncOne(await dbGet('t_cap_hats_wip'), null, {}));
      const rc = window.confirm; window.confirm = () => true;
      let imported;
      try {
        imported = await bulkImport([fileWithPath(window.__png, window.__rel)]);
        await document.getElementById('clearproj').onclick();
      } finally { window.confirm = rc; }
      const names = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name);
      return { saved, imported: imported === undefined ? 'refused' : 'ran', names, ms: Date.now() - t0 };
    });
    expect([r.saved, r.imported, r.names]).toEqual([true, 'ran', []]);
    expect(r.ms, 'reads that each gave up, not a hang').toBeLessThan(15000);
    expect(await page.evaluate(() => window.__s0.reads)).toBeGreaterThan(0);
  });

  test('this account\'s migration flag holds even on protocol 1', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await page.evaluate(() => localStorage.setItem('pb.migrating.chatnft.ws.team7.u1', String(Date.now())));
    expect((await save(page)).reason).toBe('held');
    expect(await page.evaluate(() => s0Held())).toBe('migrating');
  });

  test('THE CONTROL: another account\'s flag on this browser does not hold this one', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await page.evaluate(() => localStorage.setItem('pb.migrating.chatnft.ws.team7.u2', String(Date.now())));
    expect((await save(page)).ok).toBe(true);
  });

  test('a flag heard on the pixelbench channel shows the bar at once and redraws nothing', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await page.evaluate(async () => {
      let redraws = 0;
      const real = window.renderShelf;
      window.renderShelf = async () => { redraws++; };
      localStorage.setItem('pb.migrating.chatnft.ws.team7.u1', '1');
      new BroadcastChannel('pixelbench').postMessage({ db: 'chatnft.ws.team7', uid: 'u1', migrating: true });
      await new Promise(res => setTimeout(res, 400));
      window.renderShelf = real;
      return { redraws, shown: !document.getElementById('s0bar').hidden };
    });
    expect(r).toEqual({ redraws: 0, shown: true });
  });

  test('P0001 from the insert, and the read after says protocol 2: held, not refused', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { protocol: 2 }, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).reason).toBe('held');
    expect(await page.evaluate(() => s0Held())).toBe('switched');
  });

  test('P0001, and the read after it fails: counted as switching, kept here', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { protoStatus: 500 }, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).reason).toBe('held');
    expect(await page.evaluate(() => s0Held())).toBe('switching');
  });

  test('THE CONTROL: a check violation with protocol 1 after it is still "refused (400)"', async ({ page }) => {
    await armStage0(page, { protocol: 1, insert: { status: 400, body: { code: '23514', message: 'check' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    const r = await save(page);
    expect(r.reason).toBe('refused');
    expect(r.words).toContain('the server refused it (400)');
  });

  test('a store seen on protocol 2 stays there when the next read fails; switching does not', async ({ page }) => {
    await armStage0(page, { protocol: 2, after: { protoStatus: 500 } });
    expect(await page.evaluate(async () => { await s0Check(true); const a = s0Held(); await s0Check(true); return [a, s0Held()]; }))
      .toEqual(['switched', 'switched']);
    await armStage0(page, { switching: '2026-09-27T12:00:00+00:00', after: { protoStatus: 500 } });
    expect(await page.evaluate(async () => { await s0Check(true); const a = s0Held(); await s0Check(true); return [a, s0Held()]; }))
      .toEqual(['switching', null]);
  });

  test('Clear, a folder import and a removal wait while held, and ask nothing', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await pngFile(page, 'col/hats/wip/hat.png');
    const r = await page.evaluate(async () => {
      let asked = 0;
      const rc = window.confirm; window.confirm = () => { asked++; return true; };
      try {
        await document.getElementById('clearproj').onclick();
        const imported = await bulkImport([fileWithPath(window.__png, window.__rel)]);
        const removed = await dbDelShared(await dbGet('t_cap_hats_wip'));
        const names = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort();
        return { asked, imported: imported === undefined ? 'refused' : 'ran', removed, names };
      } finally { window.confirm = rc; }
    });
    expect(r).toEqual({ asked: 0, imported: 'refused', removed: 'held', names: ['cap'] });
    expect(await sends(page)).toEqual([]);
  });

  test('THE CONTROL: with nothing held, the same removal goes', async ({ page }) => {
    await armStage0(page, { protocol: 1, deleted: [{ id: 'row-1', path: 'team7/c1/trait-cap-hats-wip.png' }] });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    const removed = await page.evaluate(async () => dbDelShared(await dbGet('t_cap_hats_wip')));
    expect(removed).toBe(true);
    expect(await findTrait(page, 'trait', 'cap', 'hats', 'wip')).toBeNull();
  });

  test('THE CONTROL: with nothing held, the same fixer save sends its trait', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await pngFile(page, 'hats/wip/cap.png');
    const n = await page.evaluate(async () => fixSaveFiles([fileWithPath(window.__png, window.__rel)], fixSaveSay));
    expect(n).toBe(1);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
  });

  test('a fixer save while held is kept here, unsent, and its line says why', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await pngFile(page, 'hats/wip/cap.png');
    const r = await page.evaluate(async () => {
      const n = await fixSaveFiles([fileWithPath(window.__png, window.__rel)], fixSaveSay);
      const rec = (await dbAll()).find(i => i.kind === 'trait' && i.name === 'cap');
      return { n, synced: rec ? !!rec.synced : null, line: document.getElementById('fixsaveout').textContent };
    });
    expect([r.n, r.synced]).toEqual([1, false]);
    expect(r.line).toContain(S0_SWITCHED);
    expect(await sends(page)).toEqual([]);
  });

  test('Save to cloud and a pull each read afresh; the sends inside one share its read', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    const reads = await page.evaluate(async () => {
      await s0Check(true); const a = window.__s0.reads;
      await cloudPull({ quiet: true }); const b = window.__s0.reads;
      await cloudPush(); const c = window.__s0.reads;
      return [a, b, c];
    });
    expect(reads).toEqual([1, 2, 3]);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits')), 'the control: the push did send').toBe(true);
  });
});

test.describe('stage 0: the read every two minutes', () => {
  test('a visible, signed-in page reads every two minutes; hidden or signed out, it does not', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-27T12:00:00Z') });
    await page.goto('/index.html');
    await expect.poll(() => page.evaluate(() => typeof s0Check)).toBe('function');
    await armStage0(page, { protocol: 1 });
    await page.clock.runFor(120000);
    await expect.poll(() => page.evaluate(() => window.__s0.reads)).toBe(1);
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__s0.reads)).toBe(1);
    /* Visible again, but on a token that would need renewing: the poll leaves
       it for the person's next action (Decision 23), and asks nothing. */
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      const s = JSON.parse(localStorage.getItem('chatnft.session'));
      s.expires_at = Math.floor(Date.now() / 1000) - 10;
      localStorage.setItem('chatnft.session', JSON.stringify(s));
    });
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__s0.reads)).toBe(1);
    expect((await page.evaluate(() => window.__s0.log)).filter(l => l.indexOf('/auth/v1/token') >= 0), 'no renewal was asked for').toEqual([]);
    await page.evaluate(() => { localStorage.removeItem('chatnft.session'); });
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__s0.reads)).toBe(1);
    /* F-09 (controller's ruling): the poll's stand-in answered everything it was asked. */
    expect(await page.evaluate(() => window.__s0.unknown), 'every request had a named answer (design E2)').toEqual([]);
    await page.evaluate(() => { if (window.__s0real) window.fetch = window.__s0real; activeWs = null; });
  });
});

/* THE READ LANDS WHILE THE PAGE IS MOVING OFF THE PROJECT (controller's audit,
   Finding 2). Sign-out and a switch wait, bounded, for a drawing's last save
   before they move the store, the uid and wsGen (Task 10), so a read that
   lands during that wait still passes s0Check's check that the store and
   account are unchanged. When it finds a switch called off, what was kept
   here stays kept: sent now, it went out for a project being left, or said
   "Sign in first" over a sign-out (both measured on the plan's patch602).
   The closing save here is HELD on a gate, and
   each case asserts, in the same evaluate, that the move is still waiting
   when the read lands and that the save is still in flight 500 ms later,
   past any resend's requests; unheld, the move could land first and the old
   check would hide the defect. `move` is 'switch' (to My page), 'signOut',
   or 'none' (the control: the same, with nothing moving, and the resend
   goes). s0SeenUid is set as a verified start leaves it, which is what
   keeps the uid through sign-out's wait. */
const resendAcrossMove = (page, move) => page.evaluate(async (move) => {
  s0SeenUid = 'u1';
  window.__toasts = [];
  const shown = window.toast;
  window.toast = (m) => { window.__toasts.push(String(m)); try { shown(m); } catch (_) {} };
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'x.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  await autosaveNow();
  const encode = art.toBlob.bind(art);
  let release; const gate = new Promise(r => { release = r; });
  art.toBlob = (cb, t) => encode(b => { gate.then(() => cb(b)); }, t);
  closeEditor();
  if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
  /* The read that finds the switch called off, held until the move has begun. */
  const f = window.fetch; let answer; const held = new Promise(r => { answer = r; });
  window.fetch = async (u, io) => { if (String(u).indexOf('select=id,protocol,switching_at') >= 0) await held; return f(u, io); };
  const waitingNow = () => move === 'switch' ? s0WsWant !== undefined : move === 'signOut' ? !!s0SignOutWait : true;
  const reading = s0Check(true);
  let moving = null;
  if (move === 'switch') moving = wsSwitch(null);
  if (move === 'signOut') moving = cloudSignOut();
  const waiting = waitingNow();
  answer();
  await reading;
  const stillWaiting = waitingNow();
  const heldAfterRead = s0Held();
  await new Promise(r => setTimeout(r, 500));
  const stillInFlight = !!s0SaveInFlight;
  release();
  await moving;
  await new Promise(r => setTimeout(r, 500));
  window.fetch = f; window.toast = shown; art.toBlob = encode;
  activeWs = 'team7'; dbp = null; dbpName = null;
  const rec = await dbGet('t_cap_hats_wip');
  return { waiting, stillWaiting, heldAfterRead, stillInFlight, synced: !!(rec && rec.synced), signInFirst: window.__toasts.filter(t => t === 'Sign in first').length };
}, move);
/* Writes to the traits table, and picture uploads (a storage listing is a read). */
const traitSends = async (page) => (await log(page)).filter(l => /^(PATCH|POST|DELETE) \/rest\/v1\/traits|^POST \/storage\/v1\/object\/(?!list\/)/.test(l));
const switchCalledOff = async (page) => {
  await armStage0(page, { switching: '2026-09-27T12:00:00+00:00', after: { switching: null } });
  await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
  await page.evaluate(async () => { await setRarity(await dbGet('t_cap_hats_wip'), 50); });
  expect(await sends(page), 'held while switching').toEqual([]);
};

/* A SAVE TO CLOUD WHOSE READ OUTLIVES THE PROJECT (controller's audit, Finding
   5). cloudPush takes the collection and team first, then reads; a switch
   with nothing waiting moves the store at once, s0Check then leaves the
   state alone (the store changed), and the hold was judged for the store
   switched to, with no read: the push sent that store's traits into the
   first project's collection. The first protocol read is held until the
   switch; each store holds one unsent trait. */
const pushAcrossSwitch = (page, doSwitch) => page.evaluate(async (doSwitch) => {
  const f = window.fetch; let answer; const held = new Promise(r => { answer = r; });
  let asked = false;
  window.fetch = async (u, io) => { if (!asked && String(u).indexOf('select=id,protocol,switching_at') >= 0) { asked = true; await held; } return f(u, io); };
  const pushing = cloudPush();
  for (let i = 0; i < 300 && !asked; i++) await new Promise(r => setTimeout(r, 10));
  const readHeld = asked;
  const switching = doSwitch ? wsSwitch(null) : null;
  const moved = activeWs === null;
  answer();
  await pushing; await switching;
  await new Promise(r => setTimeout(r, 300));
  window.fetch = f;
  return { readHeld, moved };
}, doSwitch);
const twoStores = async (page) => {
  await armStage0(page, { protocol: 1 });
  await seedTrait(page, { name: 'cap', layer: 'hats' });
  await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
  await page.evaluate(() => dbClear());
  await seedTrait(page, { name: 'hat', layer: 'hats' });
  await page.evaluate(() => { activeWs = 'team7'; dbp = null; dbpName = null; });
};

test.describe('stage 0: the audit of the read against the page Task 10 left', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Check === 'function');
    await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbClear(); });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => {
      if (window.__s0real) window.fetch = window.__s0real;
      for (const k of Object.keys(localStorage)) if (k.indexOf('pb.migrating.') === 0) localStorage.removeItem(k);
      activeWs = null; localStorage.removeItem('chatnft.session');
    });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  test('a switch called off, read while a move to My page waits for the drawing\'s save: nothing is resent for the project being left', async ({ page }) => {
    await switchCalledOff(page);
    const r = await resendAcrossMove(page, 'switch');
    expect(r).toEqual({ waiting: true, stillWaiting: true, heldAfterRead: null, stillInFlight: true, synced: false, signInFirst: 0 });
    expect(await traitSends(page)).toEqual([]);
  });

  test('a switch called off, read while sign-out waits for the drawing\'s save: nothing is resent, and no "Sign in first"', async ({ page }) => {
    await switchCalledOff(page);
    const r = await resendAcrossMove(page, 'signOut');
    expect(r).toEqual({ waiting: true, stillWaiting: true, heldAfterRead: null, stillInFlight: true, synced: false, signInFirst: 0 });
    expect(await traitSends(page)).toEqual([]);
  });

  test('THE CONTROL: the same switch called off, the same save in flight, nothing moving: what was kept goes up', async ({ page }) => {
    await switchCalledOff(page);
    const r = await resendAcrossMove(page, 'none');
    expect(r).toEqual({ waiting: true, stillWaiting: true, heldAfterRead: null, stillInFlight: true, synced: true, signInFirst: 0 });
    expect((await traitSends(page)).some(l => /^(PATCH|POST) \/rest\/v1\/traits/.test(l))).toBe(true);
  });

  /* THE BAR FOLLOWS THE ACCOUNT AND THE PROJECT SHOWN (Finding 3). Each
     leaves the page where s0Held() is null, and nothing else redraws the
     bar: left up, it told the next account, or My page, to reload. */
  test('signed out while held: the bar goes', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await page.evaluate(() => s0Check(true));
    expect(await bar(page), 'held before').toEqual({ shown: true, text: S0_SWITCHED });
    await page.evaluate(() => cloudSignOut());
    expect((await bar(page)).shown).toBe(false);
  });

  test('a session the server refuses while held: the bar goes', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await page.evaluate(() => s0Check(true));
    expect(await bar(page), 'held before').toEqual({ shown: true, text: S0_SWITCHED });
    await page.evaluate(() => { sbSaveSession(null); sessionEnded(); });
    expect((await bar(page)).shown).toBe(false);
  });

  test('a move to My page while the group is held: the bar goes', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await page.evaluate(() => s0Check(true));
    expect(await bar(page), 'held before').toEqual({ shown: true, text: S0_SWITCHED });
    await page.evaluate(() => wsSwitch(null));
    expect(await page.evaluate(() => activeWs)).toBeNull();
    expect((await bar(page)).shown).toBe(false);
  });

  /* WHOSE FLAG (Finding 4). This tab's uid is pinned to account A (a verified
     start, or since Task 10 an unchecked one) while another tab has stored
     B's session, which is the token this tab's sends carry. B's flag holds
     them; a third account's does not. */
  test('a tab still on account A, B\'s session stored by another tab: B\'s migration flag holds what this tab would send with B\'s token', async ({ page }) => {
    await armStage0(page, { uid: 'u2', protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await page.evaluate(() => { s0SeenUid = 'u1'; localStorage.setItem('pb.migrating.chatnft.ws.team7.u2', String(Date.now())); });
    expect(await page.evaluate(() => s0Uid()), 'this tab is still on A').toBe('u1');
    expect((await save(page)).reason).toBe('held');
    expect(await page.evaluate(() => s0Held())).toBe('migrating');
    expect(await sends(page)).toEqual([]);
  });

  test('THE CONTROL: the same two accounts, and a third account\'s flag: the save goes up', async ({ page }) => {
    await armStage0(page, { uid: 'u2', protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await page.evaluate(() => { s0SeenUid = 'u1'; localStorage.setItem('pb.migrating.chatnft.ws.team7.u3', String(Date.now())); });
    expect(await page.evaluate(() => s0Uid()), 'this tab is still on A').toBe('u1');
    expect((await save(page)).ok).toBe(true);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
  });

  test('a flag heard for the account whose session is stored shows the bar on a tab still on account A', async ({ page }) => {
    await armStage0(page, { uid: 'u2', protocol: 1 });
    const r = await page.evaluate(async () => {
      s0SeenUid = 'u1';
      localStorage.setItem('pb.migrating.chatnft.ws.team7.u2', '1');
      new BroadcastChannel('pixelbench').postMessage({ db: 'chatnft.ws.team7', uid: 'u2', migrating: true });
      await new Promise(res => setTimeout(res, 400));
      return { uid: s0Uid(), shown: !document.getElementById('s0bar').hidden };
    });
    expect(r).toEqual({ uid: 'u1', shown: true });
  });

  test('a switch during Save to cloud\'s read: nothing from the store switched to is sent into the first project', async ({ page }) => {
    await twoStores(page);
    expect(await pushAcrossSwitch(page, true)).toEqual({ readHeld: true, moved: true });
    expect(await traitSends(page)).toEqual([]);
  });

  test('THE CONTROL: the same Save to cloud, its read held and released with no switch, sends', async ({ page }) => {
    await twoStores(page);
    expect(await pushAcrossSwitch(page, false)).toEqual({ readHeld: true, moved: false });
    expect((await traitSends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
  });
});
