/* What the rules actually do, and who has them - both of which the app knew
   and never said.

   THIS FILE PINS WHAT THE PANEL SAYS, and the panel has had to say two
   different true things.

   It was written when rules never left the browser. cloudPush uploads
   `.filter(i => i.kind==="trait"||i.kind==="ref")`, settings are not in that
   filter, and the only setting reaching the server was the layer list - so one
   person could curate a hundred combination rules and every teammate would
   generate without them, hats stacked on hair in a collection built to stop
   exactly that. The app already knew how to say this for the layer ORDER
   (LAYERS_NOT_SHARED, at five call sites) and said nothing about the rules.

   Then a rules column was added to collections and saveRules began PATCHing
   it, which made the sentence "Save to cloud does not send them" FALSE - and
   the test pinning that sentence failed, which is how it got replaced instead
   of left standing beside the fix. A note describing an old behaviour
   confidently is worse than no note.

   What it says now is read from sharedRuleSig, which is set only when a PATCH
   actually arrived - so "shared" is an observation, not an intention, and a
   send that failed says so and is retried by the next change. Two tests, one
   for each answer, because a note that could only ever say one of them would
   pass a single test while being useless.

   AND THE DECIDE ORDER, which decides which of two clashing traits survives
   and which nothing on screen mentioned after a reload.
*/
import { test, expect } from '@playwright/test';

const LAYERS = ['skins', 'hair', 'hats', 'glasses', 'unsorted'];

