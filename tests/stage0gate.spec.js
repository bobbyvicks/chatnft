/* STAGE 0: THE PROTOCOL READ, AND WHAT IT HOLDS BACK (design D1).

   While a project is being switched, or has switched, or this account's
   migration flag is set, the page keeps every change on the device, marked
   unsent through the failure paths it already has, and sends, pulls, removes,
   clears, imports and leaves nothing. Each hold here is beside a control that
   the same action goes through when nothing is held, because a gate that
   refuses everything reads exactly like caution. */
import { test, expect } from '@playwright/test';
import { armStage0, seedTrait, findTrait, S0_SWITCHING, S0_SWITCHED, S0_REFUSED } from './helpers.js';

/* patch602's fix round 3: what a shelf move says when the page left its project before the send. */
const S0_LEFT = 'Not sent: you left the project first. The move is kept there, and its next Save to cloud sends it';
/* patch602's fix round 4: what an action says when the page left its project before anything of it was written. */
const S0_LEFT_UNMADE = 'Not saved: you left the project before it was written';

const log = (page) => page.evaluate(() => window.__s0.log);
const sends = async (page) => (await log(page)).filter(l => /^(POST|PATCH|DELETE) /.test(l) && l.indexOf('/rpc/my_team') < 0);
const bar = (page) => page.evaluate(() => ({ shown: !document.getElementById('s0bar').hidden, text: document.getElementById('s0text').textContent }));
const save = (page) => page.evaluate(async () => {
  const why = {};
  const ok = await cloudSyncOne(await dbGet('t_cap_hats_wip'), null, why);
  return { ok: !!ok, reason: why.reason || null, words: cloudWhyNot(why) };
});
/* An editor Save of a synced trait, drawn on (the body of the brief's held
   test, shared with its control since fix round 1). */
