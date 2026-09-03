import { test, expect } from '@playwright/test';

/* The sign-in gate.

   These tests stop at the network boundary: the auth endpoint is intercepted
   and answered here, so what runs is the page's OWN code - gateCreds,
   gateSignIn, gateKeep, gateShow, cloudRender - against a server that answers
   the way the real one would. No account is used and no real password is
   typed anywhere; every literal below is an obvious fake.

   What that does NOT prove is that the live Supabase project agrees with any
   of it. A mock answers the way I told it to. The live check at the bottom is
   the only thing that would catch a disagreement, and it runs only when you
   hand it credentials through the environment.

   Worth stating plainly, because it is why these tests are worth having:
   the gate is presentational. gateShow only sets .hidden on #signin and
   visibility on #land, and the editor underneath keeps working - measured,
   with the scrim up, by opening a trait and drawing a pixel that read back.
   Nothing here should be read as evidence that the gate protects data. What
   protects data is row level security in the database, which is a separate
   question these tests do not answer. */

const AUTH = '**/auth/v1/token**';
const USER = '**/auth/v1/user**';

/* Shaped the way gateKeep expects. expires_in rather than expires_at, because
   that is the branch the real endpoint exercises. */
const session = (email = 'test@chatnft.invalid', username = 'test') => ({
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  user: { id: 'mock-user-id', email, user_metadata: { username, name: 'Test Person' } },
});

/** Answer every Supabase call. `onToken` sees each sign-in attempt's body.

    ORDER MATTERS, and getting it wrong does not look like a failure. Playwright
    tries the most recently added route first, so the catch-all has to be
    registered BEFORE the specific ones or it answers the sign-in itself. It
    did, on the first run of this file: the token handler never ran, and the
    enumeration test still went green - the catch-all returned [], gateKeep
    rejected it, and the screen showed the same sentence the test was looking
    for. A passing test measuring nothing. */
async function mockSupabase(page, { ok = true, tokenBody = null, onToken = () => {} } = {}) {
  /* Everything the page asks for once it believes you are in - workspaces,
     traits, status. An empty list is a valid PostgREST answer and keeps
     cloudRender from throwing on its way to opening the gate. */
  await page.route('**/dpracoavrcqyenfieksi.supabase.co/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.route(USER, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(session().user),
  }));
  await page.route(AUTH, async route => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch (_) { /* shape asserted by the caller */ }
    onToken(body);
    if (!ok) {
      await route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify(tokenBody || { error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(session(body.email, body.username)),
    });
  });
}

const gated = page => page.evaluate(() => ({
  scrim: !document.getElementById('signin').hidden,
  landHidden: getComputedStyle(document.getElementById('land')).visibility === 'hidden',
}));

const signIn = async (page, user, pass) => {
  await page.fill('#gateuser', user);
  await page.fill('#gatepass', pass);
  await page.click('#gatein');
};

/* Wait for the wall rather than sleeping: the boot check is async and raises
   it only once it has resolved to "not signed in". */
const openPage = async page => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof gateSignIn === 'function');
  await page.waitForFunction(() => !document.getElementById('signin').hidden, null, { timeout: 8000 });
};

