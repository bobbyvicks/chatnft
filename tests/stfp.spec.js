/* STFP: THE TRAITS THAT ARE THE FINAL PROJECT.

   "rn we have a wip accepted and rejected i want a 'STFP' and thats a save to
   final project category and its going to be our final project traits"

   A fourth status. wip is being worked on, approved has been looked at and
   passed, rejected is out, and stfp is the set that ships.

   approved was tested in four separate places with four copies of
   st==="approved" - drawn onto a character, used by the generator, sampled
   for the collection palette, packaged by the export. Four literals is four
   chances for a new status to be a member of some and not others, which
   nobody notices until a sheet generates without a hat in it. One function
   answers it for all of them now.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof inCollection === 'function');
};

/* One trait per status, so every gate has something to say yes and no to. */
const shelfOfEach = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  await dbClear();
  const mk = async (name, status) => {
    const S = 64, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#8b5fbf'; g.fillRect(0, 0, S, S);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    await dbPut({ id: 't_' + name + '_hats_' + status, kind: 'trait',
      name, layer: 'hats', status, blob, w: S, h: S, at: Date.now() });
  };
  await mk('Crown', 'stfp');
  await mk('Cap', 'approved');
  await mk('Draft', 'wip');
  await mk('Bad', 'rejected');
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 400));
});

test('AN STFP TRAIT IS A MEMBER OF THE COLLECTION', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => ({
    stfp: inCollection('stfp'), approved: inCollection('approved'),
    wip: inCollection('wip'), rejected: inCollection('rejected'),
    /* A record saved before statuses existed has none at all. */
    missing: inCollection(undefined),
  }));
  expect(r.stfp, 'the final set ships').toBe(true);
  expect(r.approved, 'and approved still does').toBe(true);
  /* THE CONTROL. A version that answered true for everything would pass the
     line above and would put rejected traits in the collection. */
  expect(r.wip, 'wip is the caller\'s decision, not a member by itself').toBe(false);
  expect(r.rejected, 'and rejected never is').toBe(false);
  expect(r.missing, 'nor is a record with no status at all').toBe(false);
});

test('and every gate goes through that one answer', async ({ page }) => {
  await ready(page);
  await shelfOfEach(page);
  const r = await page.evaluate(async () => {
    const items = await dbAll();
    const by = (n) => items.find(i => i.name === n);
    return {
      stfp: traitEligible(by('Crown'), false),
      approved: traitEligible(by('Cap'), false),
      wip: traitEligible(by('Draft'), false),
      wipIncluded: traitEligible(by('Draft'), true),
      rejected: traitEligible(by('Bad'), false),
      rejectedIncluded: traitEligible(by('Bad'), true),
      packaged: items.filter(i => i.kind === 'trait' && inCollection(i.status))
        .map(i => i.name).sort(),
      held: items.filter(i => i.kind === 'trait' && !inCollection(i.status))
        .map(i => i.name).sort(),
    };
  });
  /* The generator: stfp and approved are candidates, wip only when the
     checkbox says so, rejected never - not even then. */
  expect(r.stfp).toBe(true);
  expect(r.approved).toBe(true);
  expect(r.wip).toBe(false);
  expect(r.wipIncluded, 'the checkbox widens it to wip').toBe(true);
  expect(r.rejected).toBe(false);
  expect(r.rejectedIncluded, 'and never to rejected').toBe(false);
  /* The export packages both members and holds back the rest, named. */
  expect(r.packaged).toEqual(['Cap', 'Crown']);
  expect(r.held).toEqual(['Bad', 'Draft']);
});

test('THE SHELF CYCLE REACHES IT', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    try { authed = true; } catch (_) {}
    gateShow(false);
    activeWs = null;
    await dbClear();
    const S = 64, c = document.createElement('canvas');
    c.width = S; c.height = S;
    c.getContext('2d').fillRect(0, 0, S, S);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    await dbPut({ id: 't_Crown_hats_wip', kind: 'trait', name: 'Crown',
      layer: 'hats', status: 'wip', blob, w: S, h: S, at: Date.now() });
    await dbPut({ id: 'settings.layers', kind: 'settings',
      layers: ['hats', 'unsorted'], hidden: [], at: 1 });
    await renderShelf();
    await new Promise(r => setTimeout(r, 400));
  });
  const seen = await page.evaluate(async () => {
    const realToast = window.toast;
    window.toast = () => {};
    const out = [];
    try {
      for (let i = 0; i < 5; i++) {
        const cyc = document.querySelector('#projbody .cyc');
        if (!cyc) { out.push('gone'); break; }
        out.push(cyc.textContent);
        cyc.click();
        await new Promise(r => setTimeout(r, 350));
      }
    } finally { window.toast = realToast; }
    return out;
  });
  /* THE ONE A FOURTH STATE BREAKS. The cycle stepped by a hard-coded 3, so
     adding a state would have made the last one unreachable - you could never
     click to it and nothing would say why. */
  expect(seen).toEqual(['wip', 'approved', 'stfp', 'rejected', 'wip']);
});

test('and it can be set and filtered to', async ({ page }) => {
  await ready(page);
  await shelfOfEach(page);
  const r = await page.evaluate(async () => {
    const chip = document.querySelector('#tstatus [data-v="stfp"]');
    const filt = document.querySelector('.mini.filt[data-f="stfp"]');
    filt.click();
    await new Promise(r2 => setTimeout(r2, 400));
    const shown = [...document.querySelectorAll('#projbody .item')]
      .map(e => e.title || '').join(' ');
    return { chip: !!chip, filt: !!filt, shown,
      statuses: STATUSES.slice().sort() };
  });
  expect(r.chip, 'the editor can set it').toBe(true);
  expect(r.filt, 'and the shelf can filter to it').toBe(true);
  expect(r.shown, 'which shows the stfp trait').toContain('Crown');
  expect(r.shown, 'and not the others').not.toContain('Cap');
  /* A folder named stfp imports as one, the way an approved folder does. */
  expect(r.statuses).toEqual(['approved', 'rejected', 'stfp', 'wip']);
});