const editorSave = (page) => page.evaluate(async () => {
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
/* A shelf move in a group: cap, synced on skins, moved to hats, with
   reorder_traits answered by `rpc` ({status, body}; null: the stand-in's
   200). Then, past S0_REUSE_MS, one more read, as the next save makes it,
   to see whether anything is resent (fix round 1). */
const shelfMove = (page, rpc) => page.evaluate(async (rpc) => {
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  await dbPut({ id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved', blob, w: 16, h: 16,
    rarity: 1, at: 1000, shelfOrder: 10, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-skins-approved.png', synced: true });
  await renderShelf();
  const toasts = [], shown = window.toast;
  window.toast = (m) => { toasts.push(String(m)); try { shown(m); } catch (_) {} };
  let resends = 0; const realResend = window.groupResend;
  window.groupResend = async () => { resends++; };
  const f = window.fetch; let n = 0;
  window.fetch = async (u, io) => {
    if (String(u).indexOf('/rest/v1/rpc/reorder_traits') >= 0) {
      n++;
      if (rpc) { window.__s0.log.push('POST /rest/v1/rpc/reorder_traits'); return new Response(JSON.stringify(rpc.body), { status: rpc.status, headers: { 'Content-Type': 'application/json' } }); }
    }
    return f(u, io);
  };
  try {
    const moved = await commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });
    const at = { toast: toasts[toasts.length - 1] || null, held: s0Held(), shown: !document.getElementById('s0bar').hidden, ok: s0State.ok };
    await new Promise(res => setTimeout(res, 2100));
    await s0Check(false);
    await new Promise(res => setTimeout(res, 100));
    const t = (await dbAll()).find(i => i.kind === 'trait');
    return Object.assign({ moved, rpc: n }, at, { resends, layer: t && t.layer });
  } finally { window.fetch = f; window.toast = shown; window.groupResend = realResend; }
}, rpc);
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
    /* Fix round 1: and a read was made, so protocol 1 here is the read's answer. */
    expect(await page.evaluate(() => window.__s0.reads), 'a protocol read was made').toBeGreaterThan(0);
  });

  test('a read that fails counts as protocol 1, and a save goes up', async ({ page }) => {
    await armStage0(page, { protoStatus: 500 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).ok).toBe(true);
    /* Fix round 1: and a read was made, so protocol 1 here is the read's answer. */
    expect(await page.evaluate(() => window.__s0.reads), 'a protocol read was made').toBeGreaterThan(0);
  });

  test('no project row counts as protocol 1, and a save goes up', async ({ page }) => {
    await armStage0(page, { row: 'none' });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).ok).toBe(true);
    /* Fix round 1: and a read was made, so protocol 1 here is the read's answer. */
    expect(await page.evaluate(() => window.__s0.reads), 'a protocol read was made').toBeGreaterThan(0);
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

  test('THE CONTROL: with nothing held, the same weight is sent, and the trait stays synced', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => { await setRarity(await dbGet('t_cap_hats_wip'), 50); });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.rarity, r.synced]).toEqual([50, true]);
    expect((await sends(page)).some(l => l.startsWith('PATCH /rest/v1/traits?id=eq.row-1'))).toBe(true);
    expect((await bar(page)).shown).toBe(false);
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

  test('THE CONTROL: with nothing held, the same status change is sent, and the trait is synced', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await page.evaluate(async () => { await setTraitStatus(await dbGet('t_cap_hats_wip'), 'approved'); });
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'approved');
    expect(r.synced).toBe(true);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
    expect((await bar(page)).shown).toBe(false);
  });

  test('a save while held is reported with the held words, not as a failure to reach the group', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    const r = await save(page);
    expect([r.ok, r.reason]).toEqual([false, 'held']);
    /* Fix round 1: the exact inline text. It compared both sides lowercased,
       and so passed "buildaNFT was updated..." (measured). */
    expect(r.words).toBe(S0_SWITCHED + '.');
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
    const r = await editorSave(page);
    expect(r, 'the trait is still here, under its own id').not.toBeNull();
    expect(r.synced, 'kept as unsent').toBe(false);
    expect(r.at, 'and it is the new save').toBeGreaterThan(1);
    expect(await sends(page)).toEqual([]);
  });

  test('THE CONTROL: with nothing held, the same editor Save is sent, and the trait is synced', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await editorSave(page);
    expect(r, 'the trait is still here, under its own id').not.toBeNull();
    expect(r.synced, 'sent').toBe(true);
    expect(r.at, 'and it is the new save').toBeGreaterThan(1);
    expect((await sends(page)).some(l => l.startsWith('POST /rest/v1/traits'))).toBe(true);
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

  /* WHICH P0001 IS THE GUARD (fix round 1). P0001 is PostgreSQL's code for
     any bare RAISE, and the live reorder_traits raises three; only Change B's
     "project switched: reload" is the guard. And a read that answers after
     the guard's refusal is trusted. The first two differ from "P0001, and
     the read after it fails" (above) by one field each. */
  test('THE CONTROL: the guard\'s message with another code, and the read after it fails: refused, and nothing held', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { protoStatus: 500 }, insert: { status: 400, body: { code: '23514', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).reason).toBe('refused');
    expect(await page.evaluate(() => s0Held())).toBeNull();
  });

  test('a bare P0001 that is not the guard ("trait outside project"), and the read after it fails: refused, and nothing held', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { protoStatus: 500 }, insert: { status: 400, body: { code: 'P0001', message: 'trait outside project' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).reason).toBe('refused');
    expect(await page.evaluate(() => s0Held())).toBeNull();
  });

  test('the guard\'s P0001, and the read after it answers protocol 1: the switch has ended - refused, the read kept as it answered, nothing held', async ({ page }) => {
    await armStage0(page, { protocol: 1, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect((await save(page)).reason).toBe('refused');
    expect(await page.evaluate(() => ({ held: s0Held(), ok: s0State.ok, reads: window.__s0.reads })))
      .toEqual({ held: null, ok: true, reads: 2 });
  });

  /* The guard's P0001, and the page moves to My page during the read after
     it (fix round 1; judged for team7 since fix round 2 - fix round 1 took
     any move for held). The read is held until the move, then answers
     `ans`: 'switching', 'one' (protocol 1, not switching) or 'fail'. */
  const guardThenMove = (page, ans) => page.evaluate(async (ans) => {
    const f = window.fetch; let answer; const held = new Promise(res => { answer = res; });
    let n = 0, asked = false;
    window.fetch = async (u, io) => {
      if (String(u).indexOf('select=id,protocol,switching_at') >= 0 && ++n === 2) {
        asked = true; await held; await f(u, io);
        if (ans === 'fail') return new Response(JSON.stringify({ code: 'XX000' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify([{ id: 'c1', protocol: 1, switching_at: ans === 'switching' ? '2026-09-27T12:00:00+00:00' : null }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return f(u, io);
    };
    const why = {};
    const saving = cloudSyncOne(await dbGet('t_cap_hats_wip'), null, why);
    for (let i = 0; i < 300 && !asked; i++) await new Promise(res => setTimeout(res, 10));
    const readHeld = asked;
    await wsSwitch(null);
    const moved = activeWs === null;
    answer();
    await saving;
    window.fetch = f;
    return { readHeld, moved, reason: why.reason || null, held: s0Held(), shown: !document.getElementById('s0bar').hidden };
  }, ans);

  test('the guard\'s P0001, the page moves to My page during the read after it, which says switching: held for the project it came from, and My page is not held', async ({ page }) => {
    await armStage0(page, { protocol: 1, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await guardThenMove(page, 'switching')).toEqual({ readHeld: true, moved: true, reason: 'held', held: null, shown: false });
  });

  test('the guard\'s P0001, the page moves during the read after it, which fails: held (the guard, unanswered), and My page is not held', async ({ page }) => {
    await armStage0(page, { protocol: 1, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await guardThenMove(page, 'fail')).toEqual({ readHeld: true, moved: true, reason: 'held', held: null, shown: false });
  });

  test('the guard\'s P0001, the page moves during the read after it, which answers protocol 1: the switch has ended there - refused', async ({ page }) => {
    await armStage0(page, { protocol: 1, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await guardThenMove(page, 'one')).toEqual({ readHeld: true, moved: true, reason: 'refused', held: null, shown: false });
  });

  /* A READ THAT BEGAN BEFORE THE REFUSAL (fix round 2). A read already
     running - the two-minute read's shape - answers protocol 1 from before
     the switch, after the guard's refusal; a read made after it says
     switching. The read trusted must be one that began after the refusal. */
  const guardWithStaleRead = (page, stale) => page.evaluate(async (stale) => {
    const f = window.fetch; let n = 0;
    let releaseInsert; const ig = new Promise(r => { releaseInsert = r; });
    let releaseStale; const sg = new Promise(r => { releaseStale = r; });
    let insertAsked = false, staleAsked = false;
    window.fetch = async (u, io) => {
      const s = String(u), m = (io && io.method) || 'GET';
      if (m === 'POST' && s.indexOf('/rest/v1/traits') >= 0) { insertAsked = true; await ig; return f(u, io); }
      if (s.indexOf('select=id,protocol,switching_at') >= 0 && ++n === 2 && stale) {
        staleAsked = true; await sg; await f(u, io);
        return new Response(JSON.stringify([{ id: 'c1', protocol: 1, switching_at: null }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return f(u, io);
    };
    const why = {};
    const saving = cloudSyncOne(await dbGet('t_cap_hats_wip'), null, why);
    for (let i = 0; i < 300 && !insertAsked; i++) await new Promise(r => setTimeout(r, 10));
    let outside = null;
    if (stale) { outside = s0Check(true); for (let i = 0; i < 300 && !staleAsked; i++) await new Promise(r => setTimeout(r, 10)); }
    releaseInsert();
    await new Promise(r => setTimeout(r, 150));
    releaseStale();
    await saving; if (outside) await outside;
    window.fetch = f;
    return { insertAsked, staleAsked, reason: why.reason || null, held: s0Held(), reads: window.__s0.reads };
  }, stale);

  test('the guard\'s P0001 while a read begun before it is still running, which answers protocol 1: held, on a read made after the refusal', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: '2026-09-27T12:00:00+00:00' }, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await guardWithStaleRead(page, true)).toEqual({ insertAsked: true, staleAsked: true, reason: 'held', held: 'switching', reads: 3 });
  });

  test('THE CONTROL: the same refusal with no read running: held, on its own read', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: '2026-09-27T12:00:00+00:00' }, insert: { status: 400, body: { code: 'P0001', message: 'project switched: reload' } } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await guardWithStaleRead(page, false)).toEqual({ insertAsked: true, staleAsked: false, reason: 'held', held: 'switching', reads: 2 });
  });

  test('a bare P0001 from reorder_traits ("trait outside project"), the read after it answering protocol 1: an ordinary refusal - the old order back, no bar, nothing resent', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await shelfMove(page, { status: 400, body: { code: 'P0001', message: 'trait outside project' } });
    expect(r).toEqual({ moved: false, rpc: 1, toast: 'Move did not sync, so the old order was restored', held: null, shown: false, ok: true, resends: 0, layer: 'skins' });
  });

  test('a store seen on protocol 2 stays there when the next read fails; switching does not', async ({ page }) => {
    await armStage0(page, { protocol: 2, after: { protoStatus: 500 } });
    expect(await page.evaluate(async () => { await s0Check(true); const a = s0Held(); await s0Check(true); return [a, s0Held()]; }))
      .toEqual(['switched', 'switched']);
    await armStage0(page, { switching: '2026-09-27T12:00:00+00:00', after: { protoStatus: 500 } });
    expect(await page.evaluate(async () => { await s0Check(true); const a = s0Held(); await s0Check(true); return [a, s0Held()]; }))
      .toEqual(['switching', null]);
  });

  /* STICKY PAST THE ONE SLOT (fix round 1, Review Focus 5). s0State is one
     slot, and a read on another store or account took it: coming back, a
     failed read counted as protocol 1 again (measured - the catch-up pulled,
     a save sent, Clear deleted). */
  test('protocol 2 stays for its store after a read on another: team7 on 2, a read on My page, back to team7 with its reads failing', async ({ page }) => {
    await armStage0(page, { protocol: 2, after: { protoStatus: 500 } });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await page.evaluate(async () => { await s0Check(true); return s0Held(); })).toBe('switched');
    const r = await page.evaluate(async () => {
      await wsSwitch(null);
      await s0Check(true);
      const away = s0State.db;
      const mark = window.__s0.log.length;
      await wsSwitch('team7');
      /* The catch-up's pull reads the rows with select=*; the status line's
         select=id,path is a read that is not a pull, which D1 does not hold. */
      return { away, held: s0Held(), protocol: s0State.protocol, ok: s0State.ok, pulled: window.__s0.log.slice(mark).filter(l => l.indexOf('/rest/v1/traits?select=*') >= 0) };
    });
    /* protocol: s0Check itself answers 2 from what the tab remembers, not only s0Held. */
    expect(r, 'the read on My page took the one slot, and team7\'s read after failed').toEqual({ away: 'pixelbench', held: 'switched', protocol: 2, ok: false, pulled: [] });
    expect((await save(page)).reason).toBe('held');
    const c = await page.evaluate(async () => {
      let asked = 0; const rc = window.confirm; window.confirm = () => { asked++; return true; };
      try { await document.getElementById('clearproj').onclick(); } finally { window.confirm = rc; }
      return { asked, names: (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name) };
    });
    expect(c, 'Clear refused').toEqual({ asked: 0, names: ['cap'] });
    expect(await sends(page)).toEqual([]);
  });

  test('protocol 2 stays for its account after another account\'s read: u1 on 2, u2 reads, back to u1 with its reads failing', async ({ page }) => {
    await armStage0(page, { uid: 'u1', protocol: 2 });
    expect(await page.evaluate(async () => { await s0Check(true); return s0Held(); })).toBe('switched');
    await armStage0(page, { uid: 'u2', protocol: 1, keepState: true });
    expect(await page.evaluate(async () => { await s0Check(true); return [s0State.uid, s0Held()]; }), 'u2\'s read took the one slot').toEqual(['u2', null]);
    await armStage0(page, { uid: 'u1', protoStatus: 500, keepState: true });
    /* Back on u1, before any read: s0Held answers from what the tab remembers, so the bar and the words are right at once. */
    expect(await page.evaluate(() => [s0State.uid, s0Held()]), 'held before u1 reads again').toEqual(['u2', 'switched']);
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    expect(await page.evaluate(async () => { await s0Check(true); return [s0State.uid, s0State.ok, s0Held()]; })).toEqual(['u1', false, 'switched']);
    expect((await save(page)).reason).toBe('held');
    expect(await sends(page)).toEqual([]);
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
    /* Fix round 1: after each phase that reads nothing, a phase that must read
       - visible, signed in, on a fresh token - so a timer that stopped cannot
       pass the phases before it. Each shifts the count the next phase keeps. */
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }));
    await page.clock.runFor(120000);
    await expect.poll(() => page.evaluate(() => window.__s0.reads), { message: 'visible again: it reads' }).toBe(2);
    /* Visible again, but on a token that would need renewing: the poll leaves
       it for the person's next action (Decision 23), and asks nothing. */
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      const s = JSON.parse(localStorage.getItem('chatnft.session'));
      s.expires_at = Math.floor(Date.now() / 1000) - 10;
      localStorage.setItem('chatnft.session', JSON.stringify(s));
    });
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__s0.reads)).toBe(2);
    expect((await page.evaluate(() => window.__s0.log)).filter(l => l.indexOf('/auth/v1/token') >= 0), 'no renewal was asked for').toEqual([]);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('chatnft.session'));
      s.expires_at = Math.floor(Date.now() / 1000) + 3600;
      localStorage.setItem('chatnft.session', JSON.stringify(s));
    });
    await page.clock.runFor(120000);
    await expect.poll(() => page.evaluate(() => window.__s0.reads), { message: 'a fresh token again: it reads' }).toBe(3);
    const session = await page.evaluate(() => { const s = localStorage.getItem('chatnft.session'); localStorage.removeItem('chatnft.session'); return s; });
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__s0.reads)).toBe(3);
    await page.evaluate((s) => localStorage.setItem('chatnft.session', s), session);
    await page.clock.runFor(120000);
    await expect.poll(() => page.evaluate(() => window.__s0.reads), { message: 'signed in again: it reads' }).toBe(4);
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
    /* Task 15: the reload guard for the account this tab is pinned to, as
       armStage0 sets it for u2's - held by B's flag with nothing in hand,
       the page would reload itself (patch606). */
    await page.evaluate(() => { s0SeenUid = 'u1'; sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1'); localStorage.setItem('pb.migrating.chatnft.ws.team7.u2', String(Date.now())); });
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
      sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1');   /* Task 15: as above */
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

/* SAVE TO CLOUD'S END OF RUN (fix round 1). Uploads are held on gates, in
   the order they arrive, so the test decides what happens between the items
   and the end of the run. `mode`:
     'read'    - a read partway through answers switching (armStage0's after);
     'flag'    - this account's migration flag is set partway through;
     'flagOff' - the flag is set, an item is held by it, and the flag is taken
                 off again before the run ends, so s0Held() is null there;
     'none'    - nothing is held (the control).
   With n above six (PUSH_AT_ONCE), six take the first uploads and the rest
   are sent, or held, after the first is let go. */
const pushEnd = (page, mode, n) => page.evaluate(async ([mode, n]) => {
  const f = window.fetch, gates = [];
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (m === 'POST' && s.indexOf('/storage/v1/object/traits/') >= 0) await new Promise(r => gates.push(r));
    return f(u, io);
  };
  let heldItems = 0; const sync = cloudSyncOne;
  cloudSyncOne = async (rec, ctx, why, seq) => { const r = await sync(rec, ctx, why, seq); if (why && why.reason === 'held') heldItems++; return r; };
  const until = async (ok, what) => { for (let i = 0; i < 500 && !ok(); i++) await new Promise(r => setTimeout(r, 10)); if (!ok()) throw new Error('never: ' + what); };
  const flagKey = 'pb.migrating.' + wsDbName() + '.u1';
  try {
    const pushing = cloudPush();
    const first = Math.min(n, 6);
    await until(() => gates.length === first, first + ' uploads held');
    if (mode === 'read') await s0Check(true);
    if (mode === 'flag' || mode === 'flagOff') localStorage.setItem(flagKey, String(Date.now()));
    const heldPartway = s0Held();
    gates[0]();
    if (n > first) await until(() => heldItems > 0 || gates.length > first, 'the next item held or sent');
    if (mode === 'flagOff') localStorage.removeItem(flagKey);
    for (let i = 1; i < gates.length; i++) gates[i]();
    await pushing;
    return { heldPartway, heldItems, heldAtEnd: s0Held() };
  } finally { window.fetch = f; cloudSyncOne = sync; localStorage.removeItem(flagKey); }
}, [mode, n]);
const seedMany = async (page, n) => { for (let i = 0; i < n; i++) await seedTrait(page, { name: 't' + i, layer: 'hats' }); };
/* My page, with what its end of run removes: a removal record naming
   row-old, the server listing row-old, and a picture no row names. With
   `flagOnStaleDelete`, this account's migration flag is set as the
   stale-row DELETE goes out - after the run's first end-of-run check and
   before the sweep's (pushEnd takes the flag off at the end). */
const personalEndOfRun = (page, flagOnStaleDelete, twoRows) => page.evaluate(async ([flagOnStaleDelete, twoRows]) => {
  const stale = [{ id: 'row-old', path: 'me/c1/trait-old-hats-wip.png' }].concat(twoRows ? [{ id: 'row-old1', path: 'me/c1/trait-old1-hats-wip.png' }] : []);
  await dbPut({ id: GONE_ID, kind: 'settings', rows: stale.map((r, i) => ({ rowId: r.id, path: r.path, name: 'old' + (i || ''), at: 1 })), at: Date.now() });
  const f = window.fetch;
  const json = (x, h) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (flagOnStaleDelete && m === 'DELETE' && /\/rest\/v1\/traits\?id=eq\.row-old(&|$)/.test(s)) localStorage.setItem('pb.migrating.' + wsDbName() + '.u1', String(Date.now()));
    const r = await f(u, io);
    if (m === 'POST' && s.indexOf('/storage/v1/object/list/') >= 0)
      return json((JSON.parse(io.body || '{}').offset || 0) > 0 ? [] : [{ name: 'trait-a-hats-wip.png' }, { name: 'trait-orphan-hats-wip.png' }]);
    if (m === 'GET' && s.indexOf('/rest/v1/traits?select=id,path') >= 0)
      return json(/[?&]offset=0(&|$)/.test(s) ? stale : [], { 'Content-Range': '0-' + (stale.length - 1) + '/' + stale.length });
    return r;
  };
}, [!!flagOnStaleDelete, !!twoRows]);
const endWrites = async (page) => (await log(page)).filter(l => l.startsWith('PATCH /rest/v1/collections') || l.startsWith('DELETE /rest/v1/traits?id=eq.row-old') || l === 'DELETE /storage/v1/object/traits');

