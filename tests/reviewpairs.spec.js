/* Answering a pair by looking at it.

   A trait, a target layer, and every pairing composited live from the artwork
   in the project - then Yes or No on each. The answers are the same ones the
   curated rules file carries; this is where they get made.

   THREE STATES, NOT TWO, and that is the reason decisions are kept apart from
   rules: answering YES produces no rule at all, so the rule list cannot tell
   "somebody looked and allowed it" from "nobody has looked". Without the third
   state the coverage line is a guess and a bulk answer would trample the pairs
   somebody actually thought about.
*/
import { test, expect } from '@playwright/test';

const LAYERS = ['skins', 'hair', 'hats', 'unsorted'];

const seed = (page, status) => page.evaluate(async ([layers, st]) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', layers, hidden: [], at: 1 });
  /* A real one-pixel PNG, because a tile decodes the trait to paint it. */
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  c.getContext('2d').fillRect(0, 0, 1, 1);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const put = (name, layer) => dbPut({ id: 't_' + layer + '_' + name, kind: 'trait', name, layer,
    status: st, blob, w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  await put('bob', 'hair');
  await put('mop', 'hair');
  await put('curls', 'hair');
  await put('cap', 'hats');
  RULES = []; DECISIONS = [];
  await saveRules();
  await renderShelf();
}, [LAYERS, status || 'approved']);

const open = (page, cond, layer) => page.evaluate(async ([c, l]) => {
  document.getElementById('revtrait').value = c;
  revFill();
  document.getElementById('revtrait').value = c;
  document.getElementById('revlayer').value = l;
  await revOpen(true);
  return [...document.querySelectorAll('#revgrid .revtile')].map(t => ({
    name: t.querySelector('.nm').textContent,
    yes: t.classList.contains('yes'),
    no: t.classList.contains('no'),
    pressed: [...t.querySelectorAll('.ans button')].map(b => b.getAttribute('aria-pressed')),
  }));
}, [cond, layer]);

const answer = (page, name, which) => page.evaluate(async ([n, w]) => {
  const tile = [...document.querySelectorAll('#revgrid .revtile')]
    .find(t => t.querySelector('.nm').textContent === n);
  if (!tile) throw new Error('no tile for ' + n);
  const b = [...tile.querySelectorAll('.ans button')].find(x => x.textContent === w);
  b.click();
  await new Promise(r => setTimeout(r, 400));
  return { rules: RULES.map(g => g.slice().sort().join('|')),
    decisions: DECISIONS.map(d => d.a + '+' + d.b + '=' + d.ok),
    cover: document.getElementById('revcover').textContent,
    cls: [tile.classList.contains('yes'), tile.classList.contains('no')] };
}, [name, which]);

test.describe('reviewing pairs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof revOpen === 'function');
    await seed(page);
  });

  test('the sheet has a tile per trait on the target layer', async ({ page }) => {
    const tiles = await open(page, 'hats/cap', 'hair');
    expect(tiles.map(t => t.name).sort(), 'all three hairstyles')
      .toEqual(['bob', 'curls', 'mop']);
    expect(tiles.every(t => !t.yes && !t.no), 'and none is answered yet').toBe(true);
  });

  test('and it never offers the layer the trait is already on', async ({ page }) => {
    /* Only one trait per layer is ever chosen, so a pair inside a layer can
       never occur and answering it would write a rule that can never bite. */
    const layers = await page.evaluate(() => {
      document.getElementById('revtrait').value = 'hats/cap';
      revFill();
      return [...document.getElementById('revlayer').options].map(o => o.value);
    });
    expect(layers, 'not its own layer').not.toContain('hats');
    expect(layers, 'nor the catch-all').not.toContain('unsorted');
    expect(layers, 'but the ones it can clash with').toContain('hair');
  });

  test('No writes a rule, and the tile says so', async ({ page }) => {
    await open(page, 'hats/cap', 'hair');
    const r = await answer(page, 'bob', 'No');
    expect(r.rules, 'the pair is now never together').toContain('hair/bob|hats/cap');
    expect(r.decisions, 'and the answer is recorded').toContain('hair/bob+hats/cap=false');
    expect(r.cls, 'the tile reads excluded').toEqual([false, true]);
  });

  test('Yes records an answer and makes no rule', async ({ page }) => {
    /* The asymmetry that makes decisions worth keeping: a yes produces nothing
       for the generator, so only the decision record remembers it happened. */
    await open(page, 'hats/cap', 'hair');
    const r = await answer(page, 'mop', 'Yes');
    expect(r.rules, 'nothing to obey').toEqual([]);
    expect(r.decisions, 'but it was answered').toContain('hair/mop+hats/cap=true');
    expect(r.cls, 'and the tile reads allowed').toEqual([true, false]);
  });

  test('and changing your mind removes the rule again', async ({ page }) => {
    await open(page, 'hats/cap', 'hair');
    await answer(page, 'bob', 'No');
    const r = await answer(page, 'bob', 'Yes');
    expect(r.rules, 'the rule is gone').toEqual([]);
    expect(r.decisions, 'and the answer is the new one').toContain('hair/bob+hats/cap=true');
  });

  test('the coverage line counts what is answered', async ({ page }) => {
    await open(page, 'hats/cap', 'hair');
    const before = await page.evaluate(() => document.getElementById('revcover').textContent);
    expect(before, 'nothing yet, out of three').toContain('0 of 3');
    const r = await answer(page, 'bob', 'No');
    expect(r.cover, 'one answered, one excluded').toContain('1 of 3');
    expect(r.cover).toContain('1 excluded');
  });

  test('"the rest" leaves the ones you thought about alone', async ({ page }) => {
    /* A bulk answer that overwrote considered pairs would undo the review it
       is supposed to speed up. */
    await open(page, 'hats/cap', 'hair');
    await answer(page, 'bob', 'No');
    const r = await page.evaluate(async () => {
      document.getElementById('revyesall').click();
      await new Promise(x => setTimeout(x, 500));
      return { rules: RULES.map(g => g.slice().sort().join('|')),
        decisions: DECISIONS.map(d => d.a + '+' + d.b + '=' + d.ok).sort() };
    });
    expect(r.rules, 'the considered No is untouched').toEqual(['hair/bob|hats/cap']);
    expect(r.decisions, 'and the other two were answered yes').toEqual([
      'hair/bob+hats/cap=false', 'hair/curls+hats/cap=true', 'hair/mop+hats/cap=true',
    ]);
  });

  test('a project whose traits are all wip still has a sheet', async ({ page }) => {
    /* An import with no status folders leaves everything wip. If the sheet
       filtered by traitEligible it would be empty at the exact moment somebody
       first tries it - and a rule names a trait by layer and name, with no
       status in it at all. */
    await seed(page, 'wip');
    const tiles = await open(page, 'hats/cap', 'hair');
    expect(tiles.length, 'the wip traits are all there').toBe(3);
  });

  test('and it closes the way every other overlay does', async ({ page }) => {
    await open(page, 'hats/cap', 'hair');
    const r = await page.evaluate(async () => {
      const out = {};
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(x => setTimeout(x, 200));
      out.afterEscape = document.getElementById('revscrim').hidden;
      await revOpen(true);
      out.reopened = !document.getElementById('revscrim').hidden;
      document.getElementById('revscrim').click();
      await new Promise(x => setTimeout(x, 200));
      out.afterOutside = document.getElementById('revscrim').hidden;
      return out;
    });
    expect(r.afterEscape, 'Escape closes it').toBe(true);
    expect(r.reopened, 'it opens again').toBe(true);
    expect(r.afterOutside, 'and a click outside the card closes it').toBe(true);
  });
});
