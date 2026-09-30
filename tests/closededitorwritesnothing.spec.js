/* A CLOSED EDITOR WRITES NOTHING (follow-up S21, patch609).

   closeEditor writes the drawing's last draft where it was drawn, and then
   hides the editor - but it clears neither the canvas (ctx) nor the record
   it holds (openRec), and autosaveNow asked only whether there was a
   canvas. So every later caller of autosaveNow wrote the closed editor's
   canvas again, into whichever project was current by then, as that
   trait's draft (or as the unattached canvas, AUTO_ID):
     - the tab being hidden (visibilitychange) or left (pagehide);
     - opening a trait from the shelf (openTraitRecord's flush);
     - a sign-in the server ended (sessionEnded).
   After a project switch that filed one project's drawing under another
   project's trait of the same id, and wrote over that trait's own draft
   there.

   Each case below: a drawing on your own page, closed with a stroke not
   saved (closeEditor's own write is the one that is right, and is checked
   first), then a switch, by wsSwitch, to a group that holds a trait of the
   same id, then the caller. The group's store must not gain a draft, and a
   draft it already had must be left as it was.

   RUN AGAINST 91eb861'S PAGE FIRST: every case went red there, with the
   closed editor's pixels (20) in the group's draft. The count of
   autosaveNow calls is the positive precondition: the caller did reach
   autosaveNow, so "no draft" is autosaveNow's decision, not a caller that
   never ran.

   The controls (green on both pages): with the editor OPEN, a stroke still
   in the 1.5 s autosave timer when the tab hides is saved - the reason the
   hide handlers exist - and so is an unsaved stroke with no timer waiting.
   And a closed editor with a timer somehow still waiting (it cannot be left
   by closeEditor, which clears it; set here by hand) still writes it: the
   guard refuses only when nothing is pending.

   FIX ROUND 1 (review E): A CLOSE WHOSE OWN WRITE DID NOT LAND. closeEditor
   hides the editor whatever its write answers, so when that write is
   refused, or the encode gives nothing, the drawing is only on the hidden
   canvas. On 91eb861 the next caller's write was its second chance: the tab
   hidden after a refused close wrote it (pixels 20). The first build of
   patch609 wrote nothing, and the drawing was gone at the next open. The
   page now notes that write (its key, its store, whose drawing it was) and
   a closed editor still writes it while all three hold. The cases:
     - on the same page, each of the four callers writes it (91eb861 green,
       first build red); and so for an encode that gave nothing;
     - after a switch to the group, nothing is filed there (91eb861 red);
       and so when the switch was asked for while the close's write was
       still out and the refusal came after the switch went on: the store
       noted is the one the write went to (91eb861 red);
     - with another account signed in, nothing is written as theirs
       (91eb861 red);
     - after the group's trait of the same id, or another of its traits,
       was drawn and saved there and the page came back, your page does not
       get the group's drawing (91eb861 red). The first is why a landing of
       that key in any store ends what is owed; the second is why what is
       owed is matched by key. */
import { test, expect } from '@playwright/test';

const T = 't_cap_hats_approved', U = 't_hat_hats_approved';

/* Seeds both stores, draws on your own page and closes, switches to team7,
   then runs `via`. Answers what team7's store and your own hold. */
