/* Changing the name your group sees.

   Sign-up asks for two things and stores both. An ACCOUNT NAME, which becomes
   the login and the local part of the @chatnft.invalid address - the thing you
   type to get back in. And a NAME, asked for in those words: "whatever you
   want people you share a project with to call you".

   You could set the second one once, at sign-up, and never again. A strange
   thing to be permanent about, given it is the one field on the account that
   exists purely for other people to read.

   THE FILE IS MOSTLY ABOUT THE OTHER ONE. The account name must not move. It
   is half of the address this account authenticates with, and the metadata
   beside it is only a copy - so a rename that wrote there would change what
   the group sees while leaving the login untouched, and the two would
   disagree forever with nothing to say which was right. Every test below that
   reads the request body is really asking the same question: did this touch
   the thing you sign in with.

   Measured against the live server before any of this was written: an update
   of the metadata MERGES key by key, so sending the name on its own leaves the
   account name, and everything else in there, exactly as it was. That was
   checked with a throwaway account rather than assumed, because the whole
   design rests on it.
*/
import { test, expect } from '@playwright/test';

/* Signed in, with the two auth calls stubbed and every request body kept.
   Following tests/updates.spec.js: no credentials and no server. */
const signedIn = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-me' } }));
  activeWs = null;
  window.__put = [];
  window.__toasts = [];
  /* The current metadata, which is what the prompt should be seeded from and
     what the PUT must not damage. */
  window.__meta = { username: 'bobby', name: o.name === undefined ? 'Bobby' : o.name,
    sub: 'u-me', email: 'bobby@chatnft.invalid', email_verified: true };
  const real = window.fetch;
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = (u, opt) => {
    const s = String(u);
    const method = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) {
      if (method === 'PUT') {
        window.__put.push(JSON.parse((opt && opt.body) || '{}'));
        if (o.putFails)
          return Promise.resolve(new Response(
            JSON.stringify(o.putSays ? { msg: o.putSays } : {}),
            { status: 500, headers: { 'Content-Type': 'application/json' } }));
        /* What a real server does: merge, and answer with the whole user. */
        Object.assign(window.__meta, window.__put[window.__put.length - 1].data || {});
        return Promise.resolve(json({ id: 'u-me', email: 'bobby@chatnft.invalid',
          user_metadata: window.__meta }));
      }
      return Promise.resolve(json({ id: 'u-me', email: 'bobby@chatnft.invalid',
        user_metadata: window.__meta }));
    }
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json(null));
    if (s.indexOf('/rest/v1/') >= 0) return Promise.resolve(json([]));
    return real(u, opt);
  };
  const realToast = window.toast;
  window.toast = (m) => { window.__toasts.push(String(m)); if (realToast) realToast(m); };
  /* prompt() is a browser dialog Playwright cannot type into, so it is
     replaced by the answer under test - and the message it was called with is
     kept, because seeding it with the current name is part of the point. */
  window.__asked = null;
  window.prompt = (msg, def) => { window.__asked = { msg: msg, def: def }; return o.answer; };
  await cloudRender();
}, opts);

const read = (page) => page.evaluate(() => ({
  put: window.__put, toasts: window.__toasts, asked: window.__asked,
  meta: window.__meta, who: document.getElementById('cloudwho').textContent,
}));

