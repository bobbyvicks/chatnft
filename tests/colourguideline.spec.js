/* THE RUN SAYS THE COLOUR COUNT, AND THE GUIDELINE NEVER SPEAKS LIKE A GATE.

   The page held two verdicts about colour. fixGateOf decides whether a file
   is ready for the collection on four facts, none of them a count, and it has
   returned `colours` since ab044bc without a single caller reading it. The
   agent rules hold colourBudget 16 (clothing 8) and the agent panel printed
   "16 colours of 8 allowed  -  8 over" about the same file the gate had just
   called ready. Measured on the 311 working traits: 311 ready, 121 "over".

   patch513 keeps the gate at four facts, says the count beside the verdict,
   and words the guideline as a guideline. What is pinned here is the part a
   refactor would quietly lose:

     the count is printed even when there is no guideline to compare it to
     the guideline appears only when the file's CATEGORY is known, and a
       folder this project has no layer for is not a category
     clothing is measured against 8 and everything else against 16, from the
       same sentence in the same words
     the gate's own verdict, and its wording, are untouched

   Every assertion that a sentence is ABSENT is paired in the same test with
   one that differs by a single field and has it. A negative assertion on its
   own re-targets itself onto emptiness the first time the sentence moves. */
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixRun === 'function' && typeof fixGateOf === 'function');
  await page.evaluate(() => { try { authed = true; } catch (_) {} try { gateShow(false); } catch (_) {} });
};

/* A 1280 picture in whole 8px blocks, drawn in `k` colours taken from the
   project palette, so the engine measures 160 cells and the gate's four facts
   all hold. `off` swaps one of them for a colour the palette does not have,
   which is the one fact this file needs to be able to fail. */
const art = (k, off) => `
  const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pal = paletteRGB();
  const pick = [];
  for (let i = 0; i < ${k}; i++) { const p = pal[(i * 17 + 3) % pal.length]; pick.push([p.r, p.g, p.b]); }
  if (${off ? 'true' : 'false'}) pick[1] = [1, 2, 3];
  const im = g.createImageData(W, W), d = im.data;
  for (let by = 0; by < 160; by++) for (let bx = 0; bx < 160; bx++) {
    const kk = pick[(bx + by * 7) % pick.length];
    for (let y = by * 8; y < by * 8 + 8; y++) for (let x = bx * 8; x < bx * 8 + 8; x++) {
      const i = (y * W + x) * 4; d[i] = kk[0]; d[i + 1] = kk[1]; d[i + 2] = kk[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
`;

/* One run, on a file that arrived at `rel`. webkitRelativePath is read-only
   on a File and a new File() has none, which is exactly the loose-file case -
   so `rel` null is not a shortcut here, it is the other half of the test. */
const single = (page, src, rel, pal) => page.evaluate(async ({ src, rel, pal }) => {
  // eslint-disable-next-line no-new-func
  const c = new Function(src + '\nreturn c;')();
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 1; c.height = 1;
  const f = new File([blob], 'g.png', { type: 'image/png' });
  if (rel) Object.defineProperty(f, 'webkitRelativePath', { value: rel });
  const realToast = window.toast; window.toast = () => {};
  await fixLoad(f);
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = pal !== false;
  const sn = document.getElementById('fixsnap'); sn.checked = true; sn.dispatchEvent(new Event('change', { bubbles: true }));
  const gr = document.getElementById('fixgrid'); gr.checked = true; gr.dispatchEvent(new Event('change', { bubbles: true }));
  const ff = document.getElementById('fixforce'); ff.disabled = false; ff.value = '8';
  await fixRun();
  window.toast = realToast;
  ff.value = '0';
  return document.getElementById('fixout').textContent;
}, { src, rel, pal });

