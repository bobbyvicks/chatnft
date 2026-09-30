/* FOLLOW-UP C, S1: A START'S ANSWER IS ABOUT THE SESSION IT ASKED OF.

   A start of the page (cloudRender: a reload, the account panel, a sign-in)
   asks the server whether the stored session is good, and renders what it
   hears. When the session changes while the question is out - the person
   signs out and another account signs in, or another tab of the account
   renews first - the answer is about a session that is no longer stored.
   Rendered anyway, it put "Cannot reach the server just now" over a
   working connection (sbToken answers null for a renewal whose session has
   gone, and sbAuthState read that null as "could not ask"), or, past the
   6 s deadline, the deadline wrote the same note after the new account's
   own start had rendered it signed in (measured, t10fin/refute-tokennull).

   The fix proposed first re-asked inside sbAuthState. It left the note in
   both "past" timings (the deadline, not sbAuthState, wrote it), and an
   action pressed by the leaving account (Save to cloud) re-asked too and
   ran on as the new account: "1 failed - the server could not be
   reached", with the leaving account's trait sent under the new one's
   token (same probe). So these specs are that probe's whole matrix:
     - a start whose renewal is held, a sign-out and a sign-in on the card,
       then the renewal answering 400 or 200, inside or past the deadline;
     - the control: the same start, no switch;
     - two tabs of one account renewing together, the second refused or
       answered GoTrue's way;
     - Save to cloud pressed by the leaving account, its renewal held across
       the switch: nothing is sent after the release;
   and one more of the same family: the start's account check (not its
   renewal) held, answered 200 for the leaving account after the new one
   signed in - which drew the leaving account over the new one's session.

   The stand-in names each token: tok-u1 (and its renewal) is u1's, tok-u2
   is u2's (the card's sign-in), tok-A and tok-B are u1's. Anything it does
   not name is recorded, answered 501 and fails the test; a *.supabase.co
   request that gets past it is stopped and fails the test too. Made-up
   names and tokens only. The stand-in is this file's own (Ruling F-15), a
   copy of the probe's, not stage0stamps'. */
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
test.afterEach(async () => {
  expect(pastTheStandIns, 'no request got past the stand-ins to the network').toEqual([]);
});

/* The stand-in. Renewals wait on __renewGate (re-armed by __arm) and answer
   __renewAnswer(). u1's account check waits on __userGate when a test sets
   it. Every request is listed in __asked with the token it carried. */
const standIn = () => {
  window.__unknown = []; window.__toasts = []; window.__renewAsked = 0; window.__userAsked = 0; window.__asked = [];
  const shown = window.toast; window.toast = (m) => { window.__toasts.push(String(m)); try { shown(m); } catch (_) {} };
  window.__arm = () => { let o; window.__renewGate = new Promise(r => { o = r; }); window.__renewOpen = o; };
  window.__arm();
  const json = (o, x, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  const whose = (auth) => auth.indexOf('u2') >= 0 ? 'u2' : 'u1';
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const auth = (io && io.headers && (io.headers.Authorization || io.headers.authorization)) || '';
    window.__asked.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, '').split('?')[0] + (auth ? ' [' + auth.replace('Bearer ', '') + ']' : ''));
    if (s.indexOf('/auth/v1/token?grant_type=refresh_token') >= 0 && m === 'POST') {
      window.__renewAsked++; await window.__renewGate;
      const a = window.__renewAnswer ? window.__renewAnswer() : { status: 200 };
      if (a.status !== 200) return json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }, null, a.status);
      return json({ access_token: a.at || 'tok-u1-renewed', refresh_token: a.rt || 'rt-u1-renewed', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: a.uid || 'u1' } });
    }
    if (s.indexOf('/auth/v1/token?grant_type=password') >= 0 && m === 'POST')
      return json({ access_token: 'tok-u2', refresh_token: 'rt-u2', expires_in: 3600, user: { id: 'u2' } });
    if (s.indexOf('/auth/v1/user') >= 0) {
      window.__userAsked++;
      if (window.__userGate && auth.indexOf('tok-u1') >= 0) { const st = await window.__userGate; if (st !== 200) return json({ msg: 'invalid JWT' }, null, st); }
      const who = whose(auth);
      return json({ id: who, email: who + '@example.invalid' });
    }
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'me', name: 'Me', personal: true }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET') return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits?select=') >= 0 && m === 'GET') return json([], { 'Content-Range': '*/0' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    window.__unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, null, 501);
  };
};
/* Where a page ends: signed in as whom (the verified uid, and the name the
   panel shows), what is stored, and whether it shows itself offline or
   signed out. */
