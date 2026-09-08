/* WHO WOULD THE BORDER RULE CHANGE FOR?

   blackenEdge outlines every opaque pixel that touches empty space, and treats
   off-canvas as empty on purpose: "a trait running to the edge of the frame
   still has a border there." For a hat cropped at the top that is right. For a
   background that covers the whole canvas it draws a frame around the picture,
   which is what the user objected to.

   The proposed rule is narrow: an edge of the canvas that the art fills
   COMPLETELY is not an edge of the art. Before changing a deliberate rule,
   count who it changes - and, just as important, who it does not.

   Reported per file:
     edges  - how many of the four canvas edges are fully opaque
     ring   - how many perimeter pixels the CURRENT rule paints black
   A file with 4 full edges is a full-bleed background and stops being framed.
   A file with 1 or 2 keeps its outline everywhere else.
*/
const fs = require('fs');
const path = require('path');
const PNGJS = process.env.PNGJS_PATH
  || 'C:/Users/vicke/OneDrive/Documents/ChatGPT/pixel art_/chatnft/node_modules/pngjs';
let PNG;
try { ({ PNG } = require(PNGJS)); }
catch (_) { console.error('No pngjs at ' + PNGJS); process.exit(2); }

const ROOT = process.argv[2];
const rows = [];
for (const layer of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, layer);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.png$/i.test(f)) continue;
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const { width: W, height: H, data: d } = png;
    const on = (x, y) => d[(y * W + x) * 4 + 3] >= 128;
    let top = true, bot = true, left = true, right = true;
    for (let x = 0; x < W; x++) { if (!on(x, 0)) top = false; if (!on(x, H - 1)) bot = false; }
    for (let y = 0; y < H; y++) { if (!on(0, y)) left = false; if (!on(W - 1, y)) right = false; }
    /* The perimeter pixels the current rule would blacken purely BECAUSE they
       are at the canvas edge - opaque, and with no empty neighbour on canvas. */
    let ring = 0;
    const edgePixel = (x, y) => {
      if (!on(x, y)) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // on-canvas only
        if (!on(xx, yy)) return false;                          // already an art edge
      }
      return true;
    };
    for (let x = 0; x < W; x++) { if (edgePixel(x, 0)) ring++; if (edgePixel(x, H - 1)) ring++; }
    for (let y = 1; y < H - 1; y++) { if (edgePixel(0, y)) ring++; if (edgePixel(W - 1, y)) ring++; }
    rows.push({ layer, file: f, edges: [top, bot, left, right].filter(Boolean).length, ring });
  }
}

const byEdges = {};
rows.forEach(r => { byEdges[r.edges] = (byEdges[r.edges] || 0) + 1; });
console.log('files: ' + rows.length);
console.log('canvas edges the art fills completely:');
[0, 1, 2, 3, 4].forEach(k => { if (byEdges[k]) console.log('  ' + k + ' edges : ' + byEdges[k]); });

const full = rows.filter(r => r.edges === 4);
console.log('\nFULL BLEED (all four) - these stop being framed: ' + full.length);
const perLayer = {};
full.forEach(r => { perLayer[r.layer] = (perLayer[r.layer] || 0) + 1; });
Object.keys(perLayer).sort().forEach(l => console.log('  ' + l + ': ' + perLayer[l]));
console.log('  perimeter pixels currently blackened on those: '
  + full.reduce((a, r) => a + r.ring, 0));

const some = rows.filter(r => r.edges > 0 && r.edges < 4);
console.log('\nTOUCH SOME EDGES BUT NOT ALL - outline kept everywhere else: ' + some.length);
some.slice(0, 10).forEach(r => console.log('  ' + r.layer + '/' + r.file
  + '  ' + r.edges + ' full edges, ' + r.ring + ' perimeter pixels'));

const none = rows.filter(r => r.edges === 0);
console.log('\nUNCHANGED BY THE NEW RULE: ' + none.length
  + ' (of which ' + none.filter(r => r.ring > 0).length
  + ' currently get perimeter black, and keep it)');