/* REMOVE FROM SERVER, with the server holding two rows (fix round 1). */
const removeFromServer = (page) => page.evaluate(async () => {
  const f = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const r = await f(u, io);
    if (m === 'GET' && s.indexOf('/rest/v1/traits?select=id&collection_id=') >= 0)
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/2' } });
    return r;
  };
  const toasts = [], shown = window.toast; window.toast = (m) => { toasts.push(String(m)); try { shown(m); } catch (_) {} };
  let asked = 0; const rc = window.confirm; window.confirm = () => { asked++; return true; };
  try { await clearCloudNow(); } finally { window.fetch = f; window.toast = shown; window.confirm = rc; }
  return { asked, reads: window.__s0.reads, toasts, shown: !document.getElementById('s0bar').hidden };
});
const serverCleared = async (page) => (await log(page)).filter(l => l.startsWith('DELETE /rest/v1/traits?collection_id=') || l === 'DELETE /storage/v1/object/traits');
/* The same, with a read begun while the confirm is open (the two-minute
   read's shape) that answers protocol 1, from before the switch, 150 ms
   after the confirm closes (fix round 2). */
const removeWithStaleRead = (page) => page.evaluate(async () => {
  const f = window.fetch; let n = 0, staleAsked = false;
  let releaseStale; const sg = new Promise(r => { releaseStale = r; });
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('select=id,protocol,switching_at') >= 0 && ++n === 2) {
      staleAsked = true; await sg; await f(u, io);
      return new Response(JSON.stringify([{ id: 'c1', protocol: 1, switching_at: null }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const r = await f(u, io);
    if (m === 'GET' && s.indexOf('/rest/v1/traits?select=id&collection_id=') >= 0)
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/2' } });
    return r;
  };
  const toasts = [], shown = window.toast; window.toast = (m) => { toasts.push(String(m)); try { shown(m); } catch (_) {} };
  let asked = 0; const rc = window.confirm;
  window.confirm = () => { asked++; s0Check(true); setTimeout(() => releaseStale(), 150); return true; };
  try { await clearCloudNow(); } finally { window.fetch = f; window.toast = shown; window.confirm = rc; }
  return { asked, staleAsked, reads: window.__s0.reads, toasts, shown: !document.getElementById('s0bar').hidden };
});

/* SUPERSEDED (fix round 2): fix round 1's sendAcrossSwitch and its two
   tests, "a switch to My page during a save's read: nothing is sent to the
   project left" and its control. They pinned "a move during the read
   answers held", which the re-review of 443a022 measured losing the change:
   the callers wrote their unsent marks into the store moved to, and the
   store left kept the change marked synced. What replaces them is below:
   judged for the store the send is for. */

/* THE PAGE MOVES DURING A SENDER'S READ (fix round 2). team7 holds cap
   (row-1, synced, weight 1); My page holds its own records under the same
   ids (row-me-*, weight 7) - where a write resolved through db() after the
   move would land. `o.what` is the sender: 'weight' (setRarity), 'weights'
   (setRarityMany), 'status' (setTraitStatus, through cloudMoveOne), 'shelf'
   (commitShelfMove) or 'bulk' (bulkMoveToLayer). The sender's first
   protocol read is held; with `o.move` the page moves to My page; the read
   then answers `o.answer`: 'one' (protocol 1) or 'two' (protocol 2). With
   `o.seen2`, team7 is remembered on protocol 2 (s0Seen2, set directly: a
   read of it earlier in the tab); with `o.flag`, u1's migration flag is set
   for team7. Answers what was sent, and each store's traits. */
const moveDuringRead = (page, o) => page.evaluate(async (o) => {
  const put = (recs) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('items', 'readwrite'); for (const r of recs) t.objectStore('items').put(r);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); }));
  const blob = (n) => new Blob([new Uint8Array(n)], { type: 'image/png' });
  const shelf = o.what === 'shelf' || o.what === 'bulk';
  LAYERS = ['skins', 'hats', 'unsorted'];
  const base = { kind: 'trait', name: 'cap', w: 16, h: 16, at: 1, synced: true };
  activeWs = null; dbp = null; dbpName = null;
  await put([
    Object.assign({}, base, { id: 't_cap_hats_wip', layer: 'hats', status: 'wip', rarity: 7, blob: blob(32), rowId: 'row-me-1', path: 'me/cme/trait-cap-hats-wip.png', lid: 'l_me1' }),
    Object.assign({}, base, { id: 't_cap_hats_approved', layer: 'hats', status: 'approved', rarity: 7, blob: blob(32), rowId: 'row-me-2', path: 'me/cme/trait-cap-hats-approved.png', lid: 'l_me2' }),
    Object.assign({}, base, { id: 't_cap_skins_approved', layer: 'skins', status: 'approved', rarity: 7, blob: blob(32), rowId: 'row-me-3', path: 'me/cme/trait-cap-skins-approved.png', lid: 'l_me3' }),
  ]);
  activeWs = 'team7'; dbp = null; dbpName = null;
  if (shelf) {
    await put([{ id: 'settings.layers', kind: 'settings', at: 1, layers: ['skins', 'hats', 'unsorted'], hidden: [] },
      Object.assign({}, base, { id: 't_cap_skins_approved', layer: 'skins', status: 'approved', rarity: 1, blob: blob(16), shelfOrder: 10,
        rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-skins-approved.png', lid: 'l_t7' })]);
    await renderShelf();
  } else {
    await put([Object.assign({}, base, { id: 't_cap_hats_wip', layer: 'hats', status: 'wip', rarity: 1, blob: blob(16),
      rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-hats-wip.png', lid: 'l_t7' })]);
  }
  if (o.seen2) s0Seen2.add('chatnft.ws.team7|u1');
  if (o.flag) localStorage.setItem('pb.migrating.chatnft.ws.team7.u1', '1');
  const f = window.fetch; let release; const gate = new Promise(r => { release = r; });
  let asked = false, n = 0;
  window.fetch = async (u, io) => {
    if (String(u).indexOf('select=id,protocol,switching_at') >= 0 && ++n === 1) {
      asked = true; await gate; await f(u, io);
      return new Response(JSON.stringify([{ id: 'c1', protocol: o.answer === 'two' ? 2 : 1, switching_at: null }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return f(u, io);
  };
  const rec = await dbGet(shelf ? 't_cap_skins_approved' : 't_cap_hats_wip');
  const mark = window.__s0.log.length;
  let acting = null;
  if (o.what === 'weight') acting = setRarity(rec, 50);
  if (o.what === 'weights') acting = setRarityMany([rec], 50);
  if (o.what === 'status') acting = setTraitStatus(rec, 'approved');
  if (o.what === 'shelf') acting = commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });
  if (o.what === 'bulk') { shelfPick.clear(); shelfPick.add('row-1'); acting = bulkMoveToLayer('hats'); }
  for (let i = 0; i < 300 && !asked; i++) await new Promise(r => setTimeout(r, 10));
  const readHeld = asked;
  if (o.move) await wsSwitch(null);
  const moved = activeWs === null;
  release();
  try { await acting; } catch (e) { return { threw: String(e) }; }
  await new Promise(r => setTimeout(r, 300));
  window.fetch = f;
  localStorage.removeItem('pb.migrating.chatnft.ws.team7.u1');
  const traits = async (ws) => { activeWs = ws; dbp = null; dbpName = null;
    return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + '[' + i.rowId + ' ' + i.rarity + (i.synced ? ' synced' : ' unsent') + ']').sort(); };
  const out = { readHeld, moved,
    sent: window.__s0.log.slice(mark).filter(l => /^(PATCH|POST|DELETE) \/rest\/v1\/(traits|rpc\/reorder_traits)|^POST \/storage\/v1\/object\/traits\//.test(l)),
    me: await traits(null), team7: await traits('team7') };
  activeWs = null; dbp = null; dbpName = null;
  return out;
}, o);
/* My page's three records, exactly as seeded. */
const ME = ['t_cap_hats_approved[row-me-2 7 synced]', 't_cap_hats_wip[row-me-1 7 synced]', 't_cap_skins_approved[row-me-3 7 synced]'];

/* EVERY SENDER, THE PAGE MOVING DURING ITS READ OR ITS SEND (fix round 3).
   team7 (collection c1) holds cap under row-1; My page (collection cme)
   holds its own records under the same ids (row-me-*, weight 7), its own
   layer list and its own rules - where anything resolved from the store
   shown after the move would land. `o.what` is the sender:
     'save'    cloudSyncOne, a group save of a trait never sent;
     'drop'    cloudDropOne, the removal of cap's row;
     'patch'   cloudPatchOne, a weight change sent on its own;
     'weight'  setRarity (cloudRarity);          addressed
     'weights' setRarityMany;                    addressed
     'status'  setTraitStatus (cloudMoveOne: cloudSyncOne, then cloudDropOne);
     'shelf'   commitShelfMove (cloudSendShelfPlan);
     'bulk'    bulkMoveToLayer (cloudSendShelfPlan);
     'layers'  saveLayers;
     'rules'   shareRules;
     'delete'  dbDelShared.
   `o.at` is where the page moves (with `o.move`): 'read' - the sender's
   first protocol read is held, and answers `o.answer` ('one' or 'two');
   'send' - its first write (or, for 'rules', its read of the answers,
   answered `o.theirs` when given) is held; 'auth' - its first sign-in
   check is held; 'dbGet' / 'dbDel' - dbDelShared's read, or its local
   removal, of the record is held. Answers the
   sender's own answer, what was written to the server, the last toast,
   whether My page is exactly as seeded (and, if not, what it holds), and
   team7's traits. */
const senderMoves = (page, o) => page.evaluate(async (o) => {
  const put = (recs) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('items', 'readwrite'); for (const r of recs) t.objectStore('items').put(r);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); }));
  const blob = (n) => new Blob([new Uint8Array(n)], { type: 'image/png' });
  const shelf = o.what === 'shelf' || o.what === 'bulk';
  const base = { kind: 'trait', name: 'cap', w: 16, h: 16, at: 1, synced: true };
  const snap = async () => (await dbAll()).filter(i => i.kind !== 'autosave')
    .map(i => i.id + ' ' + JSON.stringify([i.rowId, i.rarity, !!i.synced, i.unsent || null, i.layer || null, i.status || null, i.layers || null, i.groups || null, i.rows || null])).sort();
  /* My page, as seeded. */
  activeWs = null; dbp = null; dbpName = null;
  await put([
    Object.assign({}, base, { id: 't_cap_hats_wip', layer: 'hats', status: 'wip', rarity: 7, blob: blob(32), rowId: 'row-me-1', path: 'me/cme/trait-cap-hats-wip.png', lid: 'l_me1' }),
    Object.assign({}, base, { id: 't_cap_hats_approved', layer: 'hats', status: 'approved', rarity: 7, blob: blob(32), rowId: 'row-me-2', path: 'me/cme/trait-cap-hats-approved.png', lid: 'l_me2' }),
    Object.assign({}, base, { id: 't_cap_skins_approved', layer: 'skins', status: 'approved', rarity: 7, blob: blob(32), rowId: 'row-me-3', path: 'me/cme/trait-cap-skins-approved.png', lid: 'l_me3' }),
    { id: LAYERS_ID, kind: 'settings', at: 1, layers: ['mine-a', 'mine-b', 'hats', 'skins'], hidden: [] },
    { id: RULES_ID, kind: 'settings', at: 1, groups: [['hats/mine', 'skins/cap']], rulesAt: 1, pairs: [['hats/mine', 'skins/cap']] },
  ]);
  const meBefore = await snap();
  /* team7. */
  activeWs = 'team7'; dbp = null; dbpName = null;
  if (shelf) {
    await put([{ id: LAYERS_ID, kind: 'settings', at: 1, layers: ['skins', 'hats', 'unsorted'], hidden: [] },
      Object.assign({}, base, { id: 't_cap_skins_approved', layer: 'skins', status: 'approved', rarity: 1, blob: blob(16), shelfOrder: 10,
        rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-skins-approved.png', lid: 'l_t7' })]);
    LAYERS = ['skins', 'hats', 'unsorted'];
    await renderShelf();
  } else if (o.what === 'save') {
    await put([Object.assign({}, base, { id: 't_cap_hats_wip', layer: 'hats', status: 'wip', rarity: 1, blob: blob(16), synced: false, lid: 'l_t7' })]);
  } else if (o.what === 'patch') {
    await put([Object.assign({}, base, { id: 't_cap_hats_wip', layer: 'hats', status: 'wip', rarity: 5, blob: blob(16), synced: false, unsent: 'meta',
      rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-hats-wip.png', lid: 'l_t7' })]);
  } else {
    await put([Object.assign({}, base, { id: 't_cap_hats_wip', layer: 'hats', status: 'wip', rarity: 1, blob: blob(16),
      rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-hats-wip.png', lid: 'l_t7' })]);
  }
  if (o.what === 'layers' || o.what === 'rules') {
    await put([{ id: LAYERS_ID, kind: 'settings', at: 1, layers: ['hats', 'unsorted'], hidden: [] }]);
    LAYERS = ['hats', 'unsorted']; await renderShelf();
  }
  /* The sender's hold. */
  const f = window.fetch; let release; const gate = new Promise(r => { release = r; });
  let asked = false, n = 0;
  const isSend = (m, s) => o.what === 'rules' ? s.indexOf('/rest/v1/collections?select=decisions') >= 0
    : (m === 'POST' && s.indexOf('/rest/v1/traits') >= 0 && s.indexOf('/rest/v1/traits?') < 0)
      || (m === 'PATCH' && s.indexOf('/rest/v1/traits') >= 0) || s.indexOf('/rest/v1/rpc/reorder_traits') >= 0;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (o.at === 'read' && s.indexOf('select=id,protocol,switching_at') >= 0 && ++n === 1) {
      asked = true; await gate; await f(u, io);
      return new Response(JSON.stringify([{ id: 'c1', protocol: o.answer === 'two' ? 2 : 1, switching_at: null }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (o.at === 'send' && !asked && isSend(m, s)) {
      asked = true; await gate;
      if (o.theirs && s.indexOf('select=decisions') >= 0) { await f(u, io); return new Response(JSON.stringify([{ decisions: o.theirs }]), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    }
    if (o.at === 'auth' && !asked && s.indexOf('/auth/v1/user') >= 0) { asked = true; await gate; }
    return f(u, io);
  };
  const realGet = dbGet;
  if (o.at === 'dbGet') dbGet = async (id) => { const r = await realGet(id); if (!asked && id === 't_cap_hats_wip') { asked = true; await gate; } return r; };
  const realDel = dbDel;
  if (o.at === 'dbDel') dbDel = async (id) => { const r = await realDel(id); if (!asked && id === 't_cap_hats_wip') { asked = true; await gate; } return r; };
  const toasts = [], shown = window.toast; window.toast = (m) => { toasts.push(String(m)); try { shown(m); } catch (_) {} };
  const rec = await realGet(shelf ? 't_cap_skins_approved' : 't_cap_hats_wip');
  const mark = window.__s0.log.length, bodyMark = window.__s0.bodies.length;
  let acting = null;
  if (o.what === 'save') acting = cloudSyncOne(rec, null, {});
  if (o.what === 'drop') acting = cloudDropOne(rec);
  if (o.what === 'patch') acting = cloudPatchOne(rec);
  if (o.what === 'weight') acting = setRarity(rec, 50);
  if (o.what === 'weights') acting = setRarityMany([rec], 50);
  if (o.what === 'status') acting = setTraitStatus(rec, 'approved');
  if (o.what === 'shelf') acting = commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null });
  if (o.what === 'bulk') { shelfPick.clear(); shelfPick.add('row-1'); acting = bulkMoveToLayer('hats'); }
  if (o.what === 'layers') { LAYERS = ['hats', 'team7-new', 'unsorted']; sharedLayerSig = null; acting = saveLayers(); }
  if (o.what === 'rules') { RULES = [['hats/cap', 'hats/team7']]; sharedRuleSig = null; acting = shareRules(); }
  if (o.what === 'delete') acting = dbDelShared(rec);
  for (let i = 0; i < 300 && !asked; i++) await new Promise(r => setTimeout(r, 10));
  const held = asked;
  if (o.move) await wsSwitch(null);
  const moved = activeWs === null;
  release();
  let ret;
  try { ret = await acting; } catch (e) { ret = 'threw ' + e; }
  await new Promise(r => setTimeout(r, 300));
  window.fetch = f; dbGet = realGet; dbDel = realDel; window.toast = shown;
  const rpc = window.__s0.bodies.slice(bodyMark).filter(b => b.path.indexOf('/rest/v1/rpc/reorder_traits') >= 0).map(b => { try { return JSON.parse(b.body).p_collection; } catch (_) { return '?'; } });
  const sentBody = window.__s0.bodies.slice(bodyMark).filter(b => b.m === 'PATCH' && b.path.indexOf('/rest/v1/collections') >= 0)
    .map(b => { try { const x = JSON.parse(b.body); return x.layers ? { layers: x.layers } : { rules: x.rules }; } catch (_) { return '?'; } });
  const sent = window.__s0.log.slice(mark).filter(l => /^(PATCH|POST|DELETE) \/rest\/v1\/(traits|rpc\/reorder_traits|collections)|^(POST|DELETE) \/storage\/v1\/object\/traits(\/|$)/.test(l));
  activeWs = null; dbp = null; dbpName = null;
  const meAfter = await snap();
  activeWs = 'team7'; dbp = null; dbpName = null;
  const team7 = (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + '[' + i.rowId + ' ' + i.rarity + (i.synced ? ' synced' : ' unsent') + ']').sort();
  activeWs = null; dbp = null; dbpName = null;
  const said = toasts.filter(t => t !== 'Back on your page' && t !== 'Opened the group project');
  const out = { held, moved, ret: ret === undefined ? '(undefined)' : (ret && typeof ret === 'object') ? { shared: ret.shared === undefined ? null : ret.shared } : ret, sent, rpc, sentBody, toast: said[said.length - 1] || null,
    meSame: JSON.stringify(meBefore) === JSON.stringify(meAfter), team7 };
  if (!out.meSame) out.me = meAfter;
  return out;
}, o);

test.describe('stage 0: fix round 1 - what the review of 60ecb5d found', () => {
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

  /* Save to cloud's end of run. */
  test('a read partway through Save to cloud finds the project switching: the layers PATCH at the end is not sent', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: '2026-09-27T12:00:00+00:00' } });
    await seedMany(page, 7);
    expect(await pushEnd(page, 'read', 7)).toEqual({ heldPartway: 'switching', heldItems: 1, heldAtEnd: 'switching' });
    expect(await endWrites(page)).toEqual([]);
  });

  test('THE CONTROL: the same Save to cloud with nothing held sends the layers PATCH', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedMany(page, 7);
    expect(await pushEnd(page, 'none', 7)).toEqual({ heldPartway: null, heldItems: 0, heldAtEnd: null });
    expect(await endWrites(page)).toEqual(['PATCH /rest/v1/collections?id=eq.c1']);
  });

  test('an item held by the migration flag, the flag gone before the run ends: the layers PATCH is still not sent', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedMany(page, 7);
    expect(await pushEnd(page, 'flagOff', 7)).toEqual({ heldPartway: 'migrating', heldItems: 1, heldAtEnd: null });
    expect(await endWrites(page)).toEqual([]);
  });

  test('on My page, the migration flag set during the last upload: no stale-row DELETE, no sweep, no layers PATCH', async ({ page }) => {
    await armStage0(page, { ws: null, protocol: 1 });
    await seedTrait(page, { name: 'a', layer: 'hats' });
    await personalEndOfRun(page);
    expect(await pushEnd(page, 'flag', 1)).toEqual({ heldPartway: 'migrating', heldItems: 0, heldAtEnd: 'migrating' });
    expect(await endWrites(page)).toEqual([]);
  });

  test('on My page, the migration flag set as the stale-row DELETE goes: the sweep and the layers PATCH after it do not', async ({ page }) => {
    await armStage0(page, { ws: null, protocol: 1 });
    await seedTrait(page, { name: 'a', layer: 'hats' });
    await personalEndOfRun(page, true);
    expect(await pushEnd(page, 'none', 1)).toEqual({ heldPartway: null, heldItems: 0, heldAtEnd: 'migrating' });
    expect(await endWrites(page)).toEqual(['DELETE /rest/v1/traits?id=eq.row-old']);
  });

  test('on My page, two stale rows, the migration flag set as the first one\'s DELETE goes: the second is not sent, nor the sweep or the PATCH', async ({ page }) => {
    await armStage0(page, { ws: null, protocol: 1 });
    await seedTrait(page, { name: 'a', layer: 'hats' });
    await personalEndOfRun(page, true, true);
    expect(await pushEnd(page, 'none', 1)).toEqual({ heldPartway: null, heldItems: 0, heldAtEnd: 'migrating' });
    expect(await endWrites(page)).toEqual(['DELETE /rest/v1/traits?id=eq.row-old']);
  });

  test('THE CONTROL: the same two stale rows with nothing held: both go, then the sweep and the PATCH', async ({ page }) => {
    await armStage0(page, { ws: null, protocol: 1 });
    await seedTrait(page, { name: 'a', layer: 'hats' });
    await personalEndOfRun(page, false, true);
    expect(await pushEnd(page, 'none', 1)).toEqual({ heldPartway: null, heldItems: 0, heldAtEnd: null });
    expect(await endWrites(page)).toEqual(['DELETE /rest/v1/traits?id=eq.row-old', 'DELETE /rest/v1/traits?id=eq.row-old1', 'DELETE /storage/v1/object/traits', 'PATCH /rest/v1/collections?id=eq.c1']);
  });

  test('THE CONTROL: the same on My page with nothing held: the stale row, the orphan picture and the layers all go', async ({ page }) => {
    await armStage0(page, { ws: null, protocol: 1 });
    await seedTrait(page, { name: 'a', layer: 'hats' });
    await personalEndOfRun(page);
    expect(await pushEnd(page, 'none', 1)).toEqual({ heldPartway: null, heldItems: 0, heldAtEnd: null });
    expect(await endWrites(page)).toEqual(['DELETE /rest/v1/traits?id=eq.row-old', 'DELETE /storage/v1/object/traits', 'PATCH /rest/v1/collections?id=eq.c1']);
  });

  /* Remove from server: a read before the confirm, and one after it. */
  test('Remove from server: switching begins while the confirm is open - nothing is removed, and the bar says why', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: '2026-09-27T12:00:00+00:00' } });
    const r = await removeFromServer(page);
    expect([r.asked, r.reads, r.shown]).toEqual([1, 2, true]);
    /* Final fixes, ruling B3: a refused action's own sentence. This expected
       D1's switching sentence, which says the change is kept and will be
       sent after - and nothing of a refused Remove from server is. */
    expect(r.toasts).toContain(S0_REFUSED);
    expect(await serverCleared(page)).toEqual([]);
  });

  test('Remove from server: a read begun while the confirm was open answers protocol 1 after it closes, and a read made after says switching: nothing is removed', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: '2026-09-27T12:00:00+00:00' } });
    const r = await removeWithStaleRead(page);
    expect([r.asked, r.staleAsked, r.reads, r.shown]).toEqual([1, true, 3, true]);
    expect(r.toasts).toContain(S0_REFUSED);   /* final fixes, ruling B3: was S0_SWITCHING */
    expect(await serverCleared(page)).toEqual([]);
  });

  test('Remove from server while held asks nothing and removes nothing', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    const r = await removeFromServer(page);
    expect([r.asked, r.reads, r.shown]).toEqual([0, 1, true]);
    expect(r.toasts).toContain(S0_REFUSED);   /* final fixes, ruling B3: was S0_SWITCHED */
    expect(await serverCleared(page)).toEqual([]);
  });

  test('THE CONTROL: Remove from server with nothing held, before or after the confirm, removes the rows', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await removeFromServer(page);
    expect([r.asked, r.reads, r.shown]).toEqual([1, 2, false]);
    expect(await serverCleared(page)).toEqual(['DELETE /rest/v1/traits?collection_id=eq.c1']);
  });

  /* A sender whose read the page moves away from (fix round 2; see
     moveDuringRead). Not held for its own store, it is sent there, as
     60ecb5d sent it, and My page is untouched. Held there, nothing is sent
     and nothing is written into My page. The first three fail on fix round
     1's "a move answers held" (nothing sent). */
  /* (Fix round 3, ruling 3: team7's weight is written marked unsent before
     the send, and the mark cleared only while the page is still on team7.
     It moved, so it stays unsent - a resend of it, never its loss. The send
     still goes: the weight is addressed. Was: 't_cap_hats_wip[row-1 50 synced]'.) */
  /* (Task 11 fix round 4, section 2 (F1): an addressed send that lands after a move has its mark cleared in the store it was for - team7, opened by name, and only if it still holds
     the weight written ahead. Was, in fix round 3: '... 50 unsent'.) */
  test('the page moves during a weight\'s read, team7 not held: the PATCH goes to team7\'s row, and My page\'s own cap is untouched', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    expect(await moveDuringRead(page, { what: 'weight', move: true, answer: 'one' })).toEqual({ readHeld: true, moved: true,
      sent: ['PATCH /rest/v1/traits?id=eq.row-1'], me: ME, team7: ['t_cap_hats_wip[row-1 50 synced]'] });
  });

  test('the page moves during a weight on many\'s read, team7 not held: the PATCH goes, and My page is untouched', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    /* (Fix round 3, ruling 3, as for the weight above. Was: '... 50 synced'.)
       (Task 11 fix round 4, section 2 (F1): an addressed send that lands after a move has its mark cleared in the store it was for. Was, in fix round 3: '... 50 unsent'.) */
    expect(await moveDuringRead(page, { what: 'weights', move: true, answer: 'one' })).toEqual({ readHeld: true, moved: true,
      sent: ['PATCH /rest/v1/traits?id=in.(row-1)'], me: ME, team7: ['t_cap_hats_wip[row-1 50 synced]'] });
  });

  /* (Fix round 3. Ruling 1: a shelf move looks its collection up after the
     read, so a move during it is held - it sent My page's collection, which
     the live reorder_traits refuses, and the stand-in answered 200. Ruling 3:
     the move stays in team7, marked unsent. Was: "the order goes to team7",
     sent ['POST /rest/v1/rpc/reorder_traits'], '... 1 synced'.) */
  /* (Final fixes, ruling B1: a drag in a group reads the hold before it
     writes anything, so the read held here is that one, and the page leaves
     before the move is made: team7 keeps cap where it was, synced, and
     nothing is sent. The move made and then held at the send is still
     pinned, by "the page moves during a shelf move's sign-in check, after
     its read" below. Was: "... the move kept in team7",
     't_cap_hats_approved[row-1 1 unsent]'.) */
  test('the page moves during a shelf move\'s read, team7 not held: nothing sent, My page untouched, and the move not made in team7', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    expect(await moveDuringRead(page, { what: 'shelf', move: true, answer: 'one' })).toEqual({ readHeld: true, moved: true,
      sent: [], me: ME, team7: ['t_cap_skins_approved[row-1 1 synced]'] });
  });

  /* (Fix round 3, ruling 1, as for the shelf move above. Was: "the order
     goes", sent ['POST /rest/v1/rpc/reorder_traits'].) */
  test('the page moves during a batch move\'s read, team7 not held: held since fix round 3 - nothing sent, and My page is not marked unsent', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await moveDuringRead(page, { what: 'bulk', move: true, answer: 'one' });
    expect([r.readHeld, r.moved, r.sent, r.me]).toEqual([true, true, [], ME]);
  });

  test('THE CONTROL: the same weight, its read held and released with no move: the PATCH goes', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    expect(await moveDuringRead(page, { what: 'weight', move: false, answer: 'one' })).toEqual({ readHeld: true, moved: false,
      sent: ['PATCH /rest/v1/traits?id=eq.row-1'], me: ME, team7: ['t_cap_hats_wip[row-1 50 synced]'] });
  });

  for (const what of ['weight', 'weights', 'status', 'shelf', 'bulk']) {
    test('the page moves during a ' + what + ' send\'s read, and the read says team7 is on protocol 2: nothing is sent, and nothing is written into My page', async ({ page }) => {
      await armStage0(page, { protocol: 1 });
      const r = await moveDuringRead(page, { what, move: true, answer: 'two' });
      expect([r.readHeld, r.moved, r.sent, r.me]).toEqual([true, true, [], ME]);
    });
  }

  test('the page moves during a weight\'s read, team7 remembered on protocol 2 and the read saying 1: nothing is sent, and My page is untouched', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await moveDuringRead(page, { what: 'weight', move: true, answer: 'one', seen2: true });
    expect([r.readHeld, r.moved, r.sent, r.me]).toEqual([true, true, [], ME]);
  });

  test('the page moves during a weight\'s read, u1\'s migration flag set for team7 and the read saying 1: nothing is sent, and My page is untouched', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await moveDuringRead(page, { what: 'weight', move: true, answer: 'one', flag: true });
    expect([r.readHeld, r.moved, r.sent, r.me]).toEqual([true, true, [], ME]);
  });

  /* The inline words. */
  test('a save while switching is reported inline with a small "this project..."', async ({ page }) => {
    await armStage0(page, { switching: '2026-09-27T12:00:00+00:00' });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    const r = await save(page);
    expect([r.ok, r.reason]).toEqual([false, 'held']);
    expect(r.words).toBe('this project is being updated: your change is kept here and will be sent after it.');
  });

  /* HELD, AND BESIDE IT THE SAME ACTION GOING THROUGH, for the senders no test
     above reached: the review removed five holds and every test still passed. */
  test('the layer list while held: not shared, and no PATCH', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    const r = await page.evaluate(async () => { LAYERS = ['hats', 'skins', 'unsorted']; sharedLayerSig = null; return saveLayers(); });
    expect(r).toBe(false);
    expect((await sends(page)).filter(l => l.startsWith('PATCH /rest/v1/collections'))).toEqual([]);
  });

  test('THE CONTROL: the layer list with nothing held is shared', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await page.evaluate(async () => { LAYERS = ['hats', 'skins', 'unsorted']; sharedLayerSig = null; return saveLayers(); });
    expect(r).toBe(true);
    expect((await sends(page)).filter(l => l.startsWith('PATCH /rest/v1/collections'))).toEqual(['PATCH /rest/v1/collections?id=eq.c1']);
  });

  test('a shelf move while held: the order is not sent, the old one is back, and it says why', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    const r = await shelfMove(page, null);
    /* Final fixes, ruling B3: the refusal sentence. This expected D1's
       protocol-2 sentence with " - the old order is back". */
    expect([r.moved, r.rpc, r.toast, r.layer]).toEqual([false, 0, S0_REFUSED, 'skins']);
  });

  test('THE CONTROL: the same shelf move with nothing held is sent, and sticks', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await shelfMove(page, null);
    expect([r.moved, r.rpc, r.layer]).toEqual([true, 1, 'hats']);
  });

  test('a weight on many at once while held: nothing is patched, and the synced trait is kept unsent', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    expect(await page.evaluate(async () => setRarityMany([await dbGet('t_cap_hats_wip')], 5))).toBe(1);
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.rarity, r.synced, r.unsent]).toEqual([5, false, 'meta']);
    expect(await sends(page)).toEqual([]);
  });

  test('THE CONTROL: the same weight on many with nothing held is patched, and stays synced', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    expect(await page.evaluate(async () => setRarityMany([await dbGet('t_cap_hats_wip')], 5))).toBe(1);
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'wip');
    expect([r.rarity, r.synced]).toEqual([5, true]);
    expect((await sends(page)).some(l => l.startsWith('PATCH /rest/v1/traits?id=in.(row-1)'))).toBe(true);
  });

  test('a removal of the old copy (cloudDropOne) while held: no DELETE', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    expect(await page.evaluate(async () => cloudDropOne(await dbGet('t_cap_hats_wip')))).toBeNull();
    expect(await sends(page)).toEqual([]);
  });

  test('THE CONTROL: the same removal with nothing held is sent', async ({ page }) => {
    await armStage0(page, { protocol: 1, deleted: [{ id: 'row-1', path: 'team7/c1/trait-cap-hats-wip.png' }] });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    expect(await page.evaluate(async () => cloudDropOne(await dbGet('t_cap_hats_wip')))).toBe(true);
    expect((await sends(page)).some(l => l.startsWith('DELETE /rest/v1/traits?id=eq.row-1'))).toBe(true);
  });
});