test.describe('the sign-in gate', () => {
  test('a username is sent as the synthetic address, not as itself', async ({ page }) => {
    /* asLogin appends @chatnft.invalid, and every account made through the
       sign-up pane exists under that address. If the mapping ever drifts,
       every username account becomes unreachable at once, and what the person
       is told is "that email and password do not match an account" - which
       points at the password. Pinned for that reason. */
    const seen = [];
    await mockSupabase(page, { onToken: b => seen.push(b) });
    await openPage(page);
    await signIn(page, 'test', 'not-a-real-password');
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].email).toBe('test@chatnft.invalid');
    expect(seen[0].password, 'the password goes through untouched').toBe('not-a-real-password');
  });

  test('but an address with an @ is taken at face value - the control', async ({ page }) => {
    /* Without this, the test above passes just as well if asLogin appended the
       domain unconditionally, which would break every account made before
       usernames existed. */
    const seen = [];
    await mockSupabase(page, { onToken: b => seen.push(b) });
    await openPage(page);
    await signIn(page, 'Someone@Example.com', 'not-a-real-password');
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].email, 'lowercased, and no domain appended').toBe('someone@example.com');
  });

  test('signing in opens the gate and keeps the session', async ({ page }) => {
    await mockSupabase(page);
    await openPage(page);
    expect(await gated(page), 'the wall is up to begin with').toEqual({ scrim: true, landHidden: true });

    await signIn(page, 'test', 'not-a-real-password');
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 8000 }).toBe(false);
    expect(await gated(page), 'and the landing page comes back').toEqual({ scrim: false, landHidden: false });

    const kept = await page.evaluate(() => {
      const raw = localStorage.getItem('chatnft.session');
      const s = raw ? JSON.parse(raw) : null;
      return s && {
        hasAccess: !!s.access_token,
        hasRefresh: !!s.refresh_token,
        expiresIsNumber: typeof s.expires_at === 'number',
      };
    });
    expect(kept, 'the session is stored with an expiry it can refresh against')
      .toEqual({ hasAccess: true, hasRefresh: true, expiresIsNumber: true });
    expect(await page.inputValue('#gatepass'), 'and the password box is emptied').toBe('');
  });

  test('a rejected sign-in says the same thing whichever half was wrong', async ({ page, context }) => {
    /* Account enumeration. The code says this wording is deliberate, so it is
       worth pinning: if the two answers ever diverge, anyone can find out
       which usernames exist by typing them in. Two DIFFERENT server
       rejections have to reach the screen as one sentence. */
    const say = async body => {
      const p = await context.newPage();
      await mockSupabase(p, { ok: false, tokenBody: body });
      await openPage(p);
      await signIn(p, 'test', 'not-a-real-password');
      await expect.poll(async () => (await p.textContent('#gatenote')).trim())
        .not.toBe('Signing in...');
      const t = (await p.textContent('#gatenote')).trim();
      await p.close();
      return t;
    };
    const wrongPass = await say({ error: 'invalid_grant', error_description: 'Invalid login credentials' });
    const noSuchUser = await say({ error: 'invalid_grant', error_description: 'User not found' });
    expect(wrongPass, 'and it names neither half').toBe('That email and password do not match an account.');
    expect(noSuchUser, 'an unknown account is indistinguishable from a wrong password').toBe(wrongPass);
  });

  test('an unconfirmed account still gets its own message - the control', async ({ page }) => {
    /* The test above would pass if gatenote were hardcoded to one string. This
       is the case that must still come through differently. */
    await mockSupabase(page, {
      ok: false, tokenBody: { error: 'invalid_grant', error_description: 'Email not confirmed' },
    });
    await openPage(page);
    await signIn(page, 'test', 'not-a-real-password');
    await expect.poll(async () => (await page.textContent('#gatenote')).trim())
      .toBe('Check your email and confirm the account first.');
  });

  test('bad input never reaches the network', async ({ page }) => {
    const seen = [];
    await mockSupabase(page, { onToken: b => seen.push(b) });
    await openPage(page);

    await signIn(page, 'ab', 'longenough');                  // username under 3
    await expect.poll(() => page.textContent('#gatenote')).toContain('3 to 20 characters');
    await signIn(page, 'Not A Username!', 'longenough');     // illegal characters
    await expect.poll(() => page.textContent('#gatenote')).toContain('3 to 20 characters');
    await signIn(page, 'test', 'short');                     // password under 6
    await expect.poll(() => page.textContent('#gatenote')).toContain('at least 6 characters');
    expect(seen, 'none of those were worth a round trip').toEqual([]);

    /* Positive control: the same form DOES reach the network when the input is
       legal, or the assertion above is only saying the button is broken. */
    await signIn(page, 'test', 'longenough');
    await expect.poll(() => seen.length).toBe(1);
  });

  test('signing out puts the wall back and drops the session', async ({ page }) => {
    await mockSupabase(page);
    await openPage(page);
    await signIn(page, 'test', 'not-a-real-password');
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 8000 }).toBe(false);

    await page.evaluate(() => cloudSignOut());
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 8000 }).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('chatnft.session')),
      'nothing is left to sign back in with').toBe(null);
  });
});

