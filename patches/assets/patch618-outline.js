/* OUTLINE track, round 4 - paste-ready text for SP/pb-repo/index.html (46f1c01).
   Replaces: the comment above fixOutlineOnce, var OUTLINE_SKIP_LAYERS (unchanged), fixOutlineOnce;
   adds fixOutlineSource (right after fixOutlineOnce); replaces the page block at 26853-26866 (counters,
   fixOutlineWanted unchanged, fixOutlineApply) and adds fixOutlineSaid / fixOutlineBatchSaid; call-site and
   readout edits at the bottom. Round 4 vs round 3: [S2] scores falls only, applies at size 8 only, keeps the
   line-art depth; fixOutlineOnce returns res.wMin / res.wMax; the readouts say what happened. */
/* fixOutlineOnce(cells, opts) - "peel and retrace", final2. Works on the CELL grid (one cell = one "square").
   Starts from cand-final.cjs; round-3 changes are marked [B1][B2][B3][M1]..[M5]; [S1][S2] 2026-10-01, [S2] amended in round 4.

   opts.layer in OUTLINE_SKIP_LAYERS -> the input is returned unchanged (a copy).
   0. Parts: 8-connected opaque parts. A part is worked on only when ALL of:
        area >= MIN_AREA, ring >= MIN_RING (ring = cells 4-touching EMPTY space; the canvas edge does not
        count), and (pure-black share of the ring >= OUTLINED_FRAC or pure + near-black share >= OUTLINED_NEAR_FRAC).
        [M1] A part whose PURE black is >= BLACK_BODY_FRAC of it (black hair, black figure) is still worked
        on - whiskers go and its ring is made black - but nothing inside it is peeled.
        Near-black (luminance <= NEAR_BLACK_LUM, the palette's 11,7,12) counts as black in a selected part
        unless pure + near-black together reach BLACK_BODY_FRAC of it (then near-black is a body colour).
   1. Whiskers - the ONLY way the silhouette changes. A straight 1-cell-wide run of black, [M2] at most
        MAX_WHISKER = 2 cells, sticking out of a FLAT black edge (see the walk below). A 3-cell spike stays.
        All whiskers are found on the input and removed at once, so removal never cascades.
   2. [B3] Ring: the outline is black, never a designed colour. Every DARK ring cell (luminance <=
        DARK_RING_LUM: maroon rim on Red Mushroom Cap, plum on Wake Me Up, slate on Teal Puffer, near-black
        11,7,12, debris) becomes pure black #000000, however long its run. A LIGHT ring colour becomes black
        when its run along the ring is short (<= MAX_GAP cells: a gap in the line); a long light run is a
        drawn coloured edge (the yellow slats of Disco Shutter Shades) and stays. Also left in colour:
        thin coloured limbs: a 4-connected colour region with fewer than MIN_FILL_INSIDE cells off the ring
        (a 1-2 wide white arm is drawing, and blacking it out would delete it), unless the region is a
        1-2 cell speck sitting in the line (a gap), or a strip lying outside a black border that the peel
        removes (a fringe: it becomes the line).
   3. Peel (not for [M1] black-bodied parts): black inside the ring chained to the (new) black ring - the
        doubled / tripled border - is recoloured with fill. Pure black joins that band up to depth
        PEEL_DEPTH; [M4] near-black only at depth 2, right behind the ring (deeper near-black is fold /
        shading art: Hyperliquid Polo collar, Bitcoin Cap brim). Rare dark debris joins too, [M5] including
        rare dark OFF colours (luminance <= OFF_LUM) within OFF_DEPTH of empty space - the canvas edge
        does not count, so a stroke running into a cut-off chest stays (teal / slate specks on Wandering
        Fighter Crop, the olive / maroon fringe band on Gold / Rainbow Skin).
        Line art: black beyond the band depth, 4-connected. [B2] It is kept unless it is tiny
        (<= MAX_DEBRIS cells) AND shallow (no cell deeper than PEEL_DEPTH + 1): such a bit is the inside
        corner of a bunched-up border (HODLING's lower-right wisp) and is peeled with the band.
        Kept line art keeps the shortest band path to the ring (its stalk) and the band right in front of it.
        A lone 1-cell tick sticking sideways out of a straight kept line is peeled (Noun Glasses Original);
        regular teeth (a zipper) are a pattern and stay.
        [B1] After peeling, interior black no longer 4-connected to the black ring is dropped ONLY if it is
        tiny (<= MAX_DEBRIS cells) and shallow (all at depth <= PEEL_DEPTH). Real interior line art
        (the lines between the dreadlocks, the Roaring Kitty knot) is the artist's and stays.
   4. [M3] Fill for peeled cells: rounds of the weighted MAJORITY colour of the fill 8-neighbours (edge 2,
        diagonal 1), counting only neighbours deeper inside than the cell when there are any, ties to the
        darker. A rare accent colour (the red bead, HODLING's red streak) is taken only when no common
        colour is there (a cell offered only such a colour waits a round while peeled neighbours are still
        unfilled), and a colour that reads as black (luminance < DARK_FILL_LUM) is the last resort. Fill flows
        from cells at depth >= 2 only (never from the ring); a cell no fill reaches stays black, or keeps its
        own colour if it was debris (Jason Mask's maroon strap has no other colour to take).
   [S1][S2] opts.source = fixOutlineSource(picture, W, H) (2026-10-01, owner decisions 4 and the gate miss):
   [S1] GATE FROM THE SOURCE. A part the cell gate skips is still worked on when 80%+ of its SOURCE edge is dark
        (luminance <= 40) AND that line is drawn, not traced: its mean width (black px behind each edge px, within one
        cell) is >= SRC_MIN_LINE_PX = 2. Measured on the 212 traits of the 8 outlined layers: drawn lines 2.3-10.9,
        1 px traced hairlines 1.08-1.56 (Punk Frumpy Hair, Divine Ponytail, Mandalorian, Mime, Anonymous, Sun Baby,
        Green Slogan Hoodie - left as today). Such a part gets the ring only, and only on cells whose 3x3 neighbourhood
        carries a drawn line in the source (Red Lightsaber's blade glow stays red); nothing inside it is peeled (its
        line lost the vote, so there is no doubled border; peeling ate the lightsaber's hilt bands).
   [S2] WIDTH FROM THE SOURCE - AT PIXEL SIZE 8 ONLY (a cell of WIDTH_RULE_CELL_PX = 8 source px; owner decision 4
        is about size 8). The outline is w = round(source width / cell size) cells (half rounds down, 1..3), the source
        width being the depth from the edge where the share of pure-ish black (luminance <= 8) FALLS hardest (score
        fall^2/share; a RISE scores 0). Skins drawn with a 16 px line keep 2 cells at size 8. The first w depths of the
        band are the line (black); only black behind them peels (PEEL_DEPTH, NEAR_PEEL_DEPTH and the depth tests built
        on them move w-1 deeper) - but NOT the depth a small bit of black must reach to count as line art ([B2]'s
        PEEL_DEPTH + 1 stays put, ART_W_SHIFT = 0), so a 3-cell inner line off a 2-cell outline stays, as it does today.
        Superseded (round 3, 2026-10-01): "score fall^2/share" without the fall check, at every cell size, and the art
        depth moved w-1 deeper. The rise was scored as a cliff: Dark Lens Sunglasses read its lens ring (a black share
        RISING 0.14 -> 0.45 at depth 20) as a 20 px line, w = 2 at size 8, and peeled the ring round the right lens;
        Eight Lines Specs (26 px, w 3 at 8) and Black Headset (40 px, w 2 at 16) read the same way and changed nothing
        only by luck. Moving the art depth ate 3-cell inner lines next to a 2-cell outline (round-4 control C).
        At 16 with the fall check no part of the 212 traits changes through [S2] even with the rule on at every size.
   Without opts.source both are off and the pass is byte-identical to before (424/424 runs).
   opts.debug attaches the internal masks as res._dbg (probe use only).
   Plain JS, no require(), input never mutated. */