/* Save to cloud, the page moving to My page while its first uploads are in
   flight (fix round 3): what the push does after the move. team7 holds
   seven traits never sent. */
const pushAcrossMove = (page) => page.evaluate(async () => {
  const f = window.fetch, gates = [];
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (m === 'POST' && s.indexOf('/storage/v1/object/traits/') >= 0) await new Promise(r => gates.push(r));
    return f(u, io);
  };
  const until = async (ok, what) => { for (let i = 0; i < 500 && !ok(); i++) await new Promise(r => setTimeout(r, 10)); if (!ok()) throw new Error('never: ' + what); };
  try {
    const pushing = cloudPush();
    await until(() => gates.length === 6, '6 uploads held');
    await wsSwitch(null);
    const moved = activeWs === null;
    for (const g of gates) g();
    await pushing;
    await new Promise(r => setTimeout(r, 300));
    const traits = async (ws) => { activeWs = ws; dbp = null; dbpName = null; return (await dbAll()).filter(i => i.kind === 'trait').map(i => i.id + (i.synced ? ' synced' : ' unsent')).sort(); };
    const out = { moved, uploads: gates.length, me: await traits(null), team7: await traits('team7') };
    activeWs = null; dbp = null; dbpName = null;
    return out;
  } finally { window.fetch = f; }
});