const where = () => {
  let st = null; try { st = JSON.parse(localStorage.getItem('chatnft.session') || 'null'); } catch (_) {}
  return { authed, uid: s0SeenUid, who: $('cloudwho').textContent, stored: st && st.access_token,
    offline: $('cloudnote').textContent === CLOUD_UNREACHABLE, pushShown: !$('cloudpush').hidden, gateShown: !$('signin').hidden };
};
const open = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof cloudRender === 'function' && typeof sbToken === 'function' && typeof gateSignIn === 'function' && typeof s0Stamp === 'function');
  await page.evaluate(([src, whereSrc]) => {
    (new Function('return (' + src + ')'))()();
    window.__where = (new Function('return (' + whereSrc + ')'))();
    activeWs = null; wsSave(null);
  }, [standIn.toString(), where.toString()]);
};
test.afterEach(async ({ page }) => {
  await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); localStorage.removeItem('pb.uids'); });
});

/* A start whose renewal is held; with `swap`, a sign-out and u2 signing in on
   the card while it is held, 800 ms for u2's own start to settle; then the
   renewal answers `status` - at once, or (`past`) once the start's 6 s
   deadline has gone by. `what` 'renew' holds the renewal of u1's token in
   its last minute; 'user' holds u1's account check of a fresh token. */
const startAcross = (page, { status, past, swap, what }) => page.evaluate(async ([status, past, swap, what]) => {
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await cloudRender();
  const first = window.__where();
  if (what === 'renew') {
    localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } }));
    window.__arm(); window.__renewAsked = 0; window.__renewAnswer = () => ({ status, at: 'tok-u1-renewed', rt: 'rt-u1-renewed' });
  } else {
    let o; window.__userGate = new Promise(r => { o = r; }); window.__userOpen = o; window.__userAsked = 0;
  }
  const t0 = performance.now();
  let settledAt = null;
  const start = cloudRender().then(u => { settledAt = Math.round(performance.now() - t0); return u ? u.id : null; }, e => 'threw ' + e);
  const asked = what === 'renew' ? () => window.__renewAsked : () => window.__userAsked;
  for (let i = 0; i < 100 && !asked(); i++) await new Promise(r => setTimeout(r, 10));
  const held = asked() === 1;
  let afterSignIn = null;
  if (swap) {
    cloudSignOut();
    $('gateuser').value = 'someone2@example.invalid'; $('gatepass').value = 'not-a-real-pass';
    await gateSignIn();
    await new Promise(r => setTimeout(r, 800));
    afterSignIn = window.__where();
  }
  if (past) { const wait = 6500 - (performance.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait)); }
  const settledBeforeTheAnswer = settledAt !== null;
  const mark = window.__asked.length;
  if (what === 'renew') window.__renewOpen(); else window.__userOpen(status);
  const rendered = await start;
  await new Promise(r => setTimeout(r, 300));
  /* userChecksAfter: the account checks made once the held answer was let
     go - the held start's own, and any it asked again. */
  const userChecksAfter = window.__asked.slice(mark).filter(a => a.indexOf('/auth/v1/user') >= 0);
  return { first, held, afterSignIn, settledBeforeTheAnswer, rendered, end: window.__where(), toasts: window.__toasts.slice(), userChecksAfter, unknown: window.__unknown.slice() };
}, [status, !!past, !!swap, what || 'renew']);

