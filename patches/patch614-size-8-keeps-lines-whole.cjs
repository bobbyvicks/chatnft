/* patch614: AT PIXEL SIZE 8, A MOUTH, EYES OR CHAIN KEEPS ITS LINES WHOLE.

   The owner, on the size-8 results for mouths, eyes and chains: "even when
   using 8 its not good but fix it for 8 then". Read from zoomed crops
   (scratchpad/fix8/v-*.png), three faults belonged to the cell step:
     - a line about one cell wide that falls across two cells won neither
       cell's vote and vanished, or won both and doubled: Mouth 05 lost its
       left teeth bar and its bottom bar broke up;
     - a thin line on transparency fell under the "over half opaque" rule in
       the cells it crossed and broke into dots;
     - in a textured fill a cell took the local mode of the noise, so Mouth
       05's cream teeth came out with pale-yellow specks.
   PF.repair8_pack (pixelfixer/src/pf-42-repair8.js, candidate VOTE v6 in
   scratchpad/fix8/vote) is today's two_stage_pack with four rules added -
   rescue, undouble, connect and specks - each measured and each explained
   in that file. With every rule off it is today's cells byte for byte on
   283 of 283 files; art already on the 8 grid comes out byte-identical;
   Mouth 05 gets all three bars and a speck-free fill, Space Invader Pupils
   closed eye outlines, the XRP pendant an outlined X, the Triforce an
   outlined cup; Crooked Smiley's X eyes, Impossible Fold Skin's shading and
   Argentina's "0" are as today.

   WHERE IT RUNS. Only when the step is exactly 8 px and the file is in the
   mouth, eyes or chains layer - the layers the owner asked about and the
   only ones where it was measured better. On the other layers the same
   rules shuffled a few cells with no clear gain (181 control files: D worse
   on 81 by hundredths, specks +1.4%), so they keep today's cells. The layer
   is read the way the outline pass reads it (fixLayerOf).

   THE COLOUR FUNCTIONS COME FROM THE PAGE. The rules compare colours with
   the page's own labOf and deltaE2000; the worker already carries both (the
   palette step), and passes them in, so there is one definition of each.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs');
const path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const ROOT = s0.REPO;
const SRC = path.join(ROOT, 'pixelfixer', 'src');
const BUNDLE = path.join(ROOT, 'pixelfixer', 'pixelfixer.bundle.js');
const README = path.join(ROOT, 'pixelfixer', 'README.md');
const MODULE = path.join(SRC, 'pf-42-repair8.js');

/* ---- CHECK FIRST ------------------------------------------------------ */
if (!fs.existsSync(MODULE)) throw new Error('pixelfixer/src/pf-42-repair8.js is missing');
if (fs.readFileSync(MODULE, 'utf8').indexOf('PF.repair8_pack = function') < 0) throw new Error('pf-42-repair8.js defines no PF.repair8_pack');
const page0 = fs.readFileSync(s0.FILE, 'utf8');
if (page0.indexOf('function fixRepair8(') >= 0) throw new Error('patch614 is already applied');
const oldBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const OPEN = '<script id="pfcore" type="text/plain">';
function inlineOf(text) {
  const a = text.indexOf(OPEN); if (a < 0 || text.indexOf(OPEN, a + 1) >= 0) throw new Error('expected exactly one engine tag');
  const s = a + OPEN.length, e = text.indexOf('</script>', s);
  return { s, e, body: text.slice(s, e) };
}
{
  const inl = inlineOf(page0).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '');
  if (inl !== oldBundle) throw new Error('the inlined engine is not the bundle as built - a drift this patch will not paper over');
}

function edit(file, fn) {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lf = raw.replace(/\r\n/g, '\n');
  const out = fn(lf, file);
  if (out === lf) throw new Error(path.basename(file) + ': nothing changed');
  return { file, text: out.replace(/\n/g, eol) };
}
function swap(text, needle, replacement, file) {
  const n = text.split(needle).length - 1;
  if (n !== 1) throw new Error(path.basename(file) + ': expected exactly one of\n' + needle + '\nfound ' + n);
  return text.replace(needle, () => replacement);
}

