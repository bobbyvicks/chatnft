/* A rule holds any number of traits, and a character carries at most one.

   Asked for as "the if- statments are good but let people add to them". A rule
   was two traits with no way to widen it. Now each row carries its members and
   a picker that puts another trait into that rule.

   "At most one of the group" - not "not all of them together". Under the other
   reading, adding a third trait to {crown, veil} would silently UN-BAN
   crown+veil, so the gesture being asked for would weaken every rule it touched
   with nothing on screen saying so.

   At two members it is the same predicate that shipped before: 4,096 cases
   compared against the old pair logic with no disagreement, which is what makes
   this a generalisation rather than a replacement.

   THE CONTROL IS THE TEST. "The forbidden pairs never appeared" is also what
   you get from a set where they could never appear anyway. Measured on this
   fixture with the rule removed, all three pairs occur in 3000 of 3000 draws;
   with it, 0 of 3000.
*/
import { test, expect } from '@playwright/test';

const CROWN = 'hair-headwear/crown', VEIL = 'masks/veil', HALO = 'accessories/halo';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  await dbClear();
  const put = (name, layer) => dbPut({ id: 't_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  // Three layers that can each fill, so a draw COULD carry all three.
  await put('crown', 'hair-headwear');
  await put('veil', 'masks');
  await put('halo', 'accessories');
  await put('tan', 'skins');
  await renderShelf();
});

/* Makes a rule the way a person does: two pickers and Add. */
const addRule = (page, a, b) => page.evaluate(async ([x, y]) => {
  $('rulea').value = x; $('ruleb').value = y;
  return $('ruleadd').onclick();
}, [a, b]);

/* Widens the first rule through its own row's picker. */
const widen = (page, key) => page.evaluate(async (k) => {
  const sel = $('rulelist').querySelector('select');
  sel.value = k;
  return sel.onchange();
}, key);

/* Draws N characters and counts how often each forbidden pair came out.
   emptyChance 0 so every layer fills and all three are genuinely candidates. */
const pairCounts = (page, n) => page.evaluate((N) => {
  const was = emptyChance;
  emptyChance = 0;
  distCache = null; distKey = null;
  const pools = cPools();
  const seen = { cv: 0, ch: 0, vh: 0, allThree: 0, atLeastOne: 0 };
  for (let i = 0; i < N; i++) {
    const names = randomCombo(pools).map(t => t.name);
    const c = names.includes('crown'), v = names.includes('veil'), h = names.includes('halo');
    if (c && v) seen.cv++;
    if (c && h) seen.ch++;
    if (v && h) seen.vh++;
    if (c && v && h) seen.allThree++;
    if (c || v || h) seen.atLeastOne++;
  }
  emptyChance = was;
  return seen;
}, n);

