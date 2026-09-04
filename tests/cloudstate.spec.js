/* A hiccup is not a "no".

   Reported as "the cloud service is buggy and weird". Measured with a valid
   session in storage, an hour from expiry, and ONE failed request to
   /auth/v1/user - exactly a dropped connection:

                      before    after one dropped request
     signed in          yes            NO
     sign-in wall      down            UP
     shelf cards          6            0
     session stored     yes           yes

   Nothing was deleted - the rendering was taken down and IndexedDB left alone -
   but the whole collection vanished behind a sign-in wall while the session was
   still valid.

   THE CAUSE was two states where there are three. sbUser() returns null both
   for "the server says no" and for "I could not ask", and cloudRender read that
   single null as the first, set authed=false and raised the gate.

   It fires on page load, on sign-in, on a workspace switch, on joining a
   project, after a password change - and on OPENING THE ACCOUNT PANEL, which is
   a routine click. That is what makes it look weird rather than broken: you
   click the account button and everything disappears, then a reload brings it
   back.

   THE CONTROL IS THE POINT OF THIS FILE. "Nothing signs you out" is easy and
   wrong - signing out on a shared device has to keep working. So every test
   that proves a failure is ignored is paired with one proving a real rejection
   is still obeyed.
*/
import { test, expect } from '@playwright/test';

/* A session that is valid and nowhere near expiry, so the token comes straight
   from storage and no refresh call is involved. The token is not real and never
   reaches a server: every test here intercepts the request. */
const GOOD_SESSION = {
  access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
  expires_at: 0, user: { id: 'u1', email: 'someone@example.com' },
};

