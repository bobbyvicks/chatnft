/* Plan rarity: a slider per trait, and a set that always adds to 100%.

   THE SLIDER IS NOT THE WEIGHT, and every test here turns on that.

   Twenty-one eyes all at weight 3 draw at 3.1% each - identical to twenty-one
   all at weight 1 - because a share is w/Sum(w) and the scale cancels. A
   slider showing the weight would put all twenty-one thumbs at "rarest" over a
   set where nothing is rare. So the axis is the MULTIPLIER against an even
   share: 1.0 is "as likely as any other in this set", 2.0 twice that.

   That choice is what makes the headline ask a physical property rather than a
   caption: the multipliers over a set sum to n for ANY weights at all, so the
   mean thumb is always on the even mark and you cannot drag everything to
   rare. Pushing one right pushes the others left. The test named "the
   multipliers over a set sum to n" is the one that pins it.

   THE DEFECT THIS FILE WAS WRITTEN AROUND, found by driving the real page:
   on a set where nothing had been planned, dragging towards RARE made a trait
   COMMONER - 4.8% to 9.1% - because an unplanned sibling sits at weight 1,
   which is the "nobody has chosen" flag and is BELOW the rarest weight a plan
   may ask for. The set had no room underneath it. Touching a slider now plans
   the whole set at normal first, and two tests below check the direction in
   both directions so a fix that simply inverted something cannot pass.
*/
import { test, expect } from '@playwright/test';

/* Traits straight into the store: this is about arithmetic over a set, and
   driving the editor twenty-one times would be testing the editor. A tiny
   shared blob, because nothing here decodes an image. */
const project = (page, spec) => page.evaluate(async (s) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; activeWs = null;
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (const t of s.traits) {
    const rec = { id: 't_' + t.n + '_' + t.l + '_' + (t.st || 'approved'), kind: 'trait',
      name: t.n, layer: t.l, status: t.st || 'approved', blob, w: 8, h: 8, at: 1 };
    if (typeof t.r === 'number') rec.rarity = t.r;
    await dbPut(rec);
  }
  LAYERS = s.layers.slice();
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: s.layers.slice(), hidden: s.hidden || [] });
  if ($('cwip')) $('cwip').checked = !!s.wip;
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
  planFold(false);
  return true;
}, spec);

/* Everything on screen for one layer, read out of the DOM rather than
   recomputed - a test that recomputes the shares is testing its own copy. */
const readGroup = (page, layer) => page.evaluate((name) => {
  const grp = [...document.querySelectorAll('#planbody .plangrp')]
    .find(x => x.querySelector('b') && x.querySelector('b').textContent === name);
  if (!grp) return null;
  const rows = [...grp.querySelectorAll('.prow')].map(r => ({
    name: r.querySelector('.pname').textContent,
    pct: r.querySelector('.pshare').textContent,
    say: r.querySelector('.psay').textContent,
    pos: +r.querySelector('input[type=range]').value,
    disabled: r.querySelector('input[type=range]').disabled,
    unset: r.classList.contains('unset'),
  }));
  return { rows: rows,
    head: [...grp.querySelectorAll('.planhead span')].map(s => s.textContent),
    notes: [...grp.querySelectorAll('.plantot')].map(p => p.textContent),
    buttons: [...grp.querySelectorAll('button')].map(b => b.textContent) };
}, layer);

/* Drag one slider and, optionally, let go. Fired as real input/change events
   so the page's own handlers run - setting .value alone fires neither. */
const drag = (page, layer, index, pos, release) => page.evaluate((o) => {
  const grp = [...document.querySelectorAll('#planbody .plangrp')]
    .find(x => x.querySelector('b').textContent === o.layer);
  const sl = grp.querySelectorAll('.prow input[type=range]')[o.index];
  sl.value = o.pos === 'rare' ? String(POS_MAX) : o.pos === 'common' ? '0' : String(o.pos);
  sl.dispatchEvent(new Event('input', { bubbles: true }));
  if (o.release) sl.dispatchEvent(new Event('change', { bubbles: true }));
  return +sl.value;
}, { layer, index, pos, release: !!release });

const EYES = n => Array.from({ length: n }, (_, i) => ({ n: 'e' + i, l: 'eyes' }));
const SET = { layers: ['eyes', 'unsorted'], traits: EYES(21) };

