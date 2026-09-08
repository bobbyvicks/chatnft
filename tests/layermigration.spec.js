/* Migrating the collection onto v11's fourteen layers.

   The live collection carries SEVENTEEN layer names - both the old vocabulary
   (accessories, hair-headwear, unsorted) and v11's (hats, hair, glasses,
   back-extras). v11 wants fourteen, in a stated back-to-front order.

   Almost none of this needed building. Sort by inventory already dry-runs a
   per-trait list, refuses a destination that holds that name, creates missing
   layers, moves the server copy and retargets the rules. applyPaintOrder sets
   the order. What was missing is that planSort opens with

     if(!Array.isArray(inventory)) throw new Error("That file is not a trait inventory.")

   and NEITHER file the handoff ships is an array - so the one gesture that
   could move 317 traits to their v11 layers refused both of the files that say
   where those traits belong.

   THE ORDERING TEST IS THE ONE THAT CATCHES THE SUBTLE BUG. sortApply is what
   CREATES the layers a file names, so applying the paint order before it would
   silently skip every new layer - applyPaintOrder only orders layers that
   already exist. Running it after is not a preference; running it before
   quietly does a third of the job.
*/
import { test, expect } from '@playwright/test';

const V11 = ['backgrounds', 'back-extras', 'skins', 'mouth', 'eyes', 'glasses',
  'ears', 'clothing', 'chains', 'costumes', 'extras', 'masks', 'hair', 'hats'];

/* A project in the OLD vocabulary: traits sitting on accessories and
   hair-headwear, which v11 does not have. */
const seedOld = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 8, 8);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const put = async (n, l, v) => dbPut({ id: 't_' + n + '_' + l + '_approved',
    kind: 'trait', name: n, layer: l, status: 'approved', blob: await png(v),
    w: 8, h: 8, at: 1 });
  await put('Gold Chain', 'accessories', 60);
  await put('Dark Fringe', 'hair-headwear', 90);
  await put('Punk Eyes', 'eyes', 120);
  await put('Sky', 'backgrounds', 150);
  LAYERS = ['backgrounds', 'accessories', 'hair-headwear', 'eyes', 'unsorted'];
  await saveLayers();
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
  return LAYERS.slice();
});

/* Drives the real Sort by inventory flow with a parsed document. */
const sortWith = (page, doc) => page.evaluate(async (d) => {
  let items = []; try { items = await dbAll(); } catch (_) {}
  sortOrder = (d && Array.isArray(d.order)) ? d.order.map(String) : null;
  sortPlan = planSort(items.filter(i => i.kind === 'trait'), asInventory(d));
  const plan = { move: sortPlan.move.length, both: sortPlan.both.length,
    settled: sortPlan.settled.length, unknown: sortPlan.unknown.length };
  document.getElementById('sortgo').click();
  await new Promise(r => setTimeout(r, 900));
  const traits = (await dbAll()).filter(i => i.kind === 'trait');
  return { plan, layers: LAYERS.slice(),
    placed: traits.map(t => t.layer + '/' + t.name).sort(),
    note: document.getElementById('bulknote').textContent };
}, doc);

/* The collection-object shape: names is {layer: [file names]}. */
const COLLECTION = {
  revision: 'strict-fit-v11', order: V11, rules: [],
  names: {
    backgrounds: ['Sky.png'],
    eyes: ['Punk Eyes.png'],
    chains: ['Gold Chain.png'],
    hair: ['Dark Fringe.png'],
  },
};

