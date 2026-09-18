/* THE ENGINE ANSWERS THE SAME WAY EVERY TIME, AND ONLY VISIBLE PIXELS SPEAK.

   Three changes to the ported engine, measured on the 311 working traits
   and the 297 raw sources on 2026-09-18, each verified through the real
   page by more than one instrument.

   1. A FOLDER RUN DEPENDED ON WHAT CAME BEFORE IT. The k-means that decides
      which label wins a cell draws from a process-global random generator
      the reference never seeds, and a folder run keeps one Worker for the
      whole batch. So the same trait with the same settings saved as a
      different picture in a different folder order, and differed from the
      single-image run of the same file:

        nine real gridless traits, batch forward vs reverse, in the page
          8 of 9 differ, up to 1,662 of 25,600 cells
        batch vs the single-image tab, same files        7 of 9 differ
        the batch's own readout, two orders  "25604 colours moved" / "25620"
        alpha differences in any comparison              0

      Fixed by resetting the generator to its fresh state at the top of
      PF.process. Measured: two orders and the single run become identical
      on every file, and no single-image result changes, because a fresh
      Worker already starts from exactly that state. The reset lives in
      PF.process and NOT in kmeans itself: tools/test-quantize.cjs replays
      chained unseeded calls from the fresh state and tests the carry-over
      on purpose. And NOT by tuning attempts or iterations: across six
      settings the seed instability stays in the same band and every other
      setting moves the shipped result on 2 to 12 of 20 files.

   2. INVISIBLE PIXELS COLOURED VISIBLE CELLS. two_stage_pack let every
      pixel vote for a cell's label and averaged every winning pixel into
      its colour, transparent ones included, while the cell's alpha was
      decided separately by a count. The browser hands the engine (0,0,0)
      under every alpha-0 pixel (canvas premultiplication, measured on nine
      files), so a cell that is 55% opaque could be opaque AND black:

        synthetic cell, 5 columns red, 3 columns transparent   came out black
        chains/Cross Chain    8 of 106 opaque cells black, no dark source pixel
        extras/Moon Fisher    11 of 286
        any colour change when alpha-0 pixels stop voting, 311 files at 8px
          116 files, 3,199 cells, always toward black; alpha changes 0

      Fixed by giving alpha-0 pixels zero weight in the vote and the colour.
      The k-means SAMPLE still sees them: restricting it re-rolls 83,837
      cells on 196 files with no directional gain, measured.

   3. THE CELL COLOUR WAS A MEAN, SO THE RESULT INVENTED COLOURS. A cell
      whose winning label spans two exact colours got a third one that
      exists nowhere in the source, and the palette snap then mapped the
      blend:

        files with output colours absent from the source   141 of 311
        invented colours in total                          94,926
        files ending with MORE colours than they started   42
          (Club Penguin Iceberg 115 -> 952)
        palette on: cells on a palette colour no pixel under them would
          have chosen                                      95 files, 3,787 cells

      Fixed by colouring each cell with the weighted mode of the exact
      visible colours carrying the winning label. Measured over all 311:
      invented 0 on every file, silhouette identical on 311 of 311, the 42
      traits drawn at 8px byte-identical, mean colour error to the source
      8.520 against 8.543.

   Also: the forced-step cell count rounded half up where the reference
   rounds half to even (324 at 8 gave 41 cells, the reference 40; 1254 at
   12 gave 105 against 104). PF.rint is the reference's rounding and is
   used now.

   THE REFERENCE RULE IS STILL THERE. PF.process({reference:true}) runs the
   old vote and mean, so tools/test-endtoend.cjs keeps proving the port is
   byte-identical to the Python reference rather than to itself, and the
   departure is a flag somebody can read, not a drift. The README says so.

   The bundle is rebuilt from src and re-inlined into #pfcore, with the old
   inlined text checked against the old bundle first so this cannot paper
   over a drift between the two.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');
const SRC = path.join(ROOT, 'pixelfixer', 'src');
const BUNDLE = path.join(ROOT, 'pixelfixer', 'pixelfixer.bundle.js');

/* ---- a text editor that keeps each file's own line endings ----------- */
function edit(file, fn) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lf = raw.replace(/\r\n/g, '\n');
  const out = fn(lf, file);
  if (out === lf) throw new Error(path.basename(file) + ': nothing changed');
  fs.writeFileSync(file, out.replace(/\n/g, eol));
}
function once(text, needle, file) {
  const n = text.split(needle).length - 1;
  if (n !== 1) throw new Error(path.basename(file) + ': expected exactly one of\n' + needle + '\nfound ' + n);
}
function swap(text, needle, replacement, file) {
  once(text, needle, file);
  const out = text.replace(needle, () => replacement);
  if (out.indexOf(replacement) < 0) throw new Error(path.basename(file) + ': replacement did not land');
  return out;
}