const closedThenCalled = (page, o) => page.evaluate(async ([T, U, o]) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  window.__unknown = [];
  window.fetch = async (u, io) => {
    window.__unknown.push(((io && io.method) || 'GET') + ' ' + String(u).replace(/^https?:\/\/[^/]+/, ''));
    return new Response('{"code":"UNROUTED"}', { status: 501, headers: { 'Content-Type': 'application/json' } });
  };
  const png = async (v) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png')); };
  const px = async (b) => { if (!b) return null; const bm = await createImageBitmap(b);
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(1, 1, 1, 1).data[0]; };
  const read = async (id) => { const r = await dbGet(id); return r ? { px: await px(r.blob), at: r.at, traitId: r.traitId || null } : null; };
  const trait = async (id, name, v) => ({ id, kind: 'trait', name, layer: 'hats', status: 'approved',
    blob: await png(v), w: 16, h: 16, rarity: 1, at: 1000 });
  /* The group: the same trait id with its own picture (150), another trait
     (200), and - when asked - a draft of its own for the trait (60). */
  activeWs = 'team7'; dbp = null; dbpName = null;
  await dbClear();
  await dbPut(await trait(T, 'cap', 150));
  await dbPut(await trait(U, 'hat', 200));
  await dbPut({ id: 'settings.layers', kind: 'settings', layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  if (o.theirDraft) await dbPut({ id: draftKey(T), kind: 'autosave', traitId: T, name: 'cap.png', w: 16, h: 16, blob: await png(60), at: 3000 });
  /* Your own page: the trait (90). */
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  await dbPut(await trait(T, 'cap', 90));
  await dbPut({ id: 'settings.layers', kind: 'settings', layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  LAYERS = ['hats', 'unsorted'];
  await renderShelf();
  /* Draw and close with the stroke unsaved. */
  if (o.unattached) {
    const n = 16, d = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) { d[i * 4] = 90; d[i * 4 + 1] = 90; d[i * 4 + 2] = 90; d[i * 4 + 3] = 255; }
    fileName = 'loose.png';
    startEditor(d, n, n, n, n, palette(d, n * n, 24, 64), false);
  } else {
    if (!await openTraitRecord(await dbGet(T))) throw new Error('the trait did not open');
  }
  snapshot();
  ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0, 0, 4, 4);
  await closeEditor();
  const key = o.unattached ? AUTO_ID : draftKey(T);
  const mine = await read(key);   /* closeEditor's own write, on your page */
  if (!o.stay) await wsSwitch('team7');
  const ws = activeWs;
  const before = await read(key);
  /* Every call of autosaveNow from here on is counted. */
  const real = window.autosaveNow; let calls = 0;
  window.autosaveNow = function () { calls++; return real.apply(this, arguments); };
  try {
    if (o.pendingByHand) autoPending = setTimeout(() => { autosaveNow(); }, 1500);
    if (o.via === 'visibilitychange') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } else if (o.via === 'pagehide') {
      window.dispatchEvent(new Event('pagehide'));
    } else if (o.via === 'open') {
      if (!await openTraitRecord(await dbGet(U))) throw new Error('the other trait did not open');
    } else if (o.via === 'sessionEnded') {
      /* The switch's cloudRender found no session here and set authed
         false; sessionEnded is for a page that believes it is signed in,
         so that is what it is given. */
      authed = true;
      sessionEnded();
    } else throw new Error('no such caller ' + o.via);
    await new Promise(r => setTimeout(r, 100));
    if (s0SaveInFlight) await s0SaveInFlight;
    await new Promise(r => setTimeout(r, 400));
  } finally {
    window.autosaveNow = real;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  }
  const after = await read(key);
  const theirTrait = await read(T);
  activeWs = null; dbp = null; dbpName = null;
  return { ws, mine, before, after, calls, theirTrait: theirTrait && theirTrait.px };
}, [T, U, o]);

/* The editor OPEN on the group's trait: a stroke, then `how`, then the tab
   hides. Answers the group's draft of the trait, before and after. */
