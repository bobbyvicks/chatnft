/* FOLLOW-UP C, S2: THE RENEWAL'S GUARDS, AS BEHAVIOUR.

   sbToken renews a session in its last minute. When the answer lands and
   the stored session has changed meanwhile (another tab renewed first, a
   sign-out, another account signed in), the answer is not stored, and what
   sbToken hands back depends on what is stored now (final adjudication
   touch, stage 0):

     const same=!!s0SessionUid(still) && s0SessionUid(still)===s0SessionUid(s);
     return (same && still.access_token && still.expires_at
             && Date.now() < (still.expires_at*1000 - 60000)) ? still.access_token : null;

   That is three guards: the stored session's account must be known (a
   non-null uid), it must be the same account as the one renewed, and its
   token must be outside its last minute. Until this file they were pinned
   only by patch601's finish() text check; their mutants survived a full
   run (t10fin/refute-uidguard, full-m12: 2139 passed). These are that
   probe's seven cases, S1-S7, as specs. Each guard's mutant reddens only
   its own cases:
     - freshness removed: "in its last minute" and "expired";
     - the non-null uid guard removed: "tokens that do not decode";
     - the same-account comparison removed: "another account" and
       "JWT subjects differ";
   and the two controls ("fresh", "JWT subjects equal") answer the stored
   token under all three.

   A stand-in window.fetch answers the renewal only, held until the stored
   session has been changed; anything else is recorded, answered 501 and
   fails the test. Every *.supabase.co request that gets past it is stopped
   here too. Made-up tokens only. */
import { test, expect } from '@playwright/test';

let pastTheStandIns = [];
test.beforeEach(async ({ page }) => {
  const seen = pastTheStandIns = [];
  await page.route(/\.supabase\.co\//, (route) => {
    seen.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''));
    return route.abort();
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof sbToken === 'function' && typeof s0SessionUid === 'function');
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => { localStorage.removeItem('chatnft.session'); });
  expect(pastTheStandIns, 'no request got past the stand-ins to the network').toEqual([]);
});

/* A JWT whose only claim is its subject: what a sign-in link's session
   carries before anything has been verified (user: null). */
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub) => b64u({ alg: 'none' }) + '.' + b64u({ sub }) + '.sig';

/* `s` is the session the renewal starts from, in its last minute; `still`
   is stored while the renewal is held. Times are seconds from now. */
const renewAcross = (page, s, still) => page.evaluate(async ([s, still]) => {
  const now = Math.floor(Date.now() / 1000);
  s = Object.assign({}, s, { expires_at: now + s.in });
  still = Object.assign({}, still, { expires_at: now + still.in });
  delete s.in; delete still.in;
  window.__renewAsked = 0; window.__unknown = [];
  let open; const gate = new Promise(res => { open = res; });
  const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (u, io) => {
    const x = String(u), m = (io && io.method) || 'GET';
    if (x.indexOf('/auth/v1/token?grant_type=refresh_token') >= 0 && m === 'POST') {
      window.__renewAsked++; await gate;
      return json({ access_token: 'tok-renewed', refresh_token: 'rt-renewed', expires_at: Math.floor(Date.now() / 1000) + 3600, user: s.user });
    }
    window.__unknown.push(m + ' ' + x.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, 501);
  };
  localStorage.setItem('chatnft.session', JSON.stringify(s));
  const uids = { s: s0SessionUid(s), still: s0SessionUid(still) };
  const p = sbToken();
  for (let i = 0; i < 100 && !window.__renewAsked; i++) await new Promise(res => setTimeout(res, 10));
  const held = window.__renewAsked === 1;
  localStorage.setItem('chatnft.session', JSON.stringify(still));
  open();
  const got = await p;
  const after = localStorage.getItem('chatnft.session');
  /* got, named: the stored session's token, nothing, or the renewal's own. */
  const answered = got === still.access_token ? 'the stored token' : got === null ? 'nothing' : got === 'tok-renewed' ? 'the renewal' : String(got);
  return { held, uids, answered, storedUntouched: after === JSON.stringify(still), unknown: window.__unknown.slice() };
}, [s, still]);