/* Signed in with a rendered shelf, which is the state the defect destroyed. */
async function signedInWithWork(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof cloudRender === 'function');
  await page.evaluate(async (sess) => {
    localStorage.setItem('chatnft.session',
      JSON.stringify({ ...sess, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    try { authed = true; } catch (_) {}
    gateShow(false);
    await dbClear();
    const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
      status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
    await put('tan', 'skins');
    await put('pale', 'skins');
    await renderShelf();
  }, GOOD_SESSION);
  await page.waitForTimeout(400);
}

/* Runs cloudRender with the user check answering however we say, and reports
   what happened to the person's work. */
const renderWith = (page, mode) => page.evaluate(async (how) => {
  const real = window.fetch;
  window.fetch = (u, o) => {
    if (String(u).indexOf('/auth/v1/user') < 0) return real(u, o);
    if (how === 'drop') return Promise.reject(new TypeError('Failed to fetch'));
    if (how === 'ok') return Promise.resolve(new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return Promise.resolve(new Response('{}', { status: Number(how) }));
  };
  try { await cloudRender(); } finally { window.fetch = real; }
  return {
    authed: authed,
    wallUp: !document.getElementById('signin').hidden,
    projectHidden: document.getElementById('proj').hidden,
    shelfCards: document.querySelectorAll('#projbody .item').length,
    note: document.getElementById('cloudnote').textContent,
    sessionStored: !!localStorage.getItem('chatnft.session'),
  };
}, mode);

test.describe('what a failed question does to your work', () => {
  test('the starting state really does have work on screen', async ({ page }) => {
    // The precondition. Every assertion below is about work DISAPPEARING, and
    // none of them mean anything if there was none to begin with.
    await signedInWithWork(page);
    const s = await page.evaluate(() => ({
      authed: authed,
      cards: document.querySelectorAll('#projbody .item').length,
      wallUp: !document.getElementById('signin').hidden,
    }));
    expect(s.authed).toBe(true);
    expect(s.cards, 'two traits are on the shelf').toBe(2);
    expect(s.wallUp).toBe(false);
  });

  test('a dropped connection changes nothing', async ({ page }) => {
    await signedInWithWork(page);
    const r = await renderWith(page, 'drop');
    expect(r.authed, 'still signed in').toBe(true);
    expect(r.wallUp, 'no sign-in wall').toBe(false);
    expect(r.shelfCards, 'the traits are still there').toBe(2);
    expect(r.projectHidden, 'and so is the project panel').toBe(false);
    expect(r.note, 'and it says why it cannot tell').toContain('Cannot reach the server');
  });

  test('nor does a server error', async ({ page }) => {
    // A 500 or a 502 is a gateway having a bad minute, not a statement about
    // who you are.
    await signedInWithWork(page);
    for (const status of ['500', '502', '429']) {
      const r = await renderWith(page, status);
      expect(r.authed, status + ' must not sign anyone out').toBe(true);
      expect(r.shelfCards, status + ' must not take the work away').toBe(2);
    }
  });

  test('but a real rejection still signs you out', async ({ page }) => {
    // THE CONTROL. Without it, every test above is satisfied by a change that
    // simply never signs anyone out, which would break signing out on a shared
    // device - a worse defect than the one being fixed.
    await signedInWithWork(page);
    const r = await renderWith(page, '401');
    expect(r.authed, '401 is the server saying no').toBe(false);
    expect(r.wallUp, 'so the wall goes up').toBe(true);
    expect(r.shelfCards, 'and the view is taken down').toBe(0);
    expect(r.sessionStored, 'and the session is cleared').toBe(false);
  });

  test('403 counts as a rejection too', async ({ page }) => {
    await signedInWithWork(page);
    const r = await renderWith(page, '403');
    expect(r.authed).toBe(false);
    expect(r.wallUp).toBe(true);
  });

  test('the offline message is taken down once the server answers', async ({ page }) => {
    // A stale "cannot reach the server" under a working connection is its own
    // small lie, and the one that teaches people to ignore the line.
    await signedInWithWork(page);
    const offline = await renderWith(page, 'drop');
    expect(offline.note).toContain('Cannot reach the server');
    const back = await renderWith(page, 'ok');
    expect(back.note, 'the message goes when it stops being true').not.toContain('Cannot reach the server');
    expect(back.authed, 'and a good answer still signs you in').toBe(true);
  });

  test('with no session at all, it is a real signed-out, not an unknown', async ({ page }) => {
    // Otherwise a fresh visitor would sit behind a wall that says the server is
    // unreachable, which is both wrong and unactionable.
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudRender === 'function');
    const r = await page.evaluate(async () => {
      localStorage.removeItem('chatnft.session');
      const a = await sbAuthState();
      return { state: a.state };
    });
    expect(r.state, 'no session is a definite no').toBe('out');
  });

  /* Runs a cloud button with the user check answering however we say, and
     reports what it told the person. The stub goes in BEFORE the session is
     written: a probe that let the fake token reach the real server earned a
     genuine 401, which correctly cleared the session, so "Sign in first" was
     the right answer and the measurement proved nothing. */
  const buttonSays = (page, mode) => page.evaluate(async (how) => {
    const said = [];
    const realToast = window.toast;
    const real = window.fetch;
    window.toast = (m) => { said.push(m); };
    window.fetch = (u, o) => {
      const s = String(u);
      if (s.indexOf('/auth/v1/user') < 0) return real(u, o);
      if (how === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response('{}', { status: 401 }));
    };
    try {
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const state = (await sbAuthState()).state;
      said.length = 0;
      await cloudPush();
      const push = said.slice();
      said.length = 0;
      await cloudPull({});
      return { state, push, pull: said.slice() };
    } finally { window.fetch = real; window.toast = realToast; }
  }, mode);

  test('a cloud button does not tell a signed-in person to sign in', async ({ page }) => {
    // Measured before this: with a valid session and a dropped request, both
    // Save to cloud and Load from cloud said "Sign in first" - an instruction
    // to sign out and back in, on a device holding local work, to fix the
    // network.
    await signedInWithWork(page);
    const r = await buttonSays(page, 'offline');
    expect(r.state, 'the app knows it cannot tell').toBe('unknown');
    for (const said of [r.push, r.pull]) {
      expect(said.join(' '), 'it says what is actually wrong').toContain('Cannot reach the server');
      expect(said.join(' '), 'and says nothing was changed').toContain('nothing was changed');
      expect(said.join(' '), 'and does not send anyone to sign in').not.toContain('Sign in first');
    }
  });

  test('but it still does when they really are signed out', async ({ page }) => {
    // THE CONTROL. "Never say sign in" would pass the test above and leave a
    // signed-out person with no idea what to do.
    await signedInWithWork(page);
    const r = await buttonSays(page, 'rejected');
    expect(r.state, 'a 401 is the server saying no').toBe('out');
    expect(r.push.join(' ')).toContain('Sign in first');
    expect(r.pull.join(' ')).toContain('Sign in first');
  });
});
