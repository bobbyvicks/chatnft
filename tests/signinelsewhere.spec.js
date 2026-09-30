/* FOLLOW-UP C, S6 AND S8: A SIGN-IN THAT CHANGES SOMEWHERE ELSE.

   S6. ANOTHER TAB ENDS THE SIGN-IN. The session lives in localStorage, which
   every tab of the site shares, and nothing listened for another tab
   changing it. A tab whose session another tab cleared (Sign out there, or
   a refusal there) kept its panel signed in, and every cloud action said
   "Sign in first" with no wall to sign in through, until something made it
   start again. It now ends the sign-in when the session is gone - the same
   sessionEnded a refusal calls. A session stored by another tab (another
   account, or the same one renewed) is not acted on here: which account a
   tab runs as, across tabs, is plan 2's cross-tab work.

   S8. A SIGN-IN LINK OPENED DURING SIGN-OUT'S WAIT. Sign-out waits (up to
   S0_FLUSH_MS) for the drawing's last save, and until the wait ends the
   page is still the leaving account's: its project, its store, its wsGen.
   The sign-in card is refused for that time (fix round 4), but a sign-in
   link's hashchange stored the link's session at once and started the page
   as that account, on the leaving account's group store. Its tokens now
   leave the address bar at once; the session is stored, and the page
   started, only after the wait.

   The stand-in names each token: a token with "u2" in it is u2's, any other
   is u1's. Anything it does not name is recorded, answered 501 and fails
   the test; a *.supabase.co request that gets past it is stopped and fails
   the test too. Made-up names and tokens only. The stand-in and the group
   page with a drawing are this file's own (Ruling F-15), copied from
   stage0stamps' and adapted. */
import { test, expect } from '@playwright/test';

let pastTheStandIns = [];
const guard = (page) => page.route(/\.supabase\.co\//, (route) => {
  pastTheStandIns.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''));
  return route.abort();
});
test.beforeEach(async ({ page }) => {
  pastTheStandIns = [];
  await guard(page);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('chatnft.ws'); localStorage.removeItem('pb.uids'); });
  expect(pastTheStandIns, 'no request got past the stand-ins to the network').toEqual([]);
});

/* Renewals wait on __renewGate when a test sets it. The team list names a
   group, team1. */
const standIn = () => {
  window.__unknown = []; window.__toasts = []; window.__asked = [];
  const shown = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { shown(m); } catch (_) {} };
  const json = (o, x, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  const whose = (auth) => auth.indexOf('u2') >= 0 ? 'u2' : 'u1';
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const auth = (io && io.headers && (io.headers.Authorization || io.headers.authorization)) || '';
    window.__asked.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, '').split('?')[0] + (auth ? ' [' + auth.replace('Bearer ', '') + ']' : ''));
    if (s.indexOf('/auth/v1/token?grant_type=refresh_token') >= 0 && m === 'POST') {
      await (window.__renewGate || null);
      return json({ access_token: 'tok-u1-renewed', refresh_token: 'rt-u1-renewed', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } });
    }
    if (s.indexOf('/auth/v1/user') >= 0) { const who = whose(auth); return json({ id: who, email: who + '@example.invalid' }); }
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }, { id: 'team1', name: 'One', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=') >= 0 && m === 'GET') return json([], { 'Content-Range': '*/0' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, null, 501);
  };
};
const where = () => {
  let st = null; try { st = JSON.parse(localStorage.getItem('chatnft.session') || 'null'); } catch (_) {}
  return { authed, uid: s0SeenUid, who: $('cloudwho').textContent, stored: st && st.access_token, gateShown: !$('signin').hidden, pushShown: !$('cloudpush').hidden,
    signedOutToast: window.__toasts.some(t => /signed out on this device/.test(t)) };
};
const open = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof cloudRender === 'function' && typeof sbToken === 'function' && typeof s0Stamp === 'function' && typeof closeEditor === 'function');
  await page.evaluate(([src, whereSrc]) => {
    (new Function('return (' + src + ')'))()();
    window.__where = (new Function('return (' + whereSrc + ')'))();
    activeWs = null; groupCaughtUp = true;
  }, [standIn.toString(), where.toString()]);
};
const u1Session = (inSeconds) => JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + (inSeconds || 3600), user: { id: 'u1' } });

/* Two tabs of one account, u1, both started and signed in; then the first
   tab does `act`; then what the second shows. */
