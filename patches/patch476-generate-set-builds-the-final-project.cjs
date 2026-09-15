/* GENERATE SET BUILDS THE FINAL PROJECT.

   "yes make generate set use the final project"

   The final project page says which traits go into the collection, and until
   now nothing downstream read it: buildCollection took its pools from
   cPools(), the project page rows, which hold every approved trait. So the
   page that exists to answer "which of these am I shipping" had no effect on
   what shipped, and the preview added in 475 had to carry a line admitting it.

   That line is what this removes, by making it false.

   NO SILENT FALLBACK. An empty final project does not quietly go back to
   drawing from everything approved. Generate set means one thing now, and a
   button that means two things depending on state you cannot see is worse
   than one that refuses and says what to do:

     Generate set builds the final project - the traits marked stfp - and
     nothing is in it yet.

   The alternative, "use the final set when there is one", is the shape that
   looks accommodating and is a cliff: mark a single skin stfp to try the
   button out and the next Generate makes a collection of one trait, with
   nothing on screen having changed to say why.

   EVERY NUMBER IN THE REPORT FOLLOWS THE POOL. The shortfall line and the
   drift line both describe a population, and both took it from cItems - every
   approved trait. Left alone they would have gone on describing a set that is
   no longer the one being built, which is the sharper half of this change: a
   wrong pool produces a visibly wrong zip, and a wrong denominator produces a
   confident sentence nobody can check.

   They are retargeted by handing them the FILTERED records rather than by
   teaching them a new argument. traitEligible(t,false) is inCollection(st),
   which is approved-or-stfp - so a list holding only stfp traits and the base
   references passes through every one of them unchanged and counts exactly the
   set that was drawn. The alternative was turning wipIncluded into a three-way
   scope across nine call sites, to arrive at the same answer.

   THE CANVAS SIZE FOLLOWS TOO. autoCanvas picks the cell size that keeps the
   most traits whole, and it was being asked about the whole collection while
   the collection was becoming a smaller set. The preview added in 475 already
   sizes from the final traits; this makes the zip agree with the picture.

   WHAT THIS DOES NOT CHANGE, said plainly because it is the part that is now
   describing a different population from the one that gets built: the per-trait
   percentage on each shelf tile, and the "N possible characters" line on the
   project page, both still measure every approved trait. Those are the project
   page's description of the project, and moving them is a change to a screen
   the user looks at constantly rather than to a button they press deliberately
   - so it is asked rather than assumed. Build a character on the project page
   is likewise left wide on purpose: checking that a trait sits right on a skin
   is a thing you do BEFORE deciding it is final. Both notes now say which set
   they are about, so neither can be mistaken for the other. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the collection is the final project ---------------------------- */
{
  const at = kit.only(L, l => l === '  const pools=cPools();',
    'the pool the collection is built from',
    kit.inFunction(L, 'async function buildCollection(n,onProgress){'));
  kit.replace(L, { start: at, end: at }, [
    '  /* THE FINAL PROJECT, NOT THE PROJECT. cPools() reads the rows on the',
    '     project page, which hold every approved trait - so the page that exists',
    '     to say which traits are shipping had no effect on what shipped.',
    '',
    '     Read from the database rather than from cItems: cItems is whatever the',
    '     project page last rendered, and this runs from a button that does not',
    '     need that page to have been visited. */',
    '  let items=[];',
    '  try{ items=await dbAll(); }catch(_){ items=[]; }',
    '  /* The same records, filtered - handed back so the report describes the set',
    '     that was actually built. traitEligible(t,false) is approved-or-stfp, so',
    '     a list of stfp traits and the bases passes every counter unchanged. */',
    '  const pool=items.filter(i=>i&&(i.kind==="ref"',
    '    || (i.kind==="trait" && String(i.status||"wip")==="stfp")));',
    '  const pools=finalPools(items);',
    '  /* REFUSED, NOT QUIETLY WIDENED. A button that means the final project when',
    '     there is one and everything approved when there is not is a button whose',
    '     meaning you cannot see, and marking one trait stfp to try it would make',
    '     the next press build a collection of one. */',
    '  if(!Object.keys(pools).some(k=>k!=="__base"))',
    '    return { files:[], made:0, asked:n, combos:[], sizes:[], pool:pool,',
    '      reason:"final-empty" };',
  ]);
}
{
  const at = kit.only(L, l => l === '  { const S=await autoCanvas(cItems); W=S; H=S; }',
    'the canvas the collection is drawn on',
    kit.inFunction(L, 'async function buildCollection(n,onProgress){'));
  kit.replace(L, { start: at, end: at }, [
    '  /* FROM THE SET BEING BUILT. This asked about every approved trait while',
    '     the collection was becoming a smaller one, so the zip could come out at',
    '     a cell size no trait in it wanted. The preview on the final page already',
    '     sizes from these; this is what makes the two agree. */',
    '  { const S=await autoCanvas(pool.filter(i=>i.kind==="trait")); W=S; H=S; }',
  ]);
}
{
  const at = kit.only(L, l => l === '  if(!combos.length||!W||!H) return { files:[], made:0, asked:n, combos:[], sizes:[] };',
    'the nothing-to-build exit',
    kit.inFunction(L, 'async function buildCollection(n,onProgress){'));
  kit.replace(L, { start: at, end: at }, [
    '  if(!combos.length||!W||!H)',
    '    return { files:[], made:0, asked:n, combos:[], sizes:[], pool:pool };',
  ]);
}
{
  const at = kit.only(L, l => l === '  return { files, made:combos.length, asked:n, combos, sizes:sizeSpread };',
    'what the build hands back',
    kit.inFunction(L, 'async function buildCollection(n,onProgress){'));
  kit.replace(L, { start: at, end: at }, [
    '  /* pool travels with the files for the same reason combos does: the report',
    '     below measures what was built against what the set promised, and it can',
    '     only do that against the set that was actually drawn from. */',
    '  return { files, made:combos.length, asked:n, combos, sizes:sizeSpread, pool };',
  ]);
}

