/* pf-42-repair8.js - the cell step for Pixel size 8: two_stage_pack's vote,
 * then four repairs, each a failure measured on real traits at size 8.
 *
 * WHY THIS EXISTS. At 8 px cells (a 160 x 160 grid on a 1280 canvas) the
 * plain vote of PF.two_stage_pack (pf-40) loses what a pixel artist keeps:
 * a black bar 5-7 px thick that falls across two cells wins neither and
 * vanishes (Mouth 05: the left teeth bar gone, the bottom bar broken), a
 * thin stroke on transparency breaks into dots, and a textured fill leaves
 * single cells of a stray shade (Mouth 05's pale-yellow teeth cells).
 * PF.repair8_pack runs the same vote and then repairs those three things.
 * Every rule below was switched off on its own and the pictures that changed
 * back were looked at; the rules left out were measured and dropped (see the
 * end of this header).
 *
 *   PF.repair8_pack(rgba, cols, rows, colour) -> {d, w: cols, h: rows, cn: 4}
 *
 *   rgba    {d, w, h, cn: 4}, straight RGBA; alpha-0 pixels read (0,0,0,0)
 *           as the page's canvas decodes them. RGBA only: every rule reads
 *           alpha.
 *   colour  {labOf, deltaE2000}: the page's own CIELAB and CIEDE2000, passed
 *           in by the worker so there is ONE definition of "how different do
 *           these two colours look" (the palette step uses the same pair).
 *
 * It resets nothing: PF.process resets the RNG before the k-means, exactly as
 * it does before two_stage_pack. With every repair skipped the result is
 * two_stage_pack(rgba, cols, rows, 0, {}) byte for byte (stage 1 and stage 2
 * below are its code); art already on the 8 px grid comes out byte-identical
 * with the repairs on (every cell is one colour, so no rule fires).
 *
 * THE REPAIRS (in the order they run; the numbers are the named consts):
 *
 *  1. RESCUE (a line about one cell thick that straddles two cells).
 *     Each pair of neighbouring cells is read as 16 pixel lines across the
 *     pair. A colour family (labels within LINE_FAM_DE of the family's
 *     biggest label) is a LINE there when it fills FULL of the width on
 *     RESCUE_LEN..RESCUE_MAXLEN consecutive pixel lines that cross the shared
 *     edge and do not touch the pair's outer edge (so it does not run on into
 *     the next cell: a line, not the edge of a thick shape). The line belongs
 *     to the cell holding its centre.
 *       vanish - it won neither cell: the centre cell takes it (and becomes
 *                opaque), taking the label that draws that line. Mouth 05's
 *                left teeth bar and its bottom bar come back.
 *       double - it won both cells (or it is being moved into the centre
 *                cell): the other cell gives it up, but only when the line
 *                CONTINUES past the pair along its direction (a line does, a
 *                block does not: Crooked Smiley's X eyes are 9 px blocks
 *                stepping diagonally, and treating each block as a doubled
 *                line cut an arm off the X), the other cell holds almost
 *                nothing else of it, the cells along the line give it up too
 *                (no notch: Argentina 10 Shirt's "0" came out 2 cells wide
 *                with a 1-cell notch), and the line's cells stay connected.
 *     A hanging guard drops an added cell that only touches one piece of the
 *     line already shown: that is a bump on a line, not a line.
 *
 *  2. CONNECT (a thin stroke on transparency stays one piece).
 *     If one 8-connected piece of source paint comes out as two or more
 *     8-connected pieces of cells, the gap is bridged through the empty cells
 *     that hold most of that same stroke (at most CONNECT_MAXLEN cells). It
 *     only joins pieces of the SAME source stroke, so it cannot hang a cell
 *     off a clean outline: a clean outline is already one piece. A bridge
 *     cell takes the colour its stroke has around it.
 *
 *  3. SPECKS (a textured fill comes out as flat as drawn, shading kept).
 *     Labels are one TONE when they are close (TONE_DE), finely interleaved
 *     INSIDE cells (art already on the grid has no such contacts), their
 *     specks are smaller than a cell, and most of the joining label's
 *     contacts are with the tone (an anti-alias edge sits between two
 *     regions and is not texture). Inside a region of one tone only SPECKS
 *     change: 1-2 cells of a close shade, in a field of the region's colour,
 *     each won on a split vote (the winning label holds under SPECK_COVER of
 *     the cell: noise, not a drawn block). A speck takes the colour its
 *     neighbours already have. Everything else keeps its colour exactly:
 *     Impossible Fold Skin's shaded maze faces and Divine Ponytail's drawn
 *     olive highlights stay. A walled-in piece of a tone of at most
 *     SMALLREG_MAX cells (a tooth between bars) takes the tone's colour from
 *     elsewhere in the picture; a speck test cannot see it.
 *
 * MEASURED AND LEFT OUT: equal (box) pixel weights in the vote bent Crooked
 * Smiley's X, Argentina's "0" and Bitcoin Cap's stem, so the vote keeps
 * two_stage_pack's centre weight; a texture tone voting as one widened
 * Bitcoin Cap's stem; recolouring whole shade patches merged Impossible Fold
 * Skin's shading; recolouring to a colour no cell had moved Walnut Chessboard
 * Skin's cells across palette colours (the palette groups colours by count).
 *
 * PIXEL SIZE 16 (round 3: PF.lines16_pack, or repair8_pack's `rules`).
 * At 16 px cells (80 x 80 on 1280) a drawn line thinner than a cell loses the
 * vote to the fill on either side and comes out as dots or not at all:
 * Dogecoin Polo's collar, GATE Hoodie's white letter outline, Circuit Board
 * Skin's gold traces, Noun Glasses' black frame outline (gone entirely).
 *   PF.repair8_pack(rgba, cols, rows, colour, rules)
 *     rules  absent: size 8's set (rescue, connect, specks), byte for byte as
 *            before. Given {stroke, rescue, connect, specks, keep}: stroke
 *            and keep run only when true; rescue, connect and specks run
 *            unless false. {rescue:false, connect:false, specks:false} is
 *            two_stage_pack byte for byte (measured 311/311 at 16).
 *   PF.lines16_pack(rgba, cols, rows, colour) = repair8_pack with RULES16.
 * Two rules exist only at 16:
 *  4. STROKE: a line drawn ON a fill (CONNECT sees only paint on
 *     transparency) is joined across its gaps. See its comment.
 *  5. KEEP: what RESCUE and STROKE may not replace. A line takes a painted
 *     cell only when that cell's colour is the line's OUTSIDE (the biggest
 *     shape the line touches) and is not itself a line there; an empty cell
 *     only when it is the outside's transparency, not a hole in the art; and
 *     a rescued cell touching no cell of its line (a dot) is dropped.
 *     Measured without it: GATE Hoodie's white outline turned 5 yellow letter
 *     cells white and STROKE turned 2 white outline cells yellow; Ancient Oak
 *     Skin's eye slit was filled and the outline pass then wiped the eye;
 *     Cyclops Ruby Visor's ruby rows turned black when a refused line was
 *     moved to the other cell instead (so a refused line now stays as today).
 * Round 5 (versionRepair8 'pf-42-repair8/4'), measured on the live page path
 * (palette patch617 + outline patch618), four guards, all inside KEEP (size
 * 16 only; size 8 is byte for byte as before):
 *  RIM      RESCUE may not take the only cell of the colour the line lies
 *           against (the cell beyond it, away from the line, is another
 *           colour) when that colour contrasts with the line (RIM_DE). Eight
 *           Lines Specs lost the cream top rim of both lenses to the black
 *           outline. OUTWARD: the line then goes to the other cell when that
 *           is empty and the outside (not a hole), holds OUTWARD_MIN of the
 *           line and the line is not shown one cell further out - the outline
 *           sits outside the rim, as drawn. Otherwise the cell stays as today.
 *  PAINT_LEN a line replaces a PAINTED cell only when at least 6 px thick at
 *           16 (5 px is a letter's shadow: Wake Me Up put grey cells in the W).
 *  EDGE     STROKE may not take a cell of the shape a silhouette outline goes
 *           round (the outline touches the outside transparency near it):
 *           AirPod and Small White Figure got black inside the white body.
 *  THICK    STROKE joins a LINE: at both ends of a gap the stroke is at most
 *           about a cell thick (Diagonal Reflection Glasses: the black lens was
 *           'joined' across its own white highlight).
 * The GATE guard's palette snap now gets the row width (colour.snap(d, n, w)),
 * as the page's own palette call does.
 * Round 6 (versionRepair8 'pf-42-repair8/5'): the page runs these rules on
 * EVERY picture - size 8's set at a step of 8, size 16's at 16 - not on a list
 * of layers (the owner: "i dont want specific rules for certain traits").
 * Measured on all 311 traits at both sizes against base-620. Two changes:
 *  GATE     takes the outline pass's numbers from the page (colour.gate = the
 *           page's OUTLINE_GATE, the object fixOutlineOnce reads) instead of a
 *           private copy, and counts near-black as the pass's nearG does
 *           (patch620's dark grey). Size 8's rules get it too, now that they
 *           run on outlined pictures (on the 311 it never had to refuse at 8).
 *  PALETTE  both sizes (colour.snap): a repair may not move the page's palette
 *           answer for cells it did not change beyond PALETTE_SHARE of what it
 *           repaired. On pictures the rules had never run on, a few repaired
 *           cells moved the palette's shade assignment for hundreds of others:
 *           Walnut Chessboard Skin at 8 lost its dark grain (4 cells repaired,
 *           201 moved), Anfield Tunnel at 16 its wall shading, Yellow Hazmat
 *           Suit at 16 its zipper teeth. See paletteKnock.
 * Size 8 on mouths, eyes and chains (where it always ran) is unchanged on all
 * 49 of them; without the palette (colour.snap absent) and the outline pass
 * (colour.gate absent) both guards are off and the rules are as round 5's.
 * Round 7 (versionRepair8 'pf-42-repair8/6'): what round 6 left worse that
 * RESCUE made, each told from the picture (no list, no layer, no name);
 * measured on all 311 at 4, 8, 10 and 16 against round 6:
 *  STEP     RESCUE does not draw a band whose CIE L* lies between the colours
 *           on its two sides (STEP_DL from each, both sides painted) when the
 *           band is a SHADE - a grey, or within STEP_HUE of a coloured side's
 *           hue. That is shading, not a line: Red Mushroom Cap at 8 gave its
 *           black outline row to the 4 px dark-red band above it (dark red
 *           between red and black); Wake Me Up Sleep Mask and WAGMI Cap at 8
 *           drew their letters' 5 px grey drop shadow as grey cells. A band of
 *           its own hue between them is a drawn line and is still rescued
 *           (Casino Crown's red trim, Dogecoin Polo's teal edge). Size 8's
 *           set only (no KEEP): at 16 KEEP's PAINT_LEN already refuses the
 *           shadow, and STEP there only took back round 6's restored shading
 *           rows (Green Hill Loop's cloud underside) - measured, then left out.
 *  MOVE     a cell gives its line up to another only when that one takes it:
 *           when the add a move was made for is dropped (the hanging guard,
 *           KEEP's dot rule, RUN, SOLID) the move is dropped too. Ankh Earring
 *           at 16: the stem's black bottom cell gave its line to an empty cell
 *           that was then refused, so the line was drawn nowhere (yellow).
 *  RUN      (16, OUTWARD) a run of cells moved outside its rim that stops
 *           while the source line goes on, shown nowhere next to it, is a
 *           fragment: Mouth 05's 2-cell stub under the teeth. GAP: a rim cell
 *           with the line shown on both sides in its own row is a gap in that
 *           line, not a rim: moving the line out drew a dot above Sharingan
 *           Eyes' eye white (and a spike on Sleepy Neutral Eyes' lid). Eight
 *           Lines Specs' lens tops (the rim's whole length) stay.
 *  SOLID    an added cell that completes a 2 x 2 block of its line's colour
 *           (SOLID_ADDED of the 4 added) where the source fills under
 *           SOLID_SHARE of it draws an area, not a line (Black and White Rays
 *           at 8: rays finer than a cell merged into black blobs; partly
 *           fixed). Size 8's set only: at 16 two separate thin lines a cell
 *           apart (Trainer Cap with Hair's brim) make such a block too, and
 *           SOLID broke the brim's outline - measured, then left out there.
 *  Measured and left out: HELD (a cell whose own colour is a line centred in
 *  it at least as thick keeps it) fixed Red Mushroom Cap but broke Make Solana
 *  Great Again Hat's letters and Secretlab Gaming Chair's red stitching at 8
 *  (the gaps between strokes read as lines too); FINE (no rescue in a pair
 *  holding two lines) did not touch Black and White Rays and took 12 black
 *  cells off Dogecoin Polo at 8. White Couch Group's 'stray diagonal' at 16
 *  is STROKE drawing the shoulder's black outline the source draws: kept.
 *  On the 311 (lines7's rows): at 8 no mouth or eye cell changes; 5 chains
 *  change 1-2 cells each (6 in all). At 16 the changes on mouths, eyes and
 *  ears are the strays above. Sizes 4 and 10: none (the rules run at 8, 16).
 * Round 8 (versionRepair8 'pf-42-repair8/7'): HUG, both sizes (see 6. HUG). The owner, on GATE Hoodie at 16:
 *  "like the white outline for ghate, would there be something that could be fxed?" - the white outline round
 *  the yellow letters came out as scattered cells. Measured why (6. HUG): the vote, and RESCUE drawing only a
 *  line that straddles two cells; no guard undid anything. HUG draws a thin line that goes round a shape on
 *  a contrasting fill as a ring of fill cells just outside the shape, told from the picture (no list, layer
 *  or name). On the 311 against base-623 (round 8's rows): size 16 changes 9 files / 60 cells (GATE Hoodie
 *  45: no yellow cell changes and no yellow cell touches the navy any more, 45 such edges before; the rest
 *  1-5 cells: Supreme Hoodie's box, Pill Logo Cap's pill outline, Trainer Cap's logo edge), size 8 3 files /
 *  10 cells (R Place Mosaic's Aland flag gets the yellow edging of its red cross; GATE Hoodie 0: its outline
 *  is already whole at 8, the vote gives the 6-7 px line most cells there). Palette off at 16: 9 / 55.
 *  Measured and left out: without ROUND the rule also took op-art backgrounds' rings, a droid's highlight
 *  lines and an axe's inner edge (63 files at 16, 31 at 8); without its outside half (the outside not lined
 *  all round) Red Mouse Helmet's mouth line was drawn too (19 cells, the mouth's top edge read as a lining of
 *  the face); a side read from the line's own neighbouring pixel found only GATE's anti-alias rows (0 cells).
 * Round 9 (versionRepair8 'pf-42-repair8/8'): GAP (see 6. HUG, GAP). Round 8's ring also painted GATE Hoodie's
 *  negative space at 16: the G's navy hole (31,73: 75% navy in the source; 31,76), the navy notch between the A's
 *  legs (39,76 and 39,77) and the navy between letters (G|A 35,75-35,77 - 35,75 is 98% navy, 0% white - and A|T,
 *  T|E): white. Round 8's sentences above that were false for those cells: 'no yellow cell touches the navy any more'
 *  was true only because the holes and gaps had been filled; section 6's 'a lining inside a letter's counter ... the
 *  counter stays as the vote made it' does not hold for the G, whose counter opens to the outside, so its lining is
 *  part of the outer line piece. GAP keeps a cell the outside fill when its source pixels hold at least as much of
 *  the fill as of the line and that fill is narrow (the line or the shape on both sides along a row or a column,
 *  within 1.75 cells, for half its fill pixels). On the 311 against base-623 (round 9's rows): size 16 8 files /
 *  37 cells (GATE Hoodie 28: all navy to white ring cells; yellow unchanged; 16 yellow-navy edges left, every one at
 *  a kept hole, notch or gap), size 8 3 files / 10 cells (as round 8; GATE 0), palette off at 16 8 / 37. Against
 *  round 8: size 16 4 files / 23 cells (GATE 17: 12 cells kept navy, and 5 hood shade cells round 8's palette pass
 *  re-coloured are as base-623 again; Supreme Hoodie 3, Pill Logo Cap 2, Squid Game 420 Tracksuit 1), size 8 none.
 * Round 9b (comments only: the code, and versionRepair8 'pf-42-repair8/8', are round 9's token for token). The record
 *  corrected, from round 9's two verifiers and re-measured in round 9b (its notes, logs/gateshare.txt, srccells.txt):
 *  (1) Round 9 above, 'GATE Hoodie 28: all navy to white ring cells; yellow unchanged; 16 yellow-navy edges left,
 *  every one at a kept hole, notch or gap', is true and left out that 5 of the 28 ring cells sit where the source
 *  has almost no white: 46,69 53,70 44,73 48,74 50,75 (0-1% white, 92-99% navy by the pictures verifier's count,
 *  RGB distance 60; 0-4% white, 93-99% navy by round 9b's, nearest of navy, white, yellow and black). There the
 *  ring is drawn one cell outside the letter, where the source's white lies inside the letter's own edge cell.
 *  It reads as a ring; what it costs: a white row under the T's bar (44,73 and 48-49,73) and the navy gap between
 *  G and A at rows 73-74 narrowed from about 2 cells to 1 (36,73, 88% navy in the source, is painted white).
 *  (2) All 12 of GATE's kept cells depend on GAP's sliver walk (a run of another colour up to HUG_REACH px is walked
 *  past): with a third colour ending a walk open instead (the numbers verifier's one-line mutant V9, re-run in
 *  round 9b) GATE at 16 is round 8's output again, cell for cell.
 *  (3) Section 6's 'the plateau runs from about 1.6 to 2.0 cells' is superseded there (output the same from 1.5).
 *
 * Needs, resolved AT CALL TIME on PF (a missing port throws by name):
 *   PF.adaptive_k                              pf-40-reconstruct.js
 *   PF.kmeans_quantize                         pf-11-quantize.js
 *   PF.clipScalar PF.argmax PF.npMaximum PF.rint  pf-00-base.js
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  function need(name, file) {
    if (typeof PF[name] !== 'function') {
      throw new Error('pf-42-repair8.js: PF.' + name + ' is missing -- load ' + file + ' first');
    }
  }

  // ------------------------------------------------------------ constants
  // RESCUE
  var FULL = 0.75;           // a pixel line across the pair belongs to the line when the family fills this much of it
  var RESCUE_LEN = 4;        // a straddling line is at least this many px thick (thinner is anti-alias, not a line)
  var RESCUE_MAXLEN = 12;    // ... and at most this many (thicker wins a cell on its own)
  var UNDOUBLE_MAXLEN = 9;   // a line shown in both cells is doubled only when at most this thick (about one cell)
  var RESCUE_REST = 0.15;    // ... and the other cell holds less than this share of the family beyond the line
  var RESCUE_MIN = 0.2;      // the cell that takes a line must hold at least this share of it itself
  var RESCUE_TIE = 0.06;     // a line centre this close (x cell) to the shared edge is a tie: continuation decides
  var LINE_FAM_DE = 15;      // labels this close (CIEDE2000) are one line colour (black bar + its dark anti-alias)
  var LINE_CON_DE = 12;      // a rescued line must differ this much from what it replaces (lines contrast)
  // SPECKS
  var TONE_DE = 15;          // texture shades are at most this far from the tone's centre ...
  var TONE_MIX = 0.2;        // ... interleaved inside cells: contacts / smaller area at least this ...
  var TONE_INSIDE = 0.6;     // ... with at least this share of their in-cell contacts with the centre (not an edge) ...
  var TONE_BLOB = 1;         // ... and specks averaging under this many cells in area (a 10 px-grid drawing is detail)
  var FLAT_SHARE = 0.05;     // region colour candidates: exact colours holding at least this share of the region
  var PATCH_DE = 3;          // one shade: cell colours this close (the page's own same-shade is 2.3)
  var SPECK_MAX = 2;         // a speck is at most this many cells ...
  var SPECK_COVER = 0.65;    // ... each won by a label holding under this share of its cell (Mouth 05: 0.3-0.6; drawn blocks 0.7-1.0) ...
  var SPECK_DE = 15;         // ... of a shade at most this far from the region colour ...
  var NEIGH_DE = 12;         // ... in a field whose cells are all this close to the region colour
  var SMALLREG_MAX = 3;      // a walled-in piece of a tone this small takes the tone's colour from elsewhere
  // CONNECT
  var CONNECT_MINPX = 24;    // an output piece counts when it holds at least this many px of the stroke
  var CONNECT_MAXLEN = 4;    // longest bridge, in empty cells, per join
  var CONNECT_MINCOV = 0.1;  // a bridge cell must hold at least this share of the stroke
  // STROKE (Pixel size 16 only: rules.stroke)
  var STROKE_MINPX = 1.5;    // a piece of cells counts when it holds this many cell-widths of px of the stroke
  var STROKE_MAXLEN = 3;     // longest bridge, in cells, per join
  var STROKE_MINCOV = 0.1;   // a bridge cell must hold at least this share of the stroke
  var STROKE_BEND = 1.5;     // the source path across a gap is at most this x the straight distance (+ a cell)
  var STROKE_HELD = 0.5;     // a bridge prefers cells whose own colour holds less of them
  // KEEP (Pixel size 16 only: rules.keep) - what a line may NOT replace
  var KEEP_THIN = 0.75;      // a colour no thicker than this x a cell where it wins a cell is itself a line there
  var EDGE_OUT = 0.5;        // a line is the SILHOUETTE's outline at a cell when, in the 3 x 3 cells round it, its pixels touch the
                             // outside transparency at least this x as often as they touch the cell's own colour (round 5)
  var EDGE_MINPX = 4;        // ... and at least this many px of it (a corner speck of transparency is not a silhouette)
  var STROKE_THICK = 1.1;    // STROKE joins a line: at both ends of a gap the stroke is at most about a cell thick (twice its depth)
  var RIM_DE = 30;           // a rim the line may not erase contrasts with it this much (cream on black; a near-black frame row does not)
  var PAINT_LEN = 0.375;     // at 16 a line replaces a PAINTED cell only when at least this x a cell thick (6 px; 5 px is a shadow)
  var OUTWARD_MIN = 0.1;     // a line refused a RIM cell goes to the empty cell outside when that holds this share of it
  // round 7 (see the header): four rules, each with its switch; all four false = round 6's pf-42-repair8/5 exactly
  // (the seam, measured on the 311 at 8 and 16)
  var STEP_ON = true;       // STEP: a band whose lightness lies between its two sides, and is a shade, is not a line
  var STEP_DL = 3;          // ... by at least this much CIE L* from each side
  var STEP_SIDE = 0.5;      // ... a side counts when at least this share of its pixels is painted
  var STEP_GREY = 10;       // ... a colour with CIE chroma under this is a grey
  var STEP_HUE = 30;        // ... a band within this many degrees of hue of a coloured side is a shade of it
  var MOVE_ON = true;       // MOVE: a move is dropped with the add it was made for
  var RUN_ON = true;        // RUN (and GAP): OUTWARD moves a line as a whole run, never a fragment or a bump
  var SOLID_ON = true;      // SOLID: RESCUE may not make a 2 x 2 block of a colour the source does not fill there
  var SOLID_SHARE = 0.5;    // ... a block of cells is filled in the source when its family holds this share of the block
  var SOLID_ADDED = 3;      // ... and the rescue made the block: at least this many of its 4 cells were added
  // round 8 (see the header): HUG, both sizes; HUG_ON false = round 7's pf-42-repair8/6 exactly (the seam)
  var HUG_ON = true;        // HUG: a thin line between a shape and the fill round it is drawn as a ring of cells outside the shape
  var HUG_THICK = 1.0;      // ... the line's mean thickness (2 x its pixels / its edge contacts) is at most this x a cell
  var HUG_SIDE = 0.2;       // ... each of its two sides (the outside fill, the shape) holds at least this share of its contacts
  var HUG_CLEAR = 0.2;      // ... and transparency at most this share (an outline on the silhouette is the outline pass's)
  var HUG_MINPX = 2;        // ... and it holds at least this many cells' worth of pixels (a line round something, not a fleck)
  var HUG_PX = 4;           // an outside cell beside a shape cell takes the line when the two hold this x a cell-width of it
  var HUG_ROUND = 0.75;      // ... and the line goes ROUND the shape: the shape is edged by the line colour for this share of its edge
  var HUG_REACH = 4;        // a side is the first colour at least 3 px thick within this many px of the line's edge
  // round 9 (see the header): GAP; HUG_GAP_ON false = round 8's pf-42-repair8/7 exactly (the seam)
  var HUG_GAP_ON = true;    // GAP: HUG leaves a cell the outside fill where the source draws a gap there - a hole, a notch, the fill between two rings
  var HUG_GAP_OUT = 1.0;    // ... the cell's source pixels hold at least this x as much of the outside fill as of the line
  var HUG_GAP = 1.75;       // ... and that fill is narrow: along its row or its column the line or the shape lies on BOTH sides, end to end within this x a cell
  var HUG_GAP_SHARE = 0.5;  // ... for at least this share of the cell's fill pixels

  /* the 8 cells around a cell, clockwise from top-left; ringPieces counts the
     8-connected pieces among the marked ones (king-move neighbours join) */
  var RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  function ringPieces(ring) {
    var seen = [false, false, false, false, false, false, false, false], k = 0, s, t, a, q;
    for (s = 0; s < 8; s++) {
      if (!ring[s] || seen[s]) continue;
      k++; q = [s]; seen[s] = true;
      while (q.length) {
        a = q.pop();
        for (t = 0; t < 8; t++) {
          if (ring[t] && !seen[t] && Math.max(Math.abs(RING[a][0] - RING[t][0]), Math.abs(RING[a][1] - RING[t][1])) === 1) { seen[t] = true; q.push(t); }
        }
      }
    }
    return k;
  }

  // CSR grouping of pixel indices by cell (pf-40's, in pixel order within a cell)
  function csrByCell(cell, N, n) {
    var offs = new Int32Array(n + 1), order = new Int32Array(N), i, c, fill;
    for (i = 0; i < N; i++) offs[cell[i] + 1]++;
    for (c = 0; c < n; c++) offs[c + 1] += offs[c];
    fill = new Int32Array(offs.subarray(0, n));
    for (i = 0; i < N; i++) { c = cell[i]; order[fill[c]++] = i; }
    return { offs: offs, order: order };
  }

  function mapEntries(m) { var a = []; m.forEach(function (v, k) { a.push([k, v]); }); return a; }

  /* ---------------------------------------------------------- shared facts
     Per label: mean colour of its paint pixels (alpha > 127) in Lab, and the
     CIEDE2000 between every two labels. Per cell: paint share per LINE family.
     Families are built around a centre (the biggest label starts one, a
     smaller label joins the nearest centre within reach), never chained:
     chaining joined black - dark grey - grey - white on XRP Chain. */
  function facts(d, w, h, N, lab, K, cell, n, cols, rows, colour) {
    var sum = new Float64Array(K * 3), cnt = new Float64Array(K), paint = new Uint8Array(N), i, l, a, b, x, y;
    for (i = 0; i < N; i++) {
      if (d[i * 4 + 3] > 127) { paint[i] = 1; l = lab[i]; cnt[l]++; sum[l * 3] += d[i * 4]; sum[l * 3 + 1] += d[i * 4 + 1]; sum[l * 3 + 2] += d[i * 4 + 2]; }
    }
    var L = [];
    for (l = 0; l < K; l++) L.push(cnt[l] ? colour.labOf(sum[l * 3] / cnt[l], sum[l * 3 + 1] / cnt[l], sum[l * 3 + 2] / cnt[l]) : null);
    var dE = new Float64Array(K * K);
    for (a = 0; a < K; a++) for (b = 0; b < K; b++) {
      dE[a * K + b] = (L[a] && L[b]) ? colour.deltaE2000(L[a][0], L[a][1], L[a][2], L[b][0], L[b][1], L[b][2]) : 999;
    }
    // 4-contacts between labels INSIDE one cell: a mix finer than the cell
    var con = new Float64Array(K * K);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!paint[i]) continue;
      if (x + 1 < w && paint[i + 1] && lab[i + 1] !== lab[i] && cell[i + 1] === cell[i]) { con[lab[i] * K + lab[i + 1]]++; con[lab[i + 1] * K + lab[i]]++; }
      if (y + 1 < h && paint[i + w] && lab[i + w] !== lab[i] && cell[i + w] === cell[i]) { con[lab[i] * K + lab[i + w]]++; con[lab[i + w] * K + lab[i]]++; }
    }
    var byCnt = []; for (l = 0; l < K; l++) if (cnt[l]) byCnt.push(l);
    byCnt.sort(function (p, q) { return cnt[q] - cnt[p] || p - q; });
    function star(ok) {
      var f = new Int32Array(K), centres = [], j, k, c, e, best, be;
      for (k = 0; k < K; k++) f[k] = k;
      for (j = 0; j < byCnt.length; j++) {
        k = byCnt[j]; best = -1; be = Infinity;
        for (var ci = 0; ci < centres.length; ci++) { c = centres[ci]; e = dE[k * K + c]; if (ok(k, c, e) && e < be) { be = e; best = c; } }
        if (best >= 0) f[k] = best; else centres.push(k);
      }
      return f;
    }
    // mean blob size per label (4-connected pixels of one label)
    var blobs = new Float64Array(K), seen = new Uint8Array(N), stk = new Int32Array(N), s0, sp, j;
    for (s0 = 0; s0 < N; s0++) {
      if (!paint[s0] || seen[s0]) continue;
      l = lab[s0]; blobs[l]++; sp = 0; stk[sp++] = s0; seen[s0] = 1;
      while (sp) {
        j = stk[--sp]; x = j % w;
        if (x > 0 && !seen[j - 1] && paint[j - 1] && lab[j - 1] === l) { seen[j - 1] = 1; stk[sp++] = j - 1; }
        if (x + 1 < w && !seen[j + 1] && paint[j + 1] && lab[j + 1] === l) { seen[j + 1] = 1; stk[sp++] = j + 1; }
        if (j >= w && !seen[j - w] && paint[j - w] && lab[j - w] === l) { seen[j - w] = 1; stk[sp++] = j - w; }
        if (j + w < N && !seen[j + w] && paint[j + w] && lab[j + w] === l) { seen[j + w] = 1; stk[sp++] = j + w; }
      }
    }
    var cellArea = (w / cols) * (h / rows);
    var blobMean = new Float64Array(K); for (l = 0; l < K; l++) blobMean[l] = blobs[l] ? cnt[l] / blobs[l] : 0;
    var line = star(function (k, c, e) { return e < LINE_FAM_DE; });
    var conTot = new Float64Array(K); for (a = 0; a < K; a++) for (b = 0; b < K; b++) conTot[a] += con[a * K + b];
    var tone = star(function (k, c, e) {
      return e < TONE_DE && con[k * K + c] / Math.min(cnt[k], cnt[c]) >= TONE_MIX && blobMean[k] < TONE_BLOB * cellArea &&
        conTot[k] > 0 && con[k * K + c] / conTot[k] >= TONE_INSIDE;
    });
    var toneSize = new Int32Array(K); for (l = 0; l < K; l++) if (cnt[l]) toneSize[tone[l]]++;
    // per-cell share of each LINE family (Float32, as measured)
    var cov = new Float32Array(n * K), paintCnt = new Float32Array(n), cellN = new Float32Array(n), c2, sc, f2;
    for (i = 0; i < N; i++) { c2 = cell[i]; cellN[c2]++; if (paint[i]) { cov[c2 * K + line[lab[i]]]++; paintCnt[c2]++; } }
    for (c2 = 0; c2 < n; c2++) { sc = cellN[c2] || 1; for (f2 = 0; f2 < K; f2++) cov[c2 * K + f2] /= sc; paintCnt[c2] /= sc; }
    return { d: d, paint: paint, cnt: cnt, dE: dE, line: line, tone: tone, toneSize: toneSize, cov: cov, paintCnt: paintCnt, cellN: cellN, cell: cell, w: w, h: h, lab: lab, labOf: colour.labOf };
  }

  /* ---------------------------------------------------------- 1. RESCUE */
  function rescue(win, opaque, I, cols, rows, K, ACC, G) {
    var n = cols * rows, fam = I.line, cov = I.cov, W = I.w;
    var cellW = W / cols;
    if (cellW !== Math.floor(cellW) || I.h / rows !== cellW) return;   // whole square cells only (size 8 on 1280)
    var S = cellW, S2 = 2 * S, c, i;
    var winF = new Int32Array(n);
    for (c = 0; c < n; c++) winF[c] = opaque[c] ? fam[win[c]] : -1;
    function isF(k, f) { return k >= 0 && k < n && winF[k] === f; }
    var famPix = new Int32Array(I.w * I.h);
    for (i = 0; i < famPix.length; i++) famPix[i] = I.paint[i] ? fam[I.lab[i]] : -1;
    var add = new Map(), drop = new Map(), prof = new Map();

    function pair(a, b, horiz) {
      // horiz: a left of b, the line runs vertically; the profile is over pixel COLUMNS
      if (I.paintCnt[a] + I.paintCnt[b] === 0) return;
      prof.clear();
      var ax = (a % cols) * S, ay = ((a / cols) | 0) * S, u, v, x, y, f, p;
      for (u = 0; u < S2; u++) {            // across the pair
        for (v = 0; v < S; v++) {           // along the line
          x = horiz ? ax + u : ax + v; y = horiz ? ay + v : ay + u;
          f = famPix[y * W + x]; if (f < 0) continue;
          p = prof.get(f); if (!p) { p = new Int32Array(S2); prof.set(f, p); }
          p[u]++;
        }
      }
      // share of cell o held by f beyond the line's pixel lines [lo..hi], not
      // counting lines of f crossing o the other way (a junction's own pair)
      function restOf(o, f, lo, hi) {
        var ox = (o % cols) * S, oy = ((o / cols) | 0) * S, u0 = o === a ? 0 : S, restPx = 0, vv, uu, k, kin, xx, yy;
        for (vv = 0; vv < S; vv++) {
          k = 0; kin = 0;
          for (uu = 0; uu < S; uu++) {
            xx = horiz ? ox + uu : ox + vv; yy = horiz ? oy + vv : oy + uu;
            if (famPix[yy * W + xx] !== f) continue;
            k++; if (u0 + uu >= lo && u0 + uu <= hi) kin++;
          }
          if (k >= FULL * S) continue;
          restPx += k - kin;
        }
        return restPx / (S * S);
      }
      // STEP (round 7): across the pair, the band's own pixels (family f) and, on each side of it, the pixels of
      // that side's most common label; each as its mean colour, compared by CIE L*. The band is a step of shading
      // when its L* lies between the two sides' by STEP_DL from each (both sides mostly painted).
      function stepOf(f, lo, hi) {
        var bs = [0, 0, 0, 0], side = [new Map(), new Map()], tot = [0, 0], uu, vv, xx, yy, ii, k, sd, m, p;
        for (uu = 0; uu < S2; uu++) for (vv = 0; vv < S; vv++) {
          xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * W + xx;
          if (uu >= lo && uu <= hi) { if (famPix[ii] === f) { bs[0] += I.d[ii * 4]; bs[1] += I.d[ii * 4 + 1]; bs[2] += I.d[ii * 4 + 2]; bs[3]++; } continue; }
          sd = uu < lo ? 0 : 1; tot[sd]++;
          if (!I.paint[ii]) continue;
          m = side[sd]; p = m.get(I.lab[ii]); if (!p) { p = [0, 0, 0, 0]; m.set(I.lab[ii], p); }
          p[0] += I.d[ii * 4]; p[1] += I.d[ii * 4 + 1]; p[2] += I.d[ii * 4 + 2]; p[3]++;
        }
        if (!bs[3]) return false;
        var Ls = [];
        for (sd = 0; sd < 2; sd++) {
          var best = null, bk = -1, painted = 0;
          side[sd].forEach(function (v2, k2) { painted += v2[3]; if (!best || v2[3] > best[3] || (v2[3] === best[3] && k2 < bk)) { best = v2; bk = k2; } });
          if (!best || painted < STEP_SIDE * tot[sd]) return false;
          Ls.push(I.labOf(best[0] / best[3], best[1] / best[3], best[2] / best[3]));
        }
        var Bl = I.labOf(bs[0] / bs[3], bs[1] / bs[3], bs[2] / bs[3]), Lb = Bl[0];
        if (!(Lb >= Math.min(Ls[0][0], Ls[1][0]) + STEP_DL && Lb <= Math.max(Ls[0][0], Ls[1][0]) - STEP_DL)) return false;
        // ... and it is a SHADE: a grey (a drop shadow), or the hue of a coloured side (a darker red between a red cap
        // and its outline). A coloured band of its own hue between them is a drawn line (Casino Crown's red trim
        // between the black outline and the gold, Dogecoin Polo's teal edge between black and grey): rescued.
        var Cb = Math.sqrt(Bl[1] * Bl[1] + Bl[2] * Bl[2]);
        if (Cb < STEP_GREY) return true;
        return Ls.some(function (q) {
          var Cq = Math.sqrt(q[1] * q[1] + q[2] * q[2]); if (Cq < STEP_GREY) return false;
          var dh = Math.abs(Math.atan2(Bl[2], Bl[1]) - Math.atan2(q[2], q[1])) * 180 / Math.PI; if (dh > 180) dh = 360 - dh;
          return dh <= STEP_HUE;
        });
      }
      // does the band [lo..hi] continue past the pair along the line?
      function continues(f, lo, hi) {
        var offsets = [-1, S], oi, off, k, uu, xx, yy;
        for (oi = 0; oi < 2; oi++) {
          off = offsets[oi]; k = 0;
          for (uu = lo; uu <= hi; uu++) {
            xx = horiz ? ax + uu : ax + off; yy = horiz ? ay + off : ay + uu;
            if (xx < 0 || yy < 0 || xx >= W || yy >= I.h) continue;
            if (famPix[yy * W + xx] === f) k++;
          }
          if (k >= FULL * (hi - lo + 1)) return true;
        }
        return false;
      }
      prof.forEach(function (p, f) {
        var lo = -1, hi = -1, L = 0, sum = 0, u2;
        for (u2 = 0; u2 < S2; u2++) if (p[u2] >= FULL * S) { if (lo < 0) lo = u2; hi = u2; L++; sum += u2; }
        if (L < RESCUE_LEN || L > RESCUE_MAXLEN) return;
        if (hi - lo + 1 !== L) return;                        // one band
        if (lo === 0 || hi === S2 - 1) return;                // runs on into the next cell
        if (lo >= S || hi < S) return;                        // inside one cell: no straddle
        var ca = cov[a * K + f], cb = cov[b * K + f];
        var mid = sum / L + 0.5, t;
        if (Math.abs(mid - S) > RESCUE_TIE * S) t = mid < S ? a : b;
        else {
          // a tie: the cell whose neighbours along the line show it, then the one holding more
          var ya = (a / cols) | 0, xa = a % cols, yb = (b / cols) | 0, xb = b % cols;
          var nb = function (x1, y1) { return (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) ? -1 : y1 * cols + x1; };
          var al = horiz ? [nb(xa, ya - 1), nb(xa, ya + 1), nb(xb, yb - 1), nb(xb, yb + 1)] : [nb(xa - 1, ya), nb(xa + 1, ya), nb(xb - 1, yb), nb(xb + 1, yb)];
          var ka = (isF(al[0], f) ? 1 : 0) + (isF(al[1], f) ? 1 : 0), kb = (isF(al[2], f) ? 1 : 0) + (isF(al[3], f) ? 1 : 0);
          t = ka !== kb ? (ka > kb ? a : b) : (ca >= cb ? a : b);
        }
        var o = t === a ? b : a, rest, prev, outw = null;
        if (winF[t] !== f) {
          if ((t === a ? ca : cb) < RESCUE_MIN) return;
          // STEP is size 8's rule (no KEEP): at 16 KEEP already refuses a painted cell to a line under PAINT_LEN
          // (the 5 px shadow) and to a line that is not its outside colour; measured at 16 STEP only took back
          // round 6's restored shading rows (Green Hill Loop's cloud underside), so it does not run there.
          if (STEP_ON && !G && stepOf(f, lo, hi)) return;
          if (G && winF[t] >= 0 && L < PAINT_LEN * S) return;
          if (winF[t] >= 0 && I.dE[fam[win[t]] * K + f] < LINE_CON_DE) return;
          if (G) {
            // KEEP (size 16): an empty cell takes the line only on the outside, never in a hole
            // (Ancient Oak Skin's eye slit filled, and the outline pass then wiped the eye);
            // a painted cell only when it is the line's outside colour and not itself a line
            // (GATE Hoodie's yellow letter cells turned white). Refused = today's cell.
            var bp = G.bandPiece(f, ax, ay, lo, hi, horiz);
            if (winF[t] < 0 ? G.inHole(t) : !G.mayTake(t, winF[t], bp)) return;
            // RIM (round 5): a line may not take the only cell of the colour it lies against. Eight Lines Specs:
            // across each lens top the source draws a black line (9 px), a cream rim (13 px), then the black lens;
            // at 16 the cream holds one cell row, and the black line's centre falls in it, so the line took the
            // rim's only cell and the frame read as a black block. When the cell beyond t (away from o) does not
            // show t's colour, t is that colour's only cell across the line here: refused, and
            // OUTWARD: when o is empty and the outside (not a hole), holds some of the line, and the line is not
            // shown one cell further out, the line goes to o - outside the rim, where a pixel artist puts it.
            if (winF[t] >= 0) {
              var ox = o % cols, oy = (o / cols) | 0, tx = t % cols, ty = (t / cols) | 0;
              var fx2 = 2 * tx - ox, fy2 = 2 * ty - oy, bx = 2 * ox - tx, by = 2 * oy - ty;
              var rim = I.dE[fam[win[t]] * K + f] >= RIM_DE && !(fx2 >= 0 && fy2 >= 0 && fx2 < cols && fy2 < rows && winF[fy2 * cols + fx2] === winF[t]);
              if (rim) {
                var beyond = bx >= 0 && by >= 0 && bx < cols && by < rows && isF(by * cols + bx, f);
                if (!(winF[o] < 0 && !G.inHole(o) && (t === a ? cb : ca) >= OUTWARD_MIN && !beyond)) return;
                // GAP (round 7, with RUN): when the line is shown in the rim cell's own row on both sides along the
                // line, the rim cell is a gap in a line drawn in that row, not a rim the line goes round: moving the
                // line out would draw a bump (Sharingan Eyes at 16: a black dot above the eye white). Stays as today.
                if (RUN_ON && (horiz ? isF(t - cols, f) && isF(t + cols, f) : (tx > 0 && tx + 1 < cols && isF(t - 1, f) && isF(t + 1, f)))) return;
                var t0 = t; t = o; o = t0;
                outw = [(t % cols) - (o % cols), ((t / cols) | 0) - ((o / cols) | 0)];
              }
            }
          }
          // the label that draws THIS line: most common label of f on its own pixel lines
          var lc = new Map(), uu, vv, xx, yy, ii, lineLab = -1, lcn = -1;
          for (uu = lo; uu <= hi; uu++) for (vv = 0; vv < S; vv++) {
            xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * W + xx;
            if (famPix[ii] === f) lc.set(I.lab[ii], (lc.get(I.lab[ii]) || 0) + 1);
          }
          lc.forEach(function (k2, l2) { if (k2 > lcn || (k2 === lcn && l2 < lineLab)) { lcn = k2; lineLab = l2; } });
          prev = add.get(t); if (!prev || L > prev.L) add.set(t, { f: f, L: L, lab: lineLab, outw: outw, horiz: horiz });
          // move, not copy: the other cell gives the line up when it holds nothing else of it
          if (winF[o] === f && L <= UNDOUBLE_MAXLEN && continues(f, lo, hi)) {
            rest = restOf(o, f, lo, hi);
            if (rest < RESCUE_REST) { prev = drop.get(o); if (!prev || L > prev.L) drop.set(o, { f: f, L: L, horiz: horiz, via: t }); }
          }
        } else if (winF[o] === f && L <= UNDOUBLE_MAXLEN && continues(f, lo, hi)) {
          rest = restOf(o, f, lo, hi);
          if (rest < RESCUE_REST) { prev = drop.get(o); if (!prev || L > prev.L) drop.set(o, { f: f, L: L, horiz: horiz }); }
        }
      });
    }
    var x, y;
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      c = y * cols + x;
      if (x + 1 < cols) pair(c, c + 1, true);
      if (y + 1 < rows) pair(c, c + cols, false);
    }

    // MOVE (round 7): an add that is dropped takes the moves made for it along; that cell keeps its line
    // (Ankh Earring at 16: the stem's black bottom cell gave its line to an empty cell the dot rule then refused,
    // so the line was drawn nowhere and the cell went yellow)
    function unAdd(k) {
      var v = add.get(k); if (!v) return;
      add.delete(k);
      if (MOVE_ON) mapEntries(drop).forEach(function (d2) { if (d2[1].via === k && d2[1].f === v.f) drop.delete(d2[0]); });
    }
    // hanging guard: an added cell touching only one shown piece of its line, and no other added cell
    var resF = new Int32Array(n).fill(-1);
    add.forEach(function (v, k) { resF[k] = v.f; });
    function ringOf(k, f, withAdded, without) {
      var x0 = k % cols, y0 = (k / cols) | 0, ring = [], orig = 0, res = 0, r, xx, yy, kk, o2, r2;
      for (r = 0; r < 8; r++) {
        xx = x0 + RING[r][0]; yy = y0 + RING[r][1];
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) { ring.push(0); continue; }
        kk = yy * cols + xx;
        o2 = winF[kk] === f && !(without && without.has(kk));
        r2 = withAdded && resF[kk] === f;
        if (o2) orig++; if (r2) res++;
        ring.push(o2 || r2 ? 1 : 0);
      }
      return { pieces: ringPieces(ring), orig: orig, res: res };
    }
    mapEntries(add).forEach(function (e) {
      var R = ringOf(e[0], e[1].f, true, null);
      if (R.res === 0 && R.orig > 0 && R.pieces <= 1) unAdd(e[0]);
      // KEEP (size 16): nor a cell alone, touching no cell of its line (a dot, not a line)
      else if (G && R.res === 0 && R.orig === 0) unAdd(e[0]);
    });
    // RUN (round 7, OUTWARD only): walk each run of cells moved outward, along the line. At each end look at the
    // next column along the line: the rim's row, the run's row, one further out. When none of them shows the line
    // but the source still draws it there (its family holds at least RESCUE_LEN px per cell-width across the rim's
    // and the run's cells), the run stops while the line goes on: a fragment of the line, not the line moved
    // outside its rim (Mouth 05 at 16: a 2-cell stub under the teeth of a bottom outline drawn nowhere else).
    // It is dropped and those cells stay as today. Eight Lines Specs' lens tops (the whole rim's length, ending
    // on the frame's corners) stay.
    if (RUN_ON) {
      var runSeen = new Set();
      mapEntries(add).forEach(function (e) {
        var k0 = e[0], v0 = e[1]; if (!v0.outw || runSeen.has(k0) || !add.has(k0)) return;
        var dx = v0.horiz ? 0 : 1, dy = v0.horiz ? 1 : 0, ox = v0.outw[0], oy = v0.outw[1], run = [k0], ends = [], sgn, kx, ky, nx, ny, nk, nv;
        runSeen.add(k0);
        for (sgn = -1; sgn <= 1; sgn += 2) {
          kx = k0 % cols; ky = (k0 / cols) | 0;
          for (;;) {
            nx = kx + sgn * dx; ny = ky + sgn * dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break;
            nk = ny * cols + nx; nv = add.get(nk);
            if (!nv || !nv.outw || nv.f !== v0.f || nv.outw[0] !== ox || nv.outw[1] !== oy) break;
            run.push(nk); runSeen.add(nk); kx = nx; ky = ny;
          }
          ends.push([kx, ky, sgn]);
        }
        var shows = function (x1, y1) { if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) return false; var k1 = y1 * cols + x1, a1 = add.get(k1); return winF[k1] === v0.f || !!(a1 && a1.f === v0.f); };
        var cut = ends.some(function (en) {
          var x1 = en[0] + en[2] * dx, y1 = en[1] + en[2] * dy, xr = x1 - ox, yr = y1 - oy;
          if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows || xr < 0 || yr < 0 || xr >= cols || yr >= rows) return false;
          if (shows(x1, y1) || shows(xr, yr) || shows(x1 + ox, y1 + oy)) return false;
          return (cov[(y1 * cols + x1) * K + v0.f] + cov[(yr * cols + xr) * K + v0.f]) * S >= RESCUE_LEN;
        });
        if (cut) run.forEach(unAdd);
      });
    }
    // SOLID (round 7): a rescued line is about one cell thick. An added cell that completes a 2 x 2 block of its
    // line's colour (shown or added) where the source does not fill that block (the family holds under SOLID_SHARE
    // of it) draws an area, not a line (Black and White Rays at 8: rays finer than a cell merged into a black blob).
    // Size 8's set only (no KEEP): at 16 two separate thin lines a cell apart (Trainer Cap with Hair: the brim's
    // black outline and the dark line under it) make such a block too, and SOLID broke the outline - measured.
    if (SOLID_ON && !G) {
      var showF = function (k1, f1) { var a1 = add.get(k1); return winF[k1] === f1 || !!(a1 && a1.f === f1); };
      var addKeys = mapEntries(add).map(function (e) { return e[0]; }).sort(function (p1, q1) { return p1 - q1; });
      addKeys.forEach(function (k1) {
        var v1 = add.get(k1); if (!v1) return;
        var x1 = k1 % cols, y1 = (k1 / cols) | 0, sx, sy, q, ok, share, cc, nadd, solid = false;
        for (sy = y1 - 1; sy <= y1 && !solid; sy++) for (sx = x1 - 1; sx <= x1 && !solid; sx++) {
          if (sx < 0 || sy < 0 || sx + 1 >= cols || sy + 1 >= rows) continue;
          ok = true; share = 0; nadd = 0;
          for (q = 0; q < 4; q++) { cc = (sy + (q >> 1)) * cols + sx + (q & 1); if (!showF(cc, v1.f)) { ok = false; break; } share += cov[cc * K + v1.f]; if (winF[cc] !== v1.f) nadd++; }
          if (ok && nadd >= SOLID_ADDED && share < SOLID_SHARE * 4) solid = true;
        }
        if (solid) unAdd(k1);
      });
    }
    add.forEach(function (v, k) {
      var bl = -1, bw = 0, big = -1, l;
      for (l = 0; l < K; l++) if (fam[l] === v.f && ACC[k * K + l] > 0 && (big < 0 || I.cnt[l] > I.cnt[big])) big = l;
      for (l = 0; l < K; l++) if (fam[l] === v.f && ACC[k * K + l] > bw) { bw = ACC[k * K + l]; bl = l; }
      if (v.lab >= 0) bl = v.lab; else if (big >= 0) bl = big;
      if (bl < 0) return;
      win[k] = bl; opaque[k] = 1;
    });

    // no notches: a cell gives a line up only when its neighbours along the line do too (or do not show it)
    function showsF(k, f) { return k >= 0 && opaque[k] && fam[win[k]] === f; }
    var changed = true;
    while (changed) {
      changed = false;
      mapEntries(drop).forEach(function (e) {
        var k = e[0], v = e[1];
        if (add.has(k)) return;
        var x1 = k % cols, y1 = (k / cols) | 0;
        var al = v.horiz ? [y1 > 0 ? k - cols : -1, y1 + 1 < rows ? k + cols : -1] : [x1 > 0 ? k - 1 : -1, x1 + 1 < cols ? k + 1 : -1];
        var bad = al.some(function (q) { return showsF(q, v.f) && !(drop.has(q) && drop.get(q).f === v.f && !add.has(q)); });
        if (bad) { drop.delete(k); changed = true; }
      });
    }
    // give the line up: best other label, or empty when more of the cell is empty
    // than any other colour family; never when that cuts the line's cells apart
    var gone = new Set();
    drop.forEach(function (v, k) {
      if (add.has(k)) return;
      var R = ringOf(k, v.f, true, gone);
      if (R.pieces > 1) return;
      var bl = -1, bw = 0, l, g, bestOther = 0;
      for (l = 0; l < K; l++) if (fam[l] !== v.f && ACC[k * K + l] > bw) { bw = ACC[k * K + l]; bl = l; }
      for (g = 0; g < K; g++) if (fam[g] === g && g !== v.f) bestOther = Math.max(bestOther, cov[k * K + g]);
      var empty = 1 - I.paintCnt[k];
      if (bl < 0 || empty >= bestOther) opaque[k] = 0; else win[k] = bl;
      gone.add(k);
    });
  }

  /* ---------------------------------------------------------- 2. CONNECT */
  function connect(win, opaque, I, cols, rows, K, ACC, bridges) {
    var w = I.w, h = I.h, paint = I.paint, cell = I.cell, N = w * h, n = cols * rows;
    // source pieces: 8-connected paint pixels
    var comp = new Int32Array(N).fill(-1), nc = 0, stack = new Int32Array(N), s, sp, i, x, y, dx, dy, xx, yy, j;
    for (s = 0; s < N; s++) {
      if (!paint[s] || comp[s] >= 0) continue;
      sp = 0; stack[sp++] = s; comp[s] = nc;
      while (sp) {
        i = stack[--sp]; x = i % w; y = (i / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; xx = x + dx; yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          j = yy * w + xx; if (paint[j] && comp[j] < 0) { comp[j] = nc; stack[sp++] = j; }
        }
      }
      nc++;
    }
    // per cell: pixels of each source piece
    var cellPieces = new Array(n), c, m;
    for (i = 0; i < N; i++) {
      if (comp[i] < 0) continue; c = cell[i];
      m = cellPieces[c]; if (!m) { m = new Map(); cellPieces[c] = m; }
      m.set(comp[i], (m.get(comp[i]) || 0) + 1);
    }
    var cellPx = I.cellN;
    // output pieces: 8-connected opaque cells
    var ocomp = new Int32Array(n).fill(-1);
    function labelOut() {
      ocomp.fill(-1);
      var k = 0, st2 = [], c0, e, x0, y0, ddx, ddy, x1, y1, f;
      for (c0 = 0; c0 < n; c0++) {
        if (!opaque[c0] || ocomp[c0] >= 0) continue;
        st2.push(c0); ocomp[c0] = k;
        while (st2.length) {
          e = st2.pop(); x0 = e % cols; y0 = (e / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            x1 = x0 + ddx; y1 = y0 + ddy; if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) continue;
            f = y1 * cols + x1; if (opaque[f] && ocomp[f] < 0) { ocomp[f] = k; st2.push(f); }
          }
        }
        k++;
      }
      return k;
    }
    labelOut();
    // source pieces split over two or more output pieces (each holding >= CONNECT_MINPX of it)
    var holders = new Map();
    for (c = 0; c < n; c++) {
      if (!opaque[c] || !cellPieces[c]) continue;
      cellPieces[c].forEach(function (px, pc) {
        var hm = holders.get(pc); if (!hm) { hm = new Map(); holders.set(pc, hm); }
        hm.set(ocomp[c], (hm.get(ocomp[c]) || 0) + px);
      });
    }
    var pieces = []; holders.forEach(function (v, k) { pieces.push(k); });
    pieces.sort(function (p1, p2) { return p1 - p2; });
    pieces.forEach(function (pc) {
      var sig = 0;
      holders.get(pc).forEach(function (px) { if (px >= CONNECT_MINPX) sig++; });
      if (sig < 2) return;
      var guard = 0;
      while (guard++ < 200) {
        labelOut();
        var hm = new Map(), c1, px1;
        for (c1 = 0; c1 < n; c1++) {
          if (!opaque[c1] || !cellPieces[c1]) continue; px1 = cellPieces[c1].get(pc); if (!px1) continue;
          hm.set(ocomp[c1], (hm.get(ocomp[c1]) || 0) + px1);
        }
        var sg = mapEntries(hm).filter(function (e) { return e[1] >= CONNECT_MINPX; }).sort(function (p1, p2) { return p2[1] - p1[1] || p1[0] - p2[0]; });
        if (sg.length < 2) break;
        var main = sg[0][0], targets = new Set(), ti;
        for (ti = 1; ti < sg.length; ti++) targets.add(sg[ti][0]);
        // cheapest path through empty cells holding the stroke (cost 1.05 - its share)
        var dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), steps = new Int32Array(n), heap = [];
        var push = function (cc, dv) {
          heap.push([dv, cc]); var k = heap.length - 1, pa, tmp;
          while (k > 0) { pa = (k - 1) >> 1; if (heap[pa][0] <= heap[k][0]) break; tmp = heap[pa]; heap[pa] = heap[k]; heap[k] = tmp; k = pa; }
        };
        var pop = function () {
          var top = heap[0], last = heap.pop(), k, l2, r2, m2, tmp;
          if (heap.length) {
            heap[0] = last; k = 0;
            for (;;) {
              l2 = 2 * k + 1; r2 = l2 + 1; m2 = k;
              if (l2 < heap.length && heap[l2][0] < heap[m2][0]) m2 = l2;
              if (r2 < heap.length && heap[r2][0] < heap[m2][0]) m2 = r2;
              if (m2 === k) break;
              tmp = heap[m2]; heap[m2] = heap[k]; heap[k] = tmp; k = m2;
            }
          }
          return top;
        };
        for (c1 = 0; c1 < n; c1++) if (opaque[c1] && ocomp[c1] === main) { dist[c1] = 0; push(c1, 0); }
        var hit = -1, top, dv, cc, x2, y2, ddx, ddy, xx2, yy2, f, nd, ns, pxf, cv;
        while (heap.length) {
          top = pop(); dv = top[0]; cc = top[1]; if (dv > dist[cc]) continue;
          if (opaque[cc] && targets.has(ocomp[cc])) { hit = cc; break; }
          x2 = cc % cols; y2 = (cc / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; xx2 = x2 + ddx; yy2 = y2 + ddy; if (xx2 < 0 || yy2 < 0 || xx2 >= cols || yy2 >= rows) continue;
            f = yy2 * cols + xx2;
            if (opaque[f]) { if (!targets.has(ocomp[f])) continue; nd = dv; ns = steps[cc]; }
            else {
              pxf = cellPieces[f] ? (cellPieces[f].get(pc) || 0) : 0;
              cv = pxf / (cellPx[f] || 1);
              if (cv < CONNECT_MINCOV) continue;
              ns = steps[cc] + 1; if (ns > CONNECT_MAXLEN) continue;
              nd = dv + 1.05 - cv;
            }
            if (nd < dist[f]) { dist[f] = nd; prev[f] = cc; steps[f] = ns; push(f, nd); }
          }
        }
        if (hit < 0) break;
        // the bridge cells become opaque with their best visible label (recoloured after stage 2)
        var cb = prev[hit], made = 0, bl, bw, l;
        while (cb >= 0 && !(opaque[cb] && ocomp[cb] === main)) {
          if (!opaque[cb]) {
            bl = -1; bw = -1; for (l = 0; l < K; l++) { if (ACC[cb * K + l] > bw) { bw = ACC[cb * K + l]; bl = l; } }
            win[cb] = bl; opaque[cb] = 1; made++; bridges.push(cb);
          }
          cb = prev[cb];
        }
        if (!made) break;
      }
    });
  }

  /* ---------------------------------------------------------- 3. SPECKS */
  function specks(modeKey, win, opaque, I, cols, rows, K, d, offs, order, lab, colour) {
    var n = cols * rows, tone = I.tone;
    var reg = new Int32Array(n).fill(-1), nr = 0, labCache = new Map(), stack = [], regions = [];
    function winShare(c) {
      var k = 0, np = 0, p, q;
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; if (!I.paint[q]) continue; np++; if (lab[q] === win[c]) k++; }
      return np ? k / np : 1;
    }
    // region colour: the exact colour (>= FLAT_SHARE of the tone's pixels) nearest the region's mean
    function medoid(cellsR, t) {
      var tally = new Map(), tot = 0, mr = 0, mg = 0, mb = 0, ei, e, p, q, key, bestK = -1;
      for (ei = 0; ei < cellsR.length; ei++) {
        e = cellsR[ei];
        for (p = offs[e]; p < offs[e + 1]; p++) {
          q = order[p]; if (!I.paint[q] || tone[lab[q]] !== t) continue;
          key = (d[q * 4] << 16) | (d[q * 4 + 1] << 8) | d[q * 4 + 2];
          tally.set(key, (tally.get(key) || 0) + 1); tot++; mr += d[q * 4]; mg += d[q * 4 + 1]; mb += d[q * 4 + 2];
        }
      }
      if (tot) {
        var m = colour.labOf(mr / tot, mg / tot, mb / tot), be = Infinity;
        tally.forEach(function (v, k) {
          if (v < FLAT_SHARE * tot) return;
          var lb = colour.labOf((k >> 16) & 255, (k >> 8) & 255, k & 255);
          var e2 = colour.deltaE2000(m[0], m[1], m[2], lb[0], lb[1], lb[2]);
          if (e2 < be || (e2 === be && k < bestK)) { be = e2; bestK = k; }
        });
      }
      return bestK;
    }
    function labK(k) { var v = labCache.get(k); if (!v) { v = colour.labOf((k >> 16) & 255, (k >> 8) & 255, k & 255); labCache.set(k, v); } return v; }
    function dEk(p, q) { if (p === q) return 0; var a = labK(p), b = labK(q); return colour.deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]); }
    var N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var c, t, cellsR, e, x, y, k4, xx, yy, f;
    for (c = 0; c < n; c++) {
      if (!opaque[c] || reg[c] >= 0 || I.toneSize[tone[win[c]]] < 2) continue;
      t = tone[win[c]]; cellsR = [];
      stack.push(c); reg[c] = nr;
      while (stack.length) {
        e = stack.pop(); cellsR.push(e); x = e % cols; y = (e / cols) | 0;
        for (k4 = 0; k4 < 4; k4++) {
          xx = x + N4[k4][0]; yy = y + N4[k4][1]; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          f = yy * cols + xx; if (opaque[f] && reg[f] < 0 && tone[win[f]] === t) { reg[f] = nr; stack.push(f); }
        }
      }
      var bestK = medoid(cellsR, t);
      if (bestK < 0) { nr++; continue; }
      regions.push({ t: t, cells: cellsR, R: bestK });
      // patches of one shade; only a speck changes, to the colour its neighbours already have
      var orig = new Map(), seen = new Set(), ei;
      for (ei = 0; ei < cellsR.length; ei++) orig.set(cellsR[ei], modeKey[cellsR[ei]]);
      for (ei = 0; ei < cellsR.length; ei++) {
        e = cellsR[ei];
        if (seen.has(e)) continue;
        var k0 = orig.get(e), patch = [e], jj, g, gx, gy, to = -1;
        seen.add(e);
        for (jj = 0; jj < patch.length; jj++) {
          g = patch[jj]; gx = g % cols; gy = (g / cols) | 0;
          for (k4 = 0; k4 < 4; k4++) {
            xx = gx + N4[k4][0]; yy = gy + N4[k4][1]; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
            f = yy * cols + xx; if (reg[f] === nr && !seen.has(f) && dEk(orig.get(f), k0) < PATCH_DE) { seen.add(f); patch.push(f); }
          }
        }
        var dk = dEk(k0, bestK);
        if (dk < PATCH_DE) continue;                 // the region's own shade keeps its exact colour
        var noise = patch.every(function (q) { return winShare(q) < SPECK_COVER; });
        if (noise && patch.length <= SPECK_MAX && dk <= SPECK_DE) {
          var inP = new Set(patch), ok = true, nIn = 0, ntal = new Map(), pi, ddy, ddx, dn;
          for (pi = 0; pi < patch.length && ok; pi++) {
            g = patch[pi]; gx = g % cols; gy = (g / cols) | 0;
            for (ddy = -1; ddy <= 1 && ok; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
              if (!ddx && !ddy) continue; xx = gx + ddx; yy = gy + ddy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
              f = yy * cols + xx; if (inP.has(f) || reg[f] !== nr) continue;
              nIn++; dn = dEk(orig.get(f), bestK);
              if (dn > NEIGH_DE) { ok = false; break; }
              ntal.set(orig.get(f), (ntal.get(orig.get(f)) || 0) + 1);
            }
          }
          if (ok && nIn > 0) {
            var bk = -1, bn = -1;
            ntal.forEach(function (v, k) { if (v > bn || (v === bn && k < bk)) { bn = v; bk = k; } });
            to = bk;
          }
        }
        if (to < 0) continue;
        for (pi = 0; pi < patch.length; pi++) modeKey[patch[pi]] = to;
      }
      nr++;
    }
    // walled-in pieces of a tone take the tone's colour from elsewhere in the picture
    var byTone = new Map();
    regions.forEach(function (r) { var a = byTone.get(r.t); if (!a) { a = []; byTone.set(r.t, a); } a.push(r); });
    byTone.forEach(function (rs, t2) {
      if (rs.length < 2) return;
      var all = [];
      rs.forEach(function (r) { for (var i2 = 0; i2 < r.cells.length; i2++) all.push(r.cells[i2]); });
      var G = medoid(all, t2); if (G < 0) return;
      rs.forEach(function (r) {
        if (r.cells.length > SMALLREG_MAX) return;
        if (!r.cells.every(function (q) { return winShare(q) < SPECK_COVER; })) return;
        var k0 = modeKey[r.cells[0]];
        if (!r.cells.every(function (q) { return dEk(modeKey[q], k0) < PATCH_DE; })) return;
        var dg = dEk(k0, G);
        if (dg < PATCH_DE || dg > SPECK_DE) return;
        var tal = new Map(), tk = G, tn = -1;
        rs.forEach(function (r2) { if (r2 === r) return; for (var i3 = 0; i3 < r2.cells.length; i3++) { var kk = modeKey[r2.cells[i3]]; if (dEk(kk, G) < PATCH_DE) tal.set(kk, (tal.get(kk) || 0) + 1); } });
        tal.forEach(function (v, k) { if (v > tn || (v === tn && k < tk)) { tn = v; tk = k; } });
        for (var i4 = 0; i4 < r.cells.length; i4++) modeKey[r.cells[i4]] = tk;
      });
    });
  }

  /* ---------------------------------------------------------- PIECES (size 16)
     A piece is one LINE family's own 8-connected pixels (I.line): a collar
     line inside a grey shirt is one piece, the shirt another. Shared by
     STROKE and by KEEP. Built once per picture, and only when a size-16 rule
     is on, so size 8 never pays for it. */
  function pieces(I) {
    var w = I.w, h = I.h, N = w * h, fam = I.line, famPix = new Int32Array(N), i, x, y, dx, dy, xx, yy, j, s, sp;
    for (i = 0; i < N; i++) famPix[i] = I.paint[i] ? fam[I.lab[i]] : -1;
    var comp = new Int32Array(N).fill(-1), nc = 0, stack = new Int32Array(N), compFam = [], compPx = [];
    for (s = 0; s < N; s++) {
      if (famPix[s] < 0 || comp[s] >= 0) continue;
      var f0 = famPix[s], cntc = 0;
      sp = 0; stack[sp++] = s; comp[s] = nc;
      while (sp) {
        i = stack[--sp]; cntc++; x = i % w; y = (i / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; xx = x + dx; yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          j = yy * w + xx; if (famPix[j] === f0 && comp[j] < 0) { comp[j] = nc; stack[sp++] = j; }
        }
      }
      compFam.push(f0); compPx.push(cntc); nc++;
    }
    /* the colour OUTSIDE a piece: the family of the biggest other piece its pixels touch. An
       outline goes round the smaller shape: a white outline between a yellow letter and a navy
       hoodie has navy outside, so the letter is the shape it outlines. */
    var outBest = null;
    function outsideOf(pc) {
      if (pc < 0) return -1;
      if (!outBest) {
        outBest = new Int32Array(nc).fill(-1);
        var u, v, k2, dx2, dy2, o2, p2;
        for (k2 = 0; k2 < N; k2++) {
          p2 = comp[k2]; if (p2 < 0) continue; u = k2 % w; v = (k2 / w) | 0;
          for (dy2 = -1; dy2 <= 1; dy2++) for (dx2 = -1; dx2 <= 1; dx2++) {
            if (u + dx2 < 0 || v + dy2 < 0 || u + dx2 >= w || v + dy2 >= h) continue;
            o2 = comp[k2 + dy2 * w + dx2];
            if (o2 >= 0 && o2 !== p2 && (outBest[p2] < 0 || compPx[o2] > compPx[outBest[p2]] || (compPx[o2] === compPx[outBest[p2]] && o2 < outBest[p2]))) outBest[p2] = o2;
          }
        }
      }
      return outBest[pc] >= 0 ? compFam[outBest[pc]] : -1;
    }
    /* how deep each pixel sits inside its own family (chessboard px to the nearest pixel of
       another family or of transparency; the picture's edge is not a boundary) */
    var depth = null;
    function depthMap() {
      if (depth) return depth;
      depth = new Int32Array(N); var BIG = 1 << 20, f;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        i = y * w + x; f = famPix[i]; if (f < 0) { depth[i] = 0; continue; }
        var edge = false;
        for (dy = -1; dy <= 1 && !edge; dy++) for (dx = -1; dx <= 1; dx++) {
          xx = x + dx; yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (famPix[yy * w + xx] !== f) { edge = true; break; }
        }
        depth[i] = edge ? 1 : BIG;
      }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        i = y * w + x; if (depth[i] <= 1) continue;
        if (x > 0) depth[i] = Math.min(depth[i], depth[i - 1] + 1);
        if (y > 0) { depth[i] = Math.min(depth[i], depth[i - w] + 1); if (x > 0) depth[i] = Math.min(depth[i], depth[i - w - 1] + 1); if (x + 1 < w) depth[i] = Math.min(depth[i], depth[i - w + 1] + 1); }
      }
      for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
        i = y * w + x; if (depth[i] <= 1) continue;
        if (x + 1 < w) depth[i] = Math.min(depth[i], depth[i + 1] + 1);
        if (y + 1 < h) { depth[i] = Math.min(depth[i], depth[i + w] + 1); if (x + 1 < w) depth[i] = Math.min(depth[i], depth[i + w + 1] + 1); if (x > 0) depth[i] = Math.min(depth[i], depth[i + w - 1] + 1); }
      }
      return depth;
    }
    /* transparency that is a HOLE: empty pixels not 4-connected to the picture's edge */
    var holes = null;
    function holeMap() {
      if (holes) return holes;
      holes = new Uint8Array(N); var reach = new Uint8Array(N), st = new Int32Array(N), n2 = 0, k, kx;
      for (k = 0; k < N; k++) { kx = k % w; if (famPix[k] < 0 && (kx === 0 || kx === w - 1 || k < w || k >= N - w)) { reach[k] = 1; st[n2++] = k; } }
      while (n2) {
        k = st[--n2]; kx = k % w;
        if (kx > 0 && !reach[k - 1] && famPix[k - 1] < 0) { reach[k - 1] = 1; st[n2++] = k - 1; }
        if (kx + 1 < w && !reach[k + 1] && famPix[k + 1] < 0) { reach[k + 1] = 1; st[n2++] = k + 1; }
        if (k >= w && !reach[k - w] && famPix[k - w] < 0) { reach[k - w] = 1; st[n2++] = k - w; }
        if (k + w < N && !reach[k + w] && famPix[k + w] < 0) { reach[k + w] = 1; st[n2++] = k + w; }
      }
      for (k = 0; k < N; k++) if (famPix[k] < 0 && !reach[k]) holes[k] = 1;
      return holes;
    }
    return { famPix: famPix, comp: comp, nc: nc, compFam: compFam, compPx: compPx, outsideOf: outsideOf, depthMap: depthMap, holeMap: holeMap };
  }

  /* KEEP (size 16): what a line rule may not replace. A cell whose colour is
     the shape a line outlines (the piece's outside is another colour) keeps
     its colour: GATE Hoodie's white outline must not turn the yellow letter
     cells white. A cell whose colour is itself a line there (no thicker than
     KEEP_THIN of a cell inside that cell) keeps it: one line is not drawn by
     cutting another (STROKE turned GATE's thin white outline yellow). */
  function keeper(P, I, cols, rows, S) {
    var fam = I.line, cell = I.cell, w = I.w, thin = new Map();
    /* SILHOUETTE (round 5): the line pc is the shape's outline against the OUTSIDE transparency here, so the
       cell's colour gf is what it outlines, never its outside. outsideOf counts painted pieces only, so for an
       outline on transparency the one colour it touches - the shape it goes round - read as its outside, and
       the line took that shape's cells: Eight Lines Specs lost the cream rim of both lenses (its only cell
       across) to the black outline, AirPod and Small White Figure got black inside the white body. Local, in
       the 3 x 3 cells round g: an inner line that meets the silhouette somewhere else (Dogecoin Polo's
       placket) keeps today's KEEP rule. */
    /* MEMO KEYS (round 6 judge): pc * NCELL + g, one number per (piece, cell) pair. The round-5 key
       g * 65536 + pc collided once a picture had more than 65,536 pixel pieces, which a background now
       reaching these rules has (R Place Mosaic: 115,129 at 16); g < NCELL makes this key exact. */
    var NCELL = cols * rows;
    var edgeMemo = new Map();
    function edgeAt(g, gf, pc) {
      var key = pc * NCELL + g; if (edgeMemo.has(key)) return edgeMemo.get(key);
      var H2 = P.holeMap(), hh = I.h, gx = g % cols, gy = (g / cols) | 0;
      var x0 = Math.max(0, (gx - 1) * S), y0 = Math.max(0, (gy - 1) * S), x1 = Math.min(w, (gx + 2) * S), y1 = Math.min(hh, (gy + 2) * S);
      var tc = 0, oc = 0, u, v, k, dd, j, xx2, yy2, DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
      for (v = y0; v < y1; v++) for (u = x0; u < x1; u++) {
        k = v * w + u; if (P.comp[k] !== pc) continue;
        for (dd = 0; dd < 4; dd++) {
          xx2 = u + DX[dd]; yy2 = v + DY[dd]; if (xx2 < 0 || yy2 < 0 || xx2 >= w || yy2 >= hh) continue;
          j = yy2 * w + xx2;
          if (P.famPix[j] < 0) { if (!H2[j]) tc++; }
          else if (P.famPix[j] === gf) oc++;
        }
      }
      var r = tc >= EDGE_MINPX && tc >= EDGE_OUT * oc; edgeMemo.set(key, r); return r;
    }
    /* is the piece pc a line where it crosses cell g (no thicker than KEEP_THIN of a cell there)? */
    var thinP = new Map();
    function thinPiece(g, pc) {
      var key = pc * NCELL + g; if (thinP.has(key)) return thinP.get(key);
      var D = P.depthMap(), x0 = (g % cols) * S, y0 = ((g / cols) | 0) * S, mx = 0, u, v, k;
      for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { k = v * w + u; if (P.comp[k] === pc && D[k] > mx) mx = D[k]; }
      var r = 2 * mx <= STROKE_THICK * S; thinP.set(key, r); return r;
    }
    function thinAt(g, gf) {
      var key = g * 4096 + gf; if (thin.has(key)) return thin.get(key);
      var D = P.depthMap(), x0 = (g % cols) * S, y0 = ((g / cols) | 0) * S, mx = 0, u, v, k;
      for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { k = v * w + u; if (P.famPix[k] === gf && D[k] > mx) mx = D[k]; }
      var r = 2 * mx <= KEEP_THIN * S; thin.set(key, r); return r;
    }
    return {
      bandPiece: function (f, ax, ay, lo, hi, horiz) {
        var cnt = new Map(), best = -1, bn = 0, uu, vv, xx, yy, ii, pc;
        for (uu = lo; uu <= hi; uu++) for (vv = 0; vv < S; vv++) {
          xx = horiz ? ax + uu : ax + vv; yy = horiz ? ay + vv : ay + uu; ii = yy * w + xx;
          if (P.famPix[ii] !== f) continue; pc = P.comp[ii]; cnt.set(pc, (cnt.get(pc) || 0) + 1);
        }
        cnt.forEach(function (v2, k2) { if (v2 > bn || (v2 === bn && k2 < best)) { bn = v2; best = k2; } });
        return best;
      },
      inHole: function (g) {
        // an empty cell whose transparency is mostly a HOLE in the art (an eye slit, a lens), not the outside
        var H2 = P.holeMap(), x0 = (g % cols) * S, y0 = ((g / cols) | 0) * S, hole = 0, out = 0, u, v, k;
        for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { k = v * w + u; if (P.famPix[k] >= 0) continue; if (H2[k]) hole++; else out++; }
        return hole > out;
      },
      mayTake: function (g, gf, pc, stroke) {
        var out = P.outsideOf(pc);
        if (out >= 0 && gf !== out) return false;
        if (stroke && edgeAt(g, gf, pc)) return false;
        return !thinAt(g, gf);
      },
      edgeAt: edgeAt,
      thinPiece: thinPiece
    };
  }

  /* ---------------------------------------------------------- 4. STROKE (size 16)
     A drawn line thinner than a cell, drawn ON a fill (a collar line on the
     shirt, a white outline round a letter): CONNECT only sees paint on
     transparency, so on a fill the line has no piece of its own and comes out
     as dots. A stroke is one piece (see PIECES).
     A GAP is two cells showing the stroke's family, each holding at least
     STROKE_MINPX cell-widths of its pixels, 2..STROKE_MAXLEN+1 cells apart, that
       - are not joined by cells of that family inside the box around them
         (one cell of margin): a gap, not two ends of one shown line; and
       - ARE joined by the stroke's own pixels inside that box, by a path no
         longer than STROKE_BEND x the distance between the cell centres plus
         a cell: the source runs straight across the gap (two parallel lines
         that meet far away are not a gap).
     The gap is filled by the fewest cells that hold the stroke (each at least
     STROKE_MINCOV of the cell; the cheapest holds most of it), and only cells
       - already opaque: an added cell on the silhouette was outlined into a
         bump by the outline pass (Sorcerer Hunter, Cannabis Trucker);
       - whose winner differs from the family by LINE_CON_DE (a line contrasts);
       - whose own colour is not a one-cell line there (the ring test) and that
         KEEP lets it take (the outside colour, and not itself a line);
       - preferring cells whose own colour holds less of them (STROKE_HELD).
     Every added cell joins two shown pieces, so it cannot hang a cell off a
     clean outline: a clean outline has no gap. */
  function stroke(win, opaque, I, cols, rows, K, S, P, G) {
    var w = I.w, n = cols * rows, fam = I.line, cell = I.cell, N = I.w * I.h, i, dx, dy, xx, yy, j;
    var comp = P.comp, nc = P.nc, compFam = P.compFam, compPx = P.compPx, made = new Uint8Array(n);
    var minPx = STROKE_MINPX * S;
    var cellPieces = new Array(n), c, m;
    for (i = 0; i < N; i++) {
      if (comp[i] < 0 || compPx[comp[i]] < 2 * minPx) continue; c = cell[i];
      m = cellPieces[c]; if (!m) { m = new Map(); cellPieces[c] = m; }
      m.set(comp[i], (m.get(comp[i]) || 0) + 1);
    }
    function pxOf(c1, pc) { return cellPieces[c1] ? (cellPieces[c1].get(pc) || 0) : 0; }
    function shows(c1, f) { return opaque[c1] && fam[win[c1]] === f; }
    var dist = new Int32Array(N).fill(-1), q = new Int32Array(N);
    // are cells a and b joined by pixels of piece pc inside box [bx0..bx1] x [by0..by1] (cells), within maxSteps?
    function srcJoined(pc, a, b, bx0, by0, bx1, by1, maxSteps) {
      var px0 = bx0 * S, py0 = by0 * S, px1 = (bx1 + 1) * S, py1 = (by1 + 1) * S, qh = 0, qt = 0, touched = [], ok = false, u, v, k, ax = (a % cols) * S, ay = ((a / cols) | 0) * S;
      for (v = ay; v < ay + S; v++) for (u = ax; u < ax + S; u++) { k = v * w + u; if (comp[k] === pc) { dist[k] = 0; q[qt++] = k; touched.push(k); } }
      while (qh < qt && !ok) {
        k = q[qh++]; if (cell[k] === b) { ok = true; break; }
        if (dist[k] >= maxSteps) continue;
        u = k % w; v = (k / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          xx = u + dx; yy = v + dy; if (xx < px0 || yy < py0 || xx >= px1 || yy >= py1) continue;
          j = yy * w + xx; if (comp[j] !== pc || dist[j] >= 0) continue;
          dist[j] = dist[k] + 1; q[qt++] = j; touched.push(j);
        }
      }
      for (k = 0; k < touched.length; k++) dist[touched[k]] = -1;
      return ok;
    }
    // are a and b joined by cells showing f inside the box?
    function outJoined(f, a, b, bx0, by0, bx1, by1) {
      var seen = new Set([a]), st = [a], e, ex, ey, ddx, ddy, gx, gy, g;
      while (st.length) {
        e = st.pop(); if (e === b) return true; ex = e % cols; ey = (e / cols) | 0;
        for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
          gx = ex + ddx; gy = ey + ddy; if (gx < bx0 || gy < by0 || gx > bx1 || gy > by1) continue;
          g = gy * cols + gx; if (!seen.has(g) && shows(g, f)) { seen.add(g); st.push(g); }
        }
      }
      return false;
    }
    var R = STROKE_MAXLEN + 1, pcs = [];
    for (var pc0 = 0; pc0 < nc; pc0++) if (compPx[pc0] >= 2 * minPx) pcs.push(pc0);
    pcs.sort(function (p, q2) { return compPx[q2] - compPx[p] || p - q2; });
    pcs.forEach(function (pc) {
      var f = compFam[pc], ends = [], c1, a, b, ka, kb;
      for (c1 = 0; c1 < n; c1++) if (shows(c1, f) && pxOf(c1, pc) >= minPx) ends.push(c1);
      var pairs = [];
      for (ka = 0; ka < ends.length; ka++) for (kb = ka + 1; kb < ends.length; kb++) {
        a = ends[ka]; b = ends[kb];
        var ddx0 = Math.abs(a % cols - b % cols), ddy0 = Math.abs(((a / cols) | 0) - ((b / cols) | 0)), ch = Math.max(ddx0, ddy0);
        if (ch < 2 || ch > R) continue;
        pairs.push([ch, Math.hypot(ddx0, ddy0), a, b]);
      }
      pairs.sort(function (p, q2) { return p[0] - q2[0] || p[1] - q2[1] || p[2] - q2[2] || p[3] - q2[3]; });
      pairs.forEach(function (pr) {
        var a2 = pr[2], b2 = pr[3], ax = a2 % cols, ay = (a2 / cols) | 0, bx = b2 % cols, by = (b2 / cols) | 0;
        var bx0 = Math.max(0, Math.min(ax, bx) - 1), by0 = Math.max(0, Math.min(ay, by) - 1), bx1 = Math.min(cols - 1, Math.max(ax, bx) + 1), by1 = Math.min(rows - 1, Math.max(ay, by) + 1);
        if (outJoined(f, a2, b2, bx0, by0, bx1, by1)) return;
        // round 5: STROKE joins a LINE; a piece as thick as a cell at either end is a fill (Diagonal Reflection
        // Glasses: the black lens was 'joined' across its own white highlight, which broke the highlight)
        if (G && (!G.thinPiece(a2, pc) || !G.thinPiece(b2, pc))) return;
        if (!srcJoined(pc, a2, b2, bx0, by0, bx1, by1, Math.round(STROKE_BEND * pr[1] * S + S))) return;
        // fewest cells holding the stroke, inside the box (cells change only after a path is found)
        var best = new Map(), heap = [[0, 0, a2, -1]], prev = new Map(), top, e, ex, ey, ddx, ddy, gx, gy, g, cv, cost, hit = false;
        best.set(a2, 0);
        while (heap.length) {
          heap.sort(function (p, q2) { return p[0] - q2[0] || p[2] - q2[2]; });
          top = heap.shift(); e = top[2];
          if (top[0] > best.get(e)) continue;
          if (e === b2) { hit = true; break; }
          ex = e % cols; ey = (e / cols) | 0;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; gx = ex + ddx; gy = ey + ddy; if (gx < bx0 || gy < by0 || gx > bx1 || gy > by1) continue;
            g = gy * cols + gx;
            if (g === b2) cost = top[0];
            else {
              if (shows(g, f)) continue;                                   // through the gap only
              cv = pxOf(g, pc) / (I.cellN[g] || 1);
              if (cv < STROKE_MINCOV || made[g]) continue;
              if (!opaque[g]) continue;                                    // on transparency CONNECT does it
              if (I.dE[fam[win[g]] * K + f] < LINE_CON_DE) continue;
              if (top[1] + 1 > STROKE_MAXLEN) continue;
              // never through a cell whose own colour is a line one cell wide there (it would be cut)
              var gf = fam[win[g]], rg = [], r8, rx, ry;
              for (r8 = 0; r8 < 8; r8++) { rx = gx + RING[r8][0]; ry = gy + RING[r8][1]; rg.push(rx >= 0 && ry >= 0 && rx < cols && ry < rows && shows(ry * cols + rx, gf) ? 1 : 0); }
              if (ringPieces(rg) > 1) continue;
              // an outline goes round the smaller shape: only the outside colour gives way
              if (G) { if (!G.mayTake(g, gf, pc, true)) continue; }
              else if (gf !== P.outsideOf(pc)) continue;
              cost = top[0] + 1.05 - cv + STROKE_HELD * I.cov[g * K + gf];
            }
            if (!best.has(g) || cost < best.get(g)) { best.set(g, cost); prev.set(g, e); heap.push([cost, g === b2 ? top[1] : top[1] + 1, g]); }
          }
        }
        if (!hit) return;
        var cb = prev.get(b2), path = [];
        while (cb !== undefined && cb !== a2) { path.push(cb); cb = prev.get(cb); }
        path.forEach(function (pcell) {
          // the label drawing the stroke here: most of the stroke's own pixels in this cell
          var cnt = new Map(), bl = -1, bw = 0, u, v, k2, px0 = (pcell % cols) * S, py0 = ((pcell / cols) | 0) * S;
          for (v = py0; v < py0 + S; v++) for (u = px0; u < px0 + S; u++) { k2 = v * w + u; if (comp[k2] === pc) cnt.set(I.lab[k2], (cnt.get(I.lab[k2]) || 0) + 1); }
          cnt.forEach(function (vv, l2) { if (vv > bw || (vv === bw && l2 < bl)) { bw = vv; bl = l2; } });
          if (bl < 0) return;
          win[pcell] = bl; opaque[pcell] = 1; made[pcell] = 1;
        });
      });
    });
  }


  /* GATE (Pixel size 16 only: rules.gate; round 4). The page's outline pass (fixOutlineOnce in index.html)
     picks the shapes it works on from the CELLS: an 8-connected shape of at least 200 cells with at least 6
     cells touching empty space, whose edge cells are at least half pure black (or 60% near-black, luminance
     <= 16). A shape it picks gets every dark edge cell painted black and its doubled border peeled; a shape
     it skips is left alone (or, with the source picture, gets only its drawn line back). So when a rule
     adds a few black cells to an edge, the pass can switch on for the whole shape and repaint far more
     than the rule did: Desert Jedi Robes - 2 black cells added to the right outline, then the pass painted
     the dark-brown sleeve's left column black where the source draws a hairline and peeled its dark
     shading strip to peach (round 3: 175 cells changed for 42 the rules made). Cyclops Ruby Visor - a
     black edge added along the temple arm, then the pass peeled the visor's black left frame to grey.
     The guard paints today's vote and the repaired vote the same way (stage 2, before the palette),
     applies the pass's test to both, and wherever a shape's answer differs it puts back today's cells
     for every cell the rules changed in that shape (and in the shape it overlaps most on the other side);
     repeated, as an undo can join or split shapes, at most GATE_ROUNDS times.
     THE PASS'S NUMBERS COME FROM THE PAGE (round 6): colour.gate is the page's OUTLINE_GATE, the object
     fixOutlineOnce itself reads, sent with the message (fixLines16Gate). Superseded (rounds 4-5): a private
     copy here (GATE_FRAC 0.5, GATE_NEAR_FRAC 0.6, GATE_MIN_AREA 200, GATE_MIN_RING 6, GATE_NEAR_LUM 16) that
     had to "follow" the pass by hand; patch620 then gave the pass's gate a dark-grey near-black (nearG:
     luminance <= NEAR_GATE_LUM 22.5, channels within NEAR_GATE_SPREAD 6) and the copy did not follow - a
     copy drifts silently. A missing number throws by name: a guard asking a different question from the
     pass would look like a guard. Near-black here is the pass's nearG exactly (luminance <= NEAR_BLACK_LUM,
     or a grey within NEAR_GATE_SPREAD up to NEAR_GATE_LUM), and a shape is picked by the pass's own
     comparisons (pure >= OUTLINED_FRAC x ring, or near >= OUTLINED_NEAR_FRAC x ring).
     Still a difference from the pass, by place not by number: the guard tests the cells after the
     page's palette step (colour.snap) but before the pass's source gate [S1], which can pick a shape the
     cell test skips; the guard does not ask that question. */
  var GATE_ROUNDS = 4, GATE_DECISIVE = 1.5;
  var GATE_KEYS = ['OUTLINED_FRAC', 'OUTLINED_NEAR_FRAC', 'MIN_AREA', 'MIN_RING', 'NEAR_BLACK_LUM', 'NEAR_GATE_LUM', 'NEAR_GATE_SPREAD'];
  function gateNumbers(g) {
    if (!g || typeof g !== 'object') throw new Error('pf-42-repair8.js: colour.gate must be the page\'s outline gate (OUTLINE_GATE), got ' + typeof g);
    GATE_KEYS.forEach(function (k) {
      if (typeof g[k] !== 'number' || !isFinite(g[k])) throw new Error('pf-42-repair8.js: colour.gate.' + k + ' is missing -- the page sends OUTLINE_GATE');
    });
    return g;
  }
  function gateParts(c, cols, rows, GT) {
    var n = cols * rows, part = new Int32Array(n).fill(-1), q = new Int32Array(n), np = 0, i, a, x, y, dx, dy, j, qh, qt, p;
    var area = [], ring = [], pure = [], near = [];
    function op(k) { return c[k * 4 + 3] >= 128; }
    for (i = 0; i < n; i++) {
      if (!op(i) || part[i] >= 0) continue;
      p = np++; area.push(0); ring.push(0); pure.push(0); near.push(0);
      qh = 0; qt = 0; q[qt++] = i; part[i] = p;
      while (qh < qt) {
        a = q[qh++]; x = a % cols; y = (a / cols) | 0; area[p]++;
        if ((x > 0 && !op(a - 1)) || (x < cols - 1 && !op(a + 1)) || (y > 0 && !op(a - cols)) || (y < rows - 1 && !op(a + cols))) {
          ring[p]++;
          var r0 = c[a * 4], g0 = c[a * 4 + 1], b0 = c[a * 4 + 2];
          if (!r0 && !g0 && !b0) pure[p]++;
          var lum0 = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;   // the pass's nearG
          if (lum0 <= GT.NEAR_BLACK_LUM || (lum0 <= GT.NEAR_GATE_LUM && Math.max(r0, g0, b0) - Math.min(r0, g0, b0) <= GT.NEAR_GATE_SPREAD)) near[p]++;
        }
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          j = ny * cols + nx; if (op(j) && part[j] < 0) { part[j] = p; q[qt++] = j; }
        }
      }
    }
    var sel = new Uint8Array(np), score = new Float64Array(np);
    for (p = 0; p < np; p++) {
      score[p] = ring[p] ? Math.max(pure[p] / (GT.OUTLINED_FRAC * ring[p]), near[p] / (GT.OUTLINED_NEAR_FRAC * ring[p])) : 0;
      sel[p] = (area[p] >= GT.MIN_AREA && ring[p] >= GT.MIN_RING &&
        (pure[p] >= GT.OUTLINED_FRAC * ring[p] || near[p] >= GT.OUTLINED_NEAR_FRAC * ring[p])) ? 1 : 0;
    }
    return { part: part, n: np, sel: sel, area: area, score: score };
  }
  /* shapes whose answer differs between today's cells (lowT) and the repaired ones (low); undo = the
     rule-changed cells to put back */
  function gateFlips(lowT, low, winT, opaqueT, win, opaque, cols, rows, GT) {
    var n = cols * rows, A = gateParts(lowT, cols, rows, GT), B = gateParts(low, cols, rows, GT), i, p, q;
    var bad = new Uint8Array(B.n), badA = new Uint8Array(A.n), k = 0;
    function match(X, Y, from) {   // for each part of X, the part of Y it overlaps most
      var best = new Int32Array(X.n).fill(-1), cnt = new Map(), key;
      for (i = 0; i < n; i++) { p = X.part[i]; q = Y.part[i]; if (p < 0 || q < 0) continue; key = p * 65536 + q; cnt.set(key, (cnt.get(key) || 0) + 1); }
      var bn = new Float64Array(X.n);
      cnt.forEach(function (v, kk) { var pp = Math.floor(kk / 65536), qq = kk % 65536; if (v > bn[pp] || (v === bn[pp] && qq < best[pp])) { bn[pp] = v; best[pp] = qq; } });
      return best;
    }
    var bToA = match(B, A), aToB = match(A, B);
    // a shape the rules switch ON decisively (its edge is now plainly a black outline: score >= GATE_DECISIVE,
    // e.g. Noun Glasses Original, whose missing frame the rules restore: pure-black edge share 0.46 -> 1.00) is
    // left switched on; any other change of answer is undone
    for (p = 0; p < B.n; p++) { q = bToA[p]; var sa = q >= 0 ? A.sel[q] : 0; if (sa !== B.sel[p] && !(B.sel[p] && B.score[p] >= GATE_DECISIVE)) { bad[p] = 1; if (q >= 0) badA[q] = 1; k++; } }
    for (q = 0; q < A.n; q++) { p = aToB[q]; var sb = p >= 0 ? B.sel[p] : 0; if (sb !== A.sel[q] && !(sb && B.score[p] >= GATE_DECISIVE)) { badA[q] = 1; if (p >= 0) bad[p] = 1; k++; } }
    var undo = new Uint8Array(n), m = 0;
    if (k) for (i = 0; i < n; i++) {
      if (win[i] === winT[i] && opaque[i] === opaqueT[i]) continue;
      if ((B.part[i] >= 0 && bad[B.part[i]]) || (A.part[i] >= 0 && badA[A.part[i]])) { undo[i] = 1; m++; }
    }
    return { n: m, undo: undo };
  }

  /* PALETTE (round 6, every size; colour.snap = the page's own palette step, given when it is on).
     The page's palette step does not map each colour on its own: it groups the cells' colours by count
     and gives the groups palette colours together, keeping drawn shades apart where it can (snapToPalette,
     patch617/620). So a repair that changes a handful of cells can change the counts enough to move the
     palette's answer for hundreds it never touched: Walnut Chessboard Skin at 8 - the specks rule
     recoloured 4 cells, and the palette then put all 201 dark-grain cells (#613105) on the dark square's
     brown (#954209): the grain was gone. Measured over the 311 traits at 8 with the repairs on every
     picture: 8,139 such cells in 45 files (backgrounds, skins, a few costumes and clothing), none of them
     a line. The guard paints the vote with no rule at all and the repaired vote, snaps copies of both
     with the page's palette step, and finds the cells the rules did not change whose palette colour
     changed anyway. Up to PALETTE_SHARE of the cells the rules changed is let through: restoring a line
     adds cells of its colour, and the palette may answer that colour's shades a little differently
     (Circuit Board Skin at 16: 145 trace cells restored, 6 gold cells moved between two golds; refusing
     that took back every trace). Beyond it (Walnut: 192 moved for 4 repaired; Anfield Tunnel at 16: the
     left wall's dark-red shading merged into the red, 198 for 32), the rule-changed cells that sit on a palette colour involved in
     that move (the knocked cells' colour before or after) go back to the vote's own cell, and it is
     asked again, at most GUARD_ROUNDS times; if the palette still moves, the picture keeps the cells the
     vote made (no rule). A rule-changed cell on any other palette colour stays repaired. */
  var GUARD_ROUNDS = 6, PALETTE_SHARE = 0.25;
  function paletteKnock(lowP, low, seenP, seenX, n) {
    var changed = new Uint8Array(n), inv = new Set(), c, o, k = 0, m = 0, undo = new Uint8Array(n);
    function key(a, o2) { return a[o2 + 3] < 128 ? -1 : (a[o2] << 16) | (a[o2 + 1] << 8) | a[o2 + 2]; }
    for (c = 0, o = 0; c < n; c++, o += 4) {
      if (low[o] !== lowP[o] || low[o + 1] !== lowP[o + 1] || low[o + 2] !== lowP[o + 2] || low[o + 3] !== lowP[o + 3]) { changed[c] = 1; continue; }
      if (key(seenP, o) !== key(seenX, o)) { k++; inv.add(key(seenP, o)); inv.add(key(seenX, o)); }
    }
    var nch = 0; for (c = 0; c < n; c++) nch += changed[c];
    if (k <= PALETTE_SHARE * nch) return { n: 0, knocked: k, undo: undo };   // in proportion to what was repaired
    inv.delete(-1);
    for (c = 0, o = 0; c < n; c++, o += 4) if (changed[c] && (inv.has(key(seenP, o)) || inv.has(key(seenX, o)))) { undo[c] = 1; m++; }
    if (!m) for (c = 0; c < n; c++) if (changed[c]) { undo[c] = 1; m++; }   // the cause is not on those colours: all of it
    return { n: m, knocked: k, undo: undo };
  }

  /* ---------------------------------------------------------- 6. HUG (round 8, both sizes)
     A thin line drawn BETWEEN a shape and the fill round it - GATE Hoodie's white outline round the yellow
     letters on the navy hoodie - is thinner than a cell (6-7 px: under half a cell at 16), so the vote gives
     each cell it crosses to the letter or to the navy and the outline comes out as scattered dots. RESCUE
     draws only a line that STRADDLES two cells; measured on GATE at 16, of 317 pair profiles where the white
     filled at least half a pixel line on 4 or more lines, 135 lay inside one cell, 104 were slanted or thin
     enough that under 4 pixel lines were FULL, 28 were two bands and 22 ran on into the next cell; of the 28
     single straddling bands 12 were 4-5 px on their full lines (under PAINT_LEN), 6 under RESCUE_MIN, 6 refused
     by KEEP (the cell was the letter, or thin), 2 already shown, 2 drawn. STROKE joined 7 of 56 gaps (10
     cells). The GATE and PALETTE guards undid nothing. So the line keeper's 12 cells there were RESCUE's 2 and
     STROKE's 10, and the cause is the vote plus RESCUE's straddle-only reach, not a guard.
     A pixel artist draws such a line as a ring of cells just outside the shape. HUG does that, from the
     picture alone:
       the LINE is one piece (PIECES) of one LINE family, thin (2 x its pixels / its edge contacts at most
       HUG_THICK of a cell), at least HUG_MINPX cells of pixels; its two SIDES are read past slivers (each edge
       walked outward up to HUG_REACH px to the first colour at least 3 px thick: an anti-alias row or a speck
       is not a side); its OUTSIDE is outsideOf (the biggest piece it touches) and its SHAPE the family it
       touches most besides; each holds HUG_SIDE of its edge, transparency at most HUG_CLEAR (an outline on
       the silhouette is the outline pass's); line, shape and outside contrast pairwise (RIM_DE);
       ROUND: the line goes ROUND the shape - the shape's pieces it lies against are edged by the line's colour
       for at least HUG_ROUND of their own edge - and not round the outside (the outside's pieces it touches
       are edged by it for less than that: a lining inside a letter's counter has the letter as its biggest
       neighbour, and the letter is lined all round, so it is refused and the counter stays as the vote made it).
     Then every cell that shows the OUTSIDE colour, beside (4-neighbour) a cell that shows the SHAPE, takes the
     line when it and the half of that shape cell facing it hold HUG_PX cell-widths of the line's pixels (the
     line may lie wholly in the shape's cell: it is drawn outside, never by taking the shape's cell). It takes
     the line's most common label there and is painted the line's own most common exact colour of that label in
     the two cells (a cell holding none of the line would otherwise be painted its own mean). It never takes a
     SHAPE cell (the letters keep every cell the vote gave them) and never an empty cell. It runs after RESCUE
     and CONNECT and before stage 2, so the GATE and PALETTE guards judge its cells like any rule's.
     Measured on the 311 at 8 and 16 (palette on, and off at 16): see the header, Round 8.
     GAP (round 9). The ring must not paint over negative space the source draws: on GATE at 16 round 8 filled the
     G's hole, the notch between the A's legs and the navy between neighbouring letters with white (the G's counter
     opens to the outside, so its lining belongs to the outer line piece and the ROUND test above does not refuse it).
     A cell HUG would paint stays the outside fill when, from its own source pixels: the fill holds at least
     HUG_GAP_OUT x as many of them as the line, and for at least HUG_GAP_SHARE of its fill pixels the fill is NARROW -
     along the pixel's row or its column the line or the shape is reached on both sides, end to end within HUG_GAP
     cells (a sliver of another colour up to HUG_REACH px is walked past; transparency or the picture's edge leaves it
     open). A hole or a notch in a shape, or the fill between two shapes' rings, is narrow; the fill beside a shape's
     outer edge runs on, and is drawn as ring. Measured, the debug build's table of every cell HUG takes on the 311
     (logs/gapstat-P*.txt in round 9's folder): on GATE at 16 the cells kept have 76-100% of their fill closed at
     1.75 cells, the ring cells drawn 0-26%; the plateau runs from about 1.6 to 2.0 cells (35,75 drops to 50% at
     1.5; 36,74, an A ring cell beside a 2-cell gap, rises to 45% at 2.0 and 86% at 2.25). Rows and columns only:
     with diagonals the T's inside corner under its bar (48,73) read 51% closed at 1.5 cells - a corner is crossed
     to the shape on both sides by a diagonal, and it is not a gap. 'At least as much fill as line', not 'mostly
     fill': the G's lower hole cell 31,76 is 43% navy, 43% white.
     Round 9b: 'the plateau runs from about 1.6 to 2.0 cells' above is superseded - that is where the debug table's
     shares sit; the OUTPUT on the files HUG touches is the same for HUG_GAP 1.5 to 2.0 (the numbers verifier's sweep,
     re-run in round 9b at 1.25, 1.5, 2.0, 2.1, 2.25: 1.25 changes GATE 3 cells - 42,70 31,73 35,75 white; 2.1 and
     2.25 1 cell - 36,74 navy; at size 8 1.5, 2.0 and 2.1 change nothing). The shares quoted stand.
     Without the sliver walk none of GATE's 12 cells is kept (header, Round 9b). The specs pin each part of GAP on a
     picture made for it (gapkept.spec.js tests 3-4, gapfixtures.js paintEdges): a sliver walked past (a 2 px
     anti-alias row), the shape
     ending a walk as the line does, transparency leaving it open, HUG_GAP between 1.625 and 1.875 cells (a 26 px gap
     kept, a 30 px band drawn), HUG_GAP_OUT above 0.6 and at most 1.29 (a 38%-fill cell drawn, a 56%-fill cell kept). */
  function hug(win, opaque, I, cols, rows, K, S, P, key) {
    var w = I.w, h = I.h, N = w * h, fam = I.line, comp = P.comp, famPix = P.famPix, compPx = P.compPx, nc = P.nc, i, j, x, y, pc, f, c;
    var idx = new Int32Array(nc).fill(-1), list = [];
    for (pc = 0; pc < nc; pc++) if (compPx[pc] >= HUG_MINPX * S * S) { idx[pc] = list.length; list.push(pc); }
    if (!list.length) return 0;
    var M = list.length, tot = new Float64Array(M), clear = new Float64Array(M), side = [], q;
    var sidePc = [];
    for (q = 0; q < M; q++) { side.push(new Map()); sidePc.push(new Map()); }
    // each edge of the line, walked outward past slivers (an anti-alias row, a speck: depth 1) up to HUG_REACH px
    var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1], dd, xx, yy, m, st, D = P.depthMap();
    for (i = 0; i < N; i++) {
      pc = comp[i]; if (pc < 0 || idx[pc] < 0) continue; q = idx[pc]; x = i % w; y = (i / w) | 0;
      for (dd = 0; dd < 4; dd++) {
        xx = x + DX[dd]; yy = y + DY[dd]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        j = yy * w + xx; if (famPix[j] === famPix[i]) continue;
        tot[q]++;
        for (st = 1; st <= HUG_REACH; st++) {
          xx = x + st * DX[dd]; yy = y + st * DY[dd]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
          j = yy * w + xx; f = famPix[j]; if (f === famPix[i]) break;
          if (f < 0) { clear[q]++; break; }
          if (D[j] >= 2) { m = side[q]; m.set(f, (m.get(f) || 0) + 1); m = sidePc[q]; m.set(comp[j], (m.get(comp[j]) || 0) + 1); break; }
        }
      }
    }
    var made = 0;
    for (q = 0; q < M; q++) {
      pc = list[q]; f = P.compFam[pc]; if (!tot[q]) continue;
      var thick = 2 * compPx[pc] / tot[q], fo = P.outsideOf(pc), fi = -1, bi = 0;
      side[q].forEach(function (v, k) { if (k !== fo && (v > bi || (v === bi && k < fi))) { bi = v; fi = k; } });
      var ok = fo >= 0 && fi >= 0 && thick <= HUG_THICK * S && (side[q].get(fo) || 0) >= HUG_SIDE * tot[q] && bi >= HUG_SIDE * tot[q] &&
        clear[q] <= HUG_CLEAR * tot[q] && I.dE[f * K + fo] >= RIM_DE && I.dE[f * K + fi] >= RIM_DE && I.dE[fo * K + fi] >= RIM_DE;
      // ROUND: the line goes round the shape - the shape's pieces it lies against are themselves mostly edged by
      // this line colour (their own contacts, walked the same way), weighted by how much of the line each takes
      // and NOT round the outside: a fill edged by the line as much (a lining inside a letter's counter has the
      // letter as its biggest neighbour, so 'outside'; the letter is edged by its lines all round) is not a hug
      var roundOf = function (g) {
        var rw = 0, rs = 0;
        sidePc[q].forEach(function (v, p2) { if (P.compFam[p2] !== g || idx[p2] < 0) return; var q2 = idx[p2]; rw += v; if (tot[q2]) rs += v * (side[q2].get(f) || 0) / tot[q2]; });
        return rw ? rs / rw : 0;
      };
      var round = fi >= 0 ? roundOf(fi) : 0, roundO = fo >= 0 ? roundOf(fo) : 1;
      ok = ok && round >= HUG_ROUND && roundO < HUG_ROUND;
      if (!ok) continue;
      // the line's pixels per cell, and its most common label per cell
      var px = new Map(), labs = new Map(), lm;
      for (i = 0; i < N; i++) {
        if (comp[i] !== pc) continue; c = I.cell[i]; px.set(c, (px.get(c) || 0) + 1);
        lm = labs.get(c); if (!lm) { lm = new Map(); labs.set(c, lm); } lm.set(I.lab[i], (lm.get(I.lab[i]) || 0) + 1);
      }
      var shows = function (k, g) { return k >= 0 && opaque[k] && fam[win[k]] === g; }, take = [];
      // the line's pixels in the half of shape cell s that faces the outside cell k (dx, dy from s to k)
      var nearHalf = function (s, dx, dy) {
        var x0 = (s % cols) * S, y0 = ((s / cols) | 0) * S, u, v, k3 = 0, H = S / 2;
        var ua = dx > 0 ? H : 0, ub = dx < 0 ? H : S, va = dy > 0 ? H : 0, vb = dy < 0 ? H : S;
        for (v = va; v < vb; v++) for (u = ua; u < ub; u++) if (comp[(y0 + v) * w + x0 + u] === pc) k3++;
        return k3;
      };
      // GAP (round 9): is outside cell k a gap the source draws? Its source pixels: how much is the outside fill and how
      // much the line; then across each fill pixel, along its row and its column, is the line or the shape reached on
      // both sides, end to end within HUG_GAP cells (a sliver of another colour up to HUG_REACH px is walked past;
      // transparency or the picture's edge ends the walk open). Rows and columns only: across a shape's inside corner
      // a diagonal meets the shape on both sides too, and a corner is not a gap (measured: GATE's T, 51% of a cell)
      var gapSpan = function (u, v, dx, dy, lim) {
        var sd, st2, uu, vv, g, run, t2 = 1, ends = 0;
        for (sd = -1; sd <= 1; sd += 2) {
          run = 0;
          for (st2 = 1; st2 <= lim; st2++) {
            uu = u + sd * st2 * dx; vv = v + sd * st2 * dy; if (uu < 0 || vv < 0 || uu >= w || vv >= h) break;
            g = famPix[vv * w + uu]; if (g < 0) break;
            if (g === f || g === fi) { ends++; t2 += st2 - 1; break; }
            if (g === fo) run = 0; else if (++run > HUG_REACH) break;
          }
        }
        return ends === 2 ? t2 : Infinity;
      };
      var gapKept = function (k) {
        var x0 = (k % cols) * S, y0 = ((k / cols) | 0) * S, u, v, g, no = 0, nl = 0, cl = 0, lim = HUG_GAP * S;
        for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { g = famPix[v * w + u]; if (g === fo) no++; else if (g === f) nl++; }
        if (!no || no < HUG_GAP_OUT * nl) return false;
        for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) {
          if (famPix[v * w + u] !== fo) continue;
          if (gapSpan(u, v, 1, 0, lim) <= lim || gapSpan(u, v, 0, 1, lim) <= lim) cl++;
        }
        return cl >= HUG_GAP_SHARE * no;
      };
      var cand = new Set();
      px.forEach(function (v, k) {
        var kx = k % cols, ky = (k / cols) | 0, e, a2;
        cand.add(k); for (e = 0; e < 4; e++) { a2 = [[kx - 1, ky], [kx + 1, ky], [kx, ky - 1], [kx, ky + 1]][e]; if (a2[0] >= 0 && a2[1] >= 0 && a2[0] < cols && a2[1] < rows) cand.add(a2[1] * cols + a2[0]); }
      });
      Array.from(cand).sort(function (p1, p2) { return p1 - p2; }).forEach(function (k) {
        if (!shows(k, fo)) return;
        var kx = k % cols, ky = (k / cols) | 0, v = px.get(k) || 0, e, D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]], sx, sy, s;
        for (e = 0; e < 4; e++) {
          sx = kx + D4[e][0]; sy = ky + D4[e][1]; if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue; s = sy * cols + sx;
          if (shows(s, fi) && v + nearHalf(s, -D4[e][0], -D4[e][1]) >= HUG_PX * S) { take.push([k, s]); return; }
        }
      });
      // GAP (round 9): a cell whose source pixels are at least as much the outside fill as the line, where that fill is
      // narrow - the line or the shape on both sides of it, along a row or a column, within HUG_GAP cells - stays the
      // fill: a hole or a notch in a shape, or the fill between two shapes' rings, is negative space the source draws
      if (HUG_GAP_ON) take = take.filter(function (ks) { return !gapKept(ks[0]); });
      take.forEach(function (ks) {
        var k = ks[0], bl = -1, bn = 0; (labs.get(k) || labs.get(ks[1])).forEach(function (v, l) { if (v > bn || (v === bn && l < bl)) { bn = v; bl = l; } });
        if (bl < 0) return;
        // its colour: the line's own most common exact colour of that label in the two cells (the cell may hold none)
        var tal = new Map(), bk = -1, bw = 0, u, v, x0, y0, ii, kk;
        [k, ks[1]].forEach(function (cc2) {
          x0 = (cc2 % cols) * S; y0 = ((cc2 / cols) | 0) * S;
          for (v = y0; v < y0 + S; v++) for (u = x0; u < x0 + S; u++) { ii = v * w + u; if (comp[ii] !== pc || I.lab[ii] !== bl) continue; kk = (I.d[ii * 4] << 16) | (I.d[ii * 4 + 1] << 8) | I.d[ii * 4 + 2]; tal.set(kk, (tal.get(kk) || 0) + 1); }
        });
        tal.forEach(function (v2, k2) { if (v2 > bw || (v2 === bw && k2 < bk)) { bw = v2; bk = k2; } });
        win[k] = bl; key.set(k, [bl, bk]); made++;
      });
    }
    return made;
  }

  /* ---------------------------------------------------------- the pack */
  PF.repair8_pack = function (rgba, cols, rows, colour, rules) {
    need('adaptive_k', 'pf-40-reconstruct.js'); need('kmeans_quantize', 'pf-11-quantize.js');
    ['clipScalar', 'argmax', 'npMaximum', 'rint'].forEach(function (nm) { need(nm, 'pf-00-base.js'); });
    if (!colour || typeof colour.labOf !== 'function') throw new Error('pf-42-repair8.js: colour.labOf is missing -- pass the page\'s labOf');
    if (typeof colour.deltaE2000 !== 'function') throw new Error('pf-42-repair8.js: colour.deltaE2000 is missing -- pass the page\'s deltaE2000');
    if (!rgba || typeof rgba !== 'object') throw new Error('PF.repair8_pack: expected a {d, w, h, cn} image');
    var d = rgba.d, w = rgba.w | 0, h = rgba.h | 0, cn = (rgba.cn === undefined || rgba.cn === null) ? 4 : (rgba.cn | 0);
    if (!(d instanceof Uint8Array || d instanceof Uint8ClampedArray)) throw new Error('PF.repair8_pack: d must be a Uint8Array or Uint8ClampedArray');
    if (w <= 0 || h <= 0) throw new Error('PF.repair8_pack: empty image (' + w + 'x' + h + ')');
    if (cn !== 4) throw new Error('PF.repair8_pack: RGBA only (cn 4), got cn ' + cn);
    if (d.length !== w * h * 4) throw new Error('PF.repair8_pack: d.length ' + d.length + ' != w*h*4 ' + (w * h * 4));
    cols = cols | 0; rows = rows | 0;
    if (cols <= 0 || rows <= 0) throw new Error('PF.repair8_pack: cols and rows must be >= 1');
    var N = w * h, n = cols * rows, i, c, ch, x, y, b, p, q;

    // stage 1, two_stage_pack's: k-means labels, centre-weighted vote; alpha-0 pixels do not vote
    var K = PF.adaptive_k(rgba);
    var lab = PF.kmeans_quantize(rgba, K).labels.d;
    var maxLab = 0;
    for (i = 0; i < N; i++) if (lab[i] > maxLab) maxLab = lab[i];
    K = maxLab + 1;
    var rgb = new Float64Array(3 * N);
    for (i = 0, b = 0; i < N; i++, b += 4) { rgb[3 * i] = d[b] / 255.0; rgb[3 * i + 1] = d[b + 1] / 255.0; rgb[3 * i + 2] = d[b + 2] / 255.0; }
    var ix = new Int32Array(w), iy = new Int32Array(h);
    for (x = 0; x < w; x++) ix[x] = PF.clipScalar(Math.floor((x * cols) / w), 0, cols - 1);
    for (y = 0; y < h; y++) iy[y] = PF.clipScalar(Math.floor((y * rows) / h), 0, rows - 1);
    var wc = w / cols, hr = h / rows, wx = new Float64Array(w), wy = new Float64Array(h), fx, fy;
    for (x = 0; x < w; x++) { fx = ((x + 0.5) - ix[x] * wc) / wc; wx[x] = 1.0 - 2.0 * Math.abs(fx - 0.5); }
    for (y = 0; y < h; y++) { fy = ((y + 0.5) - iy[y] * hr) / hr; wy[y] = 1.0 - 2.0 * Math.abs(fy - 0.5); }
    var cell = new Int32Array(N), wgt = new Float64Array(N);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; cell[i] = iy[y] * cols + ix[x];
      wgt[i] = !d[i * 4 + 3] ? 0 : (wy[y] * wx[x] + 1e-4);
    }
    var csr = csrByCell(cell, N, n), offs = csr.offs, order = csr.order;
    var acc = new Float64Array(K), win = new Int32Array(n), ACC = new Float64Array(n * K);
    for (c = 0; c < n; c++) {
      acc.fill(0);
      for (p = offs[c]; p < offs[c + 1]; p++) { q = order[p]; acc[lab[q]] += wgt[q]; }
      win[c] = PF.argmax(acc);
      ACC.set(acc, c * K);
    }
    var cntf = new Float64Array(n);
    for (c = 0; c < n; c++) cntf[c] = Math.max(offs[c + 1] - offs[c], 1);
    // opaque when more than half the cell's pixels have alpha > 127 (two_stage_pack's rule)
    var opaque = new Uint8Array(n), asum = new Float64Array(n);
    for (i = 0; i < N; i++) asum[cell[i]] += (d[i * 4 + 3] > 127) ? 1.0 : 0.0;
    for (c = 0; c < n; c++) opaque[c] = (asum[c] / cntf[c] > 0.5) ? 1 : 0;

    // repairs 1 and 2 decide which label wins and which cells are opaque
    var I = facts(d, w, h, N, lab, K, cell, n, cols, rows, colour);
    // rules (size 16): which repairs run, and STROKE and KEEP; none given = size 8's set exactly
    var R = rules || null, on = function (k) { return !R || R[k] !== false; };
    var S16 = w / cols, square = S16 === h / rows && S16 === Math.floor(S16);
    var winT = new Int32Array(win), opaqueT = new Uint8Array(opaque);   // today's vote, for the guards
    var P = (R && square && (R.stroke || R.keep)) ? pieces(I) : null;
    var G = (P && R.keep) ? keeper(P, I, cols, rows, S16) : null;
    if (P && R.stroke) stroke(win, opaque, I, cols, rows, K, S16, P, G);
    if (on('rescue')) rescue(win, opaque, I, cols, rows, K, ACC, G);
    var bridges = [];
    if (on('connect')) connect(win, opaque, I, cols, rows, K, ACC, bridges);
    // HUG (round 8): both sizes; its own PIECES when size 8's set did not build them
    var hugKey = new Map();
    if (HUG_ON && square && (!R || R.hug !== false)) hug(win, opaque, I, cols, rows, K, S16, P || pieces(I), hugKey);

    // stage 2 as a function of the vote (win, opaque), so the GATE guard can paint today's vote too;
    // the code inside is the round-3 text unchanged (seam: rules absent == live repair8_pack)
    function paint(win, opaque, bridges, doSpecks, veto) {
      // stage 2, two_stage_pack's: the weighted MODE of the exact colours carrying the
      // winning label (invents nothing); the weighted mean only for a cell with none
      var denom = new Float64Array(n), sums = new Float64Array(3 * n), selcnt = new Float64Array(n), sel, ws;
      for (i = 0; i < N; i++) {
        c = cell[i]; sel = lab[i] === win[c]; ws = sel ? wgt[i] : 0.0;
        denom[c] += ws; sums[3 * c] += rgb[3 * i] * ws; sums[3 * c + 1] += rgb[3 * i + 1] * ws; sums[3 * c + 2] += rgb[3 * i + 2] * ws;
        selcnt[c] += sel ? 1.0 : 0.0;
      }
      var out = new Float64Array(3 * n), dn, anyBad = false;
      for (c = 0; c < n; c++) {
        dn = PF.npMaximum(denom[c], 1e-9);
        out[3 * c] = sums[3 * c] / dn; out[3 * c + 1] = sums[3 * c + 1] / dn; out[3 * c + 2] = sums[3 * c + 2] / dn;
        if (selcnt[c] < 0.5) anyBad = true;
      }
      if (anyBad) {
        var msum = new Float64Array(3 * n);
        for (i = 0; i < N; i++) { c = cell[i]; msum[3 * c] += rgb[3 * i]; msum[3 * c + 1] += rgb[3 * i + 1]; msum[3 * c + 2] += rgb[3 * i + 2]; }
        for (c = 0; c < n; c++) if (selcnt[c] < 0.5) for (ch = 0; ch < 3; ch++) out[3 * c + ch] = msum[3 * c + ch] / cntf[c];
      }
      var modeKey = new Int32Array(n).fill(-1), tally = new Map(), bestW, bestKey, key, cw;
      for (c = 0; c < n; c++) {
        tally.clear(); bestW = -1; bestKey = -1;
        for (p = offs[c]; p < offs[c + 1]; p++) {
          q = order[p];
          if (lab[q] !== win[c] || !(wgt[q] > 0)) continue;
          b = q * 4; key = (d[b] << 16) | (d[b + 1] << 8) | d[b + 2];
          cw = (tally.get(key) || 0) + wgt[q]; tally.set(key, cw);
          if (cw > bestW) { bestW = cw; bestKey = key; }
        }
        modeKey[c] = bestKey;
      }

      // repair 3 recolours specks; then each bridge cell takes its stroke's colour around it
      if (doSpecks) {
        var pre = veto ? new Int32Array(modeKey) : null;
        specks(modeKey, win, opaque, I, cols, rows, K, d, offs, order, lab, colour);
        if (veto) for (c = 0; c < n; c++) if (veto[c]) modeKey[c] = pre[c];   // a guard took this cell back
      }
      if (bridges.length) {
        var isB = new Set(bridges);
        bridges.forEach(function (bc) {
          var bx = bc % cols, by = (bc / cols) | 0, tal = new Map(), ddx, ddy, xx, yy, f, bk = -1, bn = -1;
          for (ddy = -1; ddy <= 1; ddy++) for (ddx = -1; ddx <= 1; ddx++) {
            if (!ddx && !ddy) continue; xx = bx + ddx; yy = by + ddy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
            f = yy * cols + xx; if (!opaque[f] || isB.has(f) || modeKey[f] < 0) continue;
            tal.set(modeKey[f], (tal.get(modeKey[f]) || 0) + 1);
          }
          tal.forEach(function (v, k) { if (v > bn || (v === bn && k < bk)) { bn = v; bk = k; } });
          if (bk >= 0) modeKey[bc] = bk;
        });
      }

      // HUG (round 8): a ring cell is painted the line's own colour while it still carries the line's label
      hugKey.forEach(function (hv, hc) { if (win[hc] === hv[0]) modeKey[hc] = hv[1]; });
      var low = new d.constructor(n * 4), v;
      for (c = 0; c < n; c++) {
        if (modeKey[c] >= 0) {
          low[c * 4] = (modeKey[c] >> 16) & 255; low[c * 4 + 1] = (modeKey[c] >> 8) & 255; low[c * 4 + 2] = modeKey[c] & 255;
        } else {
          for (ch = 0; ch < 3; ch++) { v = PF.rint(out[3 * c + ch] * 255); low[c * 4 + ch] = PF.clipScalar(v, 0, 255); }
        }
        low[c * 4 + 3] = opaque[c] ? 255 : 0;
      }
      return low;
    }
    // THE GUARDS: what the page does next with these cells may not be changed beyond the cells repaired.
    // GATE (size 16's rules.gate since round 4; size 8's rules too since round 6, when they began to run on
    // outlined pictures) - the rules may not change which shapes the page's outline pass works on (see
    // gateFlips). colour.gate = the page's outline gate (OUTLINE_GATE) when its outline pass will run on this
    // picture, null when it will not (switch off; fixOutlineRuns says).
    // PALETTE (round 6, every size: colour.snap) - see paletteKnock.
    var GT = ((!R || R.gate) && colour.gate) ? gateNumbers(colour.gate) : null;
    var SN = typeof colour.snap === 'function' ? colour.snap : null;
    if (!GT && !SN) return { d: paint(win, opaque, bridges, on('specks')), w: cols, h: rows, cn: 4 };
    // the page's passes see the cells AFTER its palette step: snap a copy with that step (it is on when snap is given)
    var seen = function (lw) { if (!SN) return lw; var cp = new lw.constructor(lw); SN(cp, n, cols); return cp; };
    var lowT = GT ? paint(winT, opaqueT, [], on('specks')) : null, seenT = GT ? seen(lowT) : null;
    var lowP = SN ? paint(winT, opaqueT, [], false) : null, seenP = SN ? seen(lowP) : null;   // no rule at all
    var veto = new Uint8Array(n), low = null, it, und, flip, knock = null;
    for (it = 0; it < GUARD_ROUNDS; it++) {
      low = paint(win, opaque, bridges, on('specks'), veto);
      und = null; knock = null;
      if (GT) { flip = gateFlips(seenT, seen(low), winT, opaqueT, win, opaque, cols, rows, GT); if (flip.n) und = flip.undo; }
      if (!und && SN) { knock = paletteKnock(lowP, low, seenP, seen(low), n); if (knock.n) und = knock.undo; }
      if (!und) break;
      for (c = 0; c < n; c++) if (und[c]) { win[c] = winT[c]; opaque[c] = opaqueT[c]; veto[c] = 1; }
      bridges = bridges.filter(function (bc) { return !und[bc]; });
      low = null;
    }
    if (!low) {
      low = paint(win, opaque, bridges, on('specks'), veto);
      // still moving the palette after GUARD_ROUNDS: the cells the rules would not have made at all
      // (round 6 judge, LATENT, not reached on the 311 at 8 or 16: this fallback is the vote with NO rule,
      // specks included, so on a picture that lands here size 8 also drops the specks rule it ran before
      // round 6; and the gate is not asked again after this last repaint. Kept as written: a picture whose
      // palette still moves after six rounds keeps the cells the vote made.)
      if (SN && paletteKnock(lowP, low, seenP, seen(low), n).n) low = lowP;
    }
    return { d: low, w: cols, h: rows, cn: 4 };
  };

  /* PIXEL SIZE 16 (round 3). The rule set for a step of 16 - measured first on
     skins, clothing, costumes, hats, masks, hair, glasses, extras and ears, and
     since round 6 run on every picture (backgrounds, chains, mouths and eyes
     measured then): STROKE first, then RESCUE and CONNECT, with KEEP guarding
     what they may replace.
     SPECKS is off at 16: on Balaclava Suit it flattened a drawn grey stripe
     into the fill, and elsewhere it only swapped texture shades. */
  var RULES16 = { stroke: true, rescue: true, connect: true, specks: false, keep: true, gate: true };
  PF.lines16_pack = function (rgba, cols, rows, colour) {
    return PF.repair8_pack(rgba, cols, rows, colour, RULES16);
  };

  PF.versionRepair8 = 'pf-42-repair8/8';
})();
