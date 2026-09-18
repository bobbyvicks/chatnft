/* THE ADVICE IS MEASURED, AND SPEAKS THE SWITCH'S UNITS.

   After a run whose answer is bigger than pixel art gets, or that the
   detectors were unsure of, the sentence ends "if the edges still look
   soft, the pixel size it used was too small. Try 8 gives WxH, ...".
   Two things were wrong with that list, measured 2026-09-18:

   1. IT SPOKE IN THE WRONG UNITS. Since patch501 a typed size with Save at
      1280 on is the block ON THE CANVAS - 8 means 160 cells whatever the
      picture's width - and the advice still divided the picture's width
      by the size: on a 1254 picture it said "8 gives 157x157" when typing
      8 gives 160x160. Reachable whenever the switch is on and the result
      is big: typed 1 to 4 (1280 to 320 cells). The count a size means on
      the canvas is now one function, fixCanvasCells, and the run and the
      advice both call it.

   2. IT GUESSED. "8 gives 160x160" said nothing about whether 160 cells
      keep the picture, and on a picture with no pixel grid the offered
      sizes were exactly the resamples the review measured as destroying
      it. Every offered size now carries what it would keep - "keeps 94%
      of the paint" - by the same cell rule the gridless search uses to
      choose a count. That rule is hoisted out of fixGridlessCells into
      fixCellsKept, arithmetic unchanged (gridlesssearch.spec.js and its
      six mutations are re-run to prove it), so the advice and the search
      cannot disagree about what a count keeps.

   The switch-off wording ("8 gives 64x64") is kept, because there the
   number IS picture pixels per cell; it gains the measurement. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. one arithmetic for "what a size means on the canvas" ------------- */
{
  const at = kit.only(L, l => l === 'function fixStepFor(w,data,h){', 'fixStepFor');
  kit.replace(L, { start: at, end: at }, [
    '/* THE COUNT A TYPED SIZE MEANS ON THE CANVAS: CANVAS_SIDE over the size,',
    '   moved to the nearest count that divides it within a quarter',
    '   (fixWholeStep), or 0 when nothing in that band lands. One function,',
    '   because the run (fixStepFor) and the advice after it (fixTryThese) both',
    '   answer "what would 8 give" - and the advice used to answer in picture',
    '   pixels per cell, "8 gives 157x157" on a 1254 picture whose 8 gives 160',
    '   (measured 2026-09-18). */',
    'function fixCanvasCells(asked){',
    '  const want=Math.max(1,fixRint(CANVAS_SIDE/asked));',
    '  if(CANVAS_SIDE%want===0) return {cells:want, moved:null};',
    '  const fix=fixWholeStep(CANVAS_SIDE,asked);',
    '  if(fix) return {cells:fix.cols, moved:{from:asked, to:fix.step, cols:fix.cols, was:fix.was}};',
    '  return {cells:0, moved:null};',
    '}',
    'function fixStepFor(w,data,h){',
  ]);
  const a = kit.only(L, l => l === '    const want=Math.max(1,fixRint(CANVAS_SIDE/asked));', 'the canvas count in fixStepFor');
  const want = [
    '    const want=Math.max(1,fixRint(CANVAS_SIDE/asked));',
    '    let cells=0;',
    '    if(CANVAS_SIDE%want===0) cells=want;',
    '    else{',
    '      const fix=fixWholeStep(CANVAS_SIDE,asked);',
    '      if(fix){ cells=fix.cols; fixMoved={from:asked, to:fix.step, cols:fix.cols, was:fix.was}; }',
    '    }',
  ];
  for (let i = 0; i < want.length; i++) if (L[a + i] !== want[i]) throw new Error('fixStepFor line ' + i + ' is not what this expects: ' + L[a + i]);
  kit.replace(L, { start: a, end: a + want.length - 1 }, [
    '    const on=fixCanvasCells(asked);',
    '    const cells=on.cells;',
    '    if(on.moved) fixMoved=on.moved;',
  ]);
}

