/* Where a pop-out may sit.

   Every panel is placed by popAt: beside the button that opened it, inside
   the window. The rule this file pins is the one that was missing - a
   pop-out never covers the tool rail. It went wrong the first time a button
   lived outside the rail: the Colours button moved into the strip, its card
   landed at x=46 over the rail column, and recolour.spec.js's press on Undo
   was swallowed by a label in the card. That test passed the run before,
   because whether the card reached Undo depended on the card's height.

   So this asks the question directly, for EVERY registered panel, so the
   next button that lives somewhere new is covered before it is written: with
   the panel open, does the card start past the rail, and does a press on
   Undo still land on Undo? */
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const FLAT = (set, W, H) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [40, 40, 48]);
};

test.describe('a pop-out beside the rail', () => {
  test('EVERY PANEL CLEARS THE RAIL, and Undo stays pressable under it', async ({ page }) => {
    await openTrait(page, { w: 80, h: 80, draw: FLAT });
    const r = await page.evaluate(() => {
      const rail = document.querySelector('nav.tools').getBoundingClientRect();
      const undo = document.getElementById('undo');
      const u = undo.getBoundingClientRect();
      const out = [];
      /* The outline panel has its own opener and is not in RAIL_PANELS; it is
         placed by the same popAt, so it is asked the same question. */
      const all = ['ol'].concat(RAIL_PANELS);
      for (const id of all) {
        const scrim = document.getElementById(id + 'scrim');
        if (!scrim) { out.push({ id, missing: true }); continue; }
        if (id === 'ol') outlinePanel(true); else railPanel(id, true);
        const card = scrim.firstElementChild.getBoundingClientRect();
        const hit = document.elementFromPoint(u.left + u.width / 2, u.top + u.height / 2);
        out.push({ id, open: !scrim.hidden, cardLeft: Math.round(card.left),
          railRight: Math.round(rail.right),
          undoHit: !!(hit && (hit === undo || undo.contains(hit))) });
        if (id === 'ol') outlinePanel(false); else railPanel(id, false);
      }
      return out;
    });
    expect(r.length, 'there are panels to ask').toBeGreaterThan(5);
    for (const p of r) {
      expect(p.missing, p.id + ' exists').toBeFalsy();
      /* An agent panel with a hidden button still opens by call; the
         geometry rule applies to it the same. */
      expect(p.open, p.id + ' opened').toBe(true);
      expect(p.cardLeft, p.id + ' starts past the rail').toBeGreaterThanOrEqual(p.railRight);
      expect(p.undoHit, p.id + ' leaves Undo pressable').toBe(true);
    }
  });

  test('and the one that lives in the strip is the case that used to fail', async ({ page }) => {
    /* The control: the Colours button is in the strip, not the rail, so its
       right edge is well LEFT of the rail's. If placement ever goes back to
       "beside the button", this is the panel that lands on the rail. */
    await openTrait(page, { w: 80, h: 80, draw: FLAT });
    const r = await page.evaluate(() => {
      const b = document.getElementById('clbtn').getBoundingClientRect();
      const rail = document.querySelector('nav.tools').getBoundingClientRect();
      railPanel('cl', true);
      const card = document.getElementById('clscrim').firstElementChild.getBoundingClientRect();
      return { buttonRight: Math.round(b.right), railRight: Math.round(rail.right), cardLeft: Math.round(card.left) };
    });
    expect(r.buttonRight, 'the button really is left of the rail edge').toBeLessThan(r.railRight);
    expect(r.cardLeft, 'and the card is placed by the rail, not the button').toBeGreaterThanOrEqual(r.railRight);
  });
});
