/* Round 9 fixtures and helpers for gapkept.spec.js (and the diagnostic). Injected into the page as a script.
   All pictures are 1280 x 1280: a navy field with yellow shapes outlined in white, every edge placed inside a cell.
   paintGaps (for Pixel size 16, cells of 16 px):
     C  - a yellow block x 405-526, y 405-558 with a 6 px white outline, and a NOTCH cut into it from the right: navy
          14 px tall (y 467-480) running in from the outside to x 472, lined with the outline's white (y 461-466,
          481-486, x 466-471) - a hole joined to the outside, like GATE's G. The notch's cells are row 29, x 30-32.
     2|3 - two yellow blocks (x 662-763 and 788-891, y 661-811), each outlined in white, 12 px of navy between the
          two outlines (x 770-781) - two letters close together, like GATE's G and A. The gap's cells are column 48.
     L  - an L of yellow (a bar x 405-443, y 693-907 and a foot x 405-603, y 869-907), outlined in white: its inside
          corner is open fill on two sides (the cell at 28,53), not a gap.
   paintThin (for Pixel size 8, cells of 8 px): a yellow block x 402-517, y 402-597 with a 4 px white outline. */
export const FIX = `
(function () {
  function paintRects(rects) {
    var W = 1280, d = new Uint8ClampedArray(W * W * 4);
    rects.forEach(function (r) {
      for (var y = r[1]; y < r[1] + r[3]; y++) for (var x = r[0]; x < r[0] + r[2]; x++) {
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        var o = (y * W + x) * 4; d[o] = r[4][0]; d[o + 1] = r[4][1]; d[o + 2] = r[4][2]; d[o + 3] = 255;
      }
    });
    return d;
  }
  var NAVY = [13, 32, 74], YEL = [252, 189, 7], WH = [250, 250, 248];
  function paintGaps() {
    return paintRects([[200, 200, 880, 880, NAVY],
      /* C with its notch */
      [399, 399, 134, 166, WH], [405, 405, 122, 154, YEL], [466, 461, 67, 26, WH], [472, 467, 69, 14, NAVY],
      /* 2 and 3, 12 px of navy between their outlines */
      [656, 655, 114, 163, WH], [662, 661, 102, 151, YEL], [782, 655, 116, 163, WH], [788, 661, 104, 151, YEL],
      /* L */
      [399, 687, 51, 227, WH], [399, 863, 211, 51, WH], [405, 693, 39, 215, YEL], [405, 869, 199, 39, YEL]]);
  }
  /* round 9b: the EDGES picture (paintEdges) - where GAP's numbers sit. A rect list is painted in order. */
  var AA = [131, 141, 161];   /* an anti-alias row between the navy and the white: a third colour, as GATE's source has */
  /* two yellow blocks side by side, each 50 x 90 px in a 6 px white outline; xl = the first column of block A's
     right-hand line, W = px between the two white lines; aa: the navy between them meets each line through a 2 px
     AA row (inside W). Only there: an AA row all round would part the line from the navy everywhere, and the line's
     outside (the biggest piece it touches) would no longer be the navy - HUG would not take it at all */
  function pair(xl, yt, W, aa) {
    var L = 6, BW = 50, YH = 90, a = aa ? 2 : 0, xb = xl + L + W, r = [];
    r.push([xl - BW - L, yt - L, BW + 2 * L, YH + 2 * L, WH], [xb, yt - L, BW + 2 * L, YH + 2 * L, WH]);
    if (aa) r.push([xl + L, yt, W, YH, AA], [xl + L + a, yt, W - 2 * a, YH, NAVY]);
    r.push([xl - BW, yt, BW, YH, YEL], [xb + L, yt, BW, YH, YEL]);
    return r;
  }
  /* a 122 x 154 yellow block with a 6 px white outline and a notch cut in from the right, 14 px tall, like block C;
     aa: 2 px AA rows inside the notch's lining (the notch's navy 10 px); bare: the notch is lined above only (its
     lower side is the yellow itself) */
  function notched(x0, y0, aa, bare) {
    var r = [];
    r.push([x0 - 6, y0 - 6, 134, 166, WH], [x0, y0, 122, 154, YEL]);
    if (bare) r.push([x0 + 61, y0 + 56, 67, 20, WH], [x0 + 67, y0 + 62, 69, 14, NAVY]);
    else if (aa) r.push([x0 + 61, y0 + 56, 67, 26, WH], [x0 + 67, y0 + 62, 63, 14, AA], [x0 + 69, y0 + 64, 67, 10, NAVY]);
    else r.push([x0 + 61, y0 + 56, 67, 26, WH], [x0 + 67, y0 + 62, 69, 14, NAVY]);
    return r;
  }
  function paintEdges() {
    var r = [[199, 199, 882, 882, NAVY]];
    r = r.concat(notched(245, 245, true, false));      /* E1 notch with AA rows */
    r = r.concat(pair(506, 266, 16, true));            /* E2 gap 16 px with AA rows (12 navy) */
    r = r.concat(pair(682, 266, 22, false));           /* E3 gap 22 px */
    r = r.concat(pair(874, 266, 26, false));           /* E4 gap 26 px */
    r = r.concat(pair(298, 522, 30, false));           /* E5 gap 30 px */
    r = r.concat(pair(509, 522, 9, false));            /* E6 gap 9 px inside one cell: 56% fill, 44% line */
    r = r.concat(pair(703, 522, 6, false));            /* E7 gap 6 px inside one cell: 38% fill, 62% line */
    r = r.concat(notched(389, 741, false, true));      /* E8 notch lined above only */
    r.push([224, 756, 62, 102, WH], [230, 762, 50, 90, YEL]);   /* E9 a block 25 px from the field's transparent edge */
    return paintRects(r);
  }
  function paintThin() {
    return paintRects([[200, 200, 880, 880, NAVY], [398, 398, 124, 204, WH], [402, 402, 116, 196, YEL]]);
  }
  window.__g = {
    paintGaps: paintGaps, paintThin: paintThin, paintEdges: paintEdges,
    png: async function (rgba) {
      var c = document.createElement('canvas'); c.width = 1280; c.height = 1280;
      c.getContext('2d').putImageData(new ImageData(rgba, 1280, 1280), 0, 0);
      var blob = await new Promise(function (res) { c.toBlob(res, 'image/png'); });
      c.width = 1; c.height = 1;
      return new Uint8Array(await blob.arrayBuffer());
    },
    set: function (step, pal) {
      document.getElementById('fixmode').value = 'fast';
      document.getElementById('fixgrid').checked = true;
      document.getElementById('fixpal').checked = !!pal;
      document.getElementById('fixline').checked = true;
      var f = document.getElementById('fixforce'); f.disabled = false; f.value = String(step);
    },
    /* the engine switches the page has (base-623 has neither HUG_ON nor HUG_GAP_ON; round 8 has HUG_ON only) */
    has: function (name) { return (document.getElementById('pfcore').textContent.match(new RegExp('var ' + name + ' = (true|false);', 'g')) || []).length === 1; },
    /* one run; offs = engine switches to turn off for this run only - each must exist exactly once */
    run: async function (bytes, rel, step, offs, pal) {
      window.__g.set(step, pal);
      var el = document.getElementById('pfcore'), orig = el.textContent, txt = orig;
      (offs || []).forEach(function (off) {
        var re = new RegExp('var ' + off + ' = (true|false);', 'g');
        if ((txt.match(re) || []).length !== 1) throw new Error('the engine has no switch ' + off);
        txt = txt.replace(re, 'var ' + off + ' = false;');
      });
      el.textContent = txt;
      try {
        await fixLoad(fileWithPath(bytes, rel));
        var out = await fixRun();
        return out ? { w: out.width, data: Array.from(out.data) } : null;
      } finally { el.textContent = orig; }
    },
    cls: function (d, i) {
      if (d[i * 4 + 3] < 128) return '.';
      var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (r > 170 && g > 110 && b < 100) return 'Y';
      if (r > 190 && g > 190 && b > 190) return 'W';
      if (b > r + 20 && r < 80) return 'N';
      return '?';
    },
    at: function (o, x, y) { return window.__g.cls(o.data, y * o.w + x); },
    map: function (o, x0, y0, w, h) {
      var s = '', x, y;
      for (y = y0; y < y0 + h; y++) { s += String(y).padStart(3) + ' '; for (x = x0; x < x0 + w; x++) s += window.__g.at(o, x, y); s += '\\n'; }
      return s;
    },
    /* yellow cells; 4-neighbour edges from a yellow cell to a navy cell, listed as the navy cell 'x,y' */
    count: function (o) {
      var w = o.w, Y = [], navyAt = [], white = 0, other = 0, i, x, y, k, c = [];
      for (i = 0; i < w * w; i++) c.push(window.__g.cls(o.data, i));
      for (i = 0; i < w * w; i++) {
        if (c[i] === 'W') white++; if (c[i] === '?') other++;
        if (c[i] !== 'Y') continue; Y.push(i); x = i % w; y = (i / w) | 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x + d[0], yy = y + d[1]; if (xx >= 0 && yy >= 0 && xx < w && yy < w && c[yy * w + xx] === 'N') navyAt.push(xx + ',' + yy); });
      }
      return { yellow: Y.length, Y: Y.join(','), edges: navyAt.length, navyAt: navyAt, white: white, other: other };
    },
  };
})();`;
