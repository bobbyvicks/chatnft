/* What the group changed, in project settings.

   There was no way to see it. The mailbox says a teammate's edit ARRIVED,
   once, and clears when it is read; nothing answered "what has been going on".

   THE DATA WAS ALREADY THERE. traits.owner is written on every push - all 289
   rows on the real server have one - and updated_at is maintained by a
   database trigger rather than by whichever browser wrote last, so it is worth
   ordering on.

   THE NAME WAS NOT. Usernames live in auth.users, which no client may read, so
   a uuid was all anybody could see. A team_member_names RPC resolves them:
   security definer, gated on the existing is_team_member so it answers only
   for a team you are in, granted to authenticated and revoked from anon and
   public. It returns the name a person CHOSE, falling back to their account
   name when they never picked one, and NOTHING else - not the email, and not
   the part before the @, which was the obvious fallback and would have handed
   every teammate the local part of a real address.

   IT RETURNED THE WRONG ONE OF THE TWO at first. Sign-up asks for an account
   name and for a name, in those words - "whatever you want people you share a
   project with to call you" - and this listed all three members of the real
   group by the handle they type to sign in, never showing the field written
   for exactly this purpose.

   THE TEST THAT MATTERS MOST is the doubling one. Three rows on the server
   rendered as six on screen, under a heading correctly reading "the last 3" -
   the count and the list disagreeing is what gave it away. showPage writes
   location.hash, writing the hash fires hashchange, and hashchange calls
   showPage again: two runs, both emptying the list, both appending to what the
   other had cleared. Harmless while the router only toggled classes; not
   harmless once it also started a request.
*/
import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers.js';

const HOUR = 3600e3;

/* A project in a group, with the two calls the panel makes stubbed and every
   request counted. Following tests/cloudpull.spec.js: no credentials and no
   server, so this tests the client and nothing else. */
const inGroup = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_a_eyes_approved', kind: 'trait', name: 'a', layer: 'eyes',
    status: 'approved', blob, w: 8, h: 8, at: 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 200));
  /* A SESSION, or renderUpdates never reaches the network at all: sbUser
     returns null without a token, cloudCollection then returns null, and the
     panel correctly reports that it could not reach the group - which is a
     true message about a state this test did not mean to create. Not a real
     token and no server; every request is intercepted below. */
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-me' } }));
  activeWs = o.group ? 'team1' : null;
  window.__calls = { traits: 0, names: 0 };
  const real = window.fetch;
  window.__realFetch = real;
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = (u, opt) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u-me' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rpc/team_member_names') >= 0) {
      window.__calls.names++;
      return o.namesFail ? Promise.resolve(new Response('nope', { status: 500 }))
        : Promise.resolve(json(o.names || []));
    }
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['eyes'] }]));
    if (s.indexOf('/rest/v1/traits?select=name') >= 0) {
      window.__calls.traits++;
      return o.rowsFail ? Promise.resolve(new Response('nope', { status: 500 }))
        : Promise.resolve(json(o.rows || []));
    }
    return real(u, opt);
  };
}, opts);

const readPanel = (page) => page.evaluate(() => ({
  hidden: document.getElementById('updates').hidden,
  count: document.getElementById('updcount').textContent,
  note: (document.querySelector('#updbody .note') || {}).textContent || '',
  rows: [...document.querySelectorAll('#updbody .urow')].map(r => ({
    who: r.querySelector('.uwho').textContent,
    what: r.querySelector('.uwhat').textContent,
    when: r.querySelector('.uwhen').textContent,
    mine: r.classList.contains('mine'),
  })),
  calls: window.__calls,
}));

const ROWS = [
  { name: 'Blue Gorilla', layer: 'extras', status: 'approved', owner: 'u-wilson',
    updated_at: new Date(Date.now() - 2 * HOUR).toISOString() },
  { name: 'Basic Blue Eyes', layer: 'eyes', status: 'wip', owner: 'u-me',
    updated_at: new Date(Date.now() - 30 * 60e3).toISOString() },
  { name: 'Punk Eyes', layer: 'eyes', status: 'approved', owner: 'u-nobody',
    updated_at: new Date(Date.now() - 3 * 86400e3).toISOString() },
];
/* BOTH COLUMNS, DELIBERATELY DIFFERENT. The RPC returns the name a person
   chose; it used to return the account name they type to sign in. Handing the
   client both, disagreeing, is what makes this able to fail - a fixture
   carrying only the right one would pass just as happily against code that
   read the wrong one. */
