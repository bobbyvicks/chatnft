/* Clearing the rule set so a new one can be imported over a clean project.

   Importing rules only ever ADDS: a rule already present is counted as
   "already here" and skipped, and nothing is ever removed. That is right when
   you are adding a second file and wrong after a rename, which is the case
   this exists for - the live collection carries 176 rules and 2,603 answers,
   and after traits are renamed a good many of them name traits that are gone.
   Short of clearing the whole project there was no way back.

   THE ANSWERS GO WITH THE RULES, AND THAT IS THE POINT OF THIS FILE. A "no"
   answer is not a note ABOUT a rule, it IS one:

     if(!ok){ ... RULES=RULES.concat([ruleGroup([A,B])]); }

   and the pull replays every answer it holds. So rules cleared without their
   answers rebuild themselves on the next load - a button that appears to work,
   in a way nobody would catch until the rules came back.

   AND A CLEAR HAS TO SURVIVE A TEAMMATE. The pull merges rather than adopts,
   on purpose, and its last branch reads "nothing up there and something here:
   send it rather than lose it" - which cannot tell rules that predate the
   column from rules somebody just cleared. Both are an empty server and a full
   browser, and they want opposite things. A timestamp separates them, and the
   two tests at the bottom are the pair that makes it mean anything: newer and
   empty clears, older and empty does not.
*/
import { test, expect } from '@playwright/test';

/* A project with rules, answers, traits, layers and a draw order - so that
   "it cleared the rules" and "it cleared everything" are distinguishable. */
const fill = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const blob = new Blob([new Uint8Array([0])]);
  const put = (name, layer) => dbPut({ id: 't_' + name + '_' + layer + '_approved',
    kind: 'trait', name, layer, status: 'approved', blob, w: 160, h: 160, rarity: 7, at: 1 });
  await put('cap', 'hats');
  await put('bob', 'hair');
  LAYERS = ['skins', 'hair', 'hats', 'unsorted'];
  await saveLayers();
  RULES = [['hats/cap', 'hair/bob']];
  DECISIONS = [{ a: 'hair/bob', b: 'hats/cap', ok: false, at: 5, src: 'you' }];
  await saveRules();
  DECIDE_ORDER = ['hats', 'hair'];
  await saveDecideOrder();
  window.__asked = [];
  window.confirm = (m) => { window.__asked.push(String(m)); return o.say !== false; };
  await renderShelf();
}, opts || {});

const state = (page) => page.evaluate(async () => {
  const all = await dbAll();
  const rec = all.find(i => i.id === 'settings.rules');
  return {
    rules: RULES.length, decisions: DECISIONS.length,
    order: DECIDE_ORDER.slice(), layers: LAYERS.slice(),
    traits: all.filter(i => i.kind === 'trait').length,
    rarity: (all.find(i => i.kind === 'trait') || {}).rarity,
    storedGroups: (rec && rec.groups || []).length,
    storedDecisions: ((all.find(i => i.id === 'settings.decisions') || {}).decisions || []).length,
    stamp: rec && rec.rulesAt,
    note: document.getElementById('ruleimportnote').textContent,
    asked: window.__asked,
  };
});