var OUTLINE_SKIP_LAYERS = ['backgrounds', 'chains', 'eyes', 'mouth', 'ears'];
function fixOutlineOnce(c, opts) {
  var W = c.W, H = c.H, N = W * H, src = c.data;
  var d = new Uint8ClampedArray(src);
  var res = { W: W, H: H, data: d };
  var layer = opts && opts.layer ? String(opts.layer).toLowerCase() : '';
  if (layer && OUTLINE_SKIP_LAYERS.indexOf(layer) >= 0) return res;

  var OUTLINED_FRAC = 0.5, OUTLINED_NEAR_FRAC = 0.6, MIN_AREA = 200, MIN_RING = 6, BLACK_BODY_FRAC = 0.4,
      NEAR_BLACK_LUM = 16, MAX_WHISKER = 2, PEEL_DEPTH = 3, NEAR_PEEL_DEPTH = 2, JUNK_LUM = 40, JUNK_DEPTH = 6,
      OFF_LUM = 64, OFF_DEPTH = 4, DARK_RING_LUM = 80, MAX_GAP = 6, MAX_DEBRIS = 3, MAX_FILL_ROUNDS = 16, MIN_FILL_INSIDE = 6, DARK_FILL_LUM = 24,
      SRC_GATE = true, SRC_OUTLINED_FRAC = 0.8, SRC_WIDTH_FRAC = 0.1, MAX_LINE_CELLS = 3, WIDTH_ROUND_BIAS = 0.01, SRC_MIN_LINE_PX = 2,
      WIDTH_RULE_CELL_PX = 8, ART_W_SHIFT = 0;
  var i, j, k, x, y, p, a, t;
  var nb = [0, 0, 0, 0];
  function nb4(i, out) {
    var x = i % W, y = (i / W) | 0;
    out[0] = x > 0 ? i - 1 : -1; out[1] = x < W - 1 ? i + 1 : -1;
    out[2] = y > 0 ? i - W : -1; out[3] = y < H - 1 ? i + W : -1;
    return out;
  }
  function opq(j) { return d[j * 4 + 3] >= 128; }
  function lumOf(j) { return 0.299 * src[j * 4] + 0.587 * src[j * 4 + 1] + 0.114 * src[j * 4 + 2]; }
  function pureB(j) { return src[j * 4 + 3] >= 128 && src[j * 4] === 0 && src[j * 4 + 1] === 0 && src[j * 4 + 2] === 0; }
  function nearB(j) { return src[j * 4 + 3] >= 128 && lumOf(j) <= NEAR_BLACK_LUM; }   // includes pure black
  var q = new Int32Array(N), qh, qt;

  // ---- 0. parts and the gate (on the input)
  var part = new Int32Array(N).fill(-1), nParts = 0, pRing = [], pPure = [], pNear = [], pArea = [], pAllPure = [], pAllNear = [];
  for (i = 0; i < N; i++) {
    if (!opq(i) || part[i] >= 0) continue;
    p = nParts++; pRing.push(0); pPure.push(0); pNear.push(0); pArea.push(0); pAllPure.push(0); pAllNear.push(0);
    qh = 0; qt = 0; q[qt++] = i; part[i] = p;
    while (qh < qt) {
      a = q[qh++]; x = a % W; y = (a / W) | 0; pArea[p]++;
      if (pureB(a)) pAllPure[p]++;
      if (nearB(a)) pAllNear[p]++;
      nb4(a, nb); var touchesEmpty = false;
      for (k = 0; k < 4; k++) if (nb[k] >= 0 && !opq(nb[k])) touchesEmpty = true;
      if (touchesEmpty) { pRing[p]++; if (pureB(a)) pPure[p]++; if (nearB(a)) pNear[p]++; }
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        j = ny * W + nx; if (opq(j) && part[j] < 0) { part[j] = p; q[qt++] = j; }
      }
    }
  }
  var sel = new Uint8Array(nParts), nearInk = new Uint8Array(nParts), noPeel = new Uint8Array(nParts), any = false;
  for (p = 0; p < nParts; p++) {
    if (pArea[p] < MIN_AREA || pRing[p] < MIN_RING) continue;
    if (pAllPure[p] >= BLACK_BODY_FRAC * pArea[p]) noPeel[p] = 1;      // [M1] black is the body: ring + whiskers only
    nearInk[p] = pAllNear[p] < BLACK_BODY_FRAC * pArea[p] ? 1 : 0;
    if (pPure[p] >= OUTLINED_FRAC * pRing[p] || pNear[p] >= OUTLINED_NEAR_FRAC * pRing[p]) { sel[p] = 1; any = true; }
  }
  // [S1][S2] what the SOURCE picture says about each part (opts.source = fixOutlineSource(...)); without it,
  // every part keeps the cell gate and a 1-cell outline, as before
  var S = opts && opts.source, pW = new Int32Array(nParts).fill(1), pShare = new Float64Array(nParts).fill(-1), pWpx = new Float64Array(nParts), pMean = new Float64Array(nParts);
  if (S && S.W === W && S.H === H) {
    var DM = S.DMAX, own = new Int32Array(N).fill(-1), sRn = new Float64Array(nParts), sRd = new Float64Array(nParts),
        sO = new Float64Array(nParts * (DM + 1)), sK = new Float64Array(nParts * (DM + 1));
    for (i = 0; i < N; i++) {
      if (part[i] >= 0) { own[i] = part[i]; continue; }
      // an empty cell: its source pixels (a thin outline that lost the vote) belong to the part next to it
      x = i % W; y = (i / W) | 0;
      for (var oy2 = -1; oy2 <= 1 && own[i] < 0; oy2++) for (var ox2 = -1; ox2 <= 1; ox2++) {
        var qx = x + ox2, qy = y + oy2; if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        if (part[qy * W + qx] >= 0) { own[i] = part[qy * W + qx]; break; }
      }
    }
    for (i = 0; i < N; i++) {
      p = own[i]; if (p < 0) continue;
      sRn[p] += S.ringN[i]; sRd[p] += S.ringDark[i];
      for (t = 1; t <= DM; t++) { sO[p * (DM + 1) + t] += S.opqD[i * (DM + 1) + t]; sK[p * (DM + 1) + t] += S.darkD[i * (DM + 1) + t]; }
    }
    for (p = 0; p < nParts; p++) {
      if (sRn[p] > 0) pShare[p] = sRd[p] / sRn[p];
      // the outline's width in source px: the depth where the share of black (luminance <= 8) falls hardest, scored
      // fall x fall / share - a cliff, not a slope. A stair-stepped line is full width only on its flats (Diamond Ore:
      // 98% black at depth 1, 18% at 16, 2% at 17), and a dark pattern behind the line (Red Camo) falls slowly.
      var bestT = 0, bestFall = 0;
      for (t = 1; t < DM; t++) {
        var o2 = sO[p * (DM + 1) + t], o3 = sO[p * (DM + 1) + t + 1]; if (!o2) break;
        var f2 = sK[p * (DM + 1) + t] / o2, f3 = o3 ? sK[p * (DM + 1) + t + 1] / o3 : 0;
        if (f2 < SRC_WIDTH_FRAC) continue;
        var sc2 = f2 > f3 ? (f2 - f3) * (f2 - f3) / f2 : 0;   // only a FALL counts: a rise is a ring or band behind the line (Dark Lens Sunglasses' lens ring)
        if (sc2 > bestFall) { bestFall = sc2; bestT = t; }
      }
      pWpx[p] = bestT;
      // the line's MEAN width in source px (black area behind the edge / edge length, within one cell of it): a traced
      // 1 px hairline (Punk Frumpy Hair, Green Slogan Hoodie, Mandalorian) reads about 1.1-1.6, a drawn line 2.5 and up
      var mw = 0; for (t = 1; t <= Math.min(DM, Math.ceil(S.cs)); t++) { var o4 = sO[p * (DM + 1) + t]; if (o4) mw += sK[p * (DM + 1) + t] / o4; }
      pMean[p] = mw;
      // [S2] the width rule is for Pixel size 8 only (owner decision 4); at any other cell size the outline stays 1 cell
      if (Math.round(S.cs) === WIDTH_RULE_CELL_PX)
        pW[p] = Math.max(1, Math.min(MAX_LINE_CELLS, Math.floor(pWpx[p] / S.cs + 0.5 - WIDTH_ROUND_BIAS)));
      if (pArea[p] < MIN_AREA || pRing[p] < MIN_RING || sel[p]) continue;
      // [S1] selected by the source: the line lost the vote, so the cells hold no doubled border to peel - the
      // ring is redrawn (where the source has a line) and nothing inside is touched (Red Lightsaber's hilt bands, hand lines)
      if (SRC_GATE && pShare[p] >= SRC_OUTLINED_FRAC && pMean[p] >= SRC_MIN_LINE_PX) { sel[p] = 2; noPeel[p] = 1; any = true; }
    }
  }
  // [S2] the outline widths this run draws, for the readout (1 everywhere unless the source says otherwise at size 8)
  var wLo = 0, wHi = 0;
  for (p = 0; p < nParts; p++) if (sel[p]) { if (!wLo || pW[p] < wLo) wLo = pW[p]; if (pW[p] > wHi) wHi = pW[p]; }
  res.wMin = wLo; res.wMax = wHi;
  if (opts && opts.debug) res._parts = { n: nParts, area: pArea, ring: pRing, pure: pPure, near: pNear, sel: sel, share: pShare, wpx: pWpx, mean: pMean, w: pW, cs: S ? S.cs : 0 };
  if (!any) return res;
  var work = new Uint8Array(N), blk = new Uint8Array(N), pure = new Uint8Array(N);
  for (i = 0; i < N; i++) if (part[i] >= 0 && sel[part[i]]) {
    work[i] = 1; if (pureB(i)) pure[i] = 1;
    if (pure[i] || (nearInk[part[i]] && nearB(i))) blk[i] = 1;
  }

  // ---- 1. whiskers, all decided on the input, then removed together
  function op0(x, y) { return x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] >= 128; }
  var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  var drop = [];
  for (i = 0; i < N; i++) {
    if (!work[i] || !blk[i]) continue;
    x = i % W; y = (i / W) | 0;
    var n4 = 0, dir = -1;
    for (k = 0; k < 4; k++) if (op0(x + DX[k], y + DY[k])) { n4++; dir = k; }
    if (n4 !== 1) continue;                                   // a tip has exactly one 4-neighbour
    var sx = DX[dir], sy = DY[dir], px = -sy, py = sx;         // step toward the body; perpendicular
    // nothing beyond the tip, not even diagonally (so a diagonal line never starts a whisker)
    if (op0(x - sx, y - sy) || op0(x - sx + px, y - sy + py) || op0(x - sx - px, y - sy - py)) continue;
    var run = [i], cx = x, cy = y, ok = false;
    while (true) {
      if (op0(cx + px, cy + py) || op0(cx - px, cy - py)) break;   // the run cell must be 1 wide
      var ax = cx + sx, ay = cy + sy;
      if (!op0(ax, ay)) break;
      var aj = ay * W + ax;
      if (op0(ax + px, ay + py) || op0(ax - px, ay - py)) {       // (ax,ay) has body beside it: the attach cell
        // flat edge: opaque 1 and 2 steps along the edge on both sides; the stub stands on black outline
        if (blk[aj] && op0(ax + 2 * px, ay + 2 * py) && op0(ax - 2 * px, ay - 2 * py) &&
            op0(ax + px, ay + py) && op0(ax - px, ay - py)) ok = true;
        break;
      }
      if (!blk[aj] || !work[aj]) break;                          // a thin run that turns to colour is a spike: keep
      run.push(aj); cx = ax; cy = ay;
      if (run.length > MAX_WHISKER) break;                       // longer: a spike or line art
    }
    if (!ok || run.length > MAX_WHISKER) continue;
    for (k = 0; k < run.length; k++) drop.push(run[k]);
  }
  for (k = 0; k < drop.length; k++) { a = drop[k]; d[a * 4] = d[a * 4 + 1] = d[a * 4 + 2] = d[a * 4 + 3] = 0; work[a] = 0; blk[a] = 0; pure[a] = 0; }

  // ---- depth / ring on the cleaned silhouette (canvas edge counts for depth, never for the ring)
  var D = new Int32Array(N), ring = new Uint8Array(N);
  qh = 0; qt = 0;
  for (i = 0; i < N; i++) {
    if (!opq(i)) continue;
    nb4(i, nb); var edge = false, empty = false;
    for (k = 0; k < 4; k++) { if (nb[k] < 0) edge = true; else if (!opq(nb[k])) empty = true; }
    if (edge || empty) { D[i] = 1; q[qt++] = i; } else D[i] = 1 << 30;
    if (empty) ring[i] = 1;
  }
  while (qh < qt) {
    i = q[qh++]; nb4(i, nb);
    for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && opq(j) && D[j] > D[i] + 1) { D[j] = D[i] + 1; q[qt++] = j; } }
  }

  // depth from real empty space only (the canvas edge is not an edge of the drawing): for off-colour debris
  var De = new Int32Array(N); qh = 0; qt = 0;
  for (i = 0; i < N; i++) { if (!opq(i)) continue; if (ring[i]) { De[i] = 1; q[qt++] = i; } else De[i] = 1 << 30; }
  while (qh < qt) {
    i = q[qh++]; nb4(i, nb);
    for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && opq(j) && De[j] > De[i] + 1) { De[j] = De[i] + 1; q[qt++] = j; } }
  }
  // debris: rare dark colours (anywhere near the line), and [M5] rare dark OFF colours right behind it
  var count = new Map(), opN = 0, key;
  function colKey(j) { return (src[j * 4] << 16) | (src[j * 4 + 1] << 8) | src[j * 4 + 2]; }
  for (i = 0; i < N; i++) if (opq(i) && !nearB(i)) { opN++; key = colKey(i); count.set(key, (count.get(key) || 0) + 1); }
  var junk = new Uint8Array(N), rareMax = Math.max(3, 0.02 * opN);
  // [R5] an OFF-colour CLUMP is debris only if all of it lies in the shallow zone behind the line: a clump
  // that runs deeper is drawn shading (Flame Visor's brim underside, Orange Winter Parka's toggle), while a
  // fringe speck of a colour that is also used deeper is still a speck (the skins' olive/maroon fringe).
  // [R4] judged by the whole colour and kept those specks.
  var offComp = new Int32Array(N).fill(-1), offDeep = [];
  for (i = 0; i < N; i++) {
    if (offComp[i] >= 0 || !work[i] || blk[i] || nearB(i) || lumOf(i) > OFF_LUM) continue;
    var ck = colKey(i), cid = offDeep.length, cmax = 0; offComp[i] = cid; qh = 0; qt = 0; q[qt++] = i;
    while (qh < qt) {
      a = q[qh++]; if (De[a] > cmax) cmax = De[a]; nb4(a, nb);
      for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && offComp[j] < 0 && work[j] && !blk[j] && !nearB(j) && colKey(j) === ck) { offComp[j] = cid; q[qt++] = j; } }   // one colour: joining dark shades brought the fringe specks back (Wandering Fighter teal/slate, Rainbow Skin 18 -> 85 floating); the Parka toggle top row is the cost
    }
    offDeep.push(cmax);
  }
  for (i = 0; i < N; i++) {
    if (!work[i] || blk[i] || nearB(i) || count.get(colKey(i)) > rareMax) continue;   // near-black body colour is never debris
    var L = lumOf(i);
    if (L <= JUNK_LUM) junk[i] = 1;
    else if (L <= OFF_LUM && De[i] <= OFF_DEPTH && offComp[i] >= 0 && offDeep[offComp[i]] <= OFF_DEPTH) junk[i] = 2;
  }

  // ---- 2. [B3] the ring: every ring cell of a selected part becomes pure black, except thin coloured limbs
  // colour regions: 4-connected non-black, non-debris cells; how many of each are off the ring
  var freg = new Int32Array(N).fill(-1), fInside = [], fSize = [], fSpeck = [];
  for (i = 0; i < N; i++) {
    if (!work[i] || blk[i] || junk[i] || freg[i] >= 0) continue;
    var r = fInside.length, ins = 0, sz = 0, speck = true; fInside.push(0); fSize.push(0); fSpeck.push(0);
    qh = 0; qt = 0; q[qt++] = i; freg[i] = r;
    while (qh < qt) {
      a = q[qh++]; sz++; if (!ring[a]) ins++; nb4(a, nb);
      var emp = 0;
      for (k = 0; k < 4; k++) {
        j = nb[k]; if (j >= 0 && !opq(j)) emp++;
        if (j >= 0 && work[j] && !blk[j] && !junk[j] && freg[j] < 0) { freg[j] = r; q[qt++] = j; }
      }
      if (emp > 1) speck = false;                               // open on two sides: a limb, not a hole in a line
    }
    fInside[r] = ins; fSize[r] = sz; fSpeck[r] = speck && sz <= 2 ? 1 : 0;
  }
  var paint = new Uint8Array(N);
  function limb(i) { var r = freg[i]; return r >= 0 && fInside[r] < MIN_FILL_INSIDE && !fSpeck[r]; }
  // [S1] a part the SOURCE gate selected (sel 2) is outlined only where the source draws a line there: the cell and
  // its 8 neighbours (an empty neighbour holds a line that lost the vote) carry at least SRC_MIN_LINE_PX of black
  // per source edge pixel. Red Lightsaber's blade has a 1 px hairline (its red glow stays red) while its hand is drawn.
  function srcLine(i) {
    if (!S || sel[part[i]] !== 2) return true;
    var lx = i % W, ly = (i / W) | 0, rn = 0, bk2 = 0, tt, lim = Math.min(S.DMAX, Math.ceil(S.cs));
    for (var vy = -1; vy <= 1; vy++) for (var vx = -1; vx <= 1; vx++) {
      var ux = lx + vx, uy = ly + vy; if (ux < 0 || uy < 0 || ux >= W || uy >= H) continue;
      var c2 = uy * W + ux; rn += S.ringN[c2]; for (tt = 1; tt <= lim; tt++) bk2 += S.darkD[c2 * (S.DMAX + 1) + tt];
    }
    return rn > 0 && bk2 >= SRC_MIN_LINE_PX * rn;
  }
  function lightRing(j) { return work[j] && ring[j] && !blk[j] && !junk[j] && lumOf(j) > DARK_RING_LUM; }
  for (i = 0; i < N; i++) {
    if (!work[i] || !ring[i] || pure[i]) continue;
    if (blk[i] || junk[i]) { paint[i] = 1; continue; }                 // near-black ink, debris
    if (lumOf(i) <= DARK_RING_LUM && !limb(i) && srcLine(i)) paint[i] = 1;            // a dark rim colour: always black
  }
  // light colours: a short run along the ring is a gap in the line; a long one is a drawn coloured edge
  var seen = new Uint8Array(N), run2 = [];
  for (i = 0; i < N; i++) {
    if (!lightRing(i) || seen[i]) continue;
    run2.length = 0; qh = 0; qt = 0; q[qt++] = i; seen[i] = 1;
    while (qh < qt) {
      a = q[qh++]; run2.push(a); x = a % W; y = (a / W) | 0;
      for (var ey = -1; ey <= 1; ey++) for (var ex = -1; ex <= 1; ex++) {
        var mx = x + ex, my = y + ey; if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
        j = my * W + mx; if (lightRing(j) && !seen[j]) { seen[j] = 1; q[qt++] = j; }
      }
    }
    if (run2.length <= MAX_GAP) for (k = 0; k < run2.length; k++) if (!limb(run2[k]) && srcLine(run2[k])) paint[run2[k]] = 1;
  }

  // ---- 3. the band: black / debris chained to the (new) black ring
  var band = new Uint8Array(N); qh = 0; qt = 0;
  function bandable(j) {
    if (noPeel[part[j]]) return false;
    if (blk[j]) return D[j] <= (pure[j] ? PEEL_DEPTH : NEAR_PEEL_DEPTH) + pW[part[j]] - 1;   // [S2] a w-cell line peels w-1 deeper
    if (junk[j] === 1) return D[j] <= JUNK_DEPTH;
    if (junk[j] === 2) return De[j] <= OFF_DEPTH;
    return false;
  }
  for (i = 0; i < N; i++) if (work[i] && ring[i] && !noPeel[part[i]] && (pure[i] || paint[i])) { band[i] = 1; q[qt++] = i; }
  while (qh < qt) {
    i = q[qh++]; nb4(i, nb);
    for (k = 0; k < 4; k++) {
      j = nb[k]; if (j < 0 || !work[j] || band[j] || ring[j]) continue;
      if (bandable(j)) { band[j] = 1; q[qt++] = j; }
    }
  }
  // distance to the black ring through band BLACK only (for stalks)
  var bd = new Int32Array(N).fill(-1), par = new Int32Array(N).fill(-1);
  qh = 0; qt = 0;
  for (i = 0; i < N; i++) if (band[i] && ring[i]) { bd[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    i = q[qh++]; nb4(i, nb);
    for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && band[j] && blk[j] && !ring[j] && bd[j] < 0) { bd[j] = bd[i] + 1; par[j] = i; q[qt++] = j; } }
  }
  // line art: black beyond the band depth
  function deepB(j) { return work[j] && blk[j] && !ring[j] && !noPeel[part[j]] && D[j] > (pure[j] ? PEEL_DEPTH : NEAR_PEEL_DEPTH) + pW[part[j]] - 1; }
  var keep = new Uint8Array(N), artSeen = new Uint8Array(N), clump = new Uint8Array(N), art = [];
  function touchesBand(i) { var o = [0, 0, 0, 0]; nb4(i, o); for (var t = 0; t < 4; t++) if (o[t] >= 0 && band[o[t]]) return true; return false; }
  for (i = 0; i < N; i++) {
    if (!deepB(i) || artSeen[i]) continue;
    art.length = 0; qh = 0; qt = 0; q[qt++] = i; artSeen[i] = 1; var maxD = 0;
    while (qh < qt) {
      a = q[qh++]; art.push(a); if (D[a] > maxD) maxD = D[a]; nb4(a, nb);
      for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && deepB(j) && !artSeen[j]) { artSeen[j] = 1; q[qt++] = j; } }
    }
    // [R5] a tiny shallow bit that SEPARATES the fill around it is a line, not a corner of a clump: from its
    // non-black neighbours, walk the fill (4-connected, off black and debris) inside a small window round the
    // bit; if some neighbours cannot be reached without crossing black, the bit divides two things (Doc Brown
    // Mirror Visor's arm from its lens, Trainer Cap's cap from the hair). Two shades of one fill that meet
    // round the side of it are one thing (HODLING's and Blonde Bowl's clumps) - [R4] compared colours and
    // kept those.
    var divides = false;
    // [S2] how deep a small bit of black must reach to count as line art is NOT moved deeper by a w-cell line:
    // a 3-cell inner line off a 2-cell outline (reaching depth 5) is line art, as it is to the page today, which
    // sees that outline doubled (round 3 moved it, ART_W_SHIFT 1, and ate such lines: ctl/ C_2cell_16px_stubs)
    var artEx = ART_W_SHIFT ? pW[part[art[0]]] - 1 : 0;
    if (art.length <= MAX_DEBRIS && maxD <= PEEL_DEPTH + artEx + 1) {
      var bx0 = W, by0 = H, bx1 = -1, by1 = -1, sideCells = [];
      for (k = 0; k < art.length; k++) { var ax = art[k] % W, ay = (art[k] / W) | 0; if (ax < bx0) bx0 = ax; if (ay < by0) by0 = ay; if (ax > bx1) bx1 = ax; if (ay > by1) by1 = ay; }
      for (k = 0; k < art.length; k++) {
        var cx = art[k] % W, cy = (art[k] / W) | 0;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          var nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          var nj = ny * W + nx; if (opq(nj) && !nearB(nj) && !blk[nj] && !junk[nj] && sideCells.indexOf(nj) < 0) sideCells.push(nj);
        }
      }
      if (sideCells.length >= 2) {
        var R = 6, wx0 = Math.max(0, bx0 - R), wy0 = Math.max(0, by0 - R), wx1 = Math.min(W - 1, bx1 + R), wy1 = Math.min(H - 1, by1 + R);
        var seen = new Map(); qh = 0; qt = 0; q[qt++] = sideCells[0]; seen.set(sideCells[0], 1);
        while (qh < qt) {
          var u = q[qh++]; nb4(u, nb);
          for (k = 0; k < 4; k++) { j = nb[k]; if (j < 0 || seen.has(j)) continue; var jx = j % W, jy = (j / W) | 0;
            if (jx < wx0 || jx > wx1 || jy < wy0 || jy > wy1) continue;
            if (!opq(j) || nearB(j) || blk[j] || junk[j]) continue; seen.set(j, 1); q[qt++] = j; }
        }
        var cut = 0; for (k = 0; k < sideCells.length; k++) if (!seen.has(sideCells[k])) cut++;
        divides = cut >= 2;
        // [R6] OR two clearly different colours beside it that nowhere touch each other in the window: two
        // objects with a line between them that meet again further round (Trainer Cap's cap and hair,
        // Detective Deerstalker's orange and maroon). Two shades of one fill touch all over (HODLING).
        if (!divides) {
          var sc = new Map(); for (k = 0; k < sideCells.length; k++) { key = colKey(sideCells[k]); sc.set(key, (sc.get(key) || 0) + 1); }
          var cl = []; sc.forEach(function (n2, c2) { if (n2 >= 2) cl.push(c2); });
          for (var ca = 0; ca < cl.length && !divides; ca++) for (var cb = ca + 1; cb < cl.length && !divides; cb++) {
            var A = cl[ca], B = cl[cb];
            if (Math.abs(((A >> 16) & 255) - ((B >> 16) & 255)) + Math.abs(((A >> 8) & 255) - ((B >> 8) & 255)) + Math.abs((A & 255) - (B & 255)) <= 40) continue;
            var touch = false;
            for (var yy = wy0; yy <= wy1 && !touch; yy++) for (var xx = wx0; xx <= wx1 && !touch; xx++) {
              var ii = yy * W + xx; if (!opq(ii) || colKey(ii) !== A) continue;
              if ((xx > wx0 && opq(ii - 1) && colKey(ii - 1) === B) || (xx < wx1 && opq(ii + 1) && colKey(ii + 1) === B) ||
                  (yy > wy0 && opq(ii - W) && colKey(ii - W) === B) || (yy < wy1 && opq(ii + W) && colKey(ii + W) === B)) touch = true;
            }
            if (!touch) divides = true;
          }
        }
      }
    }
    if (divides || art.length > MAX_DEBRIS || maxD > PEEL_DEPTH + artEx + 1) {      // [B2] line art (not a tiny, shallow corner of a clump)
      var best = -1, bestD = 1 << 30;
      for (k = 0; k < art.length; k++) {
        keep[art[k]] = 1; nb4(art[k], nb);
        for (t = 0; t < 4; t++) { j = nb[t]; if (j >= 0 && bd[j] >= 0 && bd[j] < bestD) { bestD = bd[j]; best = j; } }
      }
      for (j = best; j >= 0; j = par[j]) if (!ring[j]) keep[j] = 1;     // the stalk: shortest band path to the ring
      continue;
    }
    var nearBand = false; for (k = 0; k < art.length; k++) if (touchesBand(art[k])) nearBand = true;
    if (nearBand) for (k = 0; k < art.length; k++) clump[art[k]] = 1;
  }
  // the band right in front of line art belongs to it (walk outward one depth step at a time):
  // a thick black mass (KAWS-style shadow, Skull Mask Charcoal) keeps its front instead of getting a fill stripe
  qh = 0; qt = 0;
  for (i = 0; i < N; i++) if (keep[i] && deepB(i)) q[qt++] = i;
  while (qh < qt) {
    a = q[qh++]; nb4(a, nb);
    for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && band[j] && blk[j] && !ring[j] && !keep[j] && D[j] === D[a] - 1) { keep[j] = 1; q[qt++] = j; } }
  }
  var peel = new Uint8Array(N);
  for (i = 0; i < N; i++) if (work[i] && !ring[i] && !keep[i] && (band[i] || clump[i])) {
    // [S2] the source draws a w-cell line: the first w depths of the band ARE the line (black); only what lies behind it peels
    if (D[i] > pW[part[i]]) peel[i] = 1; else if (D[i] >= 2) paint[i] = 1;
  }
  // a 1-cell tick sticking sideways out of kept line art (a snapping leftover, Noun Glasses Original's inner
  // frame line) joins the fill: the tick is black with ONE black 4-neighbour, that neighbour is part of a
  // straight line running across the tick's direction, and nothing else black is around the tick
  function bk(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return false; var j = y * W + x; return work[j] && blk[j] && !peel[j]; }
  var ticks = [];
  for (i = 0; i < N; i++) {
    if (!keep[i] || !deepB(i)) continue;
    x = i % W; y = (i / W) | 0; var nB = 0, tdir = -1;
    for (k = 0; k < 4; k++) if (bk(x + DX[k], y + DY[k])) { nB++; tdir = k; }
    if (nB !== 1) continue;
    var ux = DX[tdir], uy = DY[tdir], vx = -uy, vy = ux;          // u: toward the line; v: along it
    if (!bk(x + ux + vx, y + uy + vy) || !bk(x + ux - vx, y + uy - vy)) continue;   // the line runs straight through
    if (bk(x - ux, y - uy) || bk(x - ux + vx, y - uy + vy) || bk(x - ux - vx, y - uy - vy)) continue;
    if (!bk(x + ux + 2 * vx, y + uy + 2 * vy) || !bk(x + ux - 2 * vx, y + uy - 2 * vy)) continue;  // and is a real line
    // scattered, not a pattern: no other black sticks out of the line on either side within 2 cells
    // (a zipper's teeth, Green Camo Shark Hoodie, are a pattern and stay)
    var lone = !bk(x + 2 * ux, y + 2 * uy);
    for (var m = 1; m <= 2 && lone; m++) for (var sg = -1; sg <= 1; sg += 2) {
      var lx = x + ux + sg * m * vx, ly = y + uy + sg * m * vy;
      if (bk(lx - ux, ly - uy) || bk(lx + ux, ly + uy)) lone = false;
    }
    if (lone) ticks.push(i);
  }
  for (k = 0; k < ticks.length; k++) peel[ticks[k]] = 1;
  // a coloured strip left outside a black border that was just peeled (the thin-limb guard kept it) is a fringe:
  // it becomes the black line, or that stretch of the part would have no outline at all (Yellow Hard Hat top)
  for (i = 0; i < N; i++) {
    if (!work[i] || !ring[i] || pure[i] || paint[i]) continue;
    nb4(i, nb); for (k = 0; k < 4; k++) if (nb[k] >= 0 && peel[nb[k]] && blk[nb[k]] && srcLine(i)) { paint[i] = 1; break; }
  }
  // [B1] orphans: interior black that touched what was peeled and is no longer 4-connected to the black ring.
  // Dropped only when tiny and shallow; anything bigger or deeper is the artist's line art.
  var comp = new Uint8Array(N), cells = [];
  for (i = 0; i < N; i++) {
    if (!work[i] || !blk[i] || ring[i] || peel[i] || comp[i] || noPeel[part[i]]) continue;
    cells.length = 0; qh = 0; qt = 0; q[qt++] = i; comp[i] = 1;
    var toRing = false, toPeel = false, shallow = true;
    while (qh < qt) {
      a = q[qh++]; cells.push(a); if (D[a] > PEEL_DEPTH + pW[part[a]] - 1) shallow = false; nb4(a, nb);
      for (k = 0; k < 4; k++) {
        j = nb[k]; if (j < 0 || !work[j]) continue;
        if (ring[j] && (pure[j] || paint[j] || blk[j])) toRing = true;
        if (peel[j]) toPeel = true;
        if (blk[j] && !ring[j] && !peel[j] && !comp[j]) { comp[j] = 1; q[qt++] = j; }
      }
    }
    if (toPeel && !toRing && shallow && cells.length <= MAX_DEBRIS) for (k = 0; k < cells.length; k++) peel[cells[k]] = 1;
  }

  // ---- 4. [M3] fill for peeled cells: weighted majority of fill neighbours, deeper ones first, ties to the darker
  var fillOf = new Int32Array(N).fill(-1);
  for (i = 0; i < N; i++) if (work[i] && !blk[i] && !junk[i] && !paint[i] && !peel[i] && !ring[i] && D[i] >= 2) fillOf[i] = i;
  var todo = [], rest, pend = [];
  for (i = 0; i < N; i++) if (peel[i]) todo.push(i);
  var tK = new Int32Array(16), tN = new Int32Array(16), tDeep = new Int32Array(16), tAt = new Int32Array(16), tL = new Float64Array(16), tT = new Int32Array(16), nt;
  var progressed = true;
  for (var round = 0; round < MAX_FILL_ROUNDS && todo.length; round++) {
    rest = []; pend.length = 0;
    for (var tq = 0; tq < todo.length; tq++) {
      var pi = todo[tq], pxx = pi % W, pyy = (pi / W) | 0, myD = D[pi];
      nt = 0;
      for (var fy = -1; fy <= 1; fy++) for (var fx = -1; fx <= 1; fx++) {
        if (!fx && !fy) continue;
        var gx = pxx + fx, gy = pyy + fy; if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        var gi = gy * W + gx, s = fillOf[gi]; if (s < 0) continue;
        var kk = colKey(s), wgt = (fx && fy) ? 1 : 2;
        for (t = 0; t < nt; t++) if (tK[t] === kk) break;
        if (t === nt) {
          tK[nt] = kk; tN[nt] = 0; tDeep[nt] = 0; tAt[nt] = s; tL[nt] = lumOf(s);
          // tier 0: a common colour; 1: a rare accent (it must not grow into the peeled band); 2: reads as black
          tT[nt] = tL[nt] < DARK_FILL_LUM ? 2 : ((count.get(kk) || 0) <= rareMax ? 1 : 0); nt++;
        }
        tN[t] += wgt;
        if (D[gi] > myD) tDeep[t] += wgt;
      }
      var tier = 3, anyDeep = false;
      for (t = 0; t < nt; t++) if (tT[t] < tier) tier = tT[t];
      for (t = 0; t < nt; t++) if (tT[t] === tier && tDeep[t] > 0) anyDeep = true;
      var pick = -1, pickW = -1, pickL = 1e9;
      for (t = 0; t < nt; t++) {
        if (tT[t] !== tier) continue;
        var w = anyDeep ? tDeep[t] : tN[t];
        if (w <= 0) continue;
        if (w > pickW || (w === pickW && tL[t] < pickL)) { pickW = w; pickL = tL[t]; pick = tAt[t]; }
      }
      // only a rare / black-reading colour is at hand while peeled neighbours are still waiting: wait a round,
      // a common colour may arrive (else a leftover speck seeds the whole peeled corner)
      if (pick >= 0 && tier > 0 && round < MAX_FILL_ROUNDS - 1) {
        var waiting = false;
        for (var wy = -1; wy <= 1 && !waiting; wy++) for (var wx = -1; wx <= 1; wx++) {
          var hx = pxx + wx, hy = pyy + wy; if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
          var hi = hy * W + hx; if (peel[hi] && fillOf[hi] < 0 && hi !== pi) { waiting = true; break; }
        }
        if (waiting && progressed) pick = -1;
      }
      if (pick >= 0) pend.push(pi, pick); else rest.push(pi);
    }
    for (k = 0; k < pend.length; k += 2) fillOf[pend[k]] = pend[k + 1];
    progressed = pend.length > 0;
    todo = rest;
  }
  if (opts && opts.debug) res._dbg = { D: D, ring: ring, band: band, keep: keep, peel: peel, paint: paint, blk: blk, work: work, junk: junk, designed: new Uint8Array(N) };
  for (i = 0; i < N; i++) {
    if (paint[i]) { d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
    else if (peel[i]) {
      var f = fillOf[i];
      if (f < 0 || f === i) {                    // no fill reached: black stays black, debris stays as drawn
        if (blk[i]) { d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; }
      }
      else { d[i * 4] = src[f * 4]; d[i * 4 + 1] = src[f * 4 + 1]; d[i * 4 + 2] = src[f * 4 + 2]; d[i * 4 + 3] = src[f * 4 + 3]; }
    }
  }
  return res;
}
/* fixOutlineSource(pic, W, H) - [S1][S2] what the SOURCE picture says about its outline, cell by cell.
   The pass works on cells AFTER the vote, and a thin outline that lost the vote is no longer there to be
   seen (Green Slogan Hoodie: 97-100% of the source edge is black, 1-44% of the cell edge); a 2-cell outline
   at size 8 looks like any other doubled border. So the source is measured once, at full resolution:
   per cell, its source pixels on the edge of the drawing (opaque, 4-touching transparency inside the
   picture; the canvas edge does not count), how many of those are dark (luminance <= SRC_DARK_LUM), and,
   per depth from that edge (1..DMAX source px), how many pixels are opaque and how many dark.
   pic = {data, width, height} as the engine was given it; W x H = the cell grid. */