const batch = (page, jobs) => page.evaluate(async (jobs) => {
  const files = [];
  for (const j of jobs) {
    // eslint-disable-next-line no-new-func
    const c = new Function(j.src + '\nreturn c;')();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    c.width = 1; c.height = 1;
    const f = new File([blob], j.rel.split('/').pop(), { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath', { value: j.rel });
    files.push(f);
  }
  document.getElementById('fixmode').value = 'fast';
  document.getElementById('fixpal').checked = true;
  document.getElementById('fixsnap').checked = true;
  document.getElementById('fixgrid').checked = true;
  const ff = document.getElementById('fixforce'); ff.disabled = false; ff.value = '8';
  const realToast = window.toast; window.toast = () => {};
  await fixBatch(files);
  window.toast = realToast;
  ff.value = '0';
  return document.getElementById('fixbatchout').textContent;
}, jobs);

test.describe('the colour count, and the guideline that is not a gate', () => {
  test.setTimeout(180000);
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('THE COUNT IS SAID EVEN WHEN NOTHING HAS AN OPINION ABOUT IT',
    async ({ page }) => {
      /* The loose file is the ordinary case: "Choose a file" gives a File with
         no path, so there is no category and no guideline - and the count is
         still the one thing the gate knew and never said. The second half is
         the same picture down the same code path with a path, so "no
         guideline" cannot be passing because the clause was never built. */
      const loose = await single(page, art(3), null);
      expect(loose).toContain('ready for the collection · 3 colours');
      expect(loose, 'nothing judges a file with no category').not.toContain('guideline');

      const known = await single(page, art(3), 'TRAITS/clothing/g.png');
      expect(known).toContain('ready for the collection · 3 colours, '
        + 'within the project\'s colour guideline of 8');
    });

  test('clothing is measured against 8 and everything else against 16',
    async ({ page }) => {
      /* One picture, two paths. The same twelve colours are past the guideline
         in clothing and within it everywhere else, which is what a per-layer
         number MEANS - and a test that only saw one layer could not tell this
         sentence from one that hard-codes a number. */
      const c = await single(page, art(12), 'TRAITS/clothing/g.png');
      expect(c).toContain('· 12 colours, 4 past the project\'s colour guideline of 8');

      const b = await single(page, art(12), 'TRAITS/backgrounds/g.png');
      expect(b).toContain('· 12 colours, within the project\'s colour guideline of 16');
    });

  test('A FOLDER THIS PROJECT HAS NO LAYER FOR IS NOT A CATEGORY',
    async ({ page }) => {
      /* readPath returns `layer` and `folder` and says which is which: the
         layer can only name a layer the project already has. Adopting the
         folder would answer the project's default 16 for a file in Downloads -
         the same number nobody decided that this patch removed from #tlayer,
         arriving by another door. */
      const down = await single(page, art(12), 'Downloads/g.png');
      expect(down).toContain('ready for the collection · 12 colours');
      expect(down, 'a download folder is not a category').not.toContain('guideline');

      /* The control: one segment different, and the same picture is judged. */
      const known = await single(page, art(12), 'clothing/g.png');
      expect(known).toContain('12 colours, 4 past the project\'s colour guideline of 8');
    });

  test('the gate keeps its verdict and its wording, and the count follows it',
    async ({ page }) => {
      /* The count is not a fifth fact. A file that fails the gate says so
         first, in the words it always used, and the count comes after. */
      const off = await single(page, art(12, true), 'TRAITS/clothing/g.png', false);
      expect(off).toMatch(/not ready for the collection: 1 colour off the palette/);
      expect(off).toContain('off the palette · 12 colours, 4 past the project\'s '
        + 'colour guideline of 8');
      expect(off, 'nothing is allowed, and nothing is over').not.toMatch(/allowed|\d+ over/);
    });

  test('A FOLDER RUN COUNTS THEM AND NEVER JUDGES THEM', async ({ page }) => {
    /* Three files, and only one is past its own guideline: the twelve-colour
       background is within 16 and the three-colour shirt is within 8, so a
       clause that counted files rather than files-past-their-own-guideline
       would say 2 or 3 here. All three are ready, so the two sentences are
       visibly about different questions. */
    const said = await batch(page, [
      { src: art(12), rel: 'TRAITS/clothing/over.png' },
      { src: art(3), rel: 'TRAITS/clothing/under.png' },
      { src: art(12), rel: 'TRAITS/backgrounds/wide.png' },
    ]);
    expect(said).toContain('3 of 3 ready for the collection');
    expect(said).toContain('· 1 holds more colours than the project\'s guideline '
      + 'for their layer, the most 12');
  });

  test('and says nothing at all when none of them is past', async ({ page }) => {
    /* The control for the clause above: same run, same layers, fewer colours.
       A clause built as "N of M" rather than "N past" would print "0 hold
       more colours" here and read as a finding. */
    const said = await batch(page, [
      { src: art(3), rel: 'TRAITS/clothing/a.png' },
      { src: art(3), rel: 'TRAITS/backgrounds/b.png' },
    ]);
    expect(said).toContain('2 of 2 ready for the collection');
    expect(said, 'nothing to report is reported as nothing').not.toContain('more colours than');
  });

  test('NO CATEGORY IS NOT A CATEGORY, and the rules say what they are',
    async ({ page }) => {
      /* #tlayer is the Save-to-project select; buildLayerSelect leaves it on
         "unsorted" and fixOpen never writes it, so every trait out of the
         fixer was reported against 16. 0 means "the rules do not say", which
         is what ruleGridFor has answered for the same reason since patch4xx. */
      const r = await page.evaluate(() => ({
        unsorted: PB.budgetFor('unsorted'),
        none: PB.budgetFor(''),
        clothing: PB.budgetFor('clothing'),
        backgrounds: PB.budgetFor('backgrounds'),
        note0: colourCountNote(13, PB.budgetFor('unsorted')),
        note8: colourCountNote(13, PB.budgetFor('clothing')),
      }));
      expect(r.unsorted, 'nobody has decided what this is').toBe(0);
      expect(r.none).toBe(0);
      expect(r.clothing, 'and a category that is decided keeps its number').toBe(8);
      expect(r.backgrounds).toBe(16);
      expect(r.note0).toBe('13 colours');
      expect(r.note8).toBe('13 colours, 5 past the project\'s colour guideline of 8');

      /* The panel that holds the rules listed every one of them except this
         one, which has an opinion about every file in the collection. */
      const rules = await page.evaluate(() => { agRules(); return document.getElementById('agrules').textContent; });
      expect(rules).toContain('colour guideline: 16, clothing 8 - reported, never enforced');
    });

  test('the agent panel says the run\'s sentence, in the run\'s words',
    async ({ page }) => {
      /* Two sentences wording one measurement differently is how the page came
         to hold two verdicts. There is one function now, and this is the other
         caller. */
      const r = await page.evaluate(async () => {
        await dbClear();
        const S = 160, c = document.createElement('canvas'); c.width = S; c.height = S;
        const g = c.getContext('2d');
        const pal = paletteRGB();
        for (let by = 0; by * 10 < S; by++) for (let bx = 0; bx * 10 < S; bx++) {
          const p = pal[((bx + by * 7) % 12) * 17 + 3];
          g.fillStyle = '#' + [p.r, p.g, p.b].map(v => v.toString(16).padStart(2, '0')).join('');
          g.fillRect(bx * 10, by * 10, 10, 10);
        }
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        await dbPut({ id: 'settings.layers', kind: 'settings', layers: ['clothing', 'unsorted'], hidden: [], at: 1 });
        await dbPut({ id: 't_Probe_clothing_approved', kind: 'trait', name: 'Probe',
          layer: 'clothing', status: 'approved', blob, w: S, h: S, at: 1 });
        await renderShelf();
        await new Promise(res => setTimeout(res, 300));
        const rec = (await dbAll()).find(x => x.kind === 'trait');
        await openTraitRecord(rec);
        await new Promise(res => setTimeout(res, 600));
        const spec = PB.spec();
        return { said: document.getElementById('agspecout').textContent,
          colours: spec.colours, budget: spec.budget, over: spec.overBudget };
      });
      expect(r.budget, 'the panel reads the category off #tlayer').toBe(8);
      expect(r.colours).toBeGreaterThan(8);
      expect(r.said).toContain(r.colours + ' colours, ' + r.over
        + ' past the project\'s colour guideline of 8');
      expect(r.said, 'the words of an allowance are gone').not.toMatch(/allowed|\d+ over/);
      /* The difference stays in the DATA for anything that wants it as a
         number - what changed is what the page SAYS. */
      expect(r.over).toBe(r.colours - 8);
    });
});
