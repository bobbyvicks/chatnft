/* THE PAGE ROUNDS A CELL COUNT THE WAY THE ENGINE DOES.

   The engine turns a forced step into a count with PF.rint - numpy's
   np.rint, half to even - since patch500 matched it to the Python
   reference (pf-99-api.js: cols = max(1, rint(width / forceStep))). The
   page predicted the same count eight times over with Math.round, which
   is half UP. The two agree everywhere except on an exact .5, and there
   the readout promises one thing and the file is another:

     324 across, Pixel size 8, Save at 1280 off:  324/8 = 40.5
       readout "-> 41x41 pixels"      engine 40x40   (measured 2026-09-18
       on backgrounds/Cyan and Yellow Swirl.png, the one 324 source)
     108 at 8 = 13.5: both say 14 (14 is even) - so it is not "one rounds
       down", it is half-to-even, and a test has to hold both cases.

   With Save at 1280 on the step is width/cells and width/step is the
   whole count, so nothing there ever lands on .5; this is the switch-off
   path, where the typed number is source pixels per cell. The review
   listed it under "smaller things", and it is: one function, eight call
   sites, and a readout that can no longer disagree with the answer.

   fixRint is the engine's rule written once in the page; the test loads
   the engine text and checks the two agree on 20,000 values, and that
   Math.round does not. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the rule, once ------------------------------------------------ */
{
  const at = kit.only(L, l => l === '/* THE CELL COUNTS THAT CAN LAND ON THE COLLECTION CANVAS.', 'the canvas-counts comment');
  kit.replace(L, { start: at, end: at }, [
    '/* ROUND HALF TO EVEN - the engine\'s rule for turning a step into a cell',
    '   count (PF.rint, numpy\'s np.rint: cols = rint(width / step), pf-99-api.js).',
    '   Math.round takes 40.5 to 41 where the engine takes it to 40, so a 324px',
    '   picture at 8 with Save at 1280 off read "41x41" and came out 40 across',
    '   (measured 2026-09-18). Every count the page predicts goes through this,',
    '   so the readout cannot disagree with the answer. halfeven.spec.js checks',
    '   it against the engine\'s own function. */',
    'function fixRint(x){',
    '  if(!isFinite(x)) return x;',
    '  const f=Math.floor(x), d=x-f;',
    '  return d<0.5 ? f : d>0.5 ? f+1 : (f%2===0 ? f : f+1);',
    '}',
    '/* THE CELL COUNTS THAT CAN LAND ON THE COLLECTION CANVAS.',
  ]);
}

/* ---- 2. the eight predictions -------------------------------------------- */
const swap = (from, to, name) => {
  const at = kit.only(L, l => l === from, name);
  kit.replace(L, { start: at, end: at }, [to]);
};
swap('    out.push(s+" gives "+Math.max(1,Math.round(W/s))+"\\u00d7"+Math.max(1,Math.round(H/s)));',
     '    out.push(s+" gives "+Math.max(1,fixRint(W/s))+"\\u00d7"+Math.max(1,fixRint(H/s)));', 'fixTryThese');
swap('    const own=Math.round(FIX.src.width/nat);',
     '    const own=fixRint(FIX.src.width/nat);', 'fixEvenSizes');
swap('  const want=Math.max(1,Math.round(w/step));',
     '  const want=Math.max(1,fixRint(w/step));', 'fixWholeStep');
swap('    const want=Math.max(1,Math.round(CANVAS_SIDE/asked));',
     '    const want=Math.max(1,fixRint(CANVAS_SIDE/asked));', 'fixStepFor canvas count');
swap('      fixUnhonoured={asked:asked, cells:cells, w:w, step:keep, cols:Math.max(1,Math.round(w/keep))};',
     '      fixUnhonoured={asked:asked, cells:cells, w:w, step:keep, cols:Math.max(1,fixRint(w/keep))};', 'fixUnhonoured cols');
swap('      fixBlockUnfit={block:nat, cells:Math.round(w/nat)};',
     '      fixBlockUnfit={block:nat, cells:fixRint(w/nat)};', 'fixBlockUnfit cells');
swap('  const cols=scale?W:(decided>0?Math.max(1,Math.round(W/decided)):g.cells);',
     '  const cols=scale?W:(decided>0?Math.max(1,fixRint(W/decided)):g.cells);', 'fixSizeHint cols');
swap('  const rows=scale?H:(decided>0?Math.max(1,Math.round(H/decided)):g.cells);',
     '  const rows=scale?H:(decided>0?Math.max(1,fixRint(H/decided)):g.cells);', 'fixSizeHint rows');
swap('    recut=" \\u00b7 "+nat+"px blocks ("+Math.round(W/nat)+" cells) become "',
     '    recut=" \\u00b7 "+nat+"px blocks ("+fixRint(W/nat)+" cells) become "', 'fixSizeHint recut');

/* ---- 3. checks ------------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines, text }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  need('function fixRint(x){');
  for (const s of ['Math.round(W/s)', 'Math.round(H/s)', 'Math.round(FIX.src.width/nat)', 'Math.round(w/step)',
    'Math.round(CANVAS_SIDE/asked)', 'Math.round(w/keep)', 'Math.round(w/nat)', 'Math.round(W/decided)',
    'Math.round(H/decided)', 'Math.round(W/nat)']) never(s);
  /* No other prediction of a count from a step is left on Math.round: every
     "/decided", "/step", "/asked", "/keep" division that is rounded goes
     through fixRint now. gridCellPx (the editor's cell in trait pixels) is
     not a prediction of the engine and keeps Math.round. */
  const stray = lines.filter(l => /Math\.round\((W|H|w|h|CANVAS_SIDE)\/(s|step|asked|keep|nat|decided)\)/.test(l));
  if (stray.length) throw new Error('a count still rounds half up:\n' + stray.join('\n'));

  /* THE RULE IS THE ENGINE'S. Carve fixRint, load the engine, compare. */
  const a = lines.findIndex(l => l === 'function fixRint(x){');
  let b = a; while (lines[b] !== '}') b++;
  const fixRint = new Function(lines.slice(a, b + 1).join('\n') + '\nreturn fixRint;')();
  const m = text.match(/<script id="pfcore" type="text\/plain">([\s\S]*?)<\/script>/);
  const PF = new Function('globalThis', m[1].replace(/\r\n/g, '\n') + '\nreturn globalThis.PF;')({});
  if (typeof PF.rint !== 'function') throw new Error('the engine has no rint');
  let diff = 0, roundDiff = 0;
  for (let k = 0; k <= 40000; k++) { const x = k / 8; if (PF.rint(x) !== fixRint(x)) diff++; if (Math.round(x) !== PF.rint(x)) roundDiff++; }
  if (diff) throw new Error('fixRint disagrees with PF.rint on ' + diff + ' of 40001 values');
  if (!roundDiff) throw new Error('the comparison cannot fail: Math.round agreed with PF.rint everywhere');
  for (const [x, want] of [[40.5, 40], [13.5, 14], [12.5, 12], [40.4, 40], [40.6, 41], [0.5, 0], [1.5, 2], [160.00000000000003, 160], [159.99999999999997, 160]]) {
    if (fixRint(x) !== want) throw new Error('fixRint(' + x + ') = ' + fixRint(x) + ', want ' + want);
  }
});

fs.renameSync(TMP, FILE);
console.log('patch505 written, ' + grew + ' bytes');
