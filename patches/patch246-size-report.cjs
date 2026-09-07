/* Generate set built a whole collection out of mismatched sizes and said
   nothing.

   Reported as "the skins are bigger on the randomizer than everything else so
   i want that fixed".

   MEASURED on the live collection, among approved traits: 270 at 1024x1024,
   61 at 1254, 46 skins at 1280, 4 at 2048. The canvas is sized to the largest
   trait in the draw, so a skin makes it 1280 - and paintTrait scales by a
   WHOLE number, floor(1280/1024) being 1, so every 1024 trait is drawn at its
   native size and centred. The skin fills the canvas and the hat does not.

   THE SCALING IS NOT THE BUG, AND I NEARLY MADE IT ONE. My first attempt let
   paintTrait scale by the exact fit instead. tests/pixels.spec.js failed, and
   reading it showed why it exists: whole-number scaling was introduced
   deliberately, with a measurement in its header -

     48px source striped every 2px, painted into a 160 box
       stretched to 160    stripe widths 3 and 4    uneven
       3x and centred      stripe widths 3          uniform

   Uneven pixel widths are the one thing pixel art cannot survive, and it is
   the same reason the editor zooms in whole steps. That change was a revert of
   a considered fix, dressed as an improvement, and it has been undone.

   There is no scale that rescues 1024 and 1280 together: 1280/1024 is 1.25 and
   1024/1280 is 0.8, so whichever way it is taken some source pixels come out
   wider than others. Only the ARTWORK can fix that, by being one size.

   WHAT IS ACTUALLY WRONG IS THE SILENCE. drawCompose says "Not all the same
   size: ..." and drawSheet says it too. buildCollection - the one that writes
   the zip somebody mints from - takes the max of every trait, paints, and
   reports files, made, asked and combos. No size anywhere. So the preview
   warns, the sheet warns, and the ten thousand characters that leave the
   building do not. That is the shape WORKLOG.md's fourth lens names: a fix at
   one call site while its sibling keeps the old behaviour.

   So the sizes are counted where the collection is actually built, and named
   in the same report that already says how many characters were made and
   which traits drifted from their share. It changes no pixels.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('sizeSpread') >= 0) throw new Error('already patched');

/* ---- 1. count the sizes where the collection is built ---- */
{
  const at = kit.only(doc.lines,
    l => l === '  for(const c of combos) for(const r of c){ if(r.w>W) W=r.w; if(r.h>H) H=r.h; }',
    'the canvas sizing in buildCollection',
    kit.inFunction(doc.lines, 'async function buildCollection(n,onProgress){'));
  kit.replace(doc.lines, { start: at, end: at }, [
    '  for(const c of combos) for(const r of c){ if(r.w>W) W=r.w; if(r.h>H) H=r.h; }',
    '  /* WHAT SIZES WENT IN. The canvas is the largest of them and paintTrait',
    '     scales by a whole number, so anything smaller is drawn at its native',
    '     size and centred - a 1024 hat on a 1280 head is a hat that looks too',
    '     small, in every one of these files. drawCompose and drawSheet both say',
    '     this; the zip somebody mints from did not. */',
    '  const sizeSpread=sizesIn(combos);',
  ]);
  console.log('ok  the sizes are counted where the collection is built');
}

/* ---- 2. the counter, beside the function that reports drift ---- */
{
  const at = kit.only(doc.lines, l => l === 'async function buildCollection(n,onProgress){',
    'buildCollection');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* The distinct canvas sizes across a set of characters, biggest first, with',
    '   how many traits each covers and a few of their names.',
    '',
    '   Traits rather than characters on purpose: "46 at 1280" is a thing you can',
    '   go and fix, and "8,000 characters affected" is not. */',
    'function sizesIn(combos){',
    '  const by=new Map();',
    '  for(const c of (combos||[])) for(const r of c){',
    '    if(!r||!r.w||!r.h) continue;',
    '    const k=r.w+"\\u00d7"+r.h;',
    '    if(!by.has(k)) by.set(k,{n:0,names:new Set(),w:r.w,h:r.h});',
    '    const e=by.get(k);',
    '    if(!e.names.has(r.name)){ e.names.add(r.name); e.n++; }',
    '  }',
    '  const list=[...by.entries()].map(([k,v])=>({size:k,w:v.w,h:v.h,n:v.n,',
    '    names:[...v.names].sort().slice(0,3)})).sort((a,b)=>(b.w*b.h)-(a.w*a.h));',
    '  return list;',
    '}',
    '/* One sentence, or nothing at all when every trait agrees - which is the',
    '   ordinary case and must stay quiet. */',
    'function sizeLine(list){',
    '  if(!list||list.length<2) return "";',
    '  const big=list[0];',
    '  const rest=list.slice(1).reduce((a,e)=>a+e.n,0);',
    '  return "  Not all the same size: "+big.n+" trait"+(big.n===1?"":"s")+" at "+big.size',
    '    +" ("+big.names.join(", ")+") set the canvas, and "+rest+" smaller one"+(rest===1?"":"s")',
    '    +" "+(rest===1?"is":"are")+" drawn at native size and centred, so they look small on it.'
      + ' Make them one size before minting.";',
    '}',
    'async function buildCollection(n,onProgress){',
  ]);
  console.log('ok  and turned into one sentence, silent when they agree');
}

