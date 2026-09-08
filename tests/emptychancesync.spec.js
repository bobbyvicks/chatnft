/* The empty chance reaches the group.

   The half the local fix deliberately left. cloudPush sends traits and refs
   only, and collections had no column for this, so two people on one project
   read different percentages for the same trait - on a shared mint, two people
   planning against two different collections.

   collections.empty_chance exists now, and the value rides with the rules:
   shareRules already PATCHes that row, already knows whether there is a group,
   and already carries a signature so an unchanged project sends nothing. A
   second sender would be a second copy of all three of those decisions.

   THE TEST THAT MATTERS MOST is "changing only it is still sent". shareRules
   skips the request when its signature matches the last one - so leaving the
   empty chance out of that signature would have made the one case where it is
   the only thing you changed send nothing, silently, which is exactly the
   case somebody adjusting it would be in.

   Stubbed fetch throughout, following tests/cloudpull.spec.js: no credentials
   and no server, so this tests the client and nothing else.
*/
import { test, expect } from '@playwright/test';

/* Runs `body` with the network stubbed, and returns every PATCH sent to the
   collection row. One stub for all of these, because three near-copies of a
   fetch shim is three chances for one of them to answer differently. */
const withServer = (page, body) => page.evaluate(async (src) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  activeWs = 'team1';
  const sent = [];
  const real = window.fetch;
  const json = (o) => new Response(JSON.stringify(o),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = (u, o) => {
    const s = String(u);
    if (s.indexOf('/rest/v1/collections?id=eq.') >= 0) {
      sent.push(JSON.parse((o && o.body) || '{}'));
      return Promise.resolve(json([]));
    }
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['eyes', 'unsorted'] }]));
    return real(u, o);
  };
  try {
    // eslint-disable-next-line no-new-func
    await new Function('return (async () => {' + src + '})()')();
    await new Promise(r => setTimeout(r, 250));
  } finally { window.fetch = real; }
  return sent;
}, body);

test.describe('the empty chance reaches the group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof applyEmptyChance === 'function');
  });

  test('it goes up with the rules when it changes', async ({ page }) => {
    const sent = await withServer(page, `
      sharedRuleSig = null;
      emptyChance = 0.12;
      await shareRules();
    `);
    expect(sent.length, 'one request').toBe(1);
    expect(sent[0].empty_chance, 'carrying the choice').toBeCloseTo(0.12, 6);
    expect(sent[0], 'alongside the rules it rides with').toHaveProperty('rules');
    expect(sent[0], 'and the answers').toHaveProperty('decisions');
  });

  test('and changing only it is still sent, because it is in the signature',
    async ({ page }) => {
      /* THE ONE THAT WOULD HAVE BEEN MISSED. shareRules returns early when its
         signature matches what it last sent. With the empty chance out of that
         signature, moving it ALONE matches, sends nothing, and the group never
         learns - silently, and in precisely the case somebody adjusting this
         number is in. */
      const sent = await withServer(page, `
        sharedRuleSig = null;
        emptyChance = 0.2;
        await shareRules();
        emptyChance = 0.4;
        await shareRules();
      `);
      expect(sent.length, 'the second change is sent too').toBe(2);
      expect(sent[1].empty_chance).toBeCloseTo(0.4, 6);
    });

  test('and an unchanged project still sends nothing', async ({ page }) => {
    // The control: the signature has to keep doing its job.
    const sent = await withServer(page, `
      sharedRuleSig = null;
      emptyChance = 0.2;
      await shareRules();
      await shareRules();
      await shareRules();
    `);
    expect(sent.length, 'three calls, one request').toBe(1);
  });

  /* THROUGH takeEmptyChance, WHICH IS THE FUNCTION THAT RUNS.

     The first draft of these three copied the four-line decision into the test
     and asserted against the copy - which proves the copy works and says
     nothing about the app. tests/helpers.js opens by warning against exactly
     that, so the rule was given a name and these call it. */
  const decide = (page, mine, theirs) => page.evaluate(async (o) => {
    emptyChance = o.mine;
    const box = $('cempty'); if (box) box.value = String(Math.round(o.mine * 100));
    const did = await takeEmptyChance({ empty_chance: o.theirs });
    return { did: did, now: emptyChance, field: $('cempty').value };
  }, { mine, theirs });

  test('a value the group has is taken', async ({ page }) => {
    const r = await decide(page, 0.35, 0.15);
    expect(r.did).toBe('took');
    expect(r.now, 'the group decides').toBeCloseTo(0.15, 6);
    expect(r.field, 'and the control shows it').toBe('15');
  });

  test('but a column nobody has written is not an answer', async ({ page }) => {
    /* The same shape as "an EMPTY server side is not an answer" for the rules.
       A project that predates the column reads the default, and adopting that
       would quietly undo a choice made here - so it is sent instead. */
    const r = await decide(page, 0.05, 0.35);
    expect(r.now, 'the local choice survives a default from the server').toBe(0.05);
    expect(r.did, 'and is sent up rather than lost').toBe('sent');
  });

  test('and two defaults are simply nothing to do', async ({ page }) => {
    // A CONTROL: "always send" would pass the test above and PATCH the
    // collection on every switch for every person who has changed nothing.
    const r = await decide(page, 0.35, 0.35);
    expect(r.did).toBe('nothing');
    expect(r.now).toBe(0.35);
  });

  test('and a value outside what the control can produce is refused',
    async ({ page }) => {
      /* A column check exists too. A client that trusts a column check is
         trusting a schema it did not read today. */
      /* null is in this list because it was the one that got through: Number(null)
         is 0, and 0 is a LEGAL empty chance, so the range check waved it past and
         it read as somebody deliberately choosing every layer on every
         character. The fix refuses anything that is not already a number. */
      for (const bad of [1, -0.5, 'lots', null, undefined]) {
        const r = await decide(page, 0.35, bad);
        expect(r.now, String(bad) + ' did not get through').toBe(0.35);
        expect(r.did, 'and nothing was taken').not.toBe('took');
      }
    });
});
