/* patch620: A SHADE GIVEN A NEW COLOUR KEEPS ITS HUE; THE OUTLINE GATE SEES THE PALETTE'S NEAR-BLACK.

   Found by the independent check of patch617/618 (scratchpad/fix8/round4/VERIFY.txt) and fixed in round 5
   (scratchpad/fix8/round5/palette5, verified by a second agent, verify-report.txt there).

   1. THE PALETTE STEP. patch617 gives two drawn shades that fell on one palette colour colours again, apart.
      Some went to a wrong-looking hue to stand apart: Jason Mask's beige shadow #d0c8a8 went from #bab8a4 to
      sage #bfc6a4 (160 cells at 16), Teal Galaxy Skin's dark teal went green and grey. Two more guards on that
      re-assignment, inside snapToPalette:
        - HUE SWING: a colourful shade may not end up more than SHADE_HUE_ADD = 6 degrees further from its
          drawn hue than the colour it shared - unless that shared colour is already SHADE_HUE_FAR = 7 dE or
          more off (then it is plainly another colour; Water Skin's pale-cyan lines need that move).
          An absolute limit cannot do this: SMB Bandana's good move swings 14 -> 19 degrees, Jason's bad one
          7 -> 19 (measured in Lab and Oklab).
        - CHROMA: a shade keeps at least SHADE_CKEEP = 0.5 of its C*, unless the shared colour kept less.
      Over the 311 saved traits at size 16 / size 8: hue12 195,632 -> 194,900 and 125,299 -> 123,957; erased
      drawn boundaries (lostE) 41,403 -> 41,686 and 23,606 -> 24,255, because a shade the guards refuse
      stays merged. Costs seen in pictures: Gold Foil Skin's darkest creases a little flatter (#4c2a18 back
      onto #613105), Bounty Hunter Helmet's ear rim gold -> olive and a few housing cells dark teal. Dark
      Skin, GATE Hoodie, Circuit Board, Water Skin and SMB Bandana: no cell changes at either size.

   2. THE OUTLINE GATE. patch617 added the near-black #161616 (luminance 22.0). The outline pass counts a
      ring cell as near-black at luminance 16 or less, so a shape whose outline came out #161616 failed the
      "is this shape outlined" test and kept a #161616 ring merged with its fabric (Dark Hooded Cloak, Bounty
      Hunter Helmet, Yellow Revenge Tracksuit). The GATE now also counts a dark GREY ring cell - luminance up
      to NEAR_GATE_LUM = 22.5 and channels within NEAR_GATE_SPREAD = 6 of each other - as near-black.
      NEAR_BLACK_LUM itself stays 16: it also decides which near-black the peel removes, and raising it
      moved 23 / 39 files (Yellow Hazmat Suit's thick face ring peeled to yellow). Grey only, because the
      checker found that counting every colour up to 22.5 gives GATE Hoodie - palette off - a black outline
      its source does not draw, from navies in that range. Measured: palette on, identical to the checked
      version on 311 / 311 at both sizes; palette off, identical to before on 310 / 311 (JailStool Shirt's
      black-on-black shirt edge becomes pure black). Ring #161616 cells: 588 -> 333 at 16, 751 -> 262 at 8.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const page = fs.readFileSync(s0.FILE, 'utf8');
if (page.indexOf('SHADE_HUE_ADD') >= 0) throw new Error('patch620 is already applied');
const doc = s0.start([['function snapToPalette(d,n,w,opts){', 'patch617 is not applied']]);

/* 1. snapToPalette, whole */
{
  const a = page.indexOf(NL + 'function snapToPalette(d,n,w,opts){') + NL.length;
  const e = page.indexOf(NL + '}' + NL, a) + NL.length + 1;
  const live = page.slice(a, e);
  if (!live.endsWith('}') || live.split(NL + 'function ').length !== 1) throw new Error('snapToPalette span is not one function');
  const next = fs.readFileSync(path.join(__dirname, 'assets', 'patch620-snapToPalette.js'), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\n+$/, '').replace(/\n/g, NL);
  if (!next.startsWith('function snapToPalette(d,n,w,opts){') || !next.endsWith('}')) throw new Error('the asset is not the function');
  doc.swap(live, next);
}

/* 2. the outline gate */
doc.swap('        unless pure + near-black together reach BLACK_BODY_FRAC of it (then near-black is a body colour).',
  ['        unless pure + near-black together reach BLACK_BODY_FRAC of it (then near-black is a body colour).',
   '        The GATE alone also counts a dark GREY ring cell (luminance <= NEAR_GATE_LUM 22.5, channels within',
   '        NEAR_GATE_SPREAD 6) as near-black (patch620): the palette\'s near-black #161616 (luminance 22.0) is an',
   '        outline or fabric colour the 16 did not reach, so Dark Hooded Cloak, Bounty Hunter Helmet and Yellow',
   '        Revenge Tracksuit failed the gate and kept a #161616 ring merged with the fabric. Grey only: navies in',
   '        that range are drawn colours (GATE Hoodie, palette off). Ink and peel keep NEAR_BLACK_LUM 16.']);
doc.swap('      NEAR_BLACK_LUM = 16, MAX_WHISKER = 2,',
  '      NEAR_BLACK_LUM = 16, NEAR_GATE_LUM = 22.5, NEAR_GATE_SPREAD = 6, MAX_WHISKER = 2,');
doc.swap('  function nearB(j) { return src[j * 4 + 3] >= 128 && lumOf(j) <= NEAR_BLACK_LUM; }   // includes pure black',
  ['  function nearB(j) { return src[j * 4 + 3] >= 128 && lumOf(j) <= NEAR_BLACK_LUM; }   // includes pure black',
   '  function nearG(j) {   // the gate\'s near-black: nearB, or a dark grey (patch620)',
   '    if (nearB(j)) return true;',
   '    if (src[j * 4 + 3] < 128 || lumOf(j) > NEAR_GATE_LUM) return false;',
   '    var r = src[j * 4], g = src[j * 4 + 1], b = src[j * 4 + 2];',
   '    return Math.max(r, g, b) - Math.min(r, g, b) <= NEAR_GATE_SPREAD;',
   '  }']);
doc.swap('      if (touchesEmpty) { pRing[p]++; if (pureB(a)) pPure[p]++; if (nearB(a)) pNear[p]++; }',
  '      if (touchesEmpty) { pRing[p]++; if (pureB(a)) pPure[p]++; if (nearG(a)) pNear[p]++; }');

doc.finish(({ must }) => {
  must('SHADE_CKEEP=0.5, SHADE_HUE_ADD=6, SHADE_HUE_FAR=7;', 'the new guards');
  must('if (nearG(a)) pNear[p]++;', 'the gate uses nearG');
});