/* ---- 2. the cell rule, hoisted out of the search -------------------------- */
{
  const a = kit.only(L, l => l === '  for(const cells of cand){', 'the candidate loop');
  const body = [
    '  for(const cells of cand){',
    '    const sw=W/cells, sh=H/cells;',
    '    let x0=cells,y0=cells,x1=-1,y1=-1,kept=0;',
    '    for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){',
    '      let op=0,tot=0;',
  ];
  for (let i = 0; i < body.length; i++) if (L[a + i] !== body[i]) throw new Error('search loop line ' + i + ' is not what this expects: ' + L[a + i]);
  /* the loop runs to the line "    if(x1<0) continue;" */
  let end = -1;
  for (let i = a; i < a + 40; i++) if (L[i] === '    if(x1<0) continue;') { end = i; break; }
  if (end < 0) throw new Error('the end of the candidate loop is not where this expects');
  const inner = L.slice(a + 4, end); // from "      let op=0,tot=0;" to the line before "    if(x1<0) continue;"
  if (inner[inner.length - 1] !== '    }') throw new Error('the cell loop does not close where this expects: ' + inner[inner.length - 1]);
  const fn = kit.only(L, l => l === 'function fixGridlessCells(data,W,H){', 'fixGridlessCells');
  /* the per-cell body, re-indented two columns out, inside a function that
     also counts the paint it saw (every pixel lands in exactly one cell) */
  const hoisted = [
    '/* WHAT A CELL COUNT KEEPS OF A PICTURE, by the engine\'s own cells: a cell',
    '   is opaque when more than half its source pixels are painted, `kept` is',
    '   the paint under opaque cells, `srcN` all the paint, and x0..y1 the box',
    '   of opaque cells. The gridless search chooses a count with this and the',
    '   advice after a run reports it for each size it offers, so the two',
    '   cannot disagree. Hoisted from fixGridlessCells, arithmetic unchanged. */',
    'function fixCellsKept(data,W,H,cells){',
    '  let x0=cells,y0=cells,x1=-1,y1=-1,kept=0,srcN=0;',
    '  for(let cy=0;cy<cells;cy++) for(let cx=0;cx<cells;cx++){',
  ].concat(inner.slice(0, inner.length - 1).map(l => l.slice(2))).concat([
    '  }',
    '  return {kept:kept, srcN:srcN, x0:x0, y0:y0, x1:x1, y1:y1};',
    '}',
    'function fixGridlessCells(data,W,H){',
  ]);
  /* the paint count: op is added to srcN for every cell, opaque or not */
  const opLine = hoisted.findIndex(l => l.trim() === 'if(op*2>tot){');
  if (opLine < 0) throw new Error('the majority test is not in the hoisted body');
  hoisted.splice(opLine, 0, '      srcN+=op;');
  kit.replace(L, { start: fn, end: fn }, hoisted);
  /* and the search calls it */
  const a2 = kit.only(L, l => l === '  for(const cells of cand){', 'the candidate loop, again');
  let end2 = -1;
  for (let i = a2; i < a2 + 40; i++) if (L[i] === '    if(x1<0) continue;') { end2 = i; break; }
  kit.replace(L, { start: a2, end: end2 - 1 }, [
    '  for(const cells of cand){',
    '    const sw=W/cells, sh=H/cells;',
    '    const k=fixCellsKept(data,W,H,cells);',
    '    const x0=k.x0,y0=k.y0,x1=k.x1,y1=k.y1,kept=k.kept;',
  ]);
}

/* ---- 3. the advice ---------------------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function fixTryThese(){');
  kit.replace(L, fn, [
    'function fixTryThese(){',
    '  if(!FIX.src) return "";',
    '  const W=FIX.src.width, H=FIX.src.height, long=Math.max(W,H);',
    '  const g=fixGridCells();',
    '  /* A PICTURE NO BIGGER THAN THE GRID is already at its own size; the one',
    '     size worth trying is 1, which the divisor search below never names. */',
    '  if(W<=g.cells&&H<=g.cells) return "Try 1, which keeps it as it is ("+W+"\\u00d7"+H+").";',
    '  /* MEASURED, NOT GUESSED: what each size would keep of the paint, by the',
    '     cell rule the gridless search chooses with. The sizes this offered',
    '     used to be the very resamples the review measured as destroying a',
    '     picture with no grid, and nothing said so. */',
    '  const px=FIX.src.data;',
    '  const keeps=(cells)=>{',
    '    if(!px||!(cells>0)) return "";',
    '    const k=fixCellsKept(px,W,H,cells);',
    '    return k.srcN ? " (keeps "+Math.round(k.kept/k.srcN*100)+"% of the paint)" : "";',
    '  };',
    '  const seen=[], out=[];',
    '  if($("fixgrid")&&$("fixgrid").checked){',
    '    /* ON THE CANVAS the typed number is the block there, so 8 means 160',
    '       cells whatever the picture is - the run\'s own arithmetic',
    '       (fixCanvasCells), not "picture width over 8", which said',
    '       "8 gives 157x157" on a 1254 picture. A size that moves is named',
    '       by where it lands, and one the picture cannot hold is left out. */',
    '    for(const s of [8,12,16]){',
    '      const c=fixCanvasCells(s);',
    '      if(!c.cells||seen.indexOf(c.cells)>=0||W<c.cells||H<c.cells) continue;',
    '      seen.push(c.cells);',
    '      out.push((c.moved?c.moved.to:s)+" ("+c.cells+" cells"+keeps(c.cells).replace(" (keeps",", keeps").replace(/\\)$/,"")+")");',
    '    }',
    '    return out.length ? "Try "+out.join(", ")+"." : "";',
    '  }',
    '  /* WITH THE SWITCH OFF the number is picture pixels per cell: the',
    '     divisors of the long edge nearest 8, 12 and 16, so every suggestion',
    '     divides evenly, or the three plain numbers when nothing does, which',
    '     is the honest answer for a width like 1023. */',
    '  const divisors=[];',
    '  for(let n=2;n<=long/8;n++) if(long%n===0) divisors.push(n);',
    '  const near=(want)=>{',
    '    if(!divisors.length) return want;',
    '    let best=divisors[0];',
    '    for(const d of divisors) if(Math.abs(d-want)<Math.abs(best-want)) best=d;',
    '    return best;',
    '  };',
    '  for(const want of [8,12,16]){',
    '    const s=near(want);',
    '    if(seen.indexOf(s)>=0) continue;',
    '    seen.push(s);',
    '    const cols=Math.max(1,fixRint(W/s));',
    '    out.push(s+" gives "+cols+"\\u00d7"+Math.max(1,fixRint(H/s))+keeps(cols));',
    '  }',
    '  return "Try "+out.join(", ")+".";',
    '}',
  ]);
}