/* ---- what the inline holds today must be the bundle as built --------- */
const oldBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');

/* ================================================================
   1. pf-40-reconstruct.js: visible pixels only, and the mode colour
   ================================================================ */
edit(path.join(SRC, 'pf-40-reconstruct.js'), (t, f) => {
  t = swap(t,
    '  PF.two_stage_pack = function (rgba, cols, rows, k_colors) {\n',
    '  PF.two_stage_pack = function (rgba, cols, rows, k_colors, opts) {\n', f);
  t = swap(t,
    '    if (k_colors === undefined || k_colors === null) k_colors = 0;\n',
    [
      '    if (k_colors === undefined || k_colors === null) k_colors = 0;',
      '    opts = opts || {};',
      '    /* WHERE THIS PORT DEPARTS FROM THE REFERENCE, ON PURPOSE (2026-09-18).',
      '       The reference lets every pixel vote for a cell and averages the',
      '       winning pixels into its colour. Measured on 311 real traits at 8px:',
      '       transparent pixels (black by the time a browser canvas has decoded',
      '       them) won the vote in half-covered edge cells and painted them',
      '       black on 116 files (chains/Cross Chain: 8 of 106 opaque cells), and',
      '       the mean invented colours nobody drew on 141 files (94,926 colours;',
      '       Club Penguin Iceberg went in with 115 colours and came out with',
      '       952). So by default alpha-0 pixels neither vote nor colour, and the',
      '       cell takes the weighted MODE of the exact visible colours carrying',
      '       the winning label - which invents nothing, keeps the silhouette',
      '       identical (311 of 311) and leaves art already on the grid',
      '       byte-identical (42 of 42). opts.reference restores the reference',
      '       rule exactly; tools/test-endtoend.cjs runs that way, so parity with',
      '       the Python stays a measured fact rather than a memory. */',
      '    var visibleOnly = !opts.reference;',
      '',
    ].join('\n'), f);
  t = swap(t,
    '        wgt[i] = wy[y] * wx[x] + 1e-4;\n',
    '        wgt[i] = (visibleOnly && cn === 4 && !d[i * 4 + 3]) ? 0 : (wy[y] * wx[x] + 1e-4);\n', f);
  t = swap(t,
    [
      '    var low = new d.constructor(n * cn), v;',
      '    for (c = 0; c < n; c++) {',
      '      for (ch = 0; ch < 3; ch++) {',
      '        v = PF.rint(out[3 * c + ch] * 255);',
      '        low[c * cn + ch] = PF.clipScalar(v, 0, 255);',
      '      }',
      '    }',
      '',
    ].join('\n'),
    [
      '    /* THE COLOUR THAT WAS ACTUALLY THERE. Per cell, the weighted mode of',
      '       the exact RGB among the visible pixels carrying the winning label',
      '       (weight > 0 is what "visible" means after the vote above). A tie',
      '       goes to whichever colour reached that weight first in pixel order,',
      '       so the answer is a function of the picture and nothing else. A cell',
      '       with no visible winning pixel - which is a cell with no visible',
      '       pixel at all, since the winner has positive weight - keeps the mean',
      '       and is transparent anyway. Kept off in reference mode. */',
      '    var modeKey = null;',
      '    if (visibleOnly) {',
      '      modeKey = new Int32Array(n).fill(-1);',
      '      var tally = new Map(), bestW, bestKey, key, cw;',
      '      for (c = 0; c < n; c++) {',
      '        tally.clear(); bestW = -1; bestKey = -1;',
      '        for (p = offs[c]; p < offs[c + 1]; p++) {',
      '          q = order[p];',
      '          if (lab[q] !== win[c] || !(wgt[q] > 0)) continue;',
      '          b = q * cn;',
      '          key = (d[b] << 16) | (d[b + 1] << 8) | d[b + 2];',
      '          cw = (tally.get(key) || 0) + wgt[q];',
      '          tally.set(key, cw);',
      '          if (cw > bestW) { bestW = cw; bestKey = key; }',
      '        }',
      '        modeKey[c] = bestKey;',
      '      }',
      '    }',
      '',
      '    var low = new d.constructor(n * cn), v;',
      '    for (c = 0; c < n; c++) {',
      '      if (modeKey && modeKey[c] >= 0) {',
      '        low[c * cn] = (modeKey[c] >> 16) & 255;',
      '        low[c * cn + 1] = (modeKey[c] >> 8) & 255;',
      '        low[c * cn + 2] = modeKey[c] & 255;',
      '        continue;',
      '      }',
      '      for (ch = 0; ch < 3; ch++) {',
      '        v = PF.rint(out[3 * c + ch] * 255);',
      '        low[c * cn + ch] = PF.clipScalar(v, 0, 255);',
      '      }',
      '    }',
      '',
    ].join('\n'), f);
  return t;
});