const signedInAs = (uid, stored) => ({ authed: true, uid, who: uid + '@example.invalid', stored, offline: false, pushShown: true, gateShown: false });

test.describe('follow-up C (S1): a start renders only an answer about the session stored now', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('the control: a start whose renewal is held and answered, nobody switching, shows u1 with the renewed session', async ({ page }) => {
    const r = await startAcross(page, { status: 200, swap: false });
    /* One account check, with the renewed token: this start's own renewal
       is the session it asked of, not a change to ask again about. */
    expect({ first: r.first, held: r.held, rendered: r.rendered, end: r.end, userChecksAfter: r.userChecksAfter, unknown: r.unknown })
      .toEqual({ first: signedInAs('u1', 'tok-u1'), held: true, rendered: 'u1', end: signedInAs('u1', 'tok-u1-renewed'),
        userChecksAfter: ['GET /auth/v1/user [tok-u1-renewed]'], unknown: [] });
  });

  /* The stage-0 re-ask inside sbAuthState (a late refusal of a token no
     longer stored): the start asks again once, of u2's token, and shows u2
     - one question after the release, not two. */
  test('the leaving account\'s account check refused 401 after u2 signed in: u2 shown, asked again once', async ({ page }) => {
    const r = await startAcross(page, { status: 401, swap: true, what: 'user' });
    expect({ held: r.held, afterSignIn: r.afterSignIn, rendered: r.rendered, end: r.end, userChecksAfter: r.userChecksAfter, unknown: r.unknown })
      .toEqual({ held: true, afterSignIn: signedInAs('u2', 'tok-u2'), rendered: 'u2', end: signedInAs('u2', 'tok-u2'),
        userChecksAfter: ['GET /auth/v1/user [tok-u2]'], unknown: [] });
  });

  for (const status of [400, 200]) {
    test('the leaving account\'s renewal answered ' + status + ' after u2 signed in, inside the deadline: u2 shown, and no offline note', async ({ page }) => {
      const r = await startAcross(page, { status, swap: true });
      expect({ held: r.held, afterSignIn: r.afterSignIn, end: r.end, unknown: r.unknown })
        .toEqual({ held: true, afterSignIn: signedInAs('u2', 'tok-u2'), end: signedInAs('u2', 'tok-u2'), unknown: [] });
    });

    test('the leaving account\'s renewal answered ' + status + ' after u2 signed in, past the 6 s deadline: u2 shown, and no offline note', async ({ page }) => {
      test.setTimeout(30_000);
      const r = await startAcross(page, { status, swap: true, past: true });
      /* settledBeforeTheAnswer: the deadline, not the answer, ended the
         held start - the timing this case is for. */
      expect({ held: r.held, settledBeforeTheAnswer: r.settledBeforeTheAnswer, afterSignIn: r.afterSignIn, end: r.end, unknown: r.unknown })
        .toEqual({ held: true, settledBeforeTheAnswer: true, afterSignIn: signedInAs('u2', 'tok-u2'), end: signedInAs('u2', 'tok-u2'), unknown: [] });
    });
  }

  /* One more of the same family: not the renewal but the account check is
     held, and it answers "yes, u1" after u2 signed in. */
  test('the leaving account\'s account check answered 200 after u2 signed in: u2 is the account shown, not u1', async ({ page }) => {
    const r = await startAcross(page, { status: 200, swap: true, what: 'user' });
    expect({ held: r.held, afterSignIn: r.afterSignIn, end: r.end, unknown: r.unknown })
      .toEqual({ held: true, afterSignIn: signedInAs('u2', 'tok-u2'), end: signedInAs('u2', 'tok-u2'), unknown: [] });
  });

  /* And with nobody signing in after the sign-out: the late "yes, u1" drew
     a signed-in panel over a device with no session stored. */
  test('the leaving account\'s account check answered 200 after a sign-out, nobody signing in: the page stays signed out', async ({ page }) => {
    const r = await page.evaluate(async () => {
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      await cloudRender();
      let o; window.__userGate = new Promise(r => { o = r; }); window.__userAsked = 0;
      const start = cloudRender().then(u => u ? u.id : null, e => 'threw ' + e);
      for (let i = 0; i < 100 && !window.__userAsked; i++) await new Promise(r => setTimeout(r, 10));
      const held = window.__userAsked === 1;
      cloudSignOut();
      await new Promise(r => setTimeout(r, 300));
      const afterSignOut = window.__where();
      o(200);
      const rendered = await start;
      await new Promise(r => setTimeout(r, 300));
      return { held, afterSignOut, rendered, end: window.__where(), unknown: window.__unknown.slice() };
    });
    const out = { authed: false, uid: null, who: 'not signed in', stored: null, offline: false, pushShown: false, gateShown: true };
    expect(r).toEqual({ held: true, afterSignOut: out, rendered: null, end: out, unknown: [] });
  });

  test('the control: the same account check held and answered 200, nobody switching, shows u1', async ({ page }) => {
    const r = await startAcross(page, { status: 200, swap: false, what: 'user' });
    expect({ held: r.held, rendered: r.rendered, end: r.end, unknown: r.unknown })
      .toEqual({ held: true, rendered: 'u1', end: signedInAs('u1', 'tok-u1'), unknown: [] });
  });

  /* The deadline is still the offline note when it is true: the session the
     start asked about is still the one stored, and the server never
     answered. */
  test('the control: a renewal that never answers, nobody switching - past the deadline the offline note is shown', async ({ page }) => {
    test.setTimeout(30_000);
    const r = await page.evaluate(async () => {
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      await cloudRender();
      localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } }));
      window.__arm(); window.__renewAsked = 0;
      const t0 = performance.now();
      const rendered = await cloudRender();
      return { held: window.__renewAsked === 1, tookMs: Math.round(performance.now() - t0), rendered: rendered === null ? null : 'something', end: window.__where(),
        renewals: window.__renewAsked, userAsksAfter: window.__asked.filter(a => a.indexOf('/auth/v1/user') >= 0).length };
    });
    expect({ held: r.held, overTheDeadline: r.tookMs >= 5900 && r.tookMs < 9000, rendered: r.rendered, end: r.end, renewals: r.renewals })
      .toEqual({ held: true, overTheDeadline: true, rendered: null,
        end: { authed: true, uid: 'u1', who: 'u1@example.invalid', stored: 'tok-u1', offline: true, pushShown: true, gateShown: false }, renewals: 1 });
  });
});