function fixOutlineSource(pic, W, H) {
  var sw = pic.width, sh = pic.height, s = pic.data, n = sw * sh, N = W * H, SRC_DARK_LUM = 40, SRC_LINE_LUM = 8;
  var cs = sw / W, DMAX = Math.min(64, Math.ceil(4 * cs)), D1 = DMAX + 1;
  var dep = new Int32Array(n), q = new Int32Array(n), qh = 0, qt = 0, i, j, x, y, c, k;
  var cx = new Int32Array(sw), cy = new Int32Array(sh);
  for (x = 0; x < sw; x++) cx[x] = Math.min(W - 1, Math.floor(x * W / sw));
  for (y = 0; y < sh; y++) cy[y] = Math.min(H - 1, Math.floor(y * H / sh));
  function op(j) { return s[j * 4 + 3] >= 128; }
  for (i = 0; i < n; i++) {
    if (!op(i)) { dep[i] = 0; continue; }
    x = i % sw; y = (i / sw) | 0;
    if ((x > 0 && !op(i - 1)) || (x < sw - 1 && !op(i + 1)) || (y > 0 && !op(i - sw)) || (y < sh - 1 && !op(i + sw))) { dep[i] = 1; q[qt++] = i; }
    else dep[i] = 1 << 30;
  }
  while (qh < qt) {
    i = q[qh++]; if (dep[i] >= DMAX) continue; x = i % sw; y = (i / sw) | 0;
    var nb = [x > 0 ? i - 1 : -1, x < sw - 1 ? i + 1 : -1, y > 0 ? i - sw : -1, y < sh - 1 ? i + sw : -1];
    for (k = 0; k < 4; k++) { j = nb[k]; if (j >= 0 && dep[j] > dep[i] + 1) { dep[j] = dep[i] + 1; q[qt++] = j; } }
  }
  var ringN = new Int32Array(N), ringDark = new Int32Array(N), opqD = new Int32Array(N * D1), darkD = new Int32Array(N * D1);
  for (i = 0; i < n; i++) {
    var dd = dep[i]; if (dd < 1 || dd > DMAX) continue;
    x = i % sw; y = (i / sw) | 0; c = cy[y] * W + cx[x];
    var lum = 0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2], dark = lum <= SRC_DARK_LUM ? 1 : 0;
    opqD[c * D1 + dd]++; if (lum <= SRC_LINE_LUM) darkD[c * D1 + dd]++;
    if (dd === 1) { ringN[c]++; ringDark[c] += dark; }
  }
  return { W: W, H: H, cs: cs, DMAX: DMAX, ringN: ringN, ringDark: ringDark, opqD: opqD, darkD: darkD };
}
/* THE OUTLINE PASS, on the cell grid, after the palette. Counted for the
   folder note the way the palette is; fixOutlinedThick = the files whose
   outline was kept thicker than one cell (size 8, drawn that way). */