/* ---- 2. the report describes what was built ---------------------------- */
{
  const at = kit.only(L, l => l === '    if(!r.made){ toast("Nothing saved to build from"); $("cnote").textContent=""; return; }',
    'the empty result');
  kit.replace(L, { start: at, end: at }, [
    '    /* TOLD WHAT TO DO, not just that nothing happened. This is the first',
    '       press for anybody who has not curated a final project yet, and',
    '       "nothing saved to build from" would be false - there is plenty',
    '       saved, none of it chosen. */',
    '    if(r.reason==="final-empty"){',
    '      toast("Nothing is in the final project yet");',
    '      $("cnote").textContent="Generate set builds the FINAL PROJECT - the"',
    '        +" traits marked stfp - and nothing is in it yet. Open Final project"',
    '        +" and add the ones you want, or press the status chip on a trait"',
    '        +" here until it reads stfp.";',
    '      return;',
    '    }',
    '    if(!r.made){ toast("Nothing saved to build from"); $("cnote").textContent=""; return; }',
  ]);
}
{
  const at = kit.only(L, l => l === '    const cstat=comboStats(cItems,$("cwip").checked);',
    'the count behind the shortfall line',
    kit.inFunction(L, "$('cgenzip').onclick=async()=>{"));
  kit.replace(L, { start: at, end: at }, [
    '    /* OVER WHAT WAS BUILT FROM. These counted every approved trait, which',
    '       after this change is a different set from the one drawn - and a',
    '       denominator that describes the wrong population makes a sentence',
    '       nobody can check. false rather than the wip box for the same reason:',
    '       wip is not in the final project either. */',
    '    const cstat=comboStats(r.pool,false);',
  ]);
}
{
  const at = kit.only(L, l => l.indexOf('+driftLine(shareDrift(r.combos,cItems,$("cwip").checked),r.made);') >= 0,
    'the drift line');
  kit.replace(L, { start: at, end: at }, [
    '    $("cnote").textContent="Built "+r.made+" different character"+(r.made===1?"":"s")',
    '      +" from the final project, with metadata."+short+missed+sizeLine(r.sizes)',
    '      +driftLine(shareDrift(r.combos,r.pool,false),r.made);',
  ]);
}