const twoTabs = async (page, context, act) => {
  await open(page);
  const B = await context.newPage();
  await guard(B);
  await open(B);
  await page.evaluate((s) => { wsSave(null); localStorage.setItem('chatnft.session', s); }, u1Session());
  for (const p of [page, B]) await p.evaluate(async () => { await cloudRender(); await new Promise(r => setTimeout(r, 300)); window.__toasts = []; });
  const before = await B.evaluate(() => window.__where());
  await page.evaluate(act);
  await B.waitForTimeout(400);
  const after = await B.evaluate(() => window.__where());
  const unknown = [...await page.evaluate(() => window.__unknown.slice()), ...await B.evaluate(() => window.__unknown.slice())];
  await B.close();
  return { before, after, unknown };
};
const u1In = { authed: true, uid: 'u1', who: 'u1@example.invalid', stored: 'tok-u1', gateShown: false, pushShown: true, signedOutToast: false };

test.describe('follow-up C (S6): a sign-in another tab ended', () => {
  test('the other tab signs out: this tab ends its sign-in too, and says so', async ({ page, context }) => {
    const r = await twoTabs(page, context, () => { cloudSignOut(); });
    expect(r).toEqual({ before: u1In, unknown: [],
      after: { authed: false, uid: null, who: 'not signed in', stored: null, gateShown: true, pushShown: false, signedOutToast: true } });
  });

  test('the other tab clears the site\'s storage: this tab ends its sign-in too', async ({ page, context }) => {
    const r = await twoTabs(page, context, () => { localStorage.clear(); });
    expect(r).toEqual({ before: u1In, unknown: [],
      after: { authed: false, uid: null, who: 'not signed in', stored: null, gateShown: true, pushShown: false, signedOutToast: true } });
  });

  test('the control: the other tab renews the same account\'s session - this tab stays signed in', async ({ page, context }) => {
    const r = await twoTabs(page, context, () => {
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1-renewed', refresh_token: 'rt-u1-renewed', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
    });
    expect(r).toEqual({ before: u1In, unknown: [], after: Object.assign({}, u1In, { stored: 'tok-u1-renewed' }) });
  });

  /* Left to plan 2: which account a tab runs as when another tab signs in
     as someone else. Only that nothing is ended here is asserted. */
  test('the control: the other tab stores another account\'s session - this tab does not end its sign-in', async ({ page, context }) => {
    const r = await twoTabs(page, context, () => {
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u2', refresh_token: 'rt-u2', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u2' } }));
    });
    expect({ before: r.before, authed: r.after.authed, gateShown: r.after.gateShown, signedOutToast: r.after.signedOutToast, unknown: r.unknown })
      .toEqual({ before: u1In, authed: true, gateShown: false, signedOutToast: false, unknown: [] });
  });

  /* Only the session's own key is read as the sign-in changing. This tab's
     own sign-out clears the session before it waits for the drawing's save
     (no storage event reaches the tab that made the change), so for that
     wait it is signed in with nothing stored; another tab writing some
     other key then is not another tab ending the sign-in. */
  test('the control: while this tab\'s own sign-out waits, another tab writes some other key - this tab is not told it was signed out elsewhere', async ({ page, context }) => {
    /* B opens first, with nothing stored, so its own start asks nobody. */
    await open(page);
    const B = await context.newPage();
    await guard(B);
    await open(B);
    await groupPageWithDrawing(page, true);
    await B.waitForTimeout(300);
    await page.evaluate(() => {
      if (!s0SaveInFlight) throw new Error('the save is not in flight');
      window.__toasts = [];
      cloudSignOut();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
    });
    await B.evaluate(() => { localStorage.setItem('pb.some-other-key', '1'); localStorage.removeItem('pb.some-other-key'); });
    await page.waitForTimeout(300);
    const during = await page.evaluate(() => {
      if (!s0SignOutWait || !s0SaveInFlight) throw new Error('the wait ended before the check');
      const t = window.__toasts.slice(); window.__releaseSave(); return t;
    });
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => ({ toasts: window.__toasts.slice(), authed, unknown: window.__unknown.slice() }));
    const unknownB = await B.evaluate(() => window.__unknown.slice());
    await B.close();
    expect({ during, after, unknownB }).toEqual({ during: [], after: { toasts: ['Signed out'], authed: false, unknown: [] }, unknownB: [] });
  });
});

/* A group page, team1, signed in as u1, its account panel closed; with
   `saving`, a drawing whose closing save is being written, its encode HELD
   until __releaseSave(); without, the drawing was saved and closed first. */