/* ================================================================
   2. pf-99-api.js: one image per process, half-even, the flag through
   ================================================================ */
edit(path.join(SRC, 'pf-99-api.js'), (t, f) => {
  t = swap(t,
    '  PF.process = function process(data, width, height, opts) {\n    opts = opts || {};\n',
    [
      '  PF.process = function process(data, width, height, opts) {',
      '    opts = opts || {};',
      '    /* ONE IMAGE PER PROCESS, BY CONSTRUCTION. The k-means draws from a',
      '       process-global generator the reference never seeds, so in a Worker',
      '       that outlives one image the answer depended on what ran before it:',
      '       measured in the page, 8 of 9 real traits differed between two',
      '       folder orders (up to 1,662 of 25,600 cells) and 7 of 9 differed',
      '       from their own single-image run. 0xffffffff is the state a fresh',
      '       engine starts in (cv::theRNG, pf-03-cv2.js), so a single run is',
      '       unchanged by this and a folder run now equals it. The reset is here',
      '       and not inside kmeans: tools/test-quantize.cjs tests the carry-over',
      '       between chained calls on purpose. Not fixable by more attempts or',
      '       iterations, measured across six settings. */',
      '    PF.setRNGSeed(0xffffffff);',
      '',
    ].join('\n'), f);
  t = swap(t,
    '        cols: Math.max(1, Math.round(width / fs)),\n        rows: Math.max(1, Math.round(height / fs)),\n',
    [
      '        /* round(), not Math.round: api.py rounds half to even, so 324 at',
      '           8 is 40 cells there and was 41 here, 1254 at 12 is 104 not 105. */',
      '        cols: Math.max(1, PF.rint(width / fs)),',
      '        rows: Math.max(1, PF.rint(height / fs)),',
      '',
    ].join('\n'), f);
  t = swap(t,
    '    var low = PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0);\n',
    [
      '    /* opts.reference: the reference\'s own vote and mean, for the parity',
      '       harness. The default is this port\'s measured departure - see the',
      '       comment in two_stage_pack. */',
      '    var low = PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0,',
      '      { reference: !!opts.reference });',
      '',
    ].join('\n'), f);
  t = swap(t,
    '   * @param {{mode?:string, forceStep?:number, kColors?:number,\n   *          onProgress?:function(number,string)}} [opts]\n',
    '   * @param {{mode?:string, forceStep?:number, kColors?:number, reference?:boolean,\n   *          onProgress?:function(number,string)}} [opts]\n', f);
  return t;
});

/* ================================================================
   3. the parity tool asks for the reference rule; the header says so
   ================================================================ */
edit(path.join(ROOT, 'pixelfixer', 'tools', 'test-endtoend.cjs'), (t, f) =>
  swap(t, '  const r = PF.process(data, w, h, {});\n',
    [
      '  /* reference:true - the reference\'s own vote and mean. The default',
      '     departs from it on purpose (two_stage_pack says how and why); this',
      '     tool exists to prove parity with the Python, which only the',
      '     reference rule can have. */',
      '  const r = PF.process(data, w, h, { reference: true });',
      '',
    ].join('\n'), f));