/* ---- 4. checks ------------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  need('function fixCanvasCells(asked){');
  need('    const on=fixCanvasCells(asked);');
  need('function fixCellsKept(data,W,H,cells){');
  need('    const k=fixCellsKept(data,W,H,cells);');
  need('    srcN+=op;');
  need('    const yA=Math.floor((cy*H+cells-1)/cells), yB=Math.min(H,Math.floor(((cy+1)*H+cells-1)/cells));');
  need('% of the paint)');
  never('      if(fix){ cells=fix.cols; fixMoved={from:asked, to:fix.step, cols:fix.cols, was:fix.was}; }');
  if (code.split('const yA=Math.floor((cy*H+cells-1)/cells)').length !== 2) throw new Error('the cell bounds should exist exactly once now');

  /* THE HOISTED RULE IS THE OLD RULE. Carve fixCellsKept and run it on a
     picture with a known answer: a 40x40 block at 8 cells of a 64px square
     has 25 opaque cells and keeps all 1600 pixels; a lone 2x2 dot keeps 0. */
  const carve = (name) => { const a = lines.findIndex(l => l === 'function ' + name + '(data,W,H,cells){'); let b = a; while (lines[b] !== '}') b++; return lines.slice(a, b + 1).join('\n'); };
  const fk = new Function(carve('fixCellsKept') + '\nreturn fixCellsKept;')();
  const W = 64, d = new Uint8ClampedArray(W * W * 4);
  for (let y = 8; y < 48; y++) for (let x = 8; x < 48; x++) d[(y * W + x) * 4 + 3] = 255;
  d[(60 * W + 60) * 4 + 3] = 255; d[(60 * W + 61) * 4 + 3] = 255; d[(61 * W + 60) * 4 + 3] = 255; d[(61 * W + 61) * 4 + 3] = 255;
  const r = fk(d, W, W, 8);
  if (r.srcN !== 1604 || r.kept !== 1600 || r.x0 !== 1 || r.y0 !== 1 || r.x1 !== 5 || r.y1 !== 5) throw new Error('fixCellsKept: ' + JSON.stringify(r));
  const r2 = fk(d, W, W, 32);
  if (r2.srcN !== 1604 || r2.kept !== 1604) throw new Error('at 2px cells the dot is kept too: ' + JSON.stringify(r2));
  /* the canvas arithmetic */
  const cc = new Function('CANVAS_SIDE', 'fixRint', 'fixWholeStep', lines.slice(lines.findIndex(l => l === 'function fixCanvasCells(asked){'), lines.findIndex(l => l === 'function fixCanvasCells(asked){') + 7).join('\n') + '\nreturn fixCanvasCells;');
  const fixRint = (x) => { const f = Math.floor(x), q = x - f; return q < 0.5 ? f : q > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1); };
  const stub = (w, step) => { const want = Math.max(1, fixRint(w / step)); if (1280 % want === 0) return null; const counts = []; for (let n = 1; n <= 1280; n++) if (1280 % n === 0) counts.push(n); let best = null; for (const n of counts) { const dd = Math.abs(n - want); if (dd > want * 0.25) continue; if (!best || dd < best.d) best = { n, d: dd }; } return best ? { cols: best.n, step: w / best.n, was: want } : null; };
  const f = cc(1280, fixRint, stub);
  if (f(8).cells !== 160 || f(8).moved) throw new Error('8 on the canvas is 160: ' + JSON.stringify(f(8)));
  if (f(12).cells !== 128 || !f(12).moved || f(12).moved.to !== 10) throw new Error('12 on the canvas moves to 10 (128 cells): ' + JSON.stringify(f(12)));
  if (f(16).cells !== 80) throw new Error('16 on the canvas is 80');
});

fs.renameSync(TMP, FILE);
console.log('patch507 written, ' + grew + ' bytes');