test.describe('planning how rare each trait should be', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderPlan === 'function');
  });

  test('the multipliers over a set sum to n, whatever the weights',
    async ({ page }) => {
      /* THE PROPERTY THE WHOLE FEATURE RESTS ON, and the reason the slider
         shows a multiplier rather than a weight. Because they sum to n, the
         mean thumb is always on the even mark: you cannot drag everything to
         rare, and the 100% needs no maintenance because it is an identity.

         Five weight vectors including the two states the collection is
         actually in - all unplanned, and all seeded. */
      const r = await page.evaluate(() => {
        const out = {};
        const vecs = {
          unplanned: Array(21).fill(1),
          seeded: Array(21).fill(RAR_NORMAL),
          ceiling: Array(21).fill(RAR_MAX),
          oneRare: [RAR_MIN].concat(Array(20).fill(RAR_NORMAL)),
          lopsided: [99, 2, 2, 50, 7, 30, 14, 3, 88, 61, 2, 9, 45, 12, 33, 21, 5, 70, 16, 40, 8],
        };
        for (const [k, ws] of Object.entries(vecs)) {
          const n = ws.length, tot = ws.reduce((a, b) => a + b, 0);
          out[k] = {
            mult: ws.reduce((a, w) => a + n * (w / tot), 0),
            share: ws.reduce((a, w) => a + w / tot, 0),
          };
        }
        return out;
      });
      for (const [k, v] of Object.entries(r)) {
        expect(v.mult, k + ': the multipliers sum to the number of traits').toBeCloseTo(21, 9);
        expect(v.share, k + ': and the shares to exactly one').toBeCloseTo(1, 12);
      }
    });

  test('an even set puts every thumb on the same mark, at any weight',
    async ({ page }) => {
      /* THE AXIS ITSELF, and the argument for it in one assertion.

         Twenty-one traits all at weight 3 draw at 3.1% each - identical to
         twenty-one all at weight 300 - because a share is w/Sum(w) and the
         scale cancels. So the thumbs must be identical too, and on the even
         mark, or the screen says one of those sets is full of rare traits.

         ADDED BECAUSE A MUTATION RUN SHOWED NOTHING WAS DEFENDING THIS ANY
         MORE. The round-trip test used to catch a weight axis - it read a
         rendered position and committed it - but the guard that stops a
         release writing when the thumb has not moved compares the position
         against itself, so it now passes over any render position at all. A
         guard added for one correctness property silently removed the only
         cover another had. */
      const at = async (w) => {
        await project(page, { layers: ['eyes', 'unsorted'],
          traits: EYES(21).map(t => ({ ...t, r: w })) });
        const g = await readGroup(page, 'eyes');
        return { pos: [...new Set(g.rows.map(r => r.pos))], pct: g.rows[0].pct };
      };
      const low = await at(3);
      const high = await at(300);
      const even = await page.evaluate(() => posOfMult(1, 21));
      expect(low.pos, 'one position for twenty-one equal traits').toHaveLength(1);
      expect(high.pos).toHaveLength(1);
      expect(low.pos[0], 'and it is the even mark, not the weight').toBe(even);
      expect(high.pos[0], 'a hundred times the weight, the same mark').toBe(even);
      expect(low.pct, 'because the shares are the same').toBe(high.pct);
    });

  test('the position and the multiplier are inverses of each other',
    async ({ page }) => {
      /* ADDED AFTER A MUTATION RUN FOUND THE GAP. Inverting multOfPos left two
         tests green that read the STORED weight after a drag - because the
         thumb snaps through posOfMult, which was not inverted, and the round
         trip through the disagreement landed back on the right weight. The
         store was right for the wrong reason and nothing said the two
         functions had stopped being inverses.

         Off by at most one position, which is the rounding in posOfMult. */
      const worst = await page.evaluate(() => {
        let worst = 0;
        for (const n of [2, 3, 5, 21, 43]) {
          for (let s = 0; s <= POS_MAX; s += 137) {
            const back = posOfMult(multOfPos(s, n), n);
            worst = Math.max(worst, Math.abs(back - s));
          }
        }
        return worst;
      });
      expect(worst, 'a position survives a trip through the multiplier')
        .toBeLessThanOrEqual(1);
    });

  test('the percentages ON SCREEN add up to 100, not only the weights',
    async ({ page }) => {
      /* ALSO ADDED AFTER THE MUTATION RUN. Halving every displayed share left
         "an even set is 21 equal shares" green: it checks that the shares are
         equal, that the footer says they total 100%, and that the exact sum
         off the STORE is one - and none of those reads the numbers actually
         printed in the column. A screen showing twenty-one 2.4% rows under a
         line reading "these add up to 100%" would have passed.

         Rounding means it cannot be exactly 100: twenty-one values rounded to
         one decimal can be out by 1.05 between them, which is why the app
         states the identity rather than printing this sum. */
      await project(page, SET);
      await drag(page, 'eyes', 0, 'rare');
      const g = await readGroup(page, 'eyes');
      const sum = g.rows.reduce((a, r) => a + parseFloat(r.pct), 0);
      expect(sum, 'the column really adds to 100').toBeGreaterThan(98.5);
      expect(sum).toBeLessThan(101.5);
    });

  test('a fresh project says how many still need a rarity', async ({ page }) => {
    /* The thing that was asked for in those words: adding traits has to say
       that rarity is what is left before the project is finished. */
    await project(page, SET);
    const c = await page.evaluate(() => $('plancount').textContent);
    expect(c).toBe('0 of 21 set. 21 to go before this is finished.');
  });

  test('and says so no longer once every one is set', async ({ page }) => {
    // A CONTROL. A banner that never clears is one people stop reading.
    await project(page, { layers: ['eyes', 'unsorted'],
      traits: EYES(21).map(t => ({ ...t, r: 14 })) });
    const c = await page.evaluate(() => $('plancount').textContent);
    expect(c).toBe('Every trait has a rarity.');
  });

  test('an even set is 21 equal shares that add to exactly 100%',
    async ({ page }) => {
      await project(page, SET);
      const g = await readGroup(page, 'eyes');
      expect(g.rows).toHaveLength(21);
      expect(new Set(g.rows.map(r => r.pct)).size, 'all the same').toBe(1);
      expect(g.notes.some(t => t.indexOf('add up to 100%') >= 0),
        'and the set says it is all of the outcomes').toBe(true);
      /* The EXACT sum, off the store rather than off the rounded text: a
         column of rounded percentages does not add to 100 and printing their
         total would show 99 or 101 over a set that is perfectly right. */
      const exact = await page.evaluate(async () => {
        const items = await dbAll();
        let s = 0;
        for (const t of planRows(items, 'eyes', false)) s += layerShare(t, items, false);
        return s;
      });
      expect(exact).toBeCloseTo(1, 12);
    });

  test('dragging towards rare makes it RARER, on a set nobody has planned',
    async ({ page }) => {
      /* THE DEFECT. Every sibling was at weight 1 - the "nobody has chosen"
         flag, below the rarest weight a plan may ask for - so the set had no
         room underneath and the drag measured 4.8% going UP to 9.1%. Every set
         in the project is in that state until it is touched, so this was the
         whole first use of the feature. */
      await project(page, SET);
      const was = (await readGroup(page, 'eyes')).rows[0].pct;
      await drag(page, 'eyes', 0, 'rare');
      const now = (await readGroup(page, 'eyes')).rows[0];
      expect(was).toBe('4.8%');
      expect(parseFloat(now.pct), 'rarer than it was').toBeLessThan(parseFloat(was));
      /* 0.71% until the weight ceiling was widened from 99 to 5000. The
         neutral is the point whose ratio to each end is equal, so it moved
         from sqrt(2*99)=14 to sqrt(2*5000)=100, and one drag now reaches 50x
         rarer than an even share instead of 7x. This is a share of the SET;
         eyes is on 65% of characters, so it is 0.065% of the collection. */
      expect(now.pct).toBe('0.10%');
    });

  test('one drag reaches a one-of-one, below 0.1% of characters',
    async ({ page }) => {
      /* THE REASON THE CEILING WAS WIDENED. At 99 the neutral weight was
         sqrt(2*99) = 14, so one drag reached only 14/2 = 7x rarer than an even
         share - 0.46% of characters on eyes - and 0.1% was not expressible at
         any setting. At 5000 the neutral is 100 and one drag is 50x.

         Measured through traitChance, which is the share of CHARACTERS and
         therefore the number a collection is actually judged on - eyes is on
         65% of characters, so this is the set share of 0.10% times 0.65. */
      await project(page, SET);
      await drag(page, 'eyes', 0, 'rare', true);
      await page.waitForTimeout(500);
      const r = await page.evaluate(async () => {
        const items = await dbAll();
        const rec = items.find(i => i.name === 'e0');
        const ch = traitChance(rec, items, false);
        return { pct: ch.pct * 100, weight: rec.rarity, estimated: !!ch.estimated };
      });
      expect(r.weight, 'the floor of the store').toBe(2);
      expect(r.estimated, 'no rules here, so this is arithmetic not a sample').toBe(false);
      expect(r.pct, 'below the one in ten thousand that was asked for')
        .toBeLessThan(0.1);
      expect(r.pct, 'and not zero, which would mean it never appears')
        .toBeGreaterThan(0);
    });

  test('but a set of three cannot, and that is arithmetic rather than a limit',
    async ({ page }) => {
      /* THE HONEST BOUND, pinned so nobody later reads it as the feature being
         broken. ears holds three traits. One of three at the floor against two
         at normal is 2/202 of the set, which is 0.64% of characters, and no
         ceiling changes that: to make one of three rare the other two have to
         carry everything, and there are only two of them. */
      await project(page, { layers: ['ears', 'unsorted'], traits: [
        { n: 'a', l: 'ears' }, { n: 'b', l: 'ears' }, { n: 'c', l: 'ears' }] });
      await drag(page, 'ears', 0, 'rare', true);
      await page.waitForTimeout(500);
      const pct = await page.evaluate(async () => {
        const items = await dbAll();
        return traitChance(items.find(i => i.name === 'a'), items, false).pct * 100;
      });
      expect(pct, 'as rare as three traits go').toBeGreaterThan(0.5);
      expect(pct).toBeLessThan(0.8);
    });

  test('and dragging the other way makes it commoner', async ({ page }) => {
    /* THE CONTROL. Without it, "always go down" passes the test above and the
       slider is a one-way switch. */
    await project(page, SET);
    await drag(page, 'eyes', 0, 'common');
    const g = await readGroup(page, 'eyes');
    /* Was "greater than 20", which the widened ceiling made slack: the
       commonest a trait can be went from 26% of its set to 71%, so a mutation
       that halved every displayed share still cleared 20 and the test stopped
       seeing it. Pinned against what the store can actually reach now. */
    expect(parseFloat(g.rows[0].pct), 'much commoner than an even 4.8%')
      .toBeGreaterThan(50);
  });

  test('moving one moves everything else, and the set still totals 100%',
    async ({ page }) => {
      /* This is what "adds up to 100% automatically" looks like: no sibling
         weight is written, but every sibling's SHARE changes, because the
         denominator did. */
      await project(page, SET);
      await drag(page, 'eyes', 0, 'rare');
      const g = await readGroup(page, 'eyes');
      expect(g.rows[0].pct, 'the one that moved').toBe('0.10%');
      const others = g.rows.slice(1).map(r => r.pct);
      expect(new Set(others).size, 'the other twenty all moved together').toBe(1);
      expect(parseFloat(others[0]), 'and upward, because the total is fixed')
        .toBeGreaterThan(4.8);
    });

  test('the thumb never rests on a weight the store cannot hold',
    async ({ page }) => {
      /* The store is 98 integers and the track is 20,000 positions, so most
         positions round to a weight some neighbour also reaches. Without the
         snap the thumb sits where the collection cannot be, and lets go onto a
         different number than it showed. Dragged to the very end and checked
         that it came back to the reachable edge. */
      await project(page, SET);
      const at = await drag(page, 'eyes', 0, 'rare');
      expect(at, 'pulled short of the end of the track').toBeLessThan(20000);
      expect(at, 'but past the even mark, because it is rarer').toBeGreaterThan(
        await page.evaluate(() => posOfMult(1, 21)));
    });

  test('letting go writes the weight, and plans the siblings it needed to',
    async ({ page }) => {
      await project(page, SET);
      await drag(page, 'eyes', 0, 'rare', true);
      await page.waitForTimeout(500);
      const r = await page.evaluate(async () => {
        const items = (await dbAll()).filter(i => i.kind === 'trait');
        const w = {};
        for (const t of items) w[t.name] = t.rarity;
        return { weights: w, planned: items.filter(rarityPlanned).length,
          count: $('plancount').textContent,
          toast: ($('toast') || {}).textContent || '' };
      });
      expect(r.weights.e0, 'the one dragged is at the floor').toBe(2);
      expect(r.weights.e1, 'and the siblings were planted at normal').toBe(100);
      expect(r.planned, 'all twenty-one are planned now').toBe(21);
      expect(r.count).toBe('Every trait has a rarity.');
      expect(r.toast, 'and it said what else it did').toContain('Planned the other 20');
    });

  test('the tile on the shelf agrees with the slider', async ({ page }) => {
    /* Two controls over one field must not disagree. The number box on the
       tile and the slider write the same record through the same function. */
    await project(page, SET);
    await drag(page, 'eyes', 0, 'rare', true);
    await page.waitForTimeout(500);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('.item')].map(el => ({
        name: (el.querySelector('.nm') || el.querySelector('.name') || {}).textContent || el.title,
        rar: (el.querySelector('.rar') || {}).value })).filter(x => x.rar));
    const mine = boxes.find(b => (b.name || '').indexOf('e0') >= 0);
    expect(mine, 'the tile for the trait that was dragged').toBeTruthy();
    expect(mine.rar, 'shows the weight the slider stored').toBe('2');
  });

  test('rendering and letting go without moving writes nothing',
    async ({ page }) => {
      /* Otherwise the section rewrites the collection just by being looked at.

         THE WEIGHTS HERE SPAN THE WHOLE STORE, 2 to 5000, ON PURPOSE. They
         used to stop at 90, which is the region where the round trip inverts
         exactly - so this passed on the arithmetic and never touched the
         guard. Widening the ceiling put 4,999 weights on the same track and
         neighbours near the common end now share a position, so the trip can
         come back one off. A release compares the thumb against the position
         the row was DRAWN at instead, which is exact whatever the arithmetic
         does at the ends, and these fixtures are what exercise it. */
      await project(page, { layers: ['eyes', 'unsorted'],
        traits: EYES(21).map((t, i) => ({ ...t, r: 2 + Math.round(i * 4998 / 20) })) });
      const before = await page.evaluate(async () =>
        (await dbAll()).filter(i => i.kind === 'trait')
          .map(t => t.name + ':' + t.rarity).sort().join(','));
      await page.evaluate(() => {
        for (const sl of document.querySelectorAll('#planbody .prow input[type=range]'))
          sl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(700);
      const after = await page.evaluate(async () =>
        (await dbAll()).filter(i => i.kind === 'trait')
          .map(t => t.name + ':' + t.rarity).sort().join(','));
      expect(after, 'not one weight moved').toBe(before);
    });

  test('a set of one says so and has nothing to drag', async ({ page }) => {
    /* back-extras really does hold exactly one trait. It is drawn every time
       the set appears whatever any slider says, and the track has no length. */
    await project(page, { layers: ['back-extras', 'unsorted'],
      traits: [{ n: 'only', l: 'back-extras' }] });
    const g = await readGroup(page, 'back-extras');
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].disabled, 'nothing to drag').toBe(true);
    expect(g.rows[0].pct).toBe('100%');
    expect(g.rows[0].say).toContain('the only one');
  });

  test('the plan is the population the generator draws from, and no other',
    async ({ page }) => {
      /* A share computed over traits the generator would not draw is a
         confident wrong answer, and it is wrong by exactly the traits somebody
         is most likely to be staring at. traitEligible is asked rather than
         copied, so this cannot drift from buildCompose. */
      await project(page, { layers: ['eyes', 'unsorted'], traits: [
        { n: 'ok1', l: 'eyes' }, { n: 'ok2', l: 'eyes' },
        { n: 'binned', l: 'eyes', st: 'rejected' },
        { n: 'draft', l: 'eyes', st: 'wip' }] });
      const g = await readGroup(page, 'eyes');
      expect(g.rows.map(r => r.name).sort(), 'only what would be drawn')
        .toEqual(['ok1', 'ok2']);
      expect(await page.evaluate(() => $('plancount').textContent))
        .toContain('0 of 2 set');
    });

  test('and it follows the include-wip box, both ways', async ({ page }) => {
    // The control for the one above: the population is a live rule, not a filter
    // written once at render.
    await project(page, { wip: true, layers: ['eyes', 'unsorted'], traits: [
      { n: 'ok1', l: 'eyes' }, { n: 'draft', l: 'eyes', st: 'wip' }] });
    const g = await readGroup(page, 'eyes');
    expect(g.rows.map(r => r.name).sort()).toEqual(['draft', 'ok1']);
  });

  test('a set that is turned off cannot hold up the project', async ({ page }) => {
    /* Nothing in a hidden set is drawn, so nothing in it can be missing from a
       plan - the same population rule again. It is still shown, because
       planning a set before turning it on is reasonable and hiding it would
       read as data loss. */
    await project(page, { layers: ['eyes', 'hats', 'unsorted'], hidden: ['hats'],
      traits: [{ n: 'a', l: 'eyes', r: 14 }, { n: 'b', l: 'eyes', r: 14 },
        { n: 'h1', l: 'hats' }, { n: 'h2', l: 'hats' }] });
    expect(await page.evaluate(() => $('plancount').textContent))
      .toBe('Every trait has a rarity.');
    const g = await readGroup(page, 'hats');
    expect(g, 'the set is still on screen').toBeTruthy();
    expect(g.head.join(' '), 'and says why it is not counted').toContain('turned off');
  });

  test('the end of the track says what to do to go further', async ({ page }) => {
    /* The thumb stops before the track does, because the limit is the
       database's column reached against wherever the siblings are. Silent,
       that reads as a broken control. */
    await project(page, SET);
    await drag(page, 'eyes', 0, 'rare');
    const g = await readGroup(page, 'eyes');
    expect(g.rows[0].say).toContain('as rare as it goes here');
    expect(g.rows[0].say).toContain('make another one commoner');
  });

  test('and Download all says it too, because that is the finish',
    async ({ page }) => {
      /* Plan rarity is folded by default - 271 sliders opening themselves over
         the shelf on every load is the panel burying its own tail - so
         somebody who adds a trait and goes straight to the download would
         never be told. This is the zip that goes to the mint. */
      await project(page, SET);
      const said = await page.evaluate(async () => {
        const realZip = zip, realCreate = URL.createObjectURL;
        const realClick = HTMLAnchorElement.prototype.click, realToast = window.toast;
        const out = [];
        zip = () => new Blob([]);
        URL.createObjectURL = () => 'blob:stub';
        HTMLAnchorElement.prototype.click = function () {};
        window.toast = (m) => { out.push(m); };
        try { await $('dlzip').onclick(); await new Promise(r => setTimeout(r, 400)); }
        finally { zip = realZip; URL.createObjectURL = realCreate;
          HTMLAnchorElement.prototype.click = realClick; window.toast = realToast; }
        return out.join(' | ');
      });
      expect(said, 'it still reports the download').toContain('21 traits');
      expect(said, 'and what is left to do').toContain('21 traits still need a rarity');
      expect(said, 'and where to do it').toContain('Plan rarity');
    });

  test('and stops saying it once they are all set', async ({ page }) => {
    // A CONTROL. A line on every download stops being read long before it
    // meets the one that mattered.
    await project(page, { layers: ['eyes', 'unsorted'],
      traits: EYES(21).map(t => ({ ...t, r: 14 })) });
    const said = await page.evaluate(async () => {
      const realZip = zip, realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click, realToast = window.toast;
      const out = [];
      zip = () => new Blob([]);
      URL.createObjectURL = () => 'blob:stub';
      HTMLAnchorElement.prototype.click = function () {};
      window.toast = (m) => { out.push(m); };
      try { await $('dlzip').onclick(); await new Promise(r => setTimeout(r, 400)); }
      finally { zip = realZip; URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick; window.toast = realToast; }
      return out.join(' | ');
    });
    expect(said).toContain('21 traits');
    expect(said, 'nothing left to say about rarity').not.toContain('need a rarity');
  });

  test('one press sets everything that is still unplanned', async ({ page }) => {
    /* The way "271 to go" becomes a finished project when the owner is happy
       for a set to be even - and it really does change nothing, which the
       toast says because a button that rewrites every record should say what
       it did not do as well. */
    await project(page, SET);
    const before = await readGroup(page, 'eyes');
    await page.evaluate(() => $('planseedall').click());
    await page.waitForTimeout(900);
    const after = await readGroup(page, 'eyes');
    expect(await page.evaluate(() => $('plancount').textContent))
      .toBe('Every trait has a rarity.');
    expect(after.rows.map(r => r.pct), 'and every share is where it was')
      .toEqual(before.rows.map(r => r.pct));
    expect(await page.evaluate(() => ($('toast') || {}).textContent || ''))
      .toContain('Nothing about the collection changed');
  });
});