test.describe('stage 0: fix round 3 - every sender, the page moving during its read or its send', () => {
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
  /* team7's collection is c1 and My page's cme, so a send that resolved
     its collection after the move names cme, which reorder_traits refuses
     as the live function does. */
  const arm = (page) => armStage0(page, { protocol: 1, collections: { team7: 'c1', me: 'cme' }, deleted: [{ id: 'row-1', path: 'team7/c1/trait-cap-hats-wip.png' }] });
  const T7 = ['t_cap_hats_wip[row-1 1 synced]'];
  const SAVE = ['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-wip.png',
    'DELETE /rest/v1/traits?collection_id=eq.c1&kind=eq.trait&name=eq.cap&layer=eq.hats&status=eq.wip', 'POST /rest/v1/traits'];
  const STATUS = ['POST /storage/v1/object/traits/team7/c1/trait-cap-hats-approved.png',
    'DELETE /rest/v1/traits?collection_id=eq.c1&kind=eq.trait&name=eq.cap&layer=eq.hats&status=eq.approved', 'POST /rest/v1/traits'];
  const DROP = ['DELETE /rest/v1/traits?id=eq.row-1', 'DELETE /storage/v1/object/traits'];

  /* RULING 1 AND 5: MOVED DURING THE READ, team7 NOT HELD. Each beside its
     no-move control. The seven senders that are not addressed are held: they
     send nothing and write nothing into My page, and what they changed
     stays unsent in team7. The two addressed ones send to their own row. */
  const moved = { at: 'read', move: true, answer: 'one' };
  const still = { at: 'read', move: false, answer: 'one' };
  const cases = [
    ['a group save (cloudSyncOne)', 'save',
      { ret: null, sent: [], team7: ['t_cap_hats_wip[undefined 1 unsent]'] },
      { ret: true, sent: SAVE, team7: ['t_cap_hats_wip[row-new 1 synced]'] }],
    ['a row removal (cloudDropOne)', 'drop',
      { ret: null, sent: [], team7: T7 },
      { ret: true, sent: DROP, team7: T7 }],
    ['a weight sent on its own (cloudPatchOne)', 'patch',
      { ret: false, sent: [], team7: ['t_cap_hats_wip[row-1 5 unsent]'] },
      { ret: true, sent: ['PATCH /rest/v1/traits?id=eq.row-1'], team7: ['t_cap_hats_wip[row-1 5 synced]'] }],
    /* (Task 11 fix round 4, section 2 (F1): an addressed send that lands after a move has its mark cleared in the store it was for. Was, in fix round 3: '... 50 unsent', here and
       for the weight on many below.) */
    ['a weight (cloudRarity, addressed)', 'weight',
      { ret: true, sent: ['PATCH /rest/v1/traits?id=eq.row-1'], team7: ['t_cap_hats_wip[row-1 50 synced]'] },
      { ret: true, sent: ['PATCH /rest/v1/traits?id=eq.row-1'], team7: ['t_cap_hats_wip[row-1 50 synced]'] }],
    ['a weight on many (setRarityMany, addressed)', 'weights',
      { ret: 1, sent: ['PATCH /rest/v1/traits?id=in.(row-1)'], team7: ['t_cap_hats_wip[row-1 50 synced]'] },
      { ret: 1, sent: ['PATCH /rest/v1/traits?id=in.(row-1)'], team7: ['t_cap_hats_wip[row-1 50 synced]'] }],
    ['a status change (cloudMoveOne)', 'status',
      { ret: { shared: null }, sent: [], team7: ['t_cap_hats_approved[row-1 1 unsent]'] },
      { ret: { shared: true }, sent: STATUS.concat(DROP), team7: ['t_cap_hats_approved[row-new 1 synced]'] }],
    /* (Final fixes, ruling B1: the read is the drag's own, before it writes,
       so the page leaves before the move is made. Was: toast S0_LEFT,
       team7 't_cap_hats_approved[row-1 1 unsent]'.) */
    ['a shelf move (cloudSendShelfPlan)', 'shelf',
      { ret: false, sent: [], toast: S0_LEFT_UNMADE, team7: ['t_cap_skins_approved[row-1 1 synced]'] },
      { ret: true, sent: ['POST /rest/v1/rpc/reorder_traits'], rpc: ['c1'], team7: ['t_cap_hats_approved[row-1 1 synced]'] }],
    ['a batch move (cloudSendShelfPlan)', 'bulk',
      { sent: [], team7: ['t_cap_hats_approved[row-1 1 unsent]'] },
      { sent: ['POST /rest/v1/rpc/reorder_traits'], rpc: ['c1'], team7: ['t_cap_hats_approved[row-1 1 synced]'] }],
    ['the layer list (saveLayers)', 'layers',
      { ret: false, sent: [], sentBody: [] },
      { ret: true, sent: ['PATCH /rest/v1/collections?id=eq.c1'], sentBody: [{ layers: ['hats', 'team7-new', 'unsorted'] }] }],
    ['the rules (shareRules)', 'rules',
      { ret: false, sent: [], sentBody: [] },
      { ret: true, sent: ['PATCH /rest/v1/collections?id=eq.c1'], sentBody: [{ rules: [['hats/cap', 'hats/team7']] }] }],
    ['a removal (dbDelShared)', 'delete',
      { ret: 'held', sent: [], team7: T7 },
      { ret: true, sent: DROP, team7: [] }],
  ];
  const pick = (r, want) => { const o = {}; for (const k of Object.keys(want)) o[k] = r[k]; return o; };
  for (const [name, what, whenMoved, whenStill] of cases) {
    test(name + ': the page moves to My page during its read, team7 not held - nothing reaches the wrong project, and nothing is written into My page', async ({ page }) => {
      await arm(page);
      const r = await senderMoves(page, Object.assign({ what }, moved));
      expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
      expect(pick(r, whenMoved)).toEqual(whenMoved);
    });
    test('THE CONTROL: ' + name + ', its read held and released with no move', async ({ page }) => {
      await arm(page);
      const r = await senderMoves(page, Object.assign({ what }, still));
      expect([r.held, r.moved, r.meSame]).toEqual([true, false, true]);
      expect(pick(r, whenStill)).toEqual(whenStill);
    });
  }

  /* RULING 2: MOVED DURING THE SEND. The send already went to team7; what
     the sender writes after it would land in My page. Nothing is, and the
     change stays unsent in team7 - a resend of it, not a loss. */
  const sendCases = [
    ['a group save (cloudSyncOne): its "sent" write', 'save', { ret: true, sent: SAVE, team7: ['t_cap_hats_wip[undefined 1 unsent]'] }],
    ['a weight sent on its own (cloudPatchOne): its "sent" write', 'patch', { ret: true, sent: ['PATCH /rest/v1/traits?id=eq.row-1'], team7: ['t_cap_hats_wip[row-1 5 unsent]'] }],
    /* (Task 11 fix round 4, section 2 (F1): an addressed send that lands after a move has its mark cleared in the store it was for - the send is addressed and landed, so its
       mark is cleared in team7, not in My page. Was, in fix round 3: '... 50
       unsent', here and for the weight on many.) */
    ['a weight: the mark cleared after it, in team7', 'weight', { ret: true, sent: ['PATCH /rest/v1/traits?id=eq.row-1'], team7: ['t_cap_hats_wip[row-1 50 synced]'] }],
    ['a weight on many: the marks cleared after it, in team7', 'weights', { ret: 1, sent: ['PATCH /rest/v1/traits?id=in.(row-1)'], team7: ['t_cap_hats_wip[row-1 50 synced]'] }],
    ['a status change (cloudMoveOne): the "sent" write, and the removal of the old row', 'status', { ret: { shared: true }, sent: STATUS, team7: ['t_cap_hats_approved[row-1 1 unsent]'] }],
    /* (Task 11 fix round 4, section 3: the title said the mark was cleared and
       the rules retargeted, and the test asserts neither happened - both
       would land in My page, so team7 keeps the move marked unsent. Was: 'a
       shelf move: the mark cleared, and the rules retargeted'. The batch
       move's title below said the same of its mark.) */
    ['a shelf move: the mark not cleared, the rules not retargeted - team7 keeps the move unsent', 'shelf', { ret: true, sent: ['POST /rest/v1/rpc/reorder_traits'], rpc: ['c1'], team7: ['t_cap_hats_approved[row-1 1 unsent]'] }],
    ['a batch move: the mark not cleared - team7 keeps the move unsent', 'bulk', { sent: ['POST /rest/v1/rpc/reorder_traits'], rpc: ['c1'], team7: ['t_cap_hats_approved[row-1 1 unsent]'] }],
    ['the rules (shareRules), during its read of the answers: the merge, the write and the send', 'rules', { ret: false, sent: [], sentBody: [] }],
  ];
  for (const [name, what, want] of sendCases) {
    test('the page moves during ' + name + ' - nothing written into My page', async ({ page }) => {
      await arm(page);
      const r = await senderMoves(page, { what, at: 'send', move: true });
      expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
      expect(pick(r, want)).toEqual(want);
    });
  }
  test('the page moves during a removal\'s read of the record (dbDelShared) - nothing removed, here or there, and nothing written into My page', async ({ page }) => {
    await arm(page);
    const r = await senderMoves(page, { what: 'delete', at: 'dbGet', move: true });
    expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
    expect(pick(r, { ret: 1, sent: 1, team7: 1 })).toEqual({ ret: 'held', sent: [], team7: T7 });
  });

  test('the page moves during the rules\' read of the answers, which brings one of a teammate\'s: nothing merged into My page\'s answers, nothing sent', async ({ page }) => {
    await arm(page);
    const r = await senderMoves(page, { what: 'rules', at: 'send', move: true, theirs: [{ a: 'hats/x', b: 'hats/y', ok: true, at: 5, by: 'u9', src: 'them' }] });
    expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
    expect(pick(r, { ret: 1, sent: 1 })).toEqual({ ret: false, sent: [] });
  });
  test('the page moves during a removal\'s removal here (dbDelShared): removed here only - nothing filed in My page\'s removal list, nothing sent', async ({ page }) => {
    await arm(page);
    const r = await senderMoves(page, { what: 'delete', at: 'dbDel', move: true });
    expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
    expect(pick(r, { ret: 1, sent: 1, team7: 1 })).toEqual({ ret: false, sent: [], team7: [] });
  });
  /* A move before the send, while it checks who is signed in: the collection
     it then looks up is My page's. */
  test('the page moves during a status change\'s sign-in check (cloudMoveOne): nothing sent to My page\'s collection, nothing written into My page', async ({ page }) => {
    await arm(page);
    const r = await senderMoves(page, { what: 'status', at: 'auth', move: true });
    expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
    expect(pick(r, { ret: 1, sent: 1, team7: 1 })).toEqual({ ret: { shared: null }, sent: [], team7: ['t_cap_hats_approved[row-1 1 unsent]'] });
  });
  test('the page moves during a shelf move\'s sign-in check, after its read (cloudSendShelfPlan): the order is not sent with My page\'s collection', async ({ page }) => {
    await arm(page);
    const r = await senderMoves(page, { what: 'shelf', at: 'auth', move: true });
    expect([r.held, r.moved, r.meSame, r.me || null]).toEqual([true, true, true, null]);
    expect(pick(r, { ret: 1, sent: 1, rpc: 1, toast: 1, team7: 1 })).toEqual({ ret: false, sent: [], rpc: [], toast: S0_LEFT, team7: ['t_cap_hats_approved[row-1 1 unsent]'] });
  });

  /* RULING 3: HELD FOR ITS OWN PROJECT AFTER A MOVE (the read says protocol
     2). Nothing is sent and nothing is written into My page (fix round 2),
     and the change is not lost: team7 keeps it, marked unsent. */
  /* (Final fixes, ruling B1: 'shelf' is taken out of this list - its read is
     the drag's own, before anything is written, so there is no change to
     keep; it has its own test below. Was: ['shelf',
     't_cap_hats_approved[row-1 1 unsent]'] here.) */
  for (const [what, kept] of [['weight', 't_cap_hats_wip[row-1 50 unsent]'], ['weights', 't_cap_hats_wip[row-1 50 unsent]'],
    ['status', 't_cap_hats_approved[row-1 1 unsent]'], ['bulk', 't_cap_hats_approved[row-1 1 unsent]']]) {
    test('held for team7 after a move (' + what + '): nothing sent, nothing written into My page, and team7 keeps the change, unsent', async ({ page }) => {
      await arm(page);
      const r = await senderMoves(page, { what, at: 'read', move: true, answer: 'two' });
      expect([r.held, r.moved, r.sent, r.meSame, r.team7]).toEqual([true, true, [], true, [kept]]);
    });
  }
  test('held for team7 after a move (shelf): nothing sent, nothing written into My page, and the move not made in team7 - the drag reads before it writes (final fixes, B1)', async ({ page }) => {
    await arm(page);
    const r = await senderMoves(page, { what: 'shelf', at: 'read', move: true, answer: 'two' });
    expect([r.held, r.moved, r.sent, r.meSame, r.team7]).toEqual([true, true, [], true, ['t_cap_skins_approved[row-1 1 synced]']]);
  });

  /* Save to cloud, and a move while its first six uploads are in flight:
     the seventh is not sent, the six do not write "sent" into My page, and
     the end of the run - the layers PATCH - does not go.
     (Task 11 fix round 4, section 1: every send after any wait asks the
     action's home, so the six row inserts that followed the six uploads
     after the move are held too, and the push says it stopped. Was: 6 POST
     /rest/v1/traits.) */
  test('Save to cloud, the page moving to My page mid-push: no item after the move, no "sent" write into My page, no end-of-run write', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    await seedMany(page, 7);
    const r = await pushAcrossMove(page);
    expect(r).toEqual({ moved: true, uploads: 6, me: [],
      team7: ['t_t0_hats_wip unsent', 't_t1_hats_wip unsent', 't_t2_hats_wip unsent', 't_t3_hats_wip unsent', 't_t4_hats_wip unsent', 't_t5_hats_wip unsent', 't_t6_hats_wip unsent'] });
    expect((await log(page)).filter(l => l.startsWith('PATCH /rest/v1/collections'))).toEqual([]);
    expect((await log(page)).filter(l => l === 'POST /rest/v1/traits').length).toBe(0);
  });
});

