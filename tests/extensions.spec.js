/* The extension points: registries a patch adds to instead of strings it
   edits.

   These exist so several patches can add tools and effects at once without
   each one rewriting the rail's button list, the panel wiring loop, the Escape
   handler and the shortcut table. Every test here registers something FAKE
   from inside the page and checks the editor treats it exactly as it would a
   built-in: a registered tool gets the press, the drag and the release, and
   nothing below it runs; a registered effect gets its controls drawn, its
   result previewed on a layer that is not the artwork, and applied through
   one undo step; a selection mask confines dab() to the pixels it allows.

   THE FAKES ARE THE POINT. Testing this with a real tool would prove that
   tool works and say nothing about whether the NEXT one will. */
import { test, expect } from '@playwright/test';
import { openTrait, openPanel } from './helpers.js';

const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
};
const pixels = (page) => page.evaluate(() =>
  [...ctx.getImageData(0, 0, art.width, art.height).data]);

/* A press, a drag and a release, through the same listeners a mouse reaches.
   THE PRESS GOES TO THE CANVAS, not the stage: the stage's pointerdown treats
   a primary press whose target is the stage itself as a pan, and only a press
   that lands ON the art reaches beginStroke. Dispatching on #art and letting it
   bubble is exactly what a real click does. The move and the release are
   bound on the stage and do not care what they landed on. */
const stroke = (page, from, to) => page.evaluate(async ({ from, to }) => {
  const r = art.getBoundingClientRect();
  const at = (cx, cy) => ({ clientX: r.left + (cx + 0.5) * zoom, clientY: r.top + (cy + 0.5) * zoom,
    pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, isPrimary: true });
  art.dispatchEvent(new PointerEvent('pointerdown', at(from[0], from[1])));
  stage.dispatchEvent(new PointerEvent('pointermove', at(to[0], to[1])));
  stage.dispatchEvent(new PointerEvent('pointerup', at(to[0], to[1])));
  await new Promise(x => setTimeout(x, 80));
}, { from, to });

test.describe('a registered tool', () => {
  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 60, h: 60, draw: FLAT });
    /* A tool that records what it is handed and paints nothing. */
    await page.evaluate(() => {
      window.__probe = { down: [], move: [], up: 0, selected: 0, deselected: 0 };
      registerTool('probe', {
        down: (e, c) => __probe.down.push(c && [c.x, c.y]),
        move: (e, c) => __probe.move.push(c && [c.x, c.y]),
        up: () => { __probe.up++; },
        select: () => { __probe.selected++; },
        deselect: () => { __probe.deselected++; },
      });
      /* A rail button for it, added the way a patch would. */
      const b = document.createElement('button');
      b.className = 'tool'; b.dataset.tool = 'probe'; b.textContent = 'P';
      document.querySelector('.tools').insertBefore(b, document.querySelector('.tools .rule'));
      b.onclick = () => selectTool('probe');
    });
  });

  test('GETS THE PRESS, THE DRAG AND THE RELEASE, AND PAINTS NOTHING', async ({ page }) => {
    /* The pencil would have put down a mark here. The registry is consulted
       first, so with a registered tool selected nothing below it runs - the
       artwork is proof. */
    const before = await pixels(page);
    await page.evaluate(() => selectTool('probe'));
    await stroke(page, [5, 5], [20, 12]);
    const p = await page.evaluate(() => __probe);
    expect(p.down, 'the press, with the cell it landed on').toEqual([[5, 5]]);
    expect(p.move.length, 'the drag').toBeGreaterThan(0);
    expect(p.move[p.move.length - 1], 'ending where the pointer did').toEqual([20, 12]);
    expect(p.up, 'and the release').toBe(1);
    expect(await pixels(page), 'and not one pixel changed').toEqual(before);
    expect(await page.evaluate(() => undoStack.length), 'nor an undo step taken').toBe(0);
  });

  test('is told when it is chosen and when it is left', async ({ page }) => {
    await page.evaluate(() => { selectTool('probe'); selectTool('pencil'); });
    const p = await page.evaluate(() => __probe);
    expect(p.selected).toBe(1);
    expect(p.deselected).toBe(1);
  });

  test('and the pencil still works the moment it is chosen again', async ({ page }) => {
    /* The control. A registry that swallowed strokes for every tool would
       pass the test above and break the editor. */
    const before = await pixels(page);
    await page.evaluate(() => { selectTool('probe'); selectTool('pencil'); setColor('#ff0000'); });
    await stroke(page, [10, 10], [10, 10]);
    expect(await pixels(page)).not.toEqual(before);
  });

  test('keeps the size slider only if it asks to', async ({ page }) => {
    const r = await page.evaluate(() => {
      selectTool('probe');
      const without = document.getElementById('brushrows').hidden;
      registerTool('brushy', { brush: true });
      selectTool('brushy');
      const withIt = document.getElementById('brushrows').hidden;
      return { without, withIt };
    });
    expect(r.without, 'a tool with no brush has no slider').toBe(true);
    expect(r.withIt, 'a tool with one keeps it').toBe(false);
  });

  test('and PB.tools() names it', async ({ page }) => {
    expect(await page.evaluate(() => PB.tools())).toContain('probe');
  });
});