/* ---- 1. PF.process takes opts.repair8 ---------------------------------- */
const api = edit(path.join(SRC, 'pf-99-api.js'), (t, f) => {
  t = swap(t,
    '   * @param {{mode?:string, forceStep?:number, kColors?:number, reference?:boolean,\n',
    '   * @param {{mode?:string, forceStep?:number, kColors?:number, reference?:boolean,\n' +
    '   *          repair8?:{labOf:function, deltaE2000:function},\n', f);
  t = swap(t,
    ['    var low = PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0,',
     '      { reference: !!opts.reference });', ''].join('\n'),
    ['    /* opts.repair8: two_stage_pack with the size-8 rules (pf-42-repair8.js),',
     '       for a step the caller gave. It carries the page\'s own colour',
     '       functions, which the rules compare colours with. */',
     '    var low = (opts.repair8 && opts.forceStep > 0)',
     '      ? PF.repair8_pack(rgba, r.cols, r.rows, opts.repair8)',
     '      : PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0,',
     '        { reference: !!opts.reference });', ''].join('\n'), f);
  return t;
});
const readme = edit(README, (t, f) => swap(t,
  '## Where it is not faithful\n',
  ['- **At a given step of 8 on a mouth, eyes or chain (`opts.repair8`), four',
   '  rules keep lines whole.** `src/pf-42-repair8.js` is `two_stage_pack` plus',
   '  a straddle rescue, an undouble, a stroke connector and a speck cleanup,',
   '  each explained there with what it was measured on. The page passes it',
   '  its own `labOf` and `deltaE2000`. With every rule off it is',
   '  `two_stage_pack` byte for byte on 283 of 283 files.',
   '',
   '## Where it is not faithful', ''].join('\n'), f));