edit(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'), (t, f) =>
  swap(t,
    "  ' * and example image measured, and the reconstruction is byte-identical to',\n  ' * the reference; tools/test-detect.js and tools/test-recon.js are where',\n  ' * that is measured rather than claimed.',\n",
    [
      "  ' * and example image measured. Under {reference:true} the reconstruction',",
      "  ' * is byte-identical to the reference; the default departs from it in two',",
      "  ' * measured ways (README, \"Where it departs on purpose\"). tools/test-detect',",
      "  ' * and tools/test-endtoend are where that is measured rather than claimed.',",
      '',
    ].join('\n'), f));

edit(path.join(ROOT, 'pixelfixer', 'README.md'), (t, f) => {
  once(t, '## Where it is not faithful', f);
  return t.replace('## Where it is not faithful', [
    '## Where it departs on purpose',
    '',
    'Measured on the collection\'s 311 working traits at 8px cells (2026-09-18),',
    'and changed in `two_stage_pack` by default; `PF.process(..., {reference: true})`',
    'runs the reference\'s own rule and is what `tools/test-endtoend.cjs` compares.',
    '',
    '- **Only visible pixels vote and colour.** The reference weights every',
    '  pixel; a browser canvas hands the engine `(0,0,0)` under every alpha-0',
    '  pixel, so half-covered edge cells came out black on 116 of 311 files',
    '  (chains/Cross Chain: 8 of 106 opaque cells). Alpha-0 pixels now have',
    '  zero weight in the label vote and the colour. The k-means sample still',
    '  includes them: restricting it re-rolls 83,837 cells on 196 files with no',
    '  directional gain.',
    '- **The cell colour is the weighted mode of the exact visible colours',
    '  carrying the winning label, not their mean.** The mean invented colours',
    '  on 141 of 311 files (94,926 in total; one file went from 115 colours to',
    '  952). The mode invents none, keeps the silhouette identical on 311 of',
    '  311 and leaves art already on the grid byte-identical (42 of 42).',
    '- **`PF.process` resets the k-means generator per image.** The reference',
    '  never seeds it, so in a Worker that outlives one image the result',
    '  depended on what ran before (8 of 9 real traits differed between two',
    '  folder orders). A fresh engine starts at the same state, so single runs',
    '  are unchanged and a batch now equals them.',
    '',
    '## Where it is not faithful',
  ].join('\n'));
});

/* ================================================================
   4. rebuild, then re-inline, checking the old inline was the old bundle
   ================================================================ */