test.describe('the selection mask', () => {
  test('CONFINES DAB TO THE PIXELS IT ALLOWS', async ({ page }) => {
    /* A mask allowing only the left half, and a brush wide enough to cross
       the line. Every pixel that changed must be on the allowed side. */
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    const changed = await page.evaluate(() => {
      const W = art.width, H = art.height;
      selMask = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) selMask[y * W + x] = 1;
      const before = ctx.getImageData(0, 0, W, H).data.slice();
      setBrush(12);
      dab(20, 20, [255, 0, 0], 255);
      const after = ctx.getImageData(0, 0, W, H).data;
      const out = [];
      for (let i = 0; i < before.length; i += 4)
        if (before[i] !== after[i]) out.push((i / 4) % W);
      selMask = null;
      return out;
    });
    expect(changed.length, 'something was painted').toBeGreaterThan(0);
    expect(Math.max(...changed), 'and none of it past the mask').toBeLessThan(20);
    /* A 12 brush centred on 20 starts at 20 - floor(11/2) = 15, the same
       arithmetic dab() uses for its clip. Fourteen was my first guess and it
       was wrong, which is a reason to derive the number rather than guess. */
    expect(Math.min(...changed), 'while the brush reached the line').toBe(15);
  });

  test('and with no mask, dab is the fast path it always was', async ({ page }) => {
    await openTrait(page, { w: 40, h: 40, draw: FLAT });
    const n = await page.evaluate(() => {
      const W = art.width, H = art.height;
      const before = ctx.getImageData(0, 0, W, H).data.slice();
      setBrush(12);
      dab(20, 20, [255, 0, 0], 255);
      const after = ctx.getImageData(0, 0, W, H).data;
      let k = 0; for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i]) k++;
      return k;
    });
    expect(n, 'the whole 12x12').toBe(144);
  });
});