/* Final fixes, B3. A REFUSED ACTION SAYS IT WAS NOT DONE. D1's switching
   sentence, "This project is being updated: your change is kept here and
   will be sent after it", describes a change kept on the device. Stage 0
   also showed it - and on protocol 2 D1's other sentence - for the
   actions it refuses, where nothing was done, nothing was kept and
   nothing is sent after: the final review called a switch off after
   each, and none of them happened (measured). A refused action now says
   so in its own sentence; a kept one keeps D1's, verbatim. Each action
   below runs with the toasts and the confirm listened to. */
const SWITCHING_AT = '2026-09-27T12:00:00+00:00';
const listen = (page) => page.evaluate(() => {
  window.__said = []; window.__asked = 0; window.__onAsk = null;
  window.__shownToast = window.toast; window.__realConfirm = window.confirm;
  window.toast = (m) => { window.__said.push(String(m)); try { window.__shownToast(m); } catch (_) {} };
  window.confirm = () => { window.__asked++; const f = window.__onAsk; window.__onAsk = null; if (f) f(); return true; };
});
const heard = (page) => page.evaluate(() => {
  window.toast = window.__shownToast; window.confirm = window.__realConfirm;
  return { said: window.__said.slice(), asked: window.__asked };
});
const traitNames = (page) => page.evaluate(async () => (await dbAll()).filter(i => i.kind === 'trait').map(i => i.name).sort());
/* The tile's own remove button, pressed. */
const pressTileRemove = (page, name) => page.evaluate(async (name) => {
  await renderShelf();
  const x = document.querySelector('#projbody button.x[aria-label="Remove ' + name + '"]');
  if (!x) throw new Error('no remove button on the ' + name + ' tile');
  await x.onclick({ stopPropagation() {} });
}, name);