let fixOutlined=0, fixOutlineCells=0, fixOutlinedThick=0;
function fixOutlineWanted(){ const b=$("fixline"); return !!(b&&b.checked)&&fixMode()!=="scale"; }
/* srcPic (optional): the picture the engine was given. With it, the pass gates and sizes the outline
   from the source [S1][S2]; without it, it behaves exactly as before. */
function fixOutlineApply(out,rel,srcPic){
  if(!out||!out.data||!fixOutlineWanted()) return null;
  /* A grid this big has one-pixel cells: a cell is not the art's square. */
  if(Math.max(out.width,out.height)>512) return null;
  const layer=fixLayerOf(rel);
  const source=(srcPic&&srcPic.data&&OUTLINE_SKIP_LAYERS.indexOf(String(layer||'').toLowerCase())<0)
    ? fixOutlineSource(srcPic,out.width,out.height) : null;
  const res=fixOutlineOnce({W:out.width,H:out.height,data:out.data},{layer:layer,source:source});
  let n=0; const a=out.data, b=res.data;
  for(let i=0;i<a.length;i+=4) if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3]) n++;
  if(n){ out.data=b; fixOutlined++; fixOutlineCells+=n; if(res.wMax>1) fixOutlinedThick++; }
  return {cells:n, wMin:res.wMin, wMax:res.wMax};
}
/* WHAT THE PASS DID, in the run's sentence. One cell everywhere except at
   Pixel size 8 where the picture draws a thicker line: then it says so. */
