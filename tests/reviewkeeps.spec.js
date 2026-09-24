/* A REVIEW PASS KEEPS ITS ANSWERS, AND A STEP READS ONE TRAIT.

   RUN AGAINST THE PAGE BEFORE THE FIX: the first test went red with the
   answers gone after loading the same queue again, the second with a queue
   for another revision replacing a pass that held answers without asking,
   and the fourth with a whole-project read on every step. The third and
   fifth are controls: a new revision accepted still starts a new pass, and
   a trait renamed since the import is still found. */
import { test, expect } from '@playwright/test';

/* Two traits and a small queue naming them, in the shape the real file uses. */
const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 16, 16);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  for (const [n, l, v] of [['Backrooms Hallway', 'backgrounds', 80],
    ['Punk Eyes', 'eyes', 140]])
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n,
      layer: l, status: 'approved', blob: await png(v), w: 16, h: 16, at: 1 });
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['backgrounds', 'eyes', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
});

const QUEUE = {
  schemaVersion: 1, collectionRevision: 'strict-fit-v11',
  activeTraitId: 'trait-aaa',
  order: ['backgrounds', 'eyes'],
  traits: [
    { id: 'trait-aaa', sequence: 1, layer: 'backgrounds',
      originalName: 'Backrooms Hallway.png', currentName: 'Backrooms Hallway.png',
      finalName: null, width: 1280, height: 1280,
      reviewStatus: 'in_review', artworkAccepted: false, nameAccepted: false },
    { id: 'trait-bbb', sequence: 2, layer: 'eyes',
      originalName: 'Punk Eyes.png', currentName: 'Punk Eyes.png',
      finalName: null, width: 1280, height: 1280,
      reviewStatus: 'pending', artworkAccepted: false, nameAccepted: false },
    { id: 'trait-ccc', sequence: 3, layer: 'hats',
      originalName: 'Missing Cap.png', currentName: 'Missing Cap.png',
      finalName: null, reviewStatus: 'pending',
      artworkAccepted: false, nameAccepted: false },
  ],
};

const load = (page, doc) => page.evaluate(async (d) => {
  const f = new File([JSON.stringify(d)], 'review-queue.json',
    { type: 'application/json' });
  const ok = await importReviewQueue(f);
  await renderReview();
  return { ok, note: document.getElementById('reviewnote').textContent };
}, doc);


const answer = (page) => page.evaluate(async () => {
  REVIEW.entries[0].artworkAccepted = true;
  REVIEW.entries[1].skipped = true;
  REVIEW.activeId = 'trait-bbb';
  await saveReview();
});
const states = (page) => page.evaluate(() => ({ rev: REVIEW.revision, active: REVIEW.activeId,
  marks: REVIEW.entries.map(e => (e.artworkAccepted ? 'a' : '-') + (e.nameAccepted ? 'n' : '-') + (e.skipped ? 's' : '-')) }));

test.describe('a review pass', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof importReviewQueue === 'function');
    await seed(page);
    await load(page, QUEUE);
  });

  test('LOADING THE SAME QUEUE AGAIN keeps the answers and the place', async ({ page }) => {
    await answer(page);
    await load(page, QUEUE);
    const r = await states(page);
    console.log('same: ' + JSON.stringify(r));
    expect(r).toEqual({ rev: 'strict-fit-v11', active: 'trait-bbb', marks: ['a--', '--s', '---'] });
  });

  test('A QUEUE FOR ANOTHER REVISION asks before it replaces a pass with answers, and keeps it on no', async ({ page }) => {
    await answer(page);
    const asked = [];
    page.once('dialog', d => { asked.push(d.message()); d.dismiss(); });
    await load(page, Object.assign({}, QUEUE, { collectionRevision: 'strict-fit-v12' }));
    const r = await states(page);
    expect(asked.join(' ')).toContain('2 answers');
    expect(r.rev).toBe('strict-fit-v11');
    expect(r.marks).toEqual(['a--', '--s', '---']);
  });

  test('the control: another revision, accepted, starts a new pass', async ({ page }) => {
    await answer(page);
    page.once('dialog', d => d.accept());
    await load(page, Object.assign({}, QUEUE, { collectionRevision: 'strict-fit-v12' }));
    const r = await states(page);
    expect(r.rev).toBe('strict-fit-v12');
    expect(r.marks).toEqual(['---', '---', '---']);
  });

  test('A STEP THROUGH THE QUEUE reads the trait it names, not the whole project', async ({ page }) => {
    const r = await page.evaluate(async () => {
      let whole = 0; const real = dbAll;
      dbAll = async () => { whole++; return real(); };
      try {
        const a = await traitForEntry(REVIEW.entries[0]);
        const b = await traitForEntry(REVIEW.entries[1]);
        return { whole, a: a && a.name, b: b && b.name };
      } finally { dbAll = real; }
    });
    console.log('step: ' + JSON.stringify(r));
    expect(r).toEqual({ whole: 0, a: 'Backrooms Hallway', b: 'Punk Eyes' });
  });

  test('the control: a trait renamed since the import is still found', async ({ page }) => {
    const name = await page.evaluate(async () => {
      const t = await dbGet('t_Backrooms Hallway_backgrounds_approved');
      await dbDel(t.id);
      await dbPut(Object.assign({}, t, { id: 't_Hallway Two_backgrounds_approved', name: 'Hallway Two' }));
      const got = await traitForEntry(REVIEW.entries[0]);
      return got && got.name;
    });
    expect(name).toBe('Hallway Two');
  });
});