test.describe('stage 0 (final fixes, B3): a refused action says it was not done; a kept one keeps D1\'s words', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Check === 'function');
    await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbClear(); });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => {
      if (window.__s0real) window.fetch = window.__s0real;
      activeWs = null; localStorage.removeItem('chatnft.session');
    });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  test('switching: Clear is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await listen(page);
    await page.evaluate(() => document.getElementById('clearproj').onclick());
    const h = await heard(page);
    expect({ said: h.said, asked: h.asked, names: await traitNames(page) }).toEqual({ said: [S0_REFUSED], asked: 0, names: ['cap'] });
    expect(await sends(page)).toEqual([]);
  });

  test('switching: a folder import is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await pngFile(page, 'col/hats/wip/hat.png');
    await listen(page);
    const ran = await page.evaluate(async () => (await bulkImport([fileWithPath(window.__png, window.__rel)])) === undefined ? 'refused' : 'ran');
    const h = await heard(page);
    expect({ ran, said: h.said, names: await traitNames(page) }).toEqual({ ran: 'refused', said: [S0_REFUSED], names: [] });
    expect(await sends(page)).toEqual([]);
  });

  test('switching: a project file import is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await listen(page);
    await page.evaluate(() => importProject(new File(['{}'], 'project.json', { type: 'application/json' })));
    const h = await heard(page);
    expect({ said: h.said, names: await traitNames(page) }).toEqual({ said: [S0_REFUSED], names: [] });
    expect(await sends(page)).toEqual([]);
  });

  test('switching: a tile\'s Remove is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await listen(page);
    await pressTileRemove(page, 'cap');
    const h = await heard(page);
    expect({ said: h.said, asked: h.asked, names: await traitNames(page) }).toEqual({ said: [S0_REFUSED], asked: 0, names: ['cap'] });
    expect(await sends(page)).toEqual([]);
  });

  /* The confirm open past the read's reuse window (S0_REUSE_MS), so the
     removal's own read is a new one, and it says switching. */
  test('switching begins while a tile\'s Remove confirm is open: the removal is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: SWITCHING_AT } });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await listen(page);
    await page.evaluate(() => { window.__onAsk = () => { s0State.at = 0; }; });
    await pressTileRemove(page, 'cap');
    const h = await heard(page);
    expect({ said: h.said, asked: h.asked, reads: await page.evaluate(() => window.__s0.reads), names: await traitNames(page) })
      .toEqual({ said: [S0_REFUSED], asked: 1, reads: 2, names: ['cap'] });
    expect(await sends(page)).toEqual([]);
  });

  test('switching: Leave is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await listen(page);
    await page.evaluate(() => wsLeave());
    const h = await heard(page);
    expect({ said: h.said, asked: h.asked, activeWs: await page.evaluate(() => activeWs) }).toEqual({ said: [S0_REFUSED], asked: 0, activeWs: 'team7' });
    expect(await sends(page)).toEqual([]);
  });

  test('switching: Load from cloud is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await listen(page);
    await page.evaluate(() => cloudPull({}));
    const h = await heard(page);
    expect(h.said).toEqual([S0_REFUSED]);
    expect((await log(page)).filter(l => l.indexOf('/rest/v1/traits?select=*') >= 0), 'no rows asked for').toEqual([]);
  });

  test('protocol 2: Clear is refused, and says it was not done', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats', rowId: 'row-1', synced: true, path: 'team7/c1/trait-cap-hats-wip.png' });
    await listen(page);
    await page.evaluate(() => document.getElementById('clearproj').onclick());
    const h = await heard(page);
    expect({ said: h.said, asked: h.asked, names: await traitNames(page) }).toEqual({ said: [S0_REFUSED], asked: 0, names: ['cap'] });
  });

  /* THE CONTROLS: a change that IS kept here, and sent after, keeps D1's
     sentence verbatim - switching and on protocol 2. */
  test('THE CONTROL: switching, Save to cloud keeps the unsent trait here, and says so in D1\'s words', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await listen(page);
    await page.evaluate(() => cloudPush());
    const h = await heard(page);
    expect(h.said).toEqual([S0_SWITCHING]);
    expect(await sends(page)).toEqual([]);
  });

  test('THE CONTROL: protocol 2, Save to cloud keeps the unsent trait here, and says so in D1\'s words', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await seedTrait(page, { name: 'cap', layer: 'hats' });
    await listen(page);
    await page.evaluate(() => cloudPush());
    const h = await heard(page);
    expect(h.said).toEqual([S0_SWITCHED]);
    expect(await sends(page)).toEqual([]);
  });
});