function fixOutlineSaid(o){
  if(!o||!o.cells) return "";
  const c=o.cells.toLocaleString()+" cell"+(o.cells===1?"":"s")+" changed";
  if(!(o.wMax>1)) return " \u00b7 outline made one cell thick ("+c+")";
  return " \u00b7 outline kept "+(o.wMin>0&&o.wMin<o.wMax?o.wMin+"-"+o.wMax:o.wMax)+" cells thick, as drawn ("+c+")";
}
function fixOutlineBatchSaid(){
  const one=fixOutlined-fixOutlinedThick, said=[];
  if(one) said.push(one+" outline"+(one===1?"":"s")+" made one cell thick");
  if(fixOutlinedThick) said.push(fixOutlinedThick+" outline"+(fixOutlinedThick===1?"":"s")+" kept as thick as drawn");
  return said.length ? " \u00b7 "+said.join(", ") : "";
}

/* ---- CALL SITES AND READOUTS (index.html at 46f1c01; line numbers from that file) ----
   26853-26866  replace the comment, "let fixOutlined=0, fixOutlineCells=0;", fixOutlineWanted and fixOutlineApply
                with the PAGE BLOCK above (from "THE OUTLINE PASS" to the end of fixOutlineBatchSaid).
   27938 fixRun:     const oln=fixOutlineApply(r,FIX.rel);
                 ->  const oln=fixOutlineApply(r,FIX.rel,src);
                     (src is FIX.src, the picture posted to the worker - {data,width,height})
   28052 readout:    +(oln&&oln.cells ? " \u00b7 outline made one cell thick ("+oln.cells.toLocaleString()+" cell"+(oln.cells===1?"":"s")+" changed)" : "")
                 ->  +fixOutlineSaid(oln)
   28249 reset:      fixOutlined=0; fixOutlineCells=0;
                 ->  fixOutlined=0; fixOutlineCells=0; fixOutlinedThick=0;
   28366 batch:      fixOutlineApply(out,rel);
                 ->  fixOutlineApply(out,rel,{data:px,width:sw,height:sh});
                     (px/sw/sh: the job's picture after fixShrinkToFit, the one the engine was given)
   28614 batch note: +(fixOutlined?" \u00b7 "+fixOutlined+" outline"+(fixOutlined===1?"":"s")+" made one cell thick":"")
                 ->  +fixOutlineBatchSaid()
   2072/2074 (the switch; optional, but its words are false at size 8 once this ships):
        title  -> "Clean up the black outline: close its gaps, thin the doubled parts back to the fill, keep every spike and
                   the line art inside. One cell thick; at Pixel size 8 a line the picture draws thicker keeps its thickness
                   (a 16 px line stays 2 cells). Only on shapes that are drawn with a black outline; backgrounds, chains,
                   eyes, mouths and ears are left alone."
        label  -> "Clean black outline"   (no test reads the label or the title: grep of tests/ for "One-cell black outline"
                   and "one cell thick" finds only outlineonecell.spec.js, which reads the readouts)
*/