test.describe('clearing the trait rules', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof clearRules === 'function');
  });

  test('takes the rules AND the answers behind them', async ({ page }) => {
    /* Both, because a No answer rebuilds its rule. Leaving the answers would
       put the rule back on the next load and nothing would say why. */
    await fill(page);
    await page.evaluate(() => clearRules());
    const s = await state(page);
    expect(s.rules, 'no rules left').toBe(0);
    expect(s.decisions, 'and no answers to rebuild them from').toBe(0);
    expect(s.storedGroups, 'the store agrees').toBe(0);
    expect(s.storedDecisions).toBe(0);
    /* AND THE STAMP IS KEPT HERE TOO. It is what a later pull compares the
       server against; if it lived only in memory, the next page load would
       read 0, and a server still holding the old rules would look newer than
       anything this browser had ever written. */
    expect(typeof s.stamp, 'the clear is dated in the store').toBe('number');
    expect(s.stamp).toBeGreaterThan(0);
  });

  test('and nothing else at all', async ({ page }) => {
    /* THE CONTROL. A clear that took the traits with it would pass every test
       above. What the button promises not to touch is what it must not touch. */
    await fill(page);
    await page.evaluate(() => clearRules());
    const s = await state(page);
    expect(s.traits, 'the traits stay').toBe(2);
    expect(s.rarity, 'with their weights').toBe(7);
    expect(s.layers, 'the layers stay').toEqual(['skins', 'hair', 'hats', 'unsorted']);
    expect(s.order, 'and so does the draw order').toEqual(['hats', 'hair']);
  });

  test('it says what it is about to remove, in numbers', async ({ page }) => {
    // "2,603 answers" is a thing somebody can weigh. "the rules" is not.
    await fill(page);
    await page.evaluate(() => clearRules());
    const s = await state(page);
    expect(s.asked.length).toBe(1);
    expect(s.asked[0]).toContain('1 never-together rule');
    expect(s.asked[0]).toContain('1 reviewed answer');
    expect(s.asked[0], 'and why the answers have to go too').toContain('rebuilds its rule');
  });

  test('and Cancel changes nothing', async ({ page }) => {
    /* The recorded decision this must not break. A destructive action tested
       only on the destructive path passes just as happily once it has become
       unconditional. */
    await fill(page, { say: false });
    await page.evaluate(() => clearRules());
    const s = await state(page);
    expect(s.rules).toBe(1);
    expect(s.decisions).toBe(1);
    expect(s.storedGroups, 'and nothing was written either').toBe(1);
  });

  test('an empty rule set says so instead of asking', async ({ page }) => {
    await fill(page);
    await page.evaluate(async () => { RULES = []; DECISIONS = []; await saveRules(); });
    await page.evaluate(() => { window.__asked = []; });
    await page.evaluate(() => clearRules());
    const s = await state(page);
    expect(s.asked, 'nothing to confirm').toEqual([]);
    expect(s.note).toContain('no rules to clear');
  });

  test('the report counts what went', async ({ page }) => {
    await fill(page);
    await page.evaluate(() => clearRules());
    const s = await state(page);
    expect(s.note).toContain('Cleared 1 never-together rule');
    expect(s.note).toContain('1 reviewed answer');
  });

  test('in a group it clears them for the group too', async ({ page }) => {
    /* A clear that stayed in this browser comes back on the next load. What is
       pinned is the request: the rules and the answers both emptied, and the
       stamp that makes the clear readable as a clear rather than a gap. */
    await fill(page);
    const sent = await page.evaluate(async () => {
      /* A SESSION, or sbHeaders returns null and nothing is sent at all -
         which reads exactly like a server that refused. Not a real token; every
         request below is intercepted. */
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-me' } }));
      activeWs = 'team1';
      sharedRuleSig = null;
      const real = window.fetch;
      const json = (x) => new Response(JSON.stringify(x),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
      window.__patch = null;
      window.fetch = (u, o) => {
        const s = String(u);
        if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u-me' }));
        if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
        if (s.indexOf('/rest/v1/collections') >= 0) {
          if (o && o.method === 'PATCH') {
            window.__patch = JSON.parse(o.body);
            return Promise.resolve(json([{ id: 'c1' }]));
          }
          return Promise.resolve(json([{ id: 'c1', layers: ['hats'] }]));
        }
        return real(u, o);
      };
      await clearRules();
      return { patch: window.__patch, note: document.getElementById('ruleimportnote').textContent };
    });
    expect(sent.patch, 'the group was told').not.toBe(null);
    expect(sent.patch.rules, 'rules emptied up there').toEqual([]);
    expect(sent.patch.decisions, 'and the answers with them').toEqual([]);
    expect(typeof sent.patch.rules_at, 'stamped, so it reads as a clear').toBe('number');
    expect(sent.patch.rules_at).toBeGreaterThan(0);
    expect(sent.note).toContain('cleared too');
  });

  test('and a group it cannot reach is told about, not claimed', async ({ page }) => {
    /* "Cleared" over a server that never heard is the shape of lie worth
       avoiding: the rules come back on the next load and the message was the
       only warning there would have been. */
    await fill(page);
    const note = await page.evaluate(async () => {
      /* A SESSION, or sbHeaders returns null and nothing is sent at all -
         which reads exactly like a server that refused. Not a real token; every
         request below is intercepted. */
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-me' } }));
      activeWs = 'team1';
      sharedRuleSig = null;
      const real = window.fetch;
      window.fetch = (u, o) => {
        if (String(u).indexOf('/rest/v1/collections') >= 0 && o && o.method === 'PATCH')
          return Promise.resolve(new Response('no', { status: 500 }));
        if (String(u).indexOf('/auth/v1/user') >= 0)
          return Promise.resolve(new Response(JSON.stringify({ id: 'u-me' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (String(u).indexOf('/rest/v1/collections') >= 0)
          return Promise.resolve(new Response(JSON.stringify([{ id: 'c1', layers: [] }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (String(u).indexOf('/rpc/my_team') >= 0)
          return Promise.resolve(new Response(JSON.stringify('team1'),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return real(u, o);
      };
      await clearRules();
      return document.getElementById('ruleimportnote').textContent;
    });
    expect(note).toContain('will come back');
    expect(note, 'and it does not say the group has them cleared')
      .not.toContain('cleared too');
  });
});

/* THE PAIR THAT MAKES THE STAMP MEAN ANYTHING.

   An empty server and a full browser has two causes wanting opposite things.
   A version that adopted every empty server would wipe the rules of any
   browser whose collection simply predates the column - which, the first time
   anyone loaded it, was every browser. So both directions are pinned. */
test.describe('a clear made by somebody else', () => {
  const pull = (page, serverStamp, localStamp) => page.evaluate(async (o) => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    await dbClear();
    /* A SESSION, or sbHeaders returns null and nothing is sent at all -
       which reads exactly like a server that refused. Not a real token; every
       request below is intercepted. */
    localStorage.setItem('chatnft.session', JSON.stringify({
      access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-me' } }));
    activeWs = 'team1';
    RULES = [['hats/cap', 'hair/bob']];
    DECISIONS = [{ a: 'hair/bob', b: 'hats/cap', ok: false, at: 5, src: 'you' }];
    await saveRules();
    /* saveRules stamps with Date.now(); this is the value the test means. */
    rulesAt = o.local;
    await dbPut({ id: 'settings.rules', kind: 'settings', at: 1,
      groups: RULES.map(g => g.slice()), pairs: [], rulesAt: o.local });
    const real = window.fetch;
    const json = (x) => new Response(JSON.stringify(x),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
    window.fetch = (u, opt) => {
      const s = String(u);
      if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u-me' }));
      if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
      if (s.indexOf('/rest/v1/collections') >= 0) {
        if (opt && opt.method === 'PATCH') return Promise.resolve(json([{ id: 'c1' }]));
        return Promise.resolve(json([{ id: 'c1', layers: ['hats', 'hair'],
          rules: [], decisions: [], decide_order: [], empty_chance: 0.35,
          rules_at: o.server }]));
      }
      /* AT LEAST ONE ROW, or none of this is reached: cloudPull returns at
         "Nothing saved on the server yet" before it ever looks at the rules.
         An empty-server stub made both of these tests agree with each other
         and with nothing else. */
      if (s.indexOf('/rest/v1/traits?select=id') >= 0)
        return Promise.resolve(new Response(JSON.stringify([]),
          { status: 200, headers: { 'Content-Type': 'application/json',
            'Content-Range': '0-0/1' } }));
      if (s.indexOf('/rest/v1/traits') >= 0)
        return Promise.resolve(new Response(JSON.stringify([{ id: 'r1',
          kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
          rarity: 1, w: 160, h: 160, shelf_order: 0, owner: 'u-me',
          path: 'team1/c1/hats/cap.png', updated_at: new Date(0).toISOString() }]),
        { status: 200, headers: { 'Content-Type': 'application/json',
          'Content-Range': '0-0/1' } }));
      if (s.indexOf('/storage/v1/object/') >= 0)
        return Promise.resolve(new Response(new Blob([new Uint8Array([1])]),
          { status: 200 }));
      return real(u, opt);
    };
    await cloudPull({ quiet: true });
    return { rules: RULES.length, decisions: DECISIONS.length };
  }, { server: serverStamp, local: localStamp });

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function');
  });

  test('newer and empty is a clear, and is adopted', async ({ page }) => {
    const r = await pull(page, 9000, 1000);
    expect(r.rules, 'their clear reached this browser').toBe(0);
    expect(r.decisions).toBe(0);
  });

  test('but older and empty is a collection that was never told',
    async ({ page }) => {
      /* The control, and the one that matters more: every existing collection
         has rules_at 0 and rules that predate it. Adopting that empty would
         delete 176 rules and 2,603 answers the first time anybody loaded. */
      const r = await pull(page, 0, 1000);
      expect(r.rules, 'kept, and sent up rather than lost').toBe(1);
      expect(r.decisions).toBe(1);
    });
});