/* ---- 2. rebuild the bundle from the edited sources --------------------- */
const keepApi = fs.readFileSync(api.file, 'utf8'), keepReadme = fs.readFileSync(readme.file, 'utf8');
fs.writeFileSync(api.file, api.text);
fs.writeFileSync(readme.file, readme.text);
let newBundle;
try {
  require(path.join(ROOT, 'pixelfixer', 'tools', 'build.cjs'));
  newBundle = fs.readFileSync(BUNDLE, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (newBundle === oldBundle) throw new Error('the rebuilt bundle is unchanged');
  for (const need of ['PF.repair8_pack = function', '? PF.repair8_pack(rgba, r.cols, r.rows, opts.repair8)', '/* ==== pf-42-repair8.js'])
    if (newBundle.indexOf(need) < 0) throw new Error('the rebuilt bundle lacks: ' + need);
} catch (e) {
  /* put the sources back: nothing is left half-written */
  fs.writeFileSync(api.file, keepApi); fs.writeFileSync(readme.file, keepReadme);
  fs.writeFileSync(BUNDLE, oldBundle + '\n');
  throw e;
}

/* ---- 3. the page ------------------------------------------------------ */
const doc = s0.start([['function fixOutlineApply(out,rel){', 'fixOutlineApply is not in this page'],
  ['function fileWithPath(bytes,rel){', 'fileWithPath is not in this page']]);
{
  const inl = inlineOf(page0);
  doc.swap(inl.body, NL + newBundle.split('\n').join(NL) + NL);
}
/* the worker passes the page's colour functions when asked */
doc.swap('    "    const r=PF.process(m.data,m.width,m.height,{mode:m.mode,forceStep:m.forceStep,",',
  ['    /* m.repair8 (patch614): the size-8 rules, with this page\'s labOf and',
   '       deltaE2000 - the palette step below already brings both into the',
   '       worker, so the rules compare colours exactly as the page does. */',
   '    "    const r=PF.process(m.data,m.width,m.height,{mode:m.mode,forceStep:m.forceStep,",',
   '    "      repair8:m.repair8?{labOf:labOf,deltaE2000:deltaE2000}:null,",']);
/* the decision, beside the outline pass that reads the layer the same way */
doc.swap('function fixPalApply(out,rel){',
  ['/* SIZE 8 ON A MOUTH, EYES OR CHAIN KEEPS ITS LINES WHOLE (patch614).',
   '',
   '   The owner, on the size-8 results for these three layers: "even when',
   '   using 8 its not good but fix it for 8 then". At a step of exactly 8 px',
   '   the engine runs PF.repair8_pack (pixelfixer/src/pf-42-repair8.js): a',
   '   line one cell wide that falls across two cells goes to one of them',
   '   instead of vanishing or doubling (Mouth 05\'s teeth bars), a thin',
   '   stroke stays connected, and a speck of noise in a flat fill takes the',
   '   fill\'s colour. Only these layers: on the others the same rules moved a',
   '   few cells with no clear gain (scratchpad/fix8/vote), so they keep',
   '   today\'s cells. A file with no layer in its path keeps them too. */',
   'const FIX_REPAIR8_LAYERS=["mouth","eyes","chains"];',
   'function fixRepair8(step,rel){',
   '  return step===8 && FIX_REPAIR8_LAYERS.indexOf(fixLayerOf(rel))>=0;',
   '}',
   'function fixPalApply(out,rel){']);
/* the single run */
doc.swap('    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null,',
  '    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null, repair8:fixRepair8(forced,FIX.rel),');
/* the folder run: the step is decided inside the forceStep closure, so it is
   kept there and read by the next property, which is evaluated after it */
doc.swap('      let cut=null;' + NL + '      const pending=scale',
  '      let cut=null, stepAsked=0;' + NL + '      const pending=scale');
doc.swap('            return s>0?s:null; })()});',
  ['            stepAsked=s;',
   '            return s>0?s:null; })(),',
   '          repair8:fixRepair8(stepAsked,rel)});']);

doc.finish(({ text, code, must }) => {
  must('function fixRepair8(step,rel){', 'fixRepair8');
  must('repair8:fixRepair8(forced,FIX.rel),', 'the single run asks for it');
  must('repair8:fixRepair8(stepAsked,rel)});', 'the folder run asks for it');
  must('"      repair8:m.repair8?{labOf:labOf,deltaE2000:deltaE2000}:null,",', 'the worker passes the colour functions');
  const inl = inlineOf(text).body.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\s+$/, '');
  if (inl !== newBundle) throw new Error('the inlined engine is not the rebuilt bundle');
  if (inl.indexOf('</script') >= 0) throw new Error('the engine contains </script');
  /* The new engine, exercised before anything is written: a red bar 6 px
     wide across the boundary between two 8 px cells (4 px in one, 2 in the
     other), on transparency. Neither cell is over half covered, so today's
     rule makes both empty and the bar vanishes; with repair8 it is one
     column of cells, in the cell holding its centre. Red, not black: the
     engine's quantiser reads RGB only, and a transparent pixel reads black. */
  const PF = new Function('globalThis', inl + '\nreturn globalThis.PF;')({});
  const grab = name => { const a = code.indexOf('function ' + name + '('); const e = code.indexOf('\n}', a); return code.slice(a, e + 2); };
  const colour = new Function(grab('labOf') + '\n' + grab('deltaE2000') + '\nreturn {labOf:labOf, deltaE2000:deltaE2000};')();
  const W = 64, bar = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 12; x < 18; x++) { bar[(y * W + x) * 4] = 255; bar[(y * W + x) * 4 + 3] = 255; }
  const col = res => { const c = new Set(); for (let i = 0; i < 64; i++) if (res.data[i * 4 + 3]) c.add(i % 8); return [...c]; };
  const today = PF.process(new Uint8ClampedArray(bar), W, W, { forceStep: 8 });
  const fixed = PF.process(new Uint8ClampedArray(bar), W, W, { forceStep: 8, repair8: colour });
  if (col(today).length !== 0) throw new Error('the straddling bar did not vanish under today\'s rule, so this check cannot tell: ' + col(today));
  if (col(fixed).length !== 1 || col(fixed)[0] !== 1) throw new Error('with repair8 the bar is not one column of cells in the cell holding its centre: ' + col(fixed));
  console.log('engine check: straddling bar, today ' + col(today).length + ' columns, repair8 ' + col(fixed).length + ' (column ' + col(fixed)[0] + ')');
});