test.describe('a rule of more than two traits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderShelf === 'function');
    await seed(page);
    await page.waitForTimeout(400);
  });

  test('a trait can be added to a rule that already exists', async ({ page }) => {
    await addRule(page, CROWN, VEIL);
    await page.waitForTimeout(200);
    await widen(page, HALO);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      rules: RULES.map(g => g.slice()),
      rows: $('rulelist').querySelectorAll('.olrow').length,
    }));
    expect(r.rules, 'one rule of three, sorted').toEqual([[HALO, CROWN, VEIL].sort()]);
    expect(r.rows, 'shown as ONE rule, not three pairs').toBe(1);
  });

  test('and then none of the three appear together', async ({ page }) => {
    await addRule(page, CROWN, VEIL);
    await page.waitForTimeout(200);
    await widen(page, HALO);
    await page.waitForTimeout(300);
    const s = await pairCounts(page, 3000);
    expect(s.cv, 'crown with veil').toBe(0);
    expect(s.ch, 'crown with halo').toBe(0);
    expect(s.vh, 'veil with halo').toBe(0);
    // Not vacuous: the characters still carry one of them.
    expect(s.atLeastOne, 'and a character still gets one of the three').toBe(3000);
  });

  test('the control: without the rule those pairs happen every time', async ({ page }) => {
    // Without this, the test above passes against a fixture where the three
    // could never co-occur anyway, and proves nothing about the rule.
    const s = await pairCounts(page, 3000);
    expect(s.cv).toBe(3000);
    expect(s.ch).toBe(3000);
    expect(s.vh).toBe(3000);
    expect(s.allThree, 'all three land together with nothing to stop them').toBe(3000);
  });

  test('a three-trait rule survives a reload as one rule', async ({ page }) => {
    await addRule(page, CROWN, VEIL);
    await page.waitForTimeout(200);
    await widen(page, HALO);
    await page.waitForTimeout(300);
    const stored = await page.evaluate(async () => {
      const rec = (await dbAll()).find(i => i.id === 'settings.rules');
      return { groups: rec.groups, pairs: rec.pairs };
    });
    expect(stored.groups, 'the group is stored whole').toEqual([[HALO, CROWN, VEIL].sort()]);
    // The pairs mirror: the SAME rule spelled out for a copy of this page that
    // predates groups. "At most one of G" is the conjunction of G's pairs.
    expect(stored.pairs, 'and spelled out as its three pairs').toEqual([
      [HALO, CROWN].sort(), [HALO, VEIL].sort(), [CROWN, VEIL].sort(),
    ].sort());

    await page.reload();
    await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
    await page.waitForTimeout(500);
    const back = await page.evaluate(async () => { await renderShelf(); return RULES.map(g => g.slice()); });
    expect(back, 'and comes back as one rule of three').toEqual([[HALO, CROWN, VEIL].sort()]);
  });

  test('a project saved before groups existed still loads', async ({ page }) => {
    const r = await page.evaluate(async () => {
      // Exactly what an older copy of this page wrote: pairs, no groups.
      await dbPut({ id: 'settings.rules', kind: 'settings', at: 1,
        pairs: [['hair-headwear/crown', 'masks/veil'], ['accessories/halo', 'skins/tan']] });
      applyRules(await dbAll());
      return RULES.map(g => g.slice());
    });
    expect(r, 'both rules come back').toEqual([
      [CROWN, VEIL].sort(), [HALO, 'skins/tan'].sort(),
    ]);
  });

  test('when a record holds both, groups wins and pairs is ignored', async ({ page }) => {
    // Otherwise a group and its own expansion would both load and the rule
    // would be shown several times over.
    const r = await page.evaluate(async () => {
      await dbPut({ id: 'settings.rules', kind: 'settings', at: 1,
        groups: [['a/x', 'b/y', 'c/z']],
        pairs: [['a/x', 'b/y'], ['a/x', 'c/z'], ['b/y', 'c/z']] });
      applyRules(await dbAll());
      return RULES.map(g => g.slice());
    });
    expect(r, 'one rule of three, not three of two').toEqual([['a/x', 'b/y', 'c/z']]);
  });

  test('a rule that would end up with one trait is dropped, not kept', async ({ page }) => {
    // A one-member rule bans a trait outright, which is what deleting the rule
    // is for. ruleGroup can shrink a list, so the floor is checked after it.
    const r = await page.evaluate(async () => {
      await dbPut({ id: 'settings.rules', kind: 'settings', at: 1,
        groups: [['only'], [], ['a', 'a'], ['a', '', 'b'], 'nope', ['p', 'q']] });
      applyRules(await dbAll());
      return RULES.map(g => g.slice());
    });
    expect(r, 'only the two real rules survive').toEqual([['a', 'b'], ['p', 'q']]);
  });

  test('taking a member out of a three leaves a two', async ({ page }) => {
    await addRule(page, CROWN, VEIL);
    await page.waitForTimeout(200);
    await widen(page, HALO);
    await page.waitForTimeout(300);
    const r = await page.evaluate(async () => {
      // The member buttons, minus the trailing "remove".
      const btns = [...$('rulelist').querySelectorAll('.olrow button.mini')];
      const member = btns.find(b => b.textContent.indexOf('crown') >= 0);
      await member.onclick();
      await new Promise(r => setTimeout(r, 300));
      return RULES.map(g => g.slice());
    });
    expect(r, 'crown is out, the other two still bound').toEqual([[HALO, VEIL].sort()]);
  });

  test('and taking one out of a two removes the rule entirely', async ({ page }) => {
    await addRule(page, CROWN, VEIL);
    await page.waitForTimeout(200);
    const r = await page.evaluate(async () => {
      const btns = [...$('rulelist').querySelectorAll('.olrow button.mini')];
      const member = btns.find(b => b.textContent.indexOf('crown') >= 0);
      await member.onclick();
      await new Promise(r => setTimeout(r, 300));
      return RULES.map(g => g.slice());
    });
    expect(r, 'a rule of one would ban a trait outright').toEqual([]);
  });

  test('two rules sharing a trait stay separate when one is widened', async ({ page }) => {
    // Every mutation matches on the rule's key rather than array identity, and
    // the old key read only the first two members - so {a,b,c} and {a,b,d} were
    // the same rule as far as every comparison went.
    await addRule(page, CROWN, VEIL);
    await page.waitForTimeout(200);
    await addRule(page, CROWN, 'skins/tan');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => RULES.length);
    expect(before, 'two rules to start').toBe(2);
    await widen(page, HALO);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => RULES.map(g => g.slice()));
    expect(r.length, 'still two rules').toBe(2);
    expect(r, 'only the first grew').toEqual([
      [HALO, CROWN, VEIL].sort(), [CROWN, 'skins/tan'].sort(),
    ]);
  });
});