const openThenHidden = (page, how) => page.evaluate(async ([T, how]) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  const png = async (v) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png')); };
  const px = async (b) => { if (!b) return null; const bm = await createImageBitmap(b);
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(1, 1, 1, 1).data[0]; };
  activeWs = 'team7'; dbp = null; dbpName = null;
  await dbClear();
  await dbPut({ id: T, kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
    blob: await png(150), w: 16, h: 16, rarity: 1, at: 1000 });
  await dbPut({ id: 'settings.layers', kind: 'settings', layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  LAYERS = ['hats', 'unsorted'];
  if (!await openTraitRecord(await dbGet(T))) throw new Error('the trait did not open');
  snapshot();
  ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0, 0, 4, 4);
  if (how === 'timer') { autosave(); if (!autoPending) throw new Error('no autosave was waiting'); }
  const before = await dbGet(draftKey(T));
  const real = window.autosaveNow; let calls = 0;
  window.autosaveNow = function () { calls++; return real.apply(this, arguments); };
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 100));
    if (s0SaveInFlight) await s0SaveInFlight;
    await new Promise(r => setTimeout(r, 400));
  } finally {
    window.autosaveNow = real;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  }
  const after = await dbGet(draftKey(T));
  const out = { editorOpen: !document.getElementById('app').hidden, before: !!before,
    after: after ? await px(after.blob) : null, calls, pending: !!autoPending };
  activeWs = null; dbp = null; dbpName = null;
  return out;
}, [T, how]);

/* Fix round 1. Seeds both stores (the group: T 150, U 200; your page: T 90,
   U 210), draws on your page's T (20) and closes with that write not landing
   once - o.refuse 'write' (dbPut refuses the draft, as a transient
   UnknownError), 'encode' (the encode gives nothing) or 'late' (refused
   S0_FLUSH_MS + 500 ms after it started) - then o.then:
     'stay'        nothing;
     'switch'      wsSwitch to the group;
     'switchDuring' wsSwitch to the group asked for as the close starts, so
                   it waits S0_FLUSH_MS for the write and goes on before
                   the 'late' refusal arrives;
     'account'     another account signed in (s0SeenUid, set by hand: 'uid-one'
                   drew it, 'uid-two' is signed in when the caller runs);
     'drawnThere'  wsSwitch to the group, open its o.there (T or U), draw 40,
                   close (that write lands there), wsSwitch back;
   then runs o.via. Answers what both stores hold. */