/* Two tabs of one account restored together, the token in its last minute:
   each renews it. A's answer lands first (tok-A, rt-1, stored). B's is
   refused (400: the refresh token was already used) or answered GoTrue's
   way ('gotrue': 200, carrying the active refresh token rt-1). */
test.describe('follow-up C (S1): two tabs of one account renewing together', () => {
  for (const bStatus of ['gotrue', 400]) {
    test('the second tab\'s renewal ' + (bStatus === 'gotrue' ? 'answered with the active refresh token' : 'refused 400') + ': it ends signed in as u1, not offline', async ({ page, context }) => {
      await open(page);
      const B = await context.newPage();
      await guard(B);
      await open(B);
      await page.evaluate(() => { window.__renewAnswer = () => ({ status: 200, at: 'tok-A', rt: 'rt-1' }); });
      await B.evaluate((st) => { window.__renewAnswer = () => (st === 'gotrue' ? { status: 200, at: 'tok-B', rt: 'rt-1' } : { status: st, at: 'tok-B', rt: 'rt-1b' }); }, bStatus);
      await page.evaluate(() => { localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-0', refresh_token: 'rt-0', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } })); });
      await page.evaluate(() => { window.__render = cloudRender().then(u => u ? u.id : null, e => 'threw ' + e); });
      await B.evaluate(() => { window.__render = cloudRender().then(u => u ? u.id : null, e => 'threw ' + e); });
      await page.waitForFunction(() => window.__renewAsked === 1, null, { timeout: 5000 });
      await B.waitForFunction(() => window.__renewAsked === 1, null, { timeout: 5000 });
      const a = await page.evaluate(async () => { window.__renewOpen(); return await window.__render; });
      const b = await B.evaluate(async () => { window.__renewOpen(); return await window.__render; });
      await B.waitForTimeout(300);
      const bEnd = await B.evaluate(() => window.__where());
      const unknown = [...await page.evaluate(() => window.__unknown.slice()), ...await B.evaluate(() => window.__unknown.slice())];
      await B.close();
      expect({ a, b, bEnd, unknown })
        .toEqual({ a: 'u1', b: 'u1', bEnd: { authed: true, uid: 'u1', who: 'u1@example.invalid', stored: 'tok-A', offline: false, pushShown: true, gateShown: false }, unknown: [] });
    });
  }
});

/* Save to cloud pressed as u1, u1's token in its last minute: the push's
   renewal is held; Sign out; u2 signs in on the card; then u1's renewal
   answers. Nothing the push does after the release may carry u2's token -
   it was u1's press. One trait seeded in the personal store. */
test.describe('follow-up C (S1): an action pressed by the leaving account', () => {
  test.beforeEach(async ({ page }) => { await open(page); });
  for (const status of [200, 400]) {
    test('Save to cloud as u1, its renewal answered ' + status + ' after u2 signed in: nothing is sent after the release, and u2 stays', async ({ page }) => {
      const r = await page.evaluate(async (status) => {
        localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
        groupCaughtUp = true;
        await cloudRender();
        await dbPut({ id: 't_probe_hats_wip', kind: 'trait', name: 'probe', layer: 'hats', status: 'wip', w: 16, h: 16, at: 1, blob: new Blob([new Uint8Array(16)]) });
        await new Promise(r => setTimeout(r, 300));
        localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'tok-u1', refresh_token: 'rt-u1', expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: 'u1' } }));
        window.__arm(); window.__renewAsked = 0; window.__renewAnswer = () => ({ status, at: 'tok-u1-renewed', rt: 'rt-u1-renewed' });
        const pushing = cloudPush().then(() => 'done', e => 'threw ' + e);
        for (let i = 0; i < 100 && !window.__renewAsked; i++) await new Promise(r => setTimeout(r, 10));
        const held = window.__renewAsked === 1;
        cloudSignOut();
        $('gateuser').value = 'someone2@example.invalid'; $('gatepass').value = 'not-a-real-pass';
        await gateSignIn();
        await new Promise(r => setTimeout(r, 500));
        const afterSignIn = window.__where();
        const mark = window.__asked.length; window.__toasts = [];
        window.__renewOpen();
        const ended = await pushing;
        await new Promise(r => setTimeout(r, 300));
        return { held, afterSignIn, ended, askedAfterRelease: window.__asked.slice(mark), toasts: window.__toasts.slice(), end: window.__where(), unknown: window.__unknown.slice() };
      }, status);
      expect({ held: r.held, afterSignIn: r.afterSignIn, ended: r.ended, askedAfterRelease: r.askedAfterRelease,
        claimedAFailedSend: r.toasts.some(t => /failed/.test(t)), end: r.end, unknown: r.unknown })
        .toEqual({ held: true, afterSignIn: signedInAs('u2', 'tok-u2'), ended: 'done', askedAfterRelease: [],
          claimedAFailedSend: false, end: signedInAs('u2', 'tok-u2'), unknown: [] });
    });
  }
});