require(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'));
const newBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
if (newBundle === oldBundle) throw new Error('the rebuilt bundle is unchanged');
for (const need of ['PF.setRNGSeed(0xffffffff);', 'var visibleOnly = !opts.reference;', 'modeKey = new Int32Array(n).fill(-1);',
  'cols: Math.max(1, PF.rint(width / fs)),', '{ reference: !!opts.reference }'])
  if (newBundle.indexOf(need) < 0) throw new Error('the rebuilt bundle lacks: ' + need);

const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const open = kit.only(L, l => l === '<script id="pfcore" type="text/plain">', 'the engine tag');
let close = -1;
for (let i = open + 1; i < L.length; i++) if (L[i] === '</script>') { close = i; break; }
if (close < 0) throw new Error('no end to the engine tag');
const inlined = L.slice(open + 1, close).join('\n').replace(/\s+$/, '');
if (inlined !== oldBundle) throw new Error('the inlined engine is not the bundle as built - a drift this patch will not paper over');
kit.replace(L, { start: open + 1, end: close - 1 }, newBundle.split('\n'));

/* ================================================================
   5. the new engine, exercised before anything is written
   ================================================================ */
const grew = kit.save(doc, ({ text }) => {
  const m = text.match(/<script id="pfcore" type="text\/plain">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('engine tag lost');
  const inl = m[1].replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '');
  if (inl !== newBundle) throw new Error('the inlined engine is not the rebuilt bundle');

  /* Load it in a private realm, twice: the shipped rule and the mutant that
     is the reference rule, so each check below can return the other answer. */
  const load = () => new Function('globalThis', inl + '\nreturn globalThis.PF;')({});
  const PF = load();
  if (typeof PF.process !== 'function') throw new Error('the engine did not load');

  /* (a) five columns red, three transparent, in every 8px cell */
  const W = 64, cellsWide = W / 8;
  const five = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const cx = x % 8, i = (y * W + x) * 4;
    if (cx < 3 || cx > 5) { five[i] = 255; five[i + 3] = 255; }
  }
  const a = PF.process(new Uint8ClampedArray(five), W, W, { forceStep: 8 });
  for (let c = 0; c < cellsWide * cellsWide; c++)
    if (a.data[c * 4 + 3] !== 255 || a.data[c * 4] !== 255 || a.data[c * 4 + 1] !== 0 || a.data[c * 4 + 2] !== 0)
      throw new Error('a half-transparent cell is not red: ' + Array.from(a.data.subarray(c * 4, c * 4 + 4)));
  const aRef = PF.process(new Uint8ClampedArray(five), W, W, { forceStep: 8, reference: true });
  if (aRef.data[0] !== 0 || aRef.data[3] !== 255) throw new Error('reference mode no longer reproduces the old black cell: ' + Array.from(aRef.data.subarray(0, 4)));

  /* (b) flat 8px art with a transparent quadrant comes back byte for byte */
  const flat = new Uint8ClampedArray(W * W * 4);
  const want = [];
  for (let cy = 0; cy < cellsWide; cy++) for (let cx = 0; cx < cellsWide; cx++) {
    const col = (cx < 4 && cy < 4) ? [0, 0, 0, 0] : [(cx * 37 + cy * 91) & 255, (cx * 53 + 7) & 255, (cy * 71 + 3) & 255, 255];
    want.push(col);
    for (let y = cy * 8; y < cy * 8 + 8; y++) for (let x = cx * 8; x < cx * 8 + 8; x++) { const i = (y * W + x) * 4; flat[i] = col[0]; flat[i + 1] = col[1]; flat[i + 2] = col[2]; flat[i + 3] = col[3]; }
  }
  const bOut = PF.process(new Uint8ClampedArray(flat), W, W, { forceStep: 8 });
  for (let c = 0; c < want.length; c++) {
    const w4 = want[c];
    if (!w4[3]) { if (bOut.data[c * 4 + 3] !== 0) throw new Error('a transparent cell became opaque'); continue; }
    for (let k = 0; k < 4; k++) if (bOut.data[c * 4 + k] !== w4[k]) throw new Error('flat art changed at cell ' + c + ': ' + Array.from(bOut.data.subarray(c * 4, c * 4 + 4)) + ' vs ' + w4);
  }

  /* (c) the same image twice in one engine, the second after another */
  const noisy = new Uint8ClampedArray(W * W * 4);
  let s = 12345;
  for (let i = 0; i < W * W; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; noisy[i * 4] = s & 255; noisy[i * 4 + 1] = (s >> 8) & 255; noisy[i * 4 + 2] = (s >> 16) & 255; noisy[i * 4 + 3] = 255; }
  const first = PF.process(new Uint8ClampedArray(noisy), W, W, { forceStep: 4 });
  PF.process(new Uint8ClampedArray(five), W, W, { forceStep: 8 });
  const again = PF.process(new Uint8ClampedArray(noisy), W, W, { forceStep: 4 });
  for (let i = 0; i < first.data.length; i++) if (first.data[i] !== again.data[i]) throw new Error('the same image came out differently after another one');
  /* and that this check CAN fail: the reference rule without the reset */
  const PFm = load();
  const mut = inl.replace('PF.setRNGSeed(0xffffffff);', '');
  if (mut === inl) throw new Error('no reset line to mutate');
  const PFx = new Function('globalThis', mut + '\nreturn globalThis.PF;')({});
  const m1 = PFx.process(new Uint8ClampedArray(noisy), W, W, { forceStep: 4 });
  PFx.process(new Uint8ClampedArray(five), W, W, { forceStep: 8 });
  const m2 = PFx.process(new Uint8ClampedArray(noisy), W, W, { forceStep: 4 });
  let moved = 0; for (let i = 0; i < m1.data.length; i++) if (m1.data[i] !== m2.data[i]) moved++;
  if (!moved) throw new Error('the order-dependence control did not move, so check (c) proves nothing on this fixture');
  void PFm;

  /* (d) the forced count rounds half to even */
  const s324 = new Uint8ClampedArray(324 * 324 * 4).fill(255);
  const d4 = PF.process(s324, 324, 324, { forceStep: 8 });
  if (d4.cols !== 40 || d4.rows !== 40) throw new Error('324 at 8 gives ' + d4.cols + ' cells, expected 40');
});

fs.renameSync(TMP, FILE);
console.log('patch500 written, ' + grew + ' bytes');