const refusedThenCalled = (page, o) => page.evaluate(async ([T, U, o]) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  window.fetch = async () => new Response('{"code":"UNROUTED"}', { status: 501, headers: { 'Content-Type': 'application/json' } });
  const png = async (v) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png')); };
  const px = async (b) => { if (!b) return null; const bm = await createImageBitmap(b);
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(1, 1, 1, 1).data[0]; };
  const read = async (id) => { const r = await dbGet(id); return r ? { px: await px(r.blob), by: r.by || null } : null; };
  const trait = async (id, name, v) => ({ id, kind: 'trait', name, layer: 'hats', status: 'approved',
    blob: await png(v), w: 16, h: 16, rarity: 1, at: 1000 });
  const settings = { id: 'settings.layers', kind: 'settings', layers: ['hats', 'unsorted'], hidden: [], at: 1 };
  activeWs = 'team7'; dbp = null; dbpName = null;
  await dbClear();
  await dbPut(await trait(T, 'cap', 150));
  await dbPut(await trait(U, 'hat', 200));
  await dbPut(Object.assign({}, settings));
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  await dbPut(await trait(T, 'cap', 90));
  await dbPut(await trait(U, 'hat', 210));
  await dbPut(Object.assign({}, settings));
  LAYERS = ['hats', 'unsorted'];
  await renderShelf();
  if (o.then === 'account') s0SeenUid = 'uid-one';
  if (!await openTraitRecord(await dbGet(T))) throw new Error('the trait did not open');
  snapshot();
  ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0, 0, 4, 4);
  /* closeEditor's own write does not land, once. */
  let refused = false, refusedIn;
  const realPut = window.dbPut;
  if (o.refuse === 'write') {
    window.dbPut = function (rec) {
      if (!refused && rec && rec.kind === 'autosave') {
        refused = true;
        return Promise.reject(new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError'));
      }
      return realPut.apply(this, arguments);
    };
  } else if (o.refuse === 'encode') {
    art.toBlob = function (cb) { delete art.toBlob; refused = true; cb(null); };
  } else if (o.refuse === 'late') {
    /* Refused only after the switch's wait for it (S0_FLUSH_MS) has run out,
       so the switch has gone on by then; refusedIn says where the page was. */
    window.dbPut = function (rec) {
      if (!refused && rec && rec.kind === 'autosave') {
        refused = true;
        return new Promise((_, rej) => setTimeout(() => { refusedIn = activeWs;
          rej(new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError')); },
        S0_FLUSH_MS + 500));
      }
      return realPut.apply(this, arguments);
    };
  } else throw new Error('no such refusal ' + o.refuse);
  let afterClose = null;
  if (o.then === 'switchDuring') {
    /* The switch asked for while the close's write is still out. */
    const closing = closeEditor();
    try { await wsSwitch('team7'); await closing; } finally { window.dbPut = realPut; delete art.toBlob; }
  } else {
    try { await closeEditor(); } finally { window.dbPut = realPut; delete art.toBlob; }
    afterClose = await read(draftKey(T));
  }
  let thereDraft = null, thereOpened = null;
  if (o.then === 'switch') await wsSwitch('team7');
  else if (o.then === 'switchDuring') { /* done above */ }
  else if (o.then === 'drawnThere') {
    await wsSwitch('team7');
    /* The switch's cloudRender found no session here and set authed false,
       and startEditor opens nothing then (mayUse) - the stroke below would
       land on the old, hidden canvas. A person drawing there is signed in. */
    authed = true;
    const id = o.there === 'U' ? U : T;
    if (!await openTraitRecord(await dbGet(id))) throw new Error('the group trait did not open');
    thereOpened = !document.getElementById('app').hidden;
    snapshot();
    ctx.fillStyle = 'rgb(40,40,40)'; ctx.fillRect(0, 0, 4, 4);
    await closeEditor();
    thereDraft = await read(draftKey(id));
    await wsSwitch(null);
  } else if (o.then === 'account') s0SeenUid = 'uid-two';
  else if (o.then !== 'stay') throw new Error('no such then ' + o.then);
  const ws = activeWs;
  const real = window.autosaveNow; let calls = 0;
  window.autosaveNow = function () { calls++; return real.apply(this, arguments); };
  try {
    if (o.via === 'visibilitychange') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    } else if (o.via === 'pagehide') {
      window.dispatchEvent(new Event('pagehide'));
    } else if (o.via === 'open') {
      if (!await openTraitRecord(await dbGet(U))) throw new Error('the other trait did not open');
    } else if (o.via === 'sessionEnded') {
      authed = true;
      sessionEnded();
    } else throw new Error('no such caller ' + o.via);
    await new Promise(r => setTimeout(r, 100));
    if (s0SaveInFlight) await s0SaveInFlight;
    await new Promise(r => setTimeout(r, 400));
  } finally {
    window.autosaveNow = real;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  }
  const readIn = async (w, id) => { activeWs = w; dbp = null; dbpName = null; return read(id); };
  const out = { refused, refusedIn: refusedIn === undefined ? 'n/a' : refusedIn, afterClose, thereDraft, thereOpened, ws, calls,
    mineT: await readIn(null, draftKey(T)), mineU: await readIn(null, draftKey(U)),
    theirT: await readIn('team7', draftKey(T)), theirU: await readIn('team7', draftKey(U)) };
  activeWs = null; dbp = null; dbpName = null; s0SeenUid = null;
  return out;
}, [T, U, o]);