const groupPageWithDrawing = (page, saving) => page.evaluate(async (saving) => {
  for (const s of [null, 'team1']) { activeWs = s; dbp = null; dbpName = null; await dbClear(); }
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  activeWs = 'team1'; wsSave('team1'); dbp = null; dbpName = null; groupCaughtUp = true;
  await cloudRender();
  await new Promise(r => setTimeout(r, 300));
  const n = 16, dd = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) { dd[i * 4] = 200; dd[i * 4 + 1] = 120; dd[i * 4 + 3] = 255; }
  fileName = 'x.png';
  startEditor(dd, n, n, n, n, palette(dd, n * n, 24, 64), false);
  await autosaveNow();
  if (saving) {
    const encode = art.toBlob.bind(art);
    let open; const gate = new Promise(r => { open = r; });
    window.__releaseSave = open;
    art.toBlob = (cb, t) => encode(b => { gate.then(() => cb(b)); }, t);
    closeEditor();
    if (!s0SaveInFlight) throw new Error('the closing save is not in flight');
  } else await closeEditor();
  window.__toasts = [];
  window.__gen0 = wsGen;
}, !!saving);
/* The page as it stands: who, where, and what the address bar holds. */
const now = () => {
  let st = null; try { st = JSON.parse(localStorage.getItem('chatnft.session') || 'null'); } catch (_) {}
  return { stored: st && st.access_token, authed, uid: s0SeenUid, activeWs, addressBar: location.hash };
};
const LINK = '#access_token=tok-link-u2&refresh_token=rt-link-u2&expires_in=3600&token_type=bearer&type=magiclink';

test.describe('follow-up C (S8): a sign-in link opened while sign-out waits for the drawing\'s save', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  /* During the wait the page is still the leaving account's: its project,
     and its uid, which waits with the save (fix round 3) - the session is
     already gone (fix round 4). The control shows that state with no link;
     the link, opened in it, changes nothing but the address bar. */
  const duringTheWait = (page, link) => page.evaluate(async ([link, nowSrc]) => {
    const state = new Function('return (' + nowSrc + ')')();
    if (!s0SaveInFlight) throw new Error('the save is not in flight');
    cloudSignOut();
    if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
    if (link) location.hash = link;
    await new Promise(r => setTimeout(r, 600));
    if (!s0SignOutWait || !s0SaveInFlight) throw new Error('the wait ended before the check');
    return Object.assign(state(), { toasts: window.__toasts.slice(), unknown: window.__unknown.slice() });
  }, [link || null, now.toString()]);
  const leaving = { stored: null, authed: true, uid: 'u1', activeWs: 'team1', addressBar: '', toasts: [], unknown: [] };

  test('during the wait: the link\'s tokens leave the address bar at once, and nothing is stored or started until the wait is over', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    expect(await duringTheWait(page, LINK)).toEqual(leaving);
  });

  test('the control: the same wait with no link opened - still the leaving account\'s project and uid, with nothing stored', async ({ page }) => {
    await groupPageWithDrawing(page, true);
    expect(await duringTheWait(page, null)).toEqual(leaving);
  });

  /* With `goTo`, the person goes to another page of the site (#project)
     during the wait, after the link: that address is theirs, and storing
     the link's session after the wait leaves it alone. */
  const afterTheWait = async (page, goTo) => {
    await groupPageWithDrawing(page, true);
    await page.evaluate(async ([link, goTo]) => {
      cloudSignOut();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
      location.hash = link;
      await new Promise(r => setTimeout(r, 300));
      if (goTo) { location.hash = goTo; await new Promise(r => setTimeout(r, 300)); }
      if (!s0SignOutWait || !s0SaveInFlight) throw new Error('the wait ended before the release');
      window.__releaseSave();
    }, [LINK, goTo || null]);
    return page.evaluate(async (nowSrc) => {
      await new Promise(r => setTimeout(r, 1500));
      const state = new Function('return (' + nowSrc + ')')();
      return Object.assign(state(), { gen: wsGen - window.__gen0, who: $('cloudwho').textContent, toasts: window.__toasts.slice(), unknown: window.__unknown.slice() });
    }, now.toString());
  };
  const linkIn = { stored: 'tok-link-u2', authed: true, uid: 'u2', activeWs: null, addressBar: '', gen: 1, who: 'u2@example.invalid',
    toasts: ['Signed out', 'Signed in'], unknown: [] };

  test('after the wait: signed out of the group, then signed in as the link\'s account on its own page', async ({ page }) => {
    expect(await afterTheWait(page, null)).toEqual(linkIn);
  });

  test('after the wait, having gone to another page during it: the same, and the address bar keeps that page', async ({ page }) => {
    expect(await afterTheWait(page, '#project')).toEqual(Object.assign({}, linkIn, { addressBar: '#project' }));
  });

  test('the control: the same link with no sign-out waiting is taken at once, as before', async ({ page }) => {
    await groupPageWithDrawing(page, false);
    const r = await page.evaluate(async ([link, nowSrc]) => {
      const state = new Function('return (' + nowSrc + ')')();
      cloudSignOut();
      if (s0SignOutWait) throw new Error('sign-out waited');
      location.hash = link;
      await new Promise(r => setTimeout(r, 600));
      return Object.assign(state(), { who: $('cloudwho').textContent, unknown: window.__unknown.slice() });
    }, [LINK, now.toString()]);
    expect(r).toEqual({ stored: 'tok-link-u2', authed: true, uid: 'u2', activeWs: null, addressBar: '', who: 'u2@example.invalid', unknown: [] });
  });
});