test.describe('a registered effect', () => {
  const INVERT = () => page => page.evaluate(() => {
    registerEffect({
      id: 'probe-invert', name: 'Probe invert',
      params: [{ id: 'amount', label: 'Amount', type: 'range', min: 0, max: 100, step: 1, value: 100 }],
      run: (src, W, H, v) => {
        const out = new Uint8ClampedArray(src);
        const k = v.amount / 100;
        for (let i = 0; i < out.length; i += 4) {
          out[i] = src[i] + (255 - 2 * src[i]) * k;
          out[i + 1] = src[i + 1] + (255 - 2 * src[i + 1]) * k;
          out[i + 2] = src[i + 2] + (255 - 2 * src[i + 2]) * k;
        }
        return out;
      },
      note: v => 'inverting ' + v.amount + '%',
    });
  });

  test.beforeEach(async ({ page }) => {
    await openTrait(page, { w: 30, h: 30, draw: FLAT });
    await INVERT()(page);
    await openPanel(page, 'fx');
  });

  test('IS LISTED, GETS ITS CONTROLS, AND PREVIEWS OFF THE ARTWORK', async ({ page }) => {
    const before = await pixels(page);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      options: [...document.getElementById('fxsel').options].map(o => o.value),
      control: !!document.getElementById('fxp_amount'),
      readout: (document.getElementById('fxv_amount') || {}).textContent,
      note: document.getElementById('fxnote').textContent,
      preview: document.getElementById('fxpv').style.display,
      inList: PB.effects().map(e => e.id),
    }));
    expect(r.options).toContain('probe-invert');
    expect(r.control, 'the slider was drawn from the params').toBe(true);
    expect(r.readout, 'with its value beside it').toBe('100');
    expect(r.note, "and the effect's own note").toBe('inverting 100%');
    expect(r.preview, 'the preview is up').toBe('block');
    expect(await pixels(page), 'and the artwork is untouched').toEqual(before);
    expect(r.inList).toContain('probe-invert');
  });

  test('APPLIES IN ONE UNDO STEP', async ({ page }) => {
    const before = await pixels(page);
    await page.click('#fxapply');
    await page.waitForTimeout(200);
    const after = await pixels(page);
    expect(after, 'the artwork changed').not.toEqual(before);
    expect(after[0], '40 inverted').toBe(215);
    expect(await page.evaluate(() => undoStack.length), 'one step').toBe(1);
    await page.click('#undo');
    await page.waitForTimeout(200);
    expect(await pixels(page), 'and undo puts every byte back').toEqual(before);
  });

  test('refuses to apply a change that changes nothing', async ({ page }) => {
    /* Amount 0 is the identity. Applying it must not cost an undo step -
       an undo that appears to do nothing is how people stop trusting undo. */
    await page.evaluate(() => {
      const el = document.getElementById('fxp_amount');
      el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    await page.click('#fxapply');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => undoStack.length)).toBe(0);
  });

  test('stays inside a selection', async ({ page }) => {
    await page.evaluate(() => {
      const W = art.width, H = art.height;
      selMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) selMask[i] = (i % W) < 10 ? 1 : 0;
    });
    await page.click('#fxapply');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const W = art.width, d = ctx.getImageData(0, 0, W, art.height).data;
      selMask = null;
      return { inside: d[0], outside: d[(0 * W + 20) * 4] };
    });
    expect(r.inside, 'inverted where allowed').toBe(215);
    expect(r.outside, 'untouched where not').toBe(40);
  });

  test('closing the panel takes the preview down', async ({ page }) => {
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.getElementById('fxpv').style.display)).toBe('block');
    await page.evaluate(() => railPanel('fx', false));
    expect(await page.evaluate(() => document.getElementById('fxpv').style.display)).toBe('none');
  });

  test('and PB.adjust drives the same panel', async ({ page }) => {
    const before = await pixels(page);
    const r = await page.evaluate(() => PB.adjust('probe-invert', { amount: 100 }, true));
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(true);
    expect(await pixels(page)).not.toEqual(before);
    expect(await page.evaluate(() => PB.adjust('no-such-effect', {}, true).ok)).toBe(false);
  });

  test('registering the same id twice is refused', async ({ page }) => {
    const r = await page.evaluate(() => {
      try { registerEffect({ id: 'probe-invert', run: () => null }); return 'allowed'; }
      catch (e) { return String(e.message); }
    });
    expect(r).toContain('twice');
  });
});

test.describe('the markers', () => {
  test('exist once each, where a patch will look', async ({ page }) => {
    /* The reason the markers are comments: nothing renders them, nothing else
       edits them, so a patch inserting before one never collides with a
       patch inserting before another. */
    await page.goto('/index.html');
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    for (const m of ['<!-- rail:tools -->', '<!-- rail:more -->', '<!-- panels:more -->'])
      expect(html.split(m).length, m).toBe(2);
    const r = await page.evaluate(() => {
      const rail = [...document.querySelectorAll('.tools button')].map(b => b.id || b.dataset.tool);
      return { rail, panels: RAIL_PANELS.slice(), fx: RAIL_PANELS.indexOf('fx') };
    });
    expect(r.rail.indexOf('olbtn'), 'the outline is still right after the eyedropper')
      .toBe(r.rail.indexOf('pick') + 1);
    expect(r.fx, 'the Adjust panel is registered like the rest').toBeGreaterThan(0);
  });
});