test.describe('a closed editor writes nothing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof wsSwitch === 'function'
      && typeof closeEditor === 'function' && typeof autosaveNow === 'function');
    await page.evaluate(() => { activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; });
  });

  for (const via of ['visibilitychange', 'pagehide', 'open', 'sessionEnded']) {
    test('closed with a stroke unsaved, then a switch to a group holding the same trait id: ' + via
      + ' files no draft in the group', async ({ page }) => {
      const r = await closedThenCalled(page, { via });
      expect(r.mine && r.mine.px, 'closeEditor wrote the drawing where it was drawn (your page)').toBe(20);
      expect(r.ws, 'the switch happened').toBe('team7');
      expect(r.before, 'the group had no draft of the trait before').toBe(null);
      expect(r.calls, 'the caller did reach autosaveNow').toBeGreaterThan(0);
      expect(r.after, 'and the group still has no draft of it').toBe(null);
      expect(r.theirTrait, 'the group\'s own trait is untouched').toBe(150);
    });
  }

  test('the group\'s own draft of that trait is not written over when the tab hides', async ({ page }) => {
    const r = await closedThenCalled(page, { via: 'visibilitychange', theirDraft: true });
    expect(r.mine && r.mine.px).toBe(20);
    expect(r.before, 'the group\'s draft, before').toEqual({ px: 60, at: 3000, traitId: T });
    expect(r.calls).toBeGreaterThan(0);
    expect(r.after, 'the group\'s draft, after: the same').toEqual({ px: 60, at: 3000, traitId: T });
  });

  test('a closed canvas that was never a trait (the unattached draft) is not filed in the group either', async ({ page }) => {
    const r = await closedThenCalled(page, { via: 'visibilitychange', unattached: true });
    expect(r.mine && r.mine.px, 'closeEditor wrote the unattached draft on your page').toBe(20);
    expect(r.before).toBe(null);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.after, 'the group gains no unattached draft').toBe(null);
  });

  /* The page itself never leaves a timer waiting with the editor closed
     (closeEditor clears it and autosave() refuses while #app is hidden), so
     this one is set by hand, on the page the drawing was made on. It shows
     the guard keys on "nothing pending", as s0FlushAutosave and
     s0DraftLanded assume: a write that was waiting still lands. */
  test('the control: a closed editor with an autosave still waiting writes it, on its own page', async ({ page }) => {
    const r = await closedThenCalled(page, { via: 'visibilitychange', pendingByHand: true, stay: true });
    expect(r.ws, 'no switch').toBe(null);
    expect(r.before && r.before.px, "closeEditor's draft").toBe(20);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.after && r.after.px).toBe(20);
    expect(r.after.at, 'the waiting write went ahead: the draft was written again').toBeGreaterThan(r.before.at);
  });

  test('the control: the editor open, a stroke still in the 1.5 s timer when the tab hides, is saved', async ({ page }) => {
    const r = await openThenHidden(page, 'timer');
    expect(r.editorOpen).toBe(true);
    expect(r.before, 'the timer had not written it yet').toBe(false);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.after, 'going away wrote the stroke down').toBe(20);
    expect(r.pending, 'and nothing is left waiting').toBe(false);
  });

  test('the control: the editor open, an unsaved stroke with no timer waiting, is saved when the tab hides', async ({ page }) => {
    const r = await openThenHidden(page, 'none');
    expect(r.editorOpen).toBe(true);
    expect(r.before).toBe(false);
    expect(r.after).toBe(20);
  });
});

