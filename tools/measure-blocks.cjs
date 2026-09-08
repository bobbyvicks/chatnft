/* THE SAME QUESTION, ASKED SO THE ANSWER CAN SURVIVE A HAND EDIT.

   The first pass asked "is EVERY NxN block flat", which is the right question
   for "can this be stored on an N grid losslessly" and the WRONG one for "what
   is this art drawn at". One hand-edited pixel - and Codex's own record says
   "Off-grid hand edits are preserved exactly" - drops a file from 10px to 1px,
   so a census built on it would report a collection with no grid at all.

   Two corrections, both of which can only make the earlier number look worse
   than the truth, never better:

   1. OFFSET. Blocks were assumed to start at the canvas origin. Art shifted by
      a few pixels is drawn on a grid, just not that one. Every offset 0..n-1
      is tried and the best kept.

   2. SHARE, not all-or-nothing. What comes back is the FRACTION of blocks that
      are flat. 99.8% at 10px is 10px art with a few edits in it; 40% is not
      10px art.

   The threshold for calling it "drawn at n" is stated here rather than left
   implicit: 98% of blocks flat. It is a judgement, so the raw share is written
   out beside it and anybody can move the line.
*/
const fs = require('fs');
const path = require('path');
/* pngjs is not a dependency of this repo - there is no build step here and
   nothing the page ships needs a PNG decoder. This walks trait folders
   OUTSIDE the repo, so it borrows the copy the art pipeline already has and
   says plainly where it looked when it cannot find one. */
const PNGJS = process.env.PNGJS_PATH
  || 'C:/Users/vicke/OneDrive/Documents/ChatGPT/pixel art_/chatnft/node_modules/pngjs';
let PNG;
try { ({ PNG } = require(PNGJS)); }
catch (_) {
  try { ({ PNG } = require('pngjs')); }
  catch (_2) {
    console.error('No pngjs. Set PNGJS_PATH to a folder holding it. Looked in: ' + PNGJS);
    process.exit(2);
  }
}

const ROOT = process.argv[2];
const CAND = [40, 32, 20, 16, 10, 8, 5, 4, 2];
const CALL_IT = 0.98;

/* The share of whole NxN blocks that hold exactly one colour, at the best
   offset. Partial blocks at the far edge are not counted either way - they
   cannot be flat-or-not in the sense being asked about. */
function shareAt(px, W, H, n) {
  let best = 0, bestOff = 0;
  for (let off = 0; off < n; off++) {
    let flat = 0, total = 0;
    for (let by = off; by + n <= H; by += n) {
      for (let bx = off; bx + n <= W; bx += n) {
        total++;
        const i0 = (by * W + bx) * 4;
        const r = px[i0], g = px[i0 + 1], b = px[i0 + 2], a = px[i0 + 3];
        let ok = true;
        for (let y = by; y < by + n && ok; y++)
          for (let x = bx; x < bx + n; x++) {
            const i = (y * W + x) * 4;
            if (px[i] !== r || px[i + 1] !== g || px[i + 2] !== b || px[i + 3] !== a) { ok = false; break; }
          }
        if (ok) flat++;
      }
    }
    const s = total ? flat / total : 0;
    if (s > best) { best = s; bestOff = off; }
    if (best === 1) break;
  }
  return { share: best, off: bestOff };
}

const rows = [];
for (const layer of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, layer);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.png$/i.test(f)) continue;
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const at = {};
    for (const n of CAND) at[n] = shareAt(png.data, png.width, png.height, n);
    /* The coarsest grid it still counts as drawn on. */
    let drawn = 1;
    for (const n of CAND) if (at[n].share >= CALL_IT) { drawn = n; break; }
    rows.push({ layer, file: f, drawn,
      at10: +at[10].share.toFixed(4), off10: at[10].off,
      at8: +at[8].share.toFixed(4), off8: at[8].off,
      at5: +at[5].share.toFixed(4), at4: +at[4].share.toFixed(4),
      at2: +at[2].share.toFixed(4) });
  }
}

const by = {};
rows.forEach(r => { by[r.drawn] = (by[r.drawn] || 0) + 1; });
console.log('files: ' + rows.length + '   (called "drawn at n" at ' + (CALL_IT * 100) + '% of blocks flat)');
Object.keys(by).map(Number).sort((a, b) => b - a)
  .forEach(k => console.log('  ' + String(k).padStart(3) + 'px : ' + by[k]));

console.log('\nthe ones the first pass called 1px - what they really are:');
const wasNone = rows.filter(r => r.at10 < 1 && r.at8 < 1 && r.at5 < 1);
console.log('  not perfectly clean at 10, 8 or 5: ' + wasNone.length);
const nearly = wasNone.filter(r => r.at10 >= 0.9 || r.at8 >= 0.9 || r.at5 >= 0.9);
console.log('  ...of which 90%+ flat at one of them (a few edits, not chaos): ' + nearly.length);
nearly.slice(0, 10).forEach(r => console.log('    ' + r.layer + '/' + r.file
  + '  10px ' + (r.at10 * 100).toFixed(1) + '%  8px ' + (r.at8 * 100).toFixed(1)
  + '%  5px ' + (r.at5 * 100).toFixed(1) + '%'));

const chaos = wasNone.filter(r => r.at10 < 0.9 && r.at8 < 0.9 && r.at5 < 0.9);
console.log('\n  ...and genuinely no block structure: ' + chaos.length);
chaos.slice(0, 10).forEach(r => console.log('    ' + r.layer + '/' + r.file
  + '  best 10px ' + (r.at10 * 100).toFixed(1) + '%'));

fs.writeFileSync(path.join(__dirname, 'block-census2.json'), JSON.stringify(rows, null, 1));
console.log('\nwrote block-census2.json');