const seed = (page, opts) => page.evaluate(async ([layers, o]) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  /* BEFORE the writes, not after. Each project has its own IndexedDB
     ("chatnft.ws.<id>"), so setting activeWs afterwards would save the rules
     into one database and then read the note out of another - which is what
     the first draft of this file did, and it reported an empty note as though
     the feature were broken. */
  activeWs = o.group ? 'team1' : null;
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', layers, hidden: [], at: 1 });
  const put = (name, layer) => dbPut({ id: 't_' + layer + '_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  await put('bob', 'hair');
  await put('cap', 'hats');
  await put('specs', 'glasses');
  RULES = o.rules || [];
  await saveRules();
  DECIDE_ORDER = o.order || [];
  await saveDecideOrder();
  await renderShelf();
  const el = document.getElementById('rulestate');
  return { hidden: !!el.hidden, text: el.textContent };
}, [LAYERS, opts]);

test.describe('what the rules panel says about itself', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof ruleState === 'function');
  });

  test('with no rules it says nothing at all', async ({ page }) => {
    const r = await seed(page, {});
    expect(r.hidden, 'no note about rules that do not exist').toBe(true);
    expect(r.text).toBe('');
  });

  test('on your own page it says where they live', async ({ page }) => {
    /* Not a group warning - a fact. They are in this browser and nowhere
       else, so the file they came from is the only copy that survives
       clearing site data. */
    const r = await seed(page, { rules: [['hair/bob', 'hats/cap']] });
    expect(r.hidden).toBe(false);
    expect(r.text, 'it says this browser only').toContain('this browser only');
    expect(r.text, 'and points at the thing that travels').toContain('file');
    expect(r.text, 'and does not talk about a group you are not in').not.toContain('nobody else');
  });

  test('in a group it says whether they actually got there', async ({ page }) => {
    /* THIS TEST USED TO ASSERT THE OPPOSITE, and correctly failed the moment
       the rules started syncing: it pinned the sentence "Save to cloud does
       not send them", which was true when it was written and became a lie
       when a rules column was added to collections. A note describing an old
       behaviour confidently is worse than no note, so the sentence was
       replaced rather than left standing beside the fix - and this test
       failing is how that was noticed rather than shipped.

       "Shared" is read from sharedRuleSig, which is set only when a PATCH
       actually arrived. It is not a claim about what the code intends. */
    const r = await seed(page, { rules: [['hair/bob', 'hats/cap']], group: true });
    expect(r.text, 'it names the count').toContain('1 rules');
    expect(r.text, 'and says they have not got there, because nothing sent them')
      .toContain('have not reached');
    expect(r.text, 'never claiming a send that did not happen')
      .not.toContain('are shared with');
  });

  test('and says they are shared once a send has arrived', async ({ page }) => {
    /* The other half. Without it the test above passes on a note that can only
       ever say "not reached" - which is the same shape as the assertions found
       dead earlier today. */
    const r = await page.evaluate(async () => {
      activeWs = 'team1';
      cloudTeamId = 'team1';
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'x', refresh_token: 'y',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      const real = window.fetch;
      const json = (o) => new Response(JSON.stringify(o), { status: 200,
        headers: { 'Content-Type': 'application/json' } });
      window.fetch = (u) => {
        const s = String(u);
        if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
        if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
        if (s.indexOf('/rest/v1/collections') >= 0)
          return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
        return Promise.resolve(json([]));
      };
      try {
        RULES = [['hair/bob', 'hats/cap']];
        await saveRules();
        ruleState();
      } finally { window.fetch = real; }
      return { text: document.getElementById('rulestate').textContent,
        sig: sharedRuleSig !== null };
    });
    expect(r.sig, 'the send really did arrive').toBe(true);
    expect(r.text, 'so it says so').toContain('are shared with');
    expect(r.text, 'and stops saying they are stuck here').not.toContain('have not reached');
  });

  test('and it names the decide order, which nothing else showed', async ({ page }) => {
    const r = await seed(page, {
      rules: [['hair/bob', 'hats/cap']],
      order: ['skins', 'hats', 'hair', 'glasses', 'unsorted'],
    });
    expect(r.text, 'the later layer is the one that gives way')
      .toContain('the later one gives way');
    expect(r.text, 'and the hat is decided before the hair').toContain('hats, then hair');
    expect(r.text, 'and it is not the paint order').toContain('not the order they paint in');
  });

  test('it names only the layers a rule actually mentions', async ({ page }) => {
    /* Listing every layer would bury the one thing a person needs to read. */
    const r = await seed(page, {
      rules: [['hair/bob', 'hats/cap']],
      order: ['skins', 'hats', 'hair', 'glasses', 'unsorted'],
    });
    expect(r.text, 'glasses has no rule about it').not.toContain('glasses');
    expect(r.text, 'nor does skins').not.toContain('skins');
  });

  test('and says nothing about an order nobody set', async ({ page }) => {
    /* The control on the test above. With no decide order the layers still
       have rules, so a version that always printed the order would pass that
       test and describe an order that is not in force. */
    const r = await seed(page, { rules: [['hair/bob', 'hats/cap']] });
    expect(r.text, 'no claim about deciding').not.toContain('gives way');
    expect(r.text, 'but it still says where they live').toContain('this browser only');
  });

  test('Save to cloud still does not carry them - a different path does', async ({ page }) => {
    /* WHAT THIS PINS NOW. The rules reach the group through saveRules, which
       PATCHes the collection, and NOT through cloudPush, which uploads traits
       and base characters and nothing else. Both facts matter: the first is
       why the note can say "shared", and the second is why pressing Save to
       cloud is not what shares them - so a future change that moves rule
       sharing into cloudPush should red this and be looked at rather than
       silently making the panel's wording wrong again. */
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      /* cloudPush refuses before it sends anything unless it is signed in, has
         a collection and has a team - so all three are answered here. The first
         draft of this test skipped that, cloudPush returned at its second line,
         and "no request carried the rule" passed on ZERO requests. That is the
         same shape as the conditional assertions found in three other spec
         files today: an absence proved against an empty population. */
      activeWs = 'team1';
      cloudTeamId = 'team1';
      await dbClear();
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      await dbPut({ id: 't1', kind: 'trait', name: 'atrait', layer: 'skins', status: 'approved',
        blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
      RULES = [['skins/atrait', 'skins/btrait']];
      await saveRules();

      const bodies = [];
      const real = window.fetch;
      const json = (o) => new Response(JSON.stringify(o), { status: 200,
        headers: { 'Content-Type': 'application/json' } });
      window.fetch = (u, o) => {
        const s = String(u);
        if (o && o.body) bodies.push(String(o.body));
        if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
        if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
        if (s.indexOf('/rest/v1/collections') >= 0)
          return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
        if (s.indexOf('/storage/') >= 0) return Promise.resolve(json({}));
        return Promise.resolve(json([{ id: 'row1' }]));
      };
      try { await cloudPush(); } catch (_) {} finally { window.fetch = real; }
      return { bodies: bodies.join(' '), rules: RULES.length, calls: bodies.length };
    });
    expect(r.rules, 'the fixture really had a rule to send').toBe(1);
    /* THE POSITIVE CONTROL, and the reason this test means anything: cloudPush
       really ran and really sent the trait. Without this line, a cloudPush that
       returned at its first guard would satisfy the assertion below. */
    expect(r.calls, 'cloudPush actually sent requests').toBeGreaterThan(0);
    expect(r.bodies, 'and the trait it does upload is in one of them')
      .toContain('atrait');
    expect(r.bodies, 'while the rule is in none of them')
      .not.toContain('btrait');
  });
});