/* ---- 3. carried out with the rest of the result ---- */
{
  const at = kit.only(doc.lines,
    l => l === '  return { files, made:combos.length, asked:n, combos };',
    'the buildCollection result',
    kit.inFunction(doc.lines, 'async function buildCollection(n,onProgress){'));
  doc.lines[at] = '  return { files, made:combos.length, asked:n, combos, sizes:sizeSpread };';
  /* The empty-set return too, so a caller never reads undefined for it. */
  const none = kit.only(doc.lines,
    l => l === '  if(!combos.length||!W||!H) return { files:[], made:0, asked:n, combos:[] };',
    'the empty return',
    kit.inFunction(doc.lines, 'async function buildCollection(n,onProgress){'));
  doc.lines[none] = '  if(!combos.length||!W||!H) return { files:[], made:0, asked:n, combos:[], sizes:[] };';
  console.log('ok  and carried out with the result');
}

/* ---- 4. and said where the collection is handed over ---- */
{
  const at = kit.only(doc.lines,
    l => l.indexOf('+" with metadata."+short+missed+driftLine(') >= 0, 'the generate report');
  doc.lines[at] = doc.lines[at].replace('+short+missed+driftLine(', '+short+missed+sizeLine(r.sizes)+driftLine(');
  console.log('ok  and said in the report that hands the zip over');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  /* The scaling must be EXACTLY as it was - this patch changes no pixels. */
  const pt = kit.inFunction(codeLines, 'function paintTrait(g,bm,ox,oy,W,H){');
  const p = codeLines.slice(pt.start, pt.end + 1).join('\n');
  if (p.indexOf('const k=Math.max(1,Math.min(Math.floor(W/w),Math.floor(H/h)));') < 0)
    throw new Error('paintTrait was changed; this patch must only report, not rescale');

  const si = kit.inFunction(codeLines, 'function sizesIn(combos){');
  const s = codeLines.slice(si.start, si.end + 1).join('\n');
  /* Counted per TRAIT, not per character, or the number is unusable. */
  if (s.indexOf('if(!e.names.has(r.name)){ e.names.add(r.name); e.n++; }') < 0)
    throw new Error('a trait appearing in many characters would be counted many times');
  /* Biggest first, because the biggest is the one that sets the canvas. */
  if (s.indexOf('(b.w*b.h)-(a.w*a.h)') < 0)
    throw new Error('the size that sets the canvas is not named first');

  const sl = kit.inFunction(codeLines, 'function sizeLine(list){');
  const l = codeLines.slice(sl.start, sl.end + 1).join('\n');
  /* Silent when everything agrees - the ordinary case. */
  if (l.indexOf('if(!list||list.length<2) return "";') < 0)
    throw new Error('a uniform collection would be told it is not uniform');
  /* It must say what to DO, not only that something is wrong. */
  if (l.indexOf('Make them one size before minting') < 0)
    throw new Error('the message does not say how to fix it');

  /* Carried through and printed. */
  if (code.indexOf('sizes:sizeSpread') < 0) throw new Error('the sizes never leave buildCollection');
  if (code.indexOf('sizeLine(r.sizes)') < 0) throw new Error('the report does not say it');
});

/* RUN the counting and the sentence on the real spread. */
{
  const sizesIn = (combos) => {
    const by = new Map();
    for (const c of combos) for (const r of c) {
      const k = r.w + '×' + r.h;
      if (!by.has(k)) by.set(k, { n: 0, names: new Set(), w: r.w, h: r.h });
      const e = by.get(k);
      if (!e.names.has(r.name)) { e.names.add(r.name); e.n++; }
    }
    return [...by.entries()].map(([k, v]) => ({ size: k, w: v.w, h: v.h, n: v.n,
      names: [...v.names].sort().slice(0, 3) })).sort((a, b) => (b.w * b.h) - (a.w * a.h));
  };
  /* The live spread among approved traits, as three characters drawing them. */
  const skin = { name: 'Blue Camo Skin v3', w: 1280, h: 1280 };
  const hat = { name: 'BTC Cap', w: 1024, h: 1024 };
  const hair = { name: 'Dark Fringe', w: 1024, h: 1024 };
  const list = sizesIn([[skin, hat], [skin, hair], [skin, hat, hair]]);
  if (list.length !== 2) throw new Error('expected two sizes, got ' + list.length);
  if (list[0].size !== '1280×1280') throw new Error('the canvas-setting size is not first');
  /* A trait in three characters is counted ONCE. */
  if (list[0].n !== 1) throw new Error('the skin was counted ' + list[0].n + ' times');
  if (list[1].n !== 2) throw new Error('expected two smaller traits, got ' + list[1].n);
  /* And a uniform collection says nothing at all. */
  const uniform = sizesIn([[hat, hair], [hat, hair]]);
  if (uniform.length !== 1) throw new Error('a uniform set looks mixed');
  const sizeLine = (l) => (!l || l.length < 2) ? '' : 'said';
  if (sizeLine(uniform) !== '') throw new Error('a uniform collection would be warned');
  if (sizeLine(list) !== 'said') throw new Error('a mixed collection would stay silent');
  console.log('    ' + list.map(e => e.n + ' at ' + e.size).join(', ') + ' - named biggest first');
  console.log('    and a collection where everything agrees says nothing');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
