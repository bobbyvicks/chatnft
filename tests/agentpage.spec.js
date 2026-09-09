/* The Agent page: collection-wide questions, asked once.

   Everything else in this site works on one trait. Every question that is
   actually blocking the launch is about all 317 at once, and neither agent
   working on this collection could ask one through the app - so both kept
   answering them in throwaway scripts, and the answers kept landing as files
   on a disk instead of as something the owner can press.

   TWO AUDIENCES, ONE ANSWER, and that is the property these tests are mostly
   about: PB.grids() and the Grid census button must not be able to disagree.
   An agent-only tool is a tool nobody can check.

   The fixture is a small collection with a known shape: three traits drawn at
   10px blocks, one at 8px, and one carrying a colour nothing else uses. Those
   are the two real findings from the actual 317 - two incompatible grids, and
   colour drift that is invisible one trait at a time.
*/
import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers.js';

/* Paints a trait of `block`-sized cells in `shade`, optionally with one stray
   pixel of another colour - the shape drift takes. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const make = async (block, shade, stray) => {
    const S = 80;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    const across = S / block;
    for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
      /* Diagonal stripes of three shades so the blocks join into real regions
         and the period is measurable. */
      const v = shade + ((bx + by) % 3) * 30;
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      g.fillRect(bx * block, by * block, block, block);
    }
    if (stray) { g.fillStyle = stray; g.fillRect(40, 40, 1, 1); }
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const put = async (name, layer, blob) => dbPut({
    id: 't_' + name + '_' + layer + '_approved', kind: 'trait', name, layer,
    status: 'approved', blob, w: 80, h: 80, at: 1 });
  await put('ten-a', 'hats', await make(10, 40));
  await put('ten-b', 'hats', await make(10, 40));
  await put('ten-c', 'hair', await make(10, 40));
  await put('eight-a', 'skins', await make(8, 40));
  /* The drifted one: same picture as ten-a plus a colour nothing else has. */
  await put('drifted', 'eyes', await make(10, 40, '#2b0000'));
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['hats', 'hair', 'skins', 'eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

test.describe('the agent page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof PB === 'object' && PB && PB.version);
    await seed(page);
  });

  test('IS A PAGE, AND ONLY ON ITS OWN PAGE', async ({ page }) => {
    const tall = () => page.evaluate(() =>
      document.querySelector('.pg-agent').getBoundingClientRect().height > 0);
    await gotoPage(page, 'home');
    expect(await tall(), 'not on the main page').toBe(false);
    await gotoPage(page, 'project');
    expect(await tall(), 'nor the project').toBe(false);
    await gotoPage(page, 'settings');
    expect(await tall(), 'nor settings').toBe(false);
    await page.evaluate(() => showPage('agent', true));
    await page.waitForTimeout(150);
    expect(await tall(), 'here').toBe(true);
    expect(await page.evaluate(() => location.hash), 'and it has an address')
      .toBe('#/agent');
  });

  test('and the other pages are not on it', async ({ page }) => {
    /* The pairing is what stops a section turning up somewhere nobody meant. */
    await page.evaluate(() => showPage('agent', true));
    await page.waitForTimeout(150);
    const heights = await page.evaluate(() => ({
      home: document.querySelector('.pg-home').getBoundingClientRect().height,
      project: document.getElementById('proj').getBoundingClientRect().height,
    }));
    expect(heights.home).toBe(0);
    expect(heights.project).toBe(0);
  });

  test('THE GRID CENSUS FINDS THE TWO GRIDS', async ({ page }) => {
    /* The real finding it exists for: every skin is on one grid and almost
       everything else is on another, which nothing in the app could say
       because nothing in the app had looked at more than one trait. */
    const r = await page.evaluate(() => PB.grids());
    expect(r.traits).toBe(5);
    expect(r.byBlock['10'], 'four drawn at ten').toBe(4);
    expect(r.byBlock['8'], 'and the skin at eight').toBe(1);
    expect(r.onTen).toBe(4);
    expect(r.onEight).toBe(1);
    expect(r.run.done).toBe(5);
    expect(r.run.skipped).toEqual([]);
  });

  test('and it names the trait that does not keep to its own grid',
    async ({ page }) => {
      /* A stray pixel puts one cell off the grid the rest of the trait keeps.
         Naming which trait is the difference between a number and a repair. */
      const r = await page.evaluate(() => PB.grids());
      expect(r.drifted.length, 'exactly the one with the stray in it').toBe(1);
      expect(r.drifted[0].trait).toBe('eyes/drifted');
      expect(r.drifted[0].block).toBe(10);
      expect(r.drifted[0].share).toBeLessThan(1);
      expect(r.drifted[0].offGrid).toBe(1);
    });

  test('AND IT SAYS WHICH MEASUREMENTS TO BELIEVE', async ({ page }) => {
    /* FOUND BY RUNNING IT ON REAL TRAITS. measuredBlock estimates a period
       from the transitions and rounds it, so on the real collection eyes/
       Basic Blue Eyes came back as 11px on a 1280 canvas - and 11 tiles 1280
       no times at all. The estimate is left alone because the brush depends
       on it and it is right about the shape; what the census adds is whether
       the number can be taken literally, because a report that prints 11px
       bare invites somebody to tidy onto a grid that cannot exist. */
    const r = await page.evaluate(async () => {
      /* A canvas of 81, so a measured 10 cannot divide it. */
      const S = 81, block = 10;
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d');
      for (let by = 0; by * block < S; by++) for (let bx = 0; bx * block < S; bx++) {
        const v = 40 + ((bx + by) % 3) * 30;
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        g.fillRect(bx * block, by * block, block, block);
      }
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await dbPut({ id: 't_odd_hats_approved', kind: 'trait', name: 'odd',
        layer: 'hats', status: 'approved', blob, w: S, h: S, at: 1 });
      return PB.grids();
    });
    const odd = r.rows.find(x => x.name === 'odd');
    expect(odd, 'the odd one is in the rows').toBeTruthy();
    expect(odd.divides, 'its block does not tile its canvas').toBe(false);
    expect(r.oddBlocks.map(o => o.trait), 'and it is collected as such')
      .toContain('hats/odd');
    /* And the ones that do fit are not swept up with it. */
    const fine = r.rows.filter(x => x.name !== 'odd');
    expect(fine.every(x => x.divides), 'the 80px traits all tile evenly').toBe(true);
  });

  test('THE COLOUR CENSUS PUTS THE DRIFT FIRST', async ({ page }) => {
    /* A colour used by one trait for one pixel is what mis-picked shades and
       anti-alias residue look like. Sorted rarest-first so they are not buried
       under the blacks, and carrying the trait names so it can be acted on. */
    const r = await page.evaluate(() => PB.colours());
    expect(r.rarest[0].hex, 'the one nothing else uses').toBe('#2b0000');
    expect(r.rarest[0].pixels).toBe(1);
    expect(r.rarest[0].traits, 'in exactly one trait').toBe(1);
    expect(r.rarest[0].where, 'and it says which').toEqual(['eyes/drifted']);
    expect(r.inOneTrait).toBe(1);
    expect(r.commonest[0].pixels, 'and the common ones are far bigger')
      .toBeGreaterThan(100);
  });

  test('AND THE BUTTON GIVES THE SAME ANSWER AS THE CALL', async ({ page }) => {
    /* THE ONE THAT MATTERS MOST. Two audiences and one answer: an agent-only
       tool is a tool the owner cannot check, and a page that reports something
       different from what the function returned is worse than no page. */
    const called = await page.evaluate(() => PB.grids());
    await page.evaluate(() => showPage('agent', true));
    await page.waitForTimeout(120);
    await page.click('#aggrids');
    await page.waitForFunction(() => PB.last && PB.last.job === 'grids' && !PB.busy);
    const shown = await page.evaluate(() => ({
      status: document.getElementById('agstatus').textContent,
      body: document.getElementById('agout').textContent,
      last: PB.last,
    }));
    expect(shown.last.byBlock).toEqual(called.byBlock);
    expect(shown.last.drifted).toEqual(called.drifted);
    expect(shown.status, 'and the summary says the same thing')
      .toContain('10px x4');
    expect(shown.status).toContain('1 drawn on a grid they do not keep to');
    expect(shown.body, 'the page shows the data, not a paraphrase')
      .toContain('"job": "grids"');
  });

  test('the answer can be downloaded, and not before there is one',
    async ({ page }) => {
      await page.evaluate(() => showPage('agent', true));
      await page.waitForTimeout(120);
      expect(await page.evaluate(() =>
        document.getElementById('agsave').disabled), 'nothing to save yet').toBe(true);
      await page.click('#agcolours');
      await page.waitForFunction(() => PB.last && !PB.busy);
      expect(await page.evaluate(() =>
        document.getElementById('agsave').disabled)).toBe(false);
    });

  test('two jobs cannot run at once', async ({ page }) => {
    /* They share a canvas and a progress line; the second would report the
       first's numbers under its own name. */
    const err = await page.evaluate(async () => {
      const first = PB.grids();
      let msg = 'no error';
      try { await PB.colours(); } catch (e) { msg = e.message; }
      await first;
      return msg;
    });
    expect(err).toContain('already running');
  });

  test('AND A TRAIT THAT WILL NOT DECODE IS SKIPPED, NOT FATAL',
    async ({ page }) => {
      /* One bad record among 317 must not take the whole sweep with it - and
         it has to be named, because a run that quietly did 316 reads as a run
         that did all of them. */
      await page.evaluate(async () => {
        await dbPut({ id: 't_broken_hats_approved', kind: 'trait', name: 'broken',
          layer: 'hats', status: 'approved',
          blob: new Blob(['not a png'], { type: 'image/png' }),
          w: 80, h: 80, at: 1 });
      });
      const r = await page.evaluate(() => PB.grids());
      expect(r.run.total, 'it was counted').toBe(6);
      expect(r.run.skipped, 'and named').toEqual(['hats/broken']);
      expect(r.traits, 'the other five still answered').toBe(5);
    });

  test('and the surface says what it offers', async ({ page }) => {
    /* The point of a named surface is that an agent can depend on it. If the
       jobs list and the functions disagree, it cannot. */
    const s = await page.evaluate(() => ({
      version: PB.version,
      jobs: PB.jobs,
      real: PB.jobs.filter(j => typeof PB[j] === 'function'),
    }));
    expect(s.version).toBe(1);
    expect(s.jobs.length).toBeGreaterThan(0);
    expect(s.real, 'every job named is a job that exists').toEqual(s.jobs);
  });
});