/* Final fixes, B1. A HELD DRAG WRITES NOTHING, AND A DRAG PUT BACK TAKES ITS
   DRAWING BACK. A drag across layers was applied here first - the records
   under their new ids and, by draftsFollow, the trait's unsaved drawing
   with them - and then its send was held, and the old records were put
   back; the drawing was not. It stayed under the new id, which no trait
   had, and opening the trait no longer offered it (measured by the final
   review, and older than stage 0 for a failed send). Now a drag in a group
   reads the hold before it writes anything and, held, is refused in the
   refusal's own words; and every put-back - held at the send, refused,
   a server error, no connection - takes the drawing back with the
   records. cap is synced on skins with a drawing (20) over its saved
   picture (90); it is dragged to hats. "Offered" is what opening the trait
   the way a click does shows: 20 is the drawing, 90 the saved picture. */
const dragWithDrawing = (page, o) => page.evaluate(async (o) => {
  LAYERS = ['skins', 'hats', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: ['skins', 'hats', 'unsorted'], hidden: [] });
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  await dbPut({ id: 't_cap_skins_approved', kind: 'trait', name: 'cap', layer: 'skins', status: 'approved', blob: await png(90), w: 16, h: 16,
    rarity: 1, at: 1000, shelfOrder: 10, rowId: 'row-1', rowAt: '2026-01-01T00:00:00Z', path: 'team7/c1/trait-cap-skins-approved.png', synced: true });
  await dbPut({ id: 'autosave.t_cap_skins_approved', kind: 'autosave', traitId: 't_cap_skins_approved', name: 'cap.png', w: 16, h: 16,
    blob: await png(20), at: 2000 });
  await renderShelf();
  const snap = async () => (await dbAll()).map(r => { const x = Object.assign({}, r); delete x.blob; return JSON.stringify(x); }).sort();
  const before = await snap();
  const toasts = [], shown = window.toast;
  window.toast = (m) => { toasts.push(String(m)); try { shown(m); } catch (_) {} };
  const f = window.fetch; let rpc = 0;
  window.fetch = async (u, io) => {
    if (String(u).indexOf('/rest/v1/rpc/reorder_traits') >= 0) {
      rpc++;
      if (o.rpc === 'no connection') { window.__s0.log.push('POST /rest/v1/rpc/reorder_traits'); throw new TypeError('Failed to fetch'); }
      if (o.rpc) { window.__s0.log.push('POST /rest/v1/rpc/reorder_traits'); return new Response(JSON.stringify(o.rpc.body), { status: o.rpc.status, headers: { 'Content-Type': 'application/json' } }); }
    }
    return f(u, io);
  };
  /* lateHold: the send's own read is a new one (the redraw before the send
     passes the reuse window), and it is that read that finds the hold. */
  const rs = window.renderShelf;
  if (o.lateHold) window.renderShelf = (...a) => { s0State.at = 0; return rs(...a); };
  let moved;
  try { moved = await commitShelfMove({ recordKey: 'row-1', toLayer: 'hats', beforeKey: null }); }
  finally { window.fetch = f; window.toast = shown; window.renderShelf = rs; }
  const untouched = JSON.stringify(await snap()) === JSON.stringify(before);
  const all = await dbAll();
  const traits = all.filter(r => r.kind === 'trait').map(r => r.id);
  const drafts = all.filter(r => r.kind === 'autosave').map(r => r.id + ' -> ' + r.traitId);
  const rec = all.find(r => r.kind === 'trait' && r.name === 'cap');
  window.toast = () => {};
  try { await openTraitRecord(rec); } finally { window.toast = shown; }
  await new Promise(r => setTimeout(r, 150));
  return { moved, rpc, toast: toasts[toasts.length - 1] || null, traits, drafts, offered: ctx.getImageData(0, 0, 1, 1).data[0], untouched };
}, o);
const BACK = { traits: ['t_cap_skins_approved'], drafts: ['autosave.t_cap_skins_approved -> t_cap_skins_approved'], offered: 20 };

test.describe('stage 0 (final fixes, B1): a held drag writes nothing; a drag put back takes its drawing back', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Check === 'function');
    await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbClear(); });
  });
  test.afterEach(async ({ page }) => {
    const unknown = await page.evaluate(() => (window.__s0 && window.__s0.unknown) || []);
    await page.evaluate(() => {
      if (window.__s0real) window.fetch = window.__s0real;
      activeWs = null; localStorage.removeItem('chatnft.session');
    });
    expect(unknown, 'every request had a named answer (design E2)').toEqual([]);
  });

  test('protocol 2: a drag of a trait with a drawing is refused before anything is written, and the drawing is still offered on it', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    const r = await dragWithDrawing(page, {});
    expect(r).toEqual({ moved: false, rpc: 0, toast: S0_REFUSED, ...BACK, untouched: true });
    expect(await sends(page)).toEqual([]);
  });

  test('switching: the same drag is refused before anything is written, and the drawing is still offered on it', async ({ page }) => {
    await armStage0(page, { switching: SWITCHING_AT });
    const r = await dragWithDrawing(page, {});
    expect(r).toEqual({ moved: false, rpc: 0, toast: S0_REFUSED, ...BACK, untouched: true });
    expect(await sends(page)).toEqual([]);
  });

  test('held only at the send (its own read finds switching): put back, and the drawing with it', async ({ page }) => {
    await armStage0(page, { protocol: 1, after: { switching: SWITCHING_AT } });
    const r = await dragWithDrawing(page, { lateHold: true });
    const { untouched, ...rest } = r;
    expect({ ...rest, reads: await page.evaluate(() => window.__s0.reads) }).toEqual({ moved: false, rpc: 0, toast: S0_REFUSED, ...BACK, reads: 2 });
    expect(await sends(page)).toEqual([]);
  });

  test('a server error puts the drag back, and the drawing with it', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await dragWithDrawing(page, { rpc: { status: 500, body: { code: 'XX000', message: 'down' } } });
    const { untouched, ...rest } = r;
    expect(rest).toEqual({ moved: false, rpc: 1, toast: 'Move did not sync, so the old order was restored', ...BACK });
  });

  test('no connection puts the drag back, and the drawing with it', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await dragWithDrawing(page, { rpc: 'no connection' });
    const { untouched, ...rest } = r;
    expect(rest).toEqual({ moved: false, rpc: 1, toast: 'Move did not sync, so the old order was restored', ...BACK });
  });

  test('THE CONTROL: the same drag with nothing held sticks, and the drawing goes with it', async ({ page }) => {
    await armStage0(page, { protocol: 1 });
    const r = await dragWithDrawing(page, {});
    const { untouched, toast, ...rest } = r;
    expect(rest).toEqual({ moved: true, rpc: 1, traits: ['t_cap_hats_approved'], drafts: ['autosave.t_cap_hats_approved -> t_cap_hats_approved'], offered: 20 });
  });
});