const NAMES = [{ user_id: 'u-wilson', display_name: 'Wilson', username: 'wilson-handle' },
  { user_id: 'u-me', display_name: 'Bobby', username: 'bobby-handle' }];

test.describe('what the group changed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderUpdates === 'function');
  });

  test('names the person, the trait and how long ago', async ({ page }) => {
    await inGroup(page, { group: true, rows: ROWS, names: NAMES });
    await gotoPage(page, 'settings');
    await page.waitForTimeout(700);
    const r = await readPanel(page);
    expect(r.rows).toEqual([
      { who: 'Wilson', what: 'Blue Gorilla in extras', when: '2 hours ago', mine: false },
      { who: 'you', what: 'Basic Blue Eyes in eyes (wip)', when: '30 minutes ago', mine: true },
      { who: 'someone', what: 'Punk Eyes in eyes', when: '3 days ago', mine: false },
    ]);
    expect(r.count).toBe('the last 3, most recent first');
  });

  test('and shows each change once, not twice', async ({ page }) => {
    /* THE DEFECT. Three rows rendered as six, under a heading correctly saying
       three. showPage writes the hash, the hash fires hashchange, hashchange
       calls showPage again - and both runs emptied the list and appended to
       what the other had cleared. The count and the list disagreeing is the
       only reason it was noticed. */
    await inGroup(page, { group: true, rows: ROWS, names: NAMES });
    await gotoPage(page, 'settings');
    await page.waitForTimeout(700);
    const r = await readPanel(page);
    expect(r.rows.length, 'three on the server, three on screen').toBe(3);
    expect(r.calls.traits, 'and asked for once').toBe(1);
    expect(r.count, 'the heading agrees with the list').toContain('the last 3');
  });

  test('and pressing Check again twice does not double it either',
    async ({ page }) => {
      /* The router is not the only caller. A second run while the first is in
         flight would empty the list the first is filling, however it started. */
      await inGroup(page, { group: true, rows: ROWS, names: NAMES });
      await gotoPage(page, 'settings');
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        $('updrefresh').click();
        $('updrefresh').click();
      });
      await page.waitForTimeout(700);
      const r = await readPanel(page);
      expect(r.rows.length, 'still three').toBe(3);
      expect(r.calls.traits, 'and the overlapping press was refused').toBe(2);
    });

  test('and Check again asks who everybody is, so a rename shows up',
    async ({ page }) => {
      /* The names are fetched once and kept for the life of the page, which is
         right while they are read once per row - but it meant somebody who
         changed their name kept the old one on every teammate's screen until
         they happened to reload. This button is the press that means go and
         ask, and it was only asking for the rows. */
      await inGroup(page, { group: true, rows: ROWS, names: NAMES });
      await gotoPage(page, 'settings');
      await page.waitForTimeout(700);
      expect((await readPanel(page)).rows[0].who).toBe('Wilson');
      await page.evaluate(() => {
        const real = window.fetch;
        window.fetch = (u, o) => {
          if (String(u).indexOf('/rpc/team_member_names') >= 0)
            return Promise.resolve(new Response(JSON.stringify(
              [{ user_id: 'u-wilson', display_name: 'Wils' }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
          return real(u, o);
        };
      });
      await page.evaluate(() => $('updrefresh').click());
      await page.waitForTimeout(700);
      expect((await readPanel(page)).rows[0].who,
        'it went and asked rather than reusing what it had').toBe('Wils');
    });

  test('somebody with no name at all is "someone", never an email',
    async ({ page }) => {
      /* The RPC returns a chosen name or an account name, and nothing else.
         The obvious fallback - the part of the address before the @ - would
         hand every teammate the local part of a real email, so somebody with
         neither is shown as a gap. */
      await inGroup(page, { group: true, rows: ROWS, names: [] });
      await gotoPage(page, 'settings');
      await page.waitForTimeout(700);
      const r = await readPanel(page);
      expect(r.rows.map(x => x.who), 'only you are named, from your own session')
        .toEqual(['someone', 'you', 'someone']);
      const text = await page.evaluate(() => $('updbody').textContent);
      expect(text, 'and nothing that looks like an address').not.toContain('@');
    });

  test('a failed name lookup is not remembered', async ({ page }) => {
    /* Caching a failure would make every row read "someone" for the rest of
       the session, and pressing Check again would not fix it. */
    await inGroup(page, { group: true, rows: ROWS, names: NAMES, namesFail: true });
    await gotoPage(page, 'settings');
    await page.waitForTimeout(700);
    expect((await readPanel(page)).rows[0].who, 'nothing to go on yet').toBe('someone');
    await page.evaluate(() => { window.__names_ok = true; });
    /* The lookup starts working; the panel must ask again rather than reuse a
       remembered nothing. */
    await page.evaluate((names) => {
      const real = window.fetch;
      window.fetch = (u, o) => {
        if (String(u).indexOf('/rpc/team_member_names') >= 0)
          return Promise.resolve(new Response(JSON.stringify(names),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return real(u, o);
      };
    }, NAMES);
    await page.evaluate(() => $('updrefresh').click());
    await page.waitForTimeout(700);
    expect((await readPanel(page)).rows[0].who, 'and now it knows').toBe('Wilson');
  });

  test('on your own page it says there is nobody to hear from',
    async ({ page }) => {
      // Not an empty panel and not a missing one: a stated reason.
      await inGroup(page, { group: false, rows: ROWS, names: NAMES });
      await gotoPage(page, 'settings');
      await page.waitForTimeout(500);
      const r = await readPanel(page);
      expect(r.hidden, 'the panel is still there').toBe(false);
      expect(r.rows.length).toBe(0);
      expect(r.note).toContain('your own page');
      expect(r.calls.traits, 'and nothing was asked of the server').toBe(0);
    });

  test('and a server it cannot reach is said plainly, not shown as empty',
    async ({ page }) => {
      /* "Nothing has changed" and "I could not ask" are different facts, and
         showing the second as the first is the shape of lie this file exists
         to avoid. */
      await inGroup(page, { group: true, rowsFail: true, names: NAMES });
      await gotoPage(page, 'settings');
      await page.waitForTimeout(700);
      const r = await readPanel(page);
      expect(r.rows.length).toBe(0);
      expect(r.note).toContain('Could not reach the group');
      expect(r.count, 'and it does not claim a count it does not have').toBe('');
    });

  test('an empty collection says so, and is not the same message',
    async ({ page }) => {
      // The control for the one above.
      await inGroup(page, { group: true, rows: [], names: NAMES });
      await gotoPage(page, 'settings');
      await page.waitForTimeout(700);
      const r = await readPanel(page);
      expect(r.count).toBe('nothing has been changed yet');
      expect(r.note, 'not the unreachable message').not.toContain('Could not reach');
    });

  test('how long ago is said in words, and coarsely', async ({ page }) => {
    /* Deliberately coarse: "3 minutes ago" and "4 minutes ago" are the same
       fact, and a list that reflows on every redraw reads as activity rather
       than as a record. */
    const r = await page.evaluate(() => {
      const at = (ms) => agoWords(new Date(Date.now() - ms).toISOString());
      return { now: at(5e3), mins: at(20 * 60e3), hour: at(3600e3),
        hours: at(5 * 3600e3), yest: at(30 * 3600e3), days: at(4 * 86400e3),
        rubbish: agoWords('not a date') };
    });
    expect(r.now).toBe('just now');
    expect(r.mins).toBe('20 minutes ago');
    expect(r.hour).toBe('an hour ago');
    expect(r.hours).toBe('5 hours ago');
    expect(r.yest).toBe('yesterday');
    expect(r.days).toBe('4 days ago');
    expect(r.rubbish, 'and a date it cannot read says nothing at all').toBe('');
  });
});