test.describe('fix round 1: a close whose own write did not land', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof openTraitRecord === 'function' && typeof wsSwitch === 'function'
      && typeof closeEditor === 'function' && typeof autosaveNow === 'function');
    await page.evaluate(() => { activeWs = null; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; });
  });

  for (const via of ['visibilitychange', 'pagehide', 'open', 'sessionEnded']) {
    test('the close\'s write refused once, then on the same page ' + via + ' writes the drawing where it was drawn', async ({ page }) => {
      const r = await refusedThenCalled(page, { refuse: 'write', then: 'stay', via });
      expect(r.refused, 'the close\'s own write was refused').toBe(true);
      expect(r.afterClose, 'so the close left no draft').toBe(null);
      expect(r.ws, 'no switch').toBe(null);
      expect(r.calls, 'the caller did reach autosaveNow').toBeGreaterThan(0);
      expect(r.mineT && r.mineT.px, 'the drawing was written, on your page').toBe(20);
      expect(r.theirT, 'and nothing in the group').toBe(null);
    });
  }

  test('the close\'s encode gave nothing once, then the tab hides on the same page: the drawing is written', async ({ page }) => {
    const r = await refusedThenCalled(page, { refuse: 'encode', then: 'stay', via: 'visibilitychange' });
    expect(r.refused, 'the encode gave nothing').toBe(true);
    expect(r.afterClose).toBe(null);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.mineT && r.mineT.px).toBe(20);
  });

  for (const via of ['visibilitychange', 'open']) {
    test('the close\'s write refused once, then a switch to the group: ' + via + ' files nothing in the group', async ({ page }) => {
      const r = await refusedThenCalled(page, { refuse: 'write', then: 'switch', via });
      expect(r.refused).toBe(true);
      expect(r.afterClose).toBe(null);
      expect(r.ws, 'the switch happened').toBe('team7');
      expect(r.calls).toBeGreaterThan(0);
      expect(r.theirT, 'the group gains no draft of the trait').toBe(null);
      expect(r.mineT, 'and none is written on your page from there').toBe(null);
    });
  }

  /* The store a refused write is noted against is the one it went to, not
     the one current when the refusal arrives. */
  test('the close\'s write refused only after a switch\'s wait for it ran out: nothing is filed in the group', async ({ page }) => {
    const r = await refusedThenCalled(page, { refuse: 'late', then: 'switchDuring', via: 'visibilitychange' });
    expect(r.refused).toBe(true);
    expect(r.refusedIn, 'the refusal arrived after the switch had gone on').toBe('team7');
    expect(r.ws).toBe('team7');
    expect(r.calls).toBeGreaterThan(0);
    expect(r.theirT, 'the group gains no draft of the trait').toBe(null);
    expect(r.mineT, 'and your page none from there').toBe(null);
  });

  test('the close\'s write refused once, then another account on the same page: nothing is written as theirs', async ({ page }) => {
    const r = await refusedThenCalled(page, { refuse: 'write', then: 'account', via: 'visibilitychange' });
    expect(r.refused).toBe(true);
    expect(r.afterClose).toBe(null);
    expect(r.ws).toBe(null);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.mineT, 'no draft, and none stamped with the other account').toBe(null);
  });

  test('the close\'s write refused once, then the group\'s trait of the same id drawn and saved there, and back: your page does not get the group\'s drawing', async ({ page }) => {
    const r = await refusedThenCalled(page, { refuse: 'write', then: 'drawnThere', there: 'T', via: 'visibilitychange' });
    expect(r.refused).toBe(true);
    expect(r.afterClose).toBe(null);
    expect(r.thereOpened, 'the group\'s trait opened in the editor').toBe(true);
    expect(r.thereDraft && r.thereDraft.px, 'the group\'s drawing landed there').toBe(40);
    expect(r.ws, 'back on your page').toBe(null);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.mineT, 'your page gets no draft of the group\'s drawing').toBe(null);
    expect(r.theirT && r.theirT.px, 'the group keeps its own').toBe(40);
  });

  test('the close\'s write refused once, then another of the group\'s traits drawn and saved there, and back: your page does not get the group\'s drawing', async ({ page }) => {
    const r = await refusedThenCalled(page, { refuse: 'write', then: 'drawnThere', there: 'U', via: 'visibilitychange' });
    expect(r.refused).toBe(true);
    expect(r.afterClose).toBe(null);
    expect(r.thereOpened, 'the group\'s trait opened in the editor').toBe(true);
    expect(r.thereDraft && r.thereDraft.px, 'the group\'s drawing landed there').toBe(40);
    expect(r.ws).toBe(null);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.mineU, 'your page gets no draft of the group\'s drawing').toBe(null);
    expect(r.mineT, 'nor of the trait whose write was refused').toBe(null);
    expect(r.theirU && r.theirU.px, 'the group keeps its own').toBe(40);
  });
});