const u1 = { id: 'u1' }, u2 = { id: 'u2' };

test.describe('follow-up C (S2): what a renewal answers when the stored session changed while it was out', () => {
  test('S1, the control: the same account, stored meanwhile fresh - the stored token', async ({ page }) => {
    const r = await renewAcross(page, { access_token: 'tok-u1-a', refresh_token: 'rt-0', in: 30, user: u1 },
      { access_token: 'tok-u1-b', refresh_token: 'rt-b', in: 3600, user: u1 });
    expect(r).toEqual({ held: true, uids: { s: 'u1', still: 'u1' }, answered: 'the stored token', storedUntouched: true, unknown: [] });
  });

  test('S2: the same account, stored meanwhile in its last minute - nothing (the freshness guard)', async ({ page }) => {
    const r = await renewAcross(page, { access_token: 'tok-u1-a', refresh_token: 'rt-0', in: 30, user: u1 },
      { access_token: 'tok-u1-b', refresh_token: 'rt-b', in: 30, user: u1 });
    expect(r).toEqual({ held: true, uids: { s: 'u1', still: 'u1' }, answered: 'nothing', storedUntouched: true, unknown: [] });
  });

  test('S3: the same account, stored meanwhile already expired - nothing (the freshness guard)', async ({ page }) => {
    const r = await renewAcross(page, { access_token: 'tok-u1-a', refresh_token: 'rt-0', in: 30, user: u1 },
      { access_token: 'tok-u1-b', refresh_token: 'rt-b', in: -10, user: u1 });
    expect(r).toEqual({ held: true, uids: { s: 'u1', still: 'u1' }, answered: 'nothing', storedUntouched: true, unknown: [] });
  });

  test('S4: no user on either, tokens that do not decode - nothing (the account must be known)', async ({ page }) => {
    const r = await renewAcross(page, { access_token: 'opaque-a', refresh_token: 'rt-0', in: 30, user: null },
      { access_token: 'opaque-b', refresh_token: 'rt-b', in: 3600, user: null });
    expect(r).toEqual({ held: true, uids: { s: null, still: null }, answered: 'nothing', storedUntouched: true, unknown: [] });
  });

  test('S5: another account stored meanwhile, fresh - nothing (the same-account guard)', async ({ page }) => {
    const r = await renewAcross(page, { access_token: 'tok-u1-a', refresh_token: 'rt-0', in: 30, user: u1 },
      { access_token: 'tok-u2', refresh_token: 'rt-u2', in: 3600, user: u2 });
    expect(r).toEqual({ held: true, uids: { s: 'u1', still: 'u2' }, answered: 'nothing', storedUntouched: true, unknown: [] });
  });

  test('S6, the control: sign-in link sessions (no user), JWT subjects equal, fresh - the stored token', async ({ page }) => {
    const r = await renewAcross(page, { access_token: jwt('u1'), refresh_token: 'rt-0', in: 30, user: null },
      { access_token: jwt('u1') + 'x', refresh_token: 'rt-b', in: 3600, user: null });
    expect(r).toEqual({ held: true, uids: { s: 'u1', still: 'u1' }, answered: 'the stored token', storedUntouched: true, unknown: [] });
  });

  test('S7: sign-in link sessions (no user), JWT subjects differ, fresh - nothing (the same-account guard)', async ({ page }) => {
    const r = await renewAcross(page, { access_token: jwt('u1'), refresh_token: 'rt-0', in: 30, user: null },
      { access_token: jwt('u2'), refresh_token: 'rt-b', in: 3600, user: null });
    expect(r).toEqual({ held: true, uids: { s: 'u1', still: 'u2' }, answered: 'nothing', storedUntouched: true, unknown: [] });
  });
});
