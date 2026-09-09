/* Resize: directly below Move, and a panel that keeps up with the drag.

   Asked for: "i want the resizig feature to be a button below move and have it
   work live".

   The rail is a vertical column and the order was pencil, eraser, fill, move,
   pick, transform - so the thing directly below Move was the eyedropper, and
   the resize tool was two further down under an icon of four corners with no
   keyboard shortcut. It is MOVED rather than added: .tools is flex-wrap with
   max-height:100%, so a twelfth button can trip it into a second column and
   take width off the canvas.

   THE DRAG ITSELF WAS ALREADY LIVE - `live()` writes art.style.width/height
   and canvas{image-rendering:pixelated} makes that nearest-neighbour. What was
   not live was the PANEL: nothing between pointerdown and pointerup touched
   #rsw, #rsh or the #rsnow note, so the numbers you were dragging towards read
   the old size until you let go.

   THE PIXELS ARE STILL NOT REWRITTEN PER FRAME, and the last test here is what
   stops that being "fixed" later by accident. snapshot() pushes a full
   getImageData - 4MB a frame on a 1024 canvas against a 192MB history budget -
   so a live pixel path would evict the user's real earlier edits in about 48
   frames and trip the 60-entry cap inside a second. One drag is one undo step.
*/
import { test, expect } from '@playwright/test';

const open = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  projectGrid = 160;
  const S = 32;
  const d = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) { d[i * 4] = 200; d[i * 4 + 3] = 255; }
  fileName = 'live';
  startEditor(d, S, S, S, S, palette(d, S * S, 24, 64), false);
  await new Promise(x => setTimeout(x, 600));
  return true;
});

