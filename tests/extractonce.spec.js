/* PULLING A TRAIT OFF A CHARACTER RUNS THE PIPELINE ONCE PER CHANGE.

   extractTrait is 2.4-3.4 s a run at phone speed. The preview ran it after
   every pause in a slider drag and on every move of an area drag, and
   Extract ran it again on the inputs the preview had just used. Each test
   counts calls to extractTrait. RUN AGAINST THE PAGE BEFORE THE FIX: the
   first three went red - one more run for Extract, one per move of an area
   drag, and runs while either slider was still being dragged. The last two
   are controls: a new picture, or a changed option, is run again and
   Extract gets that result. */
import { test, expect } from '@playwright/test';

/* A grey figure, and the same figure wearing a red hat. */
const arm = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  const W = 96, H = 96;
  const ref = new ImageData(W, H), sub = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const body = x >= 28 && x < 68 && y >= 30 && y < 90;
    const hat = x >= 32 && x < 64 && y >= 14 && y < 30;
    const edge = body && (x === 28 || x === 67 || y === 30 || y === 89);
    for (const d of [ref.data, sub.data]) {
      if (body) { d[i] = edge ? 0 : 150; d[i + 1] = edge ? 0 : 150; d[i + 2] = edge ? 0 : 150; d[i + 3] = 255; }
    }
    if (hat) { const e = x === 32 || x === 63 || y === 14; sub.data[i] = e ? 0 : 210; sub.data[i + 1] = e ? 0 : 30; sub.data[i + 2] = e ? 0 : 40; sub.data[i + 3] = 255; }
  }
  refData = ref; subData = sub;
  window.__runs = 0;
  const real = extractTrait;
  extractTrait = (...a) => { window.__runs++; return real(...a); };
  renderPreview();
  await new Promise(r => setTimeout(r, 300));
  return window.__runs;
});

test.describe('pulling a trait off runs the pipeline once per change', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof extractTrait === 'function' && typeof renderPreview === 'function');
    expect(await arm(page), 'the preview ran once').toBe(1);
  });

  test('EXTRACT after the preview uses what the preview made', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const before = window.__runs;
      await $('doextract').onclick();
      return { more: window.__runs - before, w: art.width };
    });
    expect(r.more, 'no second run').toBe(0);
    expect(r.w, 'and the editor opened on the result').toBe(96);
  });

  test('AN AREA DRAG redraws the box without running the pipeline on every move', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const cv = $('preview');
      cv.scrollIntoView();
      const b = cv.getBoundingClientRect();
      const at = (fx, fy) => ({ clientX: b.left + b.width * fx, clientY: b.top + b.height * fy, pointerId: 1, bubbles: true });
      const before = window.__runs;
      cv.dispatchEvent(new PointerEvent('pointerdown', at(0.1, 0.05)));
      for (let k = 1; k <= 6; k++) {
        cv.dispatchEvent(new PointerEvent('pointermove', at(0.1 + k * 0.1, 0.05 + k * 0.06)));
        await new Promise(res => setTimeout(res, 80));
      }
      const during = window.__runs - before;
      cv.dispatchEvent(new PointerEvent('pointerup', at(0.8, 0.45)));
      await new Promise(res => setTimeout(res, 300));
      return { during, after: window.__runs - before, region: !!exRegion };
    });
    expect(r.region, 'the drag chose an area').toBe(true);
    expect(r.during, 'no run while the area is being drawn').toBe(0);
    expect(r.after, 'one when it is let go').toBe(1);
  });

  test('THE SENSITIVITY SLIDER runs the preview when it is let go, not while it moves', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const s = $('sens');
      const before = window.__runs;
      for (const v of [30, 34, 38]) {
        s.value = String(v); s.dispatchEvent(new Event('input'));
        await new Promise(res => setTimeout(res, 80));
      }
      const during = window.__runs - before;
      const shown = $('sensv').textContent;
      s.dispatchEvent(new Event('change'));
      await new Promise(res => setTimeout(res, 300));
      return { during, after: window.__runs - before, shown };
    });
    expect(r.shown, 'the number follows the thumb').toBe('38');
    expect(r.during, 'no run while it moves').toBe(0);
    expect(r.after, 'one when it is let go').toBe(1);
  });

  test('THE SPECK SLIDER does the same', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const s = $('minblob');
      const before = window.__runs;
      for (const v of [+s.value + 2, +s.value + 4, +s.value + 6]) {
        s.value = String(v); s.dispatchEvent(new Event('input'));
        await new Promise(res => setTimeout(res, 80));
      }
      const during = window.__runs - before;
      s.dispatchEvent(new Event('change'));
      await new Promise(res => setTimeout(res, 300));
      return { during, after: window.__runs - before, shown: $('minblobv').textContent === s.value };
    });
    expect(r.shown, 'the number follows the thumb').toBe(true);
    expect(r.during).toBe(0);
    expect(r.after).toBe(1);
  });

  test('the control: a new picture with the same options is run again', async ({ page }) => {
    const r = await page.evaluate(async () => {
      /* The same figure with its hat moved down a row: a new submission. */
      const W = subData.width, next = new ImageData(new Uint8ClampedArray(subData.data), W, subData.height);
      for (let x = 32; x < 64; x++) { const i = (14 * W + x) * 4; next.data[i + 3] = 0; }
      subData = next;
      const before = window.__runs;
      await $('doextract').onclick();
      return { more: window.__runs - before };
    });
    expect(r.more, 'the new picture was run').toBe(1);
  });

  test('the control: a changed input is run again, and Extract gets that result', async ({ page }) => {
    const r = await page.evaluate(async () => {
      /* Changed with no event, so the preview has not seen it. */
      $('minblob').value = String(+$('minblob').value + 7);
      const before = window.__runs;
      await $('doextract').onclick();
      const got = Array.from(art.getContext('2d').getImageData(0, 0, art.width, art.height).data);
      const fresh = extractTrait(subData, refData, currentOpts());
      return { more: window.__runs - before, same: got.every((v, i) => v === fresh.data[i]) };
    });
    expect(r.more, 'the changed options were run').toBe(2);
    expect(r.same, 'and the editor holds that run').toBe(true);
  });

});