test.describe('moving the collection onto the v11 layers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof asInventory === 'function');
    await seedOld(page);
  });

  test('THE COLLECTION FILE IS ACCEPTED AT ALL', async ({ page }) => {
    /* It was not: planSort throws on anything that is not an array, and the
       file the trait records ship is an object. */
    const shape = await page.evaluate((d) => {
      const inv = asInventory(d);
      return { isArray: Array.isArray(inv), n: inv.length, first: inv[0] };
    }, COLLECTION);
    expect(shape.isArray).toBe(true);
    expect(shape.n).toBe(4);
    expect(shape.first).toEqual({ layer: 'backgrounds', trait: 'Sky.png' });
  });

  test('and it moves the old layers onto the new ones', async ({ page }) => {
    const r = await sortWith(page, COLLECTION);
    expect(r.plan.move, 'two traits are on layers v11 does not have').toBe(2);
    expect(r.placed).toEqual(['backgrounds/Sky', 'chains/Gold Chain',
      'eyes/Punk Eyes', 'hair/Dark Fringe']);
  });

  test('AND THE PAINT ORDER LANDS ON THE LAYERS IT JUST CREATED',
    async ({ page }) => {
      /* THE SUBTLE ONE. sortApply creates chains and hair; applyPaintOrder
         only orders layers that exist. Applying the order first would skip
         both and leave the migration two thirds done, looking finished. */
      const r = await sortWith(page, COLLECTION);
      const idx = n => r.layers.indexOf(n);
      expect(idx('chains'), 'the layer it created is in the order').toBeGreaterThan(-1);
      expect(idx('hair')).toBeGreaterThan(-1);
      expect(idx('backgrounds') < idx('eyes'), 'backgrounds behind eyes').toBe(true);
      expect(idx('eyes') < idx('chains'), 'eyes behind chains').toBe(true);
      expect(idx('chains') < idx('hair'), 'chains behind hair').toBe(true);
      expect(r.note).toContain('the paint order is now the file');
    });

  test('and it names the layers left holding nothing', async ({ page }) => {
    /* The visible half of a migration: these are what the old vocabulary left
       behind, and Layers is where they go. */
    const r = await sortWith(page, COLLECTION);
    expect(r.note).toContain('now hold nothing');
    expect(r.note).toContain('accessories');
    expect(r.note).toContain('hair-headwear');
  });

  test('the review queue works as an inventory too', async ({ page }) => {
    /* The other shape the handoff ships. Its originalName is planSort's
       previousName, which is how a trait renamed since the queue was seeded
       still gets found rather than reading as unknown. */
    const QUEUE = { collectionRevision: 'strict-fit-v11', order: V11, traits: [
      { id: 'a', sequence: 1, layer: 'chains', originalName: 'Gold Chain.png',
        currentName: 'Gold Chain.png' },
      { id: 'b', sequence: 2, layer: 'hair', originalName: 'Dark Fringe.png',
        currentName: 'Dark Fringe.png' },
    ] };
    const inv = await page.evaluate(d => asInventory(d), QUEUE);
    expect(inv).toEqual([
      { layer: 'chains', trait: 'Gold Chain.png', previousName: 'Gold Chain.png' },
      { layer: 'hair', trait: 'Dark Fringe.png', previousName: 'Dark Fringe.png' },
    ]);
    const r = await sortWith(page, QUEUE);
    expect(r.placed).toContain('chains/Gold Chain');
    expect(r.placed).toContain('hair/Dark Fringe');
  });

  test('and a trait renamed since the file was written is still found',
    async ({ page }) => {
      /* previousName earning its place: the queue remembers what a trait was
         called, so a rename in between does not make it unknown. */
      await page.evaluate(async () => {
        const t = (await dbAll()).find(r => r.name === 'Gold Chain');
        await dbDel(t.id);
        await dbPut(Object.assign({}, t, { id: 't_Golden Chain_accessories_approved',
          name: 'Golden Chain' }));
        await renderShelf();
      });
      const QUEUE = { traits: [{ id: 'a', layer: 'chains',
        originalName: 'Gold Chain.png', currentName: 'Golden Chain.png' }] };
      const r = await sortWith(page, QUEUE);
      expect(r.plan.unknown, 'it was recognised, not orphaned').toBe(3);
      expect(r.placed).toContain('chains/Golden Chain');
    });

  test('a plain array still works exactly as it did', async ({ page }) => {
    /* The control. Every inventory file that works today is an array, and
       wrapping it would break all of them. */
    const arr = [{ layer: 'chains', trait: 'Gold Chain.png' }];
    const inv = await page.evaluate(d => asInventory(d), arr);
    expect(inv).toEqual(arr);
  });

  test('and something that is neither still says what is wrong', async ({ page }) => {
    const msg = await page.evaluate(() => {
      try { planSort([], asInventory({ revision: 'v11' })); return 'no error'; }
      catch (e) { return e.message; }
    });
    expect(msg).toContain('not a trait inventory');
  });
});