test.describe('changing the name your group sees', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof setDisplayName === 'function');
  });

  test('the button is there when signed in, and gone when not',
    async ({ page }) => {
      await signedIn(page, { answer: null });
      expect(await page.evaluate(() => $('setname').hidden),
        'offered beside Set a password').toBe(false);
      await page.evaluate(async () => {
        localStorage.removeItem('chatnft.session');
        await cloudRender();
      });
      expect(await page.evaluate(() => $('setname').hidden),
        'and there is nothing to rename when nobody is signed in').toBe(true);
    });

  test('it asks starting from the name you already have', async ({ page }) => {
    // An edit, not a quiz about what you last typed.
    await signedIn(page, { answer: 'Rob' });
    await page.evaluate(() => setDisplayName());
    const r = await read(page);
    expect(r.asked.def, 'seeded with the current name').toBe('Bobby');
    expect(r.asked.msg).toContain('call you');
  });

  test('AND IT DOES NOT TOUCH THE NAME YOU SIGN IN WITH', async ({ page }) => {
    /* THE ONE THAT MATTERS. The account name is half of the address this
       account authenticates with; the copy in the metadata is only a copy.
       Writing there would change what the group sees and leave the login
       alone, and nothing afterwards could say which of the two was right. */
    await signedIn(page, { answer: 'Rob' });
    await page.evaluate(() => setDisplayName());
    const r = await read(page);
    expect(r.put.length, 'one request').toBe(1);
    expect(r.put[0], 'carrying the one field and no other').toEqual({ data: { name: 'Rob' } });
    expect(JSON.stringify(r.put[0]), 'and no mention of the account name')
      .not.toContain('username');
    expect(r.meta.username, 'which therefore survives the change').toBe('bobby');
    expect(r.meta.name, 'while the name is the new one').toBe('Rob');
  });

  test('the account panel shows the new name straight away', async ({ page }) => {
    /* Otherwise the only way to find out whether it worked is to reload, and
       a person who is not sure it worked will press it again. */
    await signedIn(page, { answer: 'Rob' });
    await page.evaluate(() => setDisplayName());
    await page.waitForTimeout(300);
    const r = await read(page);
    expect(r.who).toContain('Rob');
    expect(r.toasts.join(' ')).toContain('Rob');
  });

  test('an empty name is refused, and nothing is sent', async ({ page }) => {
    /* Saving it would put you back to "someone" on every teammate's screen
       with nothing on your own to explain why. Whitespace only, because the
       trim is what makes those the same answer. */
    await signedIn(page, { answer: '   ' });
    await page.evaluate(() => setDisplayName());
    const r = await read(page);
    expect(r.put.length, 'the server was never asked').toBe(0);
    expect(r.toasts.join(' ')).toContain('cannot be empty');
    expect(r.meta.name, 'and you are still who you were').toBe('Bobby');
  });

  test('and so is one too long to be a name', async ({ page }) => {
    await signedIn(page, { answer: 'x'.repeat(41) });
    await page.evaluate(() => setDisplayName());
    const r = await read(page);
    expect(r.put.length).toBe(0);
    expect(r.toasts.join(' ')).toContain('40');
    /* The limit is the same number sign-up holds people to. One place. */
    const cap = await page.evaluate(() => MAX_NAME);
    expect(cap).toBe(40);
  });

  test('exactly at the limit is allowed, which is what makes it a limit',
    async ({ page }) => {
      // The control for the test above: 41 refused and 40 refused would be a
      // rule nobody could satisfy, and both would look like it working.
      await signedIn(page, { answer: 'y'.repeat(40) });
      await page.evaluate(() => setDisplayName());
      const r = await read(page);
      expect(r.put.length, 'sent').toBe(1);
      expect(r.put[0].data.name.length).toBe(40);
    });

  test('backing out of the box changes nothing', async ({ page }) => {
    // Cancel is null and an empty box is "", and they are different answers.
    await signedIn(page, { answer: null });
    await page.evaluate(() => setDisplayName());
    const r = await read(page);
    expect(r.put.length).toBe(0);
    expect(r.toasts, 'and it does not tell you off for changing your mind').toEqual([]);
  });

  test('re-typing the name you already have is not a change', async ({ page }) => {
    await signedIn(page, { answer: 'Bobby' });
    await page.evaluate(() => setDisplayName());
    const r = await read(page);
    expect(r.put.length, 'nothing to send').toBe(0);
    expect(r.toasts.join(' ')).toContain('already');
  });

  test('a server that refuses says so, and does not claim it worked',
    async ({ page }) => {
      /* The shape of lie worth avoiding: a toast saying the group will see
         you as Rob, over a server that never accepted it. */
      await signedIn(page, { answer: 'Rob', putFails: true });
      await page.evaluate(() => setDisplayName());
      await page.waitForTimeout(200);
      const r = await read(page);
      expect(r.put.length, 'it did try').toBe(1);
      expect(r.toasts.join(' ')).toContain('Could not change your name');
      expect(r.toasts.join(' '), 'and never says the group will see the new one')
        .not.toContain('will see you as');
      expect(r.meta.name, 'and you are still who you were').toBe('Bobby');
    });

  test('and a server that says WHY says that instead', async ({ page }) => {
    /* The sentence above is a fallback, not a replacement. Every other auth
       failure in this file passes the server's own words through on purpose -
       a server that knows something specific is more use than a tidy sentence
       that knows nothing - and this must not be the one that flattens it. */
    await signedIn(page, { answer: 'Rob', putFails: true,
      putSays: 'That name is already spoken for' });
    await page.evaluate(() => setDisplayName());
    await page.waitForTimeout(200);
    const r = await read(page);
    expect(r.toasts.join(' ')).toContain('That name is already spoken for');
    expect(r.toasts.join(' '), 'and not buried under the generic one')
      .not.toContain('Could not change your name');
  });

  test('somebody who never chose a name starts from an empty box',
    async ({ page }) => {
      /* An account made by invite link has an account name and no chosen one.
         Seeding the box with the account name would quietly turn the handle
         into the display name for anyone who just pressed OK. */
      await signedIn(page, { answer: 'Rob', name: '' });
      await page.evaluate(() => setDisplayName());
      const r = await read(page);
      expect(r.asked.def).toBe('');
      expect(r.put[0]).toEqual({ data: { name: 'Rob' } });
    });

  test('and the group is asked again who everybody is', async ({ page }) => {
    /* The names behind What changed are fetched once and kept for the life of
       the page. After a rename that cache is wrong about you, and nothing
       else would ever correct it. */
    await page.evaluate(() => {
      memberNames = new Map([['u-me', 'Bobby']]);
      memberNamesFor = 'team1';
    });
    await signedIn(page, { answer: 'Rob' });
    await page.evaluate(() => setDisplayName());
    await page.waitForTimeout(200);
    const still = await page.evaluate(() => ({
      names: memberNames, forTeam: memberNamesFor }));
    expect(still.names, 'thrown away').toBe(null);
    expect(still.forTeam).toBe(null);
  });
});