/* ---- 3. and the two panels say which set they are about ---------------- */
{
  const at = kit.only(L, l => l === '          title="Generate that many different characters and download them as a zip of images and metadata">Generate set</button>',
    'the generate button');
  kit.replace(L, { start: at, end: at }, [
    '          title="Generate that many different characters from the traits in the final project and download them as a zip of images and metadata">Generate set</button>',
  ]);
}
{
  /* The builder above it is deliberately wider - checking a trait sits right on
     a skin is something you do before deciding it is final - so it says so
     rather than letting the two be confused. */
  const at = kit.only(L, l => l === '    : "Stacks one trait per layer over a base, in draw order, to check the set works together.";',
    'the compose note');
  kit.replace(L, { start: at, end: at }, [
    '    /* WIDER THAN GENERATE, ON PURPOSE, and it has to say so now that they',
    '       differ: checking a trait sits right on a skin is something you do',
    '       BEFORE deciding it is final, so this draws from everything approved',
    '       while Generate set draws from the final project only. */',
    '    : "Stacks one trait per layer over a base, in draw order, to check the set"',
    '      +" works together. Draws from every approved trait - Generate set builds"',
    '      +" the final project only.";',
  ]);
}
{
  /* And the preview on the final page stops confessing, because it is no
     longer true. */
  const at = kit.only(L, l => l === '    const mismatch=" Generate set on the project page still draws from every"',
    'the preview mismatch line');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    /* WAS A CONFESSION, NOW A STATEMENT. Until 476 this read "Generate set on',
    '       the project page still draws from every approved trait, not only from',
    '       these" - true, and the reason this line existed. Generate set builds',
    '       exactly this set now, so the line says that instead of apologising',
    '       for the difference. */',
    '    const mismatch=" Generate set on the project page builds this, and nothing"',
    '      +" else.";',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* THE COLLECTION IS THE FINAL PROJECT. */
  const bc = kit.inFunction(codeLines, 'async function buildCollection(n,onProgress){');
  const bcb = codeLines.slice(bc.start, bc.end + 1).join('\n');
  if (!/const pools=finalPools\(items\);/.test(bcb))
    throw new Error('the collection is not built from the final project');
  if (bcb.indexOf('cPools(') >= 0)
    throw new Error('the collection still reads the project page rows');
  if (bcb.indexOf('autoCanvas(cItems)') >= 0)
    throw new Error('the zip is still sized from every approved trait');
  if (!/await autoCanvas\(pool\.filter\(i=>i\.kind==="trait"\)\)/.test(bcb))
    throw new Error('the zip is not sized from the set it is built from');
  /* REFUSED, NOT WIDENED. The whole argument for one meaning. */
  if (!/reason:"final-empty"/.test(bcb))
    throw new Error('an empty final project does not refuse, so the button means two things');
  if (/cPools|inCollection|traitEligible/.test(bcb))
    throw new Error('a second definition of what is in the collection crept back in');
  /* AND THE POOL TRAVELS WITH THE RESULT, or the report cannot describe it. */
  if (!/sizes:sizeSpread, pool \};/.test(bcb))
    throw new Error('the set that was built is not handed back, so the report measures another one');

  /* EVERY NUMBER IN THE REPORT FOLLOWS. */
  const gz = kit.inFunction(codeLines, "$('cgenzip').onclick=async()=>{");
  const gzb = codeLines.slice(gz.start, gz.end + 1).join('\n');
  if (!/const cstat=comboStats\(r\.pool,false\);/.test(gzb))
    throw new Error('the shortfall line counts a set that was not the one built');
  if (!/shareDrift\(r\.combos,r\.pool,false\)/.test(gzb))
    throw new Error('the drift line compares against a set that was not the one built');
  if (gzb.indexOf('cItems') >= 0)
    throw new Error('the report still measures every approved trait');
  if (!/if\(r\.reason==="final-empty"\)\{/.test(gzb))
    throw new Error('an empty final project is reported as nothing being saved, which is false');
  if (!/Open Final project/.test(gzb))
    throw new Error('the refusal does not say what to do about it');
  if (!/" from the final project, with metadata\."/.test(gzb))
    throw new Error('the report does not say what it built');

  /* AND NEITHER PANEL CAN BE MISTAKEN FOR THE OTHER. */
  if (text.indexOf('from the traits in the final project and download them as a zip') < 0)
    throw new Error('the button does not say what it draws from');
  if (!/Draws from every approved trait - Generate set builds"/.test(code))
    throw new Error('the character builder does not say it is wider than Generate');
  if (!/Generate set on the project page builds this, and nothing"/.test(code))
    throw new Error('the final preview still says Generate builds something else');
  /* THE OLD CONFESSION IS GONE, not left beside the new sentence. */
  if (code.indexOf('still draws from every"') >= 0)
    throw new Error('the preview says both things at once');

  /* AND THE THINGS THAT WERE DELIBERATELY LEFT WIDE ARE STILL WIDE, so this
     is Generate changing rather than every count in the app moving with it. */
  const bcp = kit.inFunction(codeLines, 'async function buildCompose(items){');
  const bcpb = codeLines.slice(bcp.start, bcp.end + 1).join('\n');
  if (!/return wip \|\| inCollection\(st\);/.test(bcpb))
    throw new Error('the character builder narrowed too, which nobody asked for');
  const ds = kit.inFunction(codeLines, 'async function drawSheet(count){');
  const dsb = codeLines.slice(ds.start, ds.end + 1).join('\n');
  if (!/const pools=cPools\(\);/.test(dsb))
    throw new Error('the project page sheet stopped previewing the project');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