test.describe('the resize tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1100 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof startEditor === 'function');
    await open(page);
  });

  test('IS ONE TOOL FOR BOTH, where there were two', async ({ page }) => {
    /* Move and Resize were separate buttons and the split was arbitrary:
       Move dragged the artwork, Resize showed a box that did nothing at all
       if you dragged inside it rather than on a handle. Fitting a trait to a
       character is both, so it meant swapping buttons between adjustments. */
    const rail = await page.evaluate(() =>
      [...document.querySelectorAll('.tools .tool[data-tool]')].map(b => b.dataset.tool));
    /* NOT the whole list. This used to pin every tool by name, which turned a
       test about Move and Resize merging into a test that fails whenever any
       tool is added anywhere - and tools are about to be added. The claim is
       narrower than the old assertion made it: transform is there once, move
       is not there at all, and the pair kept their place before the picker. */
    expect(rail.filter(t => t === 'transform'), 'one button where there were two').toEqual(['transform']);
    expect(rail, 'and the old name is not a second button').not.toContain('move');
    expect(rail.indexOf('transform'), 'kept its place after fill').toBe(rail.indexOf('fill') + 1);
    expect(rail.indexOf('pick'), 'and before the eyedropper').toBeGreaterThan(rail.indexOf('transform'));
    /* BOTH NAMES STILL REACH IT. Deleting a name is how a shortcut somebody
       has in their fingers stops working with no message. */
    const both = await page.evaluate(() => {
      selectTool('pencil');
      selectTool('move');
      const afterMove = tool;
      selectTool('pencil');
      selectTool('transform');
      return { afterMove, afterTransform: tool };
    });
    expect(both.afterMove, 'the old name lands in the same mode').toBe('transform');
    expect(both.afterTransform).toBe('transform');
  });

  test('and has a key, like every other tool', async ({ page }) => {
    /* The help panel and the keydown handler read one table, so a tool with no
       row in it is a tool with no key AND no mention in the shortcuts list. */
    const r = await page.evaluate(async () => {
      selectTool('pencil');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      await new Promise(x => setTimeout(x, 200));
      const badge = document.querySelector('.tools .tool[data-tool="transform"] .k');
      return { tool: tool, boxOn: document.getElementById('tbox').classList.contains('on'),
        badge: badge ? badge.textContent : null };
    });
    expect(r.tool, 'R selects it').toBe('transform');
    expect(r.boxOn, 'and the box comes up').toBe(true);
    /* The badge shows M, because moving is the verb people reach for; R is
       the same tool by its other name and still works. */
    expect(r.badge, 'and the button carries a key').toBe('M');
  });

  test('the Size fields count with the drag', async ({ page }) => {
    /* The thing that was stale. Before this the fields read the old size until
       the pointer came up - the numbers you were dragging towards were the
       only part of the screen not moving. */
    const r = await page.evaluate(async () => {
      selectTool('transform');
      setChip('rsmode', 'canvas');
      await new Promise(x => setTimeout(x, 300));
      const h = document.querySelector('#tbox .th[data-h="se"]');
      const rect = art.getBoundingClientRect();
      const box = document.getElementById('tbox');
      const ev = (t, tgt, x, y) => tgt.dispatchEvent(new PointerEvent(t,
        { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y }));
      const read = () => ({ w: document.getElementById('rsw').value,
                            h: document.getElementById('rsh').value,
                            note: document.getElementById('rsnow').textContent });
      const before = read();
      ev('pointerdown', h, rect.right, rect.bottom);
      ev('pointermove', box, rect.left + rect.width / 2, rect.top + rect.height / 2);
      await new Promise(x => setTimeout(x, 150));
      const during = read();
      ev('pointerup', box, rect.left + rect.width / 2, rect.top + rect.height / 2);
      await new Promise(x => setTimeout(x, 600));
      return { before, during, after: read(), canvas: art.width + 'x' + art.height };
    });
    expect(r.before.w, 'it starts at the canvas size').toBe('32');
    expect(r.during.w, 'and follows the drag before the pointer is up').toBe('16');
    expect(r.during.note, 'the note recalculates too').toContain('16');
    expect(r.canvas, 'and the commit matches what the fields promised').toBe('16x16');
  });

  test('but the pixels are still only written once, at the end', async ({ page }) => {
    /* THE ONE THAT MUST NOT REGRESS. A per-frame pixel path needs a snapshot
       per frame, and snapshot() pushes a full getImageData - on a large canvas
       that evicts the user's real earlier edits within a second of dragging.
       One drag is one undo step, however many frames it took. */
    const r = await page.evaluate(async () => {
      selectTool('transform');
      setChip('rsmode', 'canvas');
      await new Promise(x => setTimeout(x, 300));
      const h = document.querySelector('#tbox .th[data-h="se"]');
      const rect = art.getBoundingClientRect();
      const box = document.getElementById('tbox');
      const ev = (t, tgt, x, y) => tgt.dispatchEvent(new PointerEvent(t,
        { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y }));
      const before = undoStack.length;
      ev('pointerdown', h, rect.right, rect.bottom);
      /* Twenty frames of dragging, ending at HALF the size. A per-frame
         snapshot would be twenty steps.

         Ending at half matters: snap allows only whole divisors and multiples
         of the 160 grid, so a small drag lands back on the size it started
         from, resizeTo returns null and nothing commits at all. The first
         draft stopped 160 CSS px short and measured zero steps - a no-op drag,
         not a frugal one. */
      const endX = rect.left + rect.width / 2, endY = rect.top + rect.height / 2;
      for (let i = 1; i <= 20; i++) {
        ev('pointermove', box, rect.right - (rect.width / 2) * (i / 20),
                               rect.bottom - (rect.height / 2) * (i / 20));
        await new Promise(x => setTimeout(x, 8));
      }
      ev('pointerup', box, endX, endY);
      await new Promise(x => setTimeout(x, 600));
      return { before, after: undoStack.length, canvas: art.width + 'x' + art.height };
    });
    expect(r.canvas, 'the drag really committed a new size').toBe('16x16');
    expect(r.after - r.before, 'twenty frames of dragging is one undo step').toBe(1);
  });

  test('and a click that misses a handle costs nothing', async ({ page }) => {
    /* A pre-existing leak, fixed because moving the tool under Move makes the
       click far more likely. beginStroke fell through to snapshot() for any
       tool it did not recognise, and stroke() only dabs for the pencil and the
       eraser - so every stray click pushed a full-canvas ImageData onto the
       undo stack, cleared redo, and left a step that did nothing when used. */
    const r = await page.evaluate(async () => {
      selectTool('transform');
      await new Promise(x => setTimeout(x, 200));
      const cv = document.getElementById('art');
      const rect = cv.getBoundingClientRect();
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t,
        { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y }));
      const u0 = undoStack.length;
      for (let i = 0; i < 5; i++) {
        ev('pointerdown', rect.left + rect.width / 2, rect.top + rect.height / 2);
        ev('pointerup', rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      await new Promise(x => setTimeout(x, 400));
      return { u0, u1: undoStack.length };
    });
    expect(r.u1 - r.u0, 'five stray clicks, no undo steps').toBe(0);
  });

  test('the pencil still snapshots, which is what that guard must not break', async ({ page }) => {
    // THE CONTROL. A guard that skipped the snapshot for everything would pass
    // the test above and quietly take undo away from drawing.
    const r = await page.evaluate(async () => {
      selectTool('pencil');
      setColor('#123456');
      await new Promise(x => setTimeout(x, 200));
      const cv = document.getElementById('art');
      const rect = cv.getBoundingClientRect();
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t,
        { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y }));
      const u0 = undoStack.length;
      ev('pointerdown', rect.left + rect.width / 2, rect.top + rect.height / 2);
      ev('pointerup', rect.left + rect.width / 2, rect.top + rect.height / 2);
      await new Promise(x => setTimeout(x, 400));
      return { u0, u1: undoStack.length };
    });
    expect(r.u1 - r.u0, 'a pencil stroke is still undoable').toBe(1);
  });
});