test.describe('the gate is a lock, not a picture', () => {
  /* Before this, gateShow set .hidden on the scrim and visibility on the
     landing page and nothing else - so one devtools line got the whole
     editor. These tests are the difference between the two. */

  test('the wall is up in the markup, before a single request', async ({ page }) => {
    /* Read the FILE, not the running page. The scrim used to carry `hidden`
       and the landing page carried nothing, so at first paint the app was up
       and the gate came down 56-72ms later when an async round trip resolved.
       That window is not something you can test by looking at the page after
       it settles - it is a property of the bytes on disk. */
    const html = await (await page.request.get('/index.html')).text();
    expect(html, 'the scrim must not start hidden').not.toContain('id="signin" hidden');
    expect(html).toContain('<div class="scrim" id="signin">');
    expect(html, 'and the landing page must start hidden')
      .toContain('<main class="land" id="land" style="visibility:hidden">');
  });

  test('and it stays up when the server never answers', async ({ page }) => {
    /* The failure mode that matters. If the auth check hangs - offline, DNS,
       Supabase down - the old page sat there fully open forever. */
    await page.route('**/dpracoavrcqyenfieksi.supabase.co/**', r => r.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof gateSignIn === 'function');
    await page.waitForTimeout(2500);
    expect(await gated(page), 'a dead server leaves the wall up, not down')
      .toEqual({ scrim: true, landHidden: true });
  });

  test('hiding the scrim by hand does not get you a working app', async ({ page }) => {
    /* THE test. gateShow(false) is exactly what devtools gives you, and it
       must now buy nothing: the editor refuses, and a dropped file is not
       read. `authed` is deliberately not set by gateShow. */
    await page.route('**/dpracoavrcqyenfieksi.supabase.co/**', r => r.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
    await page.waitForTimeout(1200);

    const r = await page.evaluate(() => {
      gateShow(false);                       // the whole of the old bypass
      const scrimDown = document.getElementById('signin').hidden;
      const n = 64, d = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < n * n; i++) { d[i * 4] = 200; d[i * 4 + 1] = 120; d[i * 4 + 3] = 255; }
      fileName = 'x.png';
      startEditor(d, n, n, n, n, palette(d, n * n, 24, 64), false);
      return {
        scrimDown,
        mayUse: mayUse(),
        appOpen: !document.getElementById('app').hidden,
        localBooted,
      };
    });
    expect(r.scrimDown, 'the scrim did come down - so this is the real bypass').toBe(true);
    expect(r.mayUse, 'but it grants nothing').toBe(false);
    expect(r.appOpen, 'and the editor stays shut').toBe(false);
    expect(r.localBooted, 'and nothing of this device was read').toBe(false);
  });

  test('a real session does open it - the control', async ({ page }) => {
    /* Without this, the test above passes just as well if startEditor were
       broken outright, which would be far worse than the hole it closes. */
    await mockSupabase(page);
    await openPage(page);
    await signIn(page, 'test', 'not-a-real-password');
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 8000 }).toBe(false);

    const r = await page.evaluate(() => {
      const n = 64, d = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < n * n; i++) { d[i * 4] = 200; d[i * 4 + 1] = 120; d[i * 4 + 3] = 255; }
      fileName = 'x.png';
      startEditor(d, n, n, n, n, palette(d, n * n, 24, 64), false);
      return { mayUse: mayUse(), appOpen: !document.getElementById('app').hidden, localBooted };
    });
    expect(r.mayUse, 'a verified session grants use').toBe(true);
    expect(r.appOpen, 'and the editor opens').toBe(true);
    expect(r.localBooted, 'and the local view is built - once, here, not at load').toBe(true);
  });

  test('signing out takes the collection off the page, not just out of sight', async ({ page }) => {
    /* visibility:hidden left every trait name and thumbnail in the document.
       On a shared device that is the previous person's collection, readable
       without touching the gate. */
    await mockSupabase(page);
    await openPage(page);
    await signIn(page, 'test', 'not-a-real-password');
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 8000 }).toBe(false);

    await page.evaluate(() => {
      document.getElementById('projbody').innerHTML = '<div class="tile">someone-elses-trait</div>';
    });
    expect(await page.textContent('#projbody')).toContain('someone-elses-trait');

    await page.evaluate(() => cloudSignOut());
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 8000 }).toBe(true);
    expect(await page.evaluate(() => document.getElementById('projbody').innerHTML),
      'the shelf is emptied, not hidden').toBe('');
    expect(await page.evaluate(() => mayUse()), 'and use is revoked').toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   The live check. Skipped unless credentials are in the environment:

     CHATNFT_USER=<username> CHATNFT_PASS=<password> npx playwright test tests/auth.spec.js

   Nothing is written to a file and nothing is committed.

   An earlier version of this comment said the reason was that the repository
   is public. It is not - it is private, and I asserted that without checking.
   The reason stands anyway, and does not depend on today's visibility: a
   credential in a committed file outlives the account, reaches every clone and
   every CI log that ever checks the repository out, and survives the day
   somebody makes the repository public. An environment variable keeps it out
   of all of those.

   This is the only test that can catch the mock and the live project having
   drifted apart - a changed endpoint, a changed error shape, an account that
   no longer exists. Worth running before a release and not otherwise. */
const LIVE_USER = process.env.CHATNFT_USER;
const LIVE_PASS = process.env.CHATNFT_PASS;

test.describe('against the live project', () => {
  test.skip(!LIVE_USER || !LIVE_PASS, 'set CHATNFT_USER and CHATNFT_PASS to run this');

  test('the real account signs in and the gate opens', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof gateSignIn === 'function');
    await page.waitForFunction(() => !document.getElementById('signin').hidden, null, { timeout: 10000 });
    await signIn(page, LIVE_USER, LIVE_PASS);
    await expect.poll(async () => (await gated(page)).scrim, { timeout: 25000 }).toBe(false);
    expect(await page.textContent('#cloudwho'), 'and the account is named on screen')
      .not.toContain('not signed in');
  });
});
