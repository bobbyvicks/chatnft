/* REMEMBER THE BASE, AND STOP THE BUTTON EATING A FINISHED TRAIT.

   Running the shipped hideBase over both real populations found two things
   patch252 got wrong, one of them the actual complaint.

   ONE: THE BUTTON IS A FOOTGUN ON ANYTHING THAT IS NOT A RENDER. Pressed on
   hats/Coinbase Cap.png it removes 79% of the trait - the cap is two blues,
   they are the two biggest saturated balls in the picture, so "the base" is
   the artwork. 175 of the 264 approved traits lose more than 1% this way.
   Nothing stopped that but a percentage printed on the button.

   TWO, AND WORSE: THE DETECTOR CANNOT HELP WITH THE THING THAT WAS ASKED FOR.
   The complaint is about what is left AFTER cropping - "the image i send isnt
   always perfect and i always have to cut out the green and pink". Once the
   crop is made the base is a fringe, a few percent of the picture, and the
   two dominant saturated balls are the TRAIT's own colours. So on the very
   case it was built for, patch252 would have removed the trait and kept the
   base. It was proven on whole renders and the whole render is not the
   problem.

   THE FIX IS TO REMEMBER RATHER THAN RE-GUESS. The base is the same two
   colours every time; it is a fact about how this collection is made, not
   about the picture in front of you. So when a render IS recognised - and it
   is recognised reliably, 94.5% against 79.1% with nothing in between - its
   colours are written down. After that the crop is easy: those exact colours
   come out wherever they appear, however little of the picture they are,
   because they are known rather than inferred.

   And the button is gated on that knowledge. It removes remembered colours,
   or a confidently-detected render's colours, and otherwise refuses and says
   why - rather than taking whatever happens to be the biggest thing in the
   picture. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const planAt = kit.inFunction(L, 'function basePlan(){');
const listAt = kit.only(L, l => l === '  const list=balls.slice(0,2);', 'the pair basePlan settled on', planAt);
/* The cover line is replaced with it: the new block declares its own cover,
   and leaving the old one behind is a redeclaration. patchkit refused to
   write exactly that, which is why the range is two lines and not one. */
if (L[listAt + 1] !== '  const cover=list.reduce((a,b)=>a+b.n,0)/opaque*100;')
  throw new Error('the cover line does not follow the list line');
const retAt = kit.only(L, l => l === '  return {im,d,n,W,H,opaque,list,cover,gap,tol,pal};', 'basePlan return', planAt);
const decideApply = kit.only(L, l => l === 'function applyDecideOrder(items){', 'applyDecideOrder');
const bootAt = kit.only(L, l => l === '  applyDecideOrder(items);', 'the boot call');
const labelAt = kit.inFunction(L, 'function baseLabel(){');
const clickAt = kit.inFunction(L, 'function hideBaseClicked(){');
if (!(planAt.end < labelAt.start && labelAt.end < clickAt.start))
  throw new Error('the three functions are not in the order assumed');

/* ---- WRITE, bottom of the file upward so earlier ranges stay valid ---- */

/* 3. hideBaseClicked - refuse rather than guess. */
kit.replace(L, clickAt, [
  'function hideBaseClicked(){',
  '  const pl=basePlan();',
  '  /* REFUSING IS THE POINT. Pressed on a finished trait the old version took',
  '     the two biggest saturated colours and called them the base - 79% of',
  '     hats/Coinbase Cap.png, which is two blues. It only knows what a base is',
  '     when it has been told or when the picture is unmistakably a render. */',
  '  if(!pl || !pl.list.length){ toast("No base colour here"); return; }',
  '  if(pl.source==="guess"){',
  '    toast("Not sure what the base is here - open a render first, or use Replace");',
  '    return;',
  '  }',
  '  const redoWas=redoStack.slice(), dropped=snapshot();',
  '  const r=hideBase();',
  '  if(!r || !(r.gone+r.peeled)){',
  '    dropSnapshot(redoWas,dropped);',
  '    toast("Nothing here matches the base colour");',
  '    return;',
  '  }',
  '  ctx.putImageData(r.plan.im,0,0);',
  '  if(r.plan.source==="render") saveBaseColours(r.plan.list);',
  '  refreshStats(); repalette(); cleanLabel(); baseLabel();',
  '  toast("Hid "+(r.gone+r.peeled).toLocaleString()+" base pixels"',
  '    +(r.peeled?" ("+r.peeled.toLocaleString()+" of them the blended edge)":""));',
  '}',
]);

/* 2. baseLabel - say which of the two it is working from. */
kit.replace(L, labelAt, [
  'function baseLabel(){',
  '  const b=$("hidebase"); if(!b) return;',
  '  const pl=basePlan();',
  '  if(!pl || !pl.list.length || pl.source==="guess"){',
  '    b.textContent="Hide the base colour";',
  '    b.disabled=true;',
  '    /* Disabled with a reason, because a dead control with no explanation',
  '       reads as broken rather than as not applicable. */',
  '    b.title = pl && pl.source==="guess"',
  '      ? "No base is known yet. Open one of the renders and this learns its colours."',
  '      : "Finds the flat colours the character underneath was drawn in and takes them out, including the blended edge around them";',
  '    return;',
  '  }',
  '  b.disabled=false;',
  '  const names=pl.list.map(q=>hex(q.r,q.g,q.b)).join(" + ");',
  '  b.textContent = pl.source==="render"',
  '    ? "Hide the base colour ("+names+", "+Math.round(pl.cover)+"%)"',
  '    : "Hide the base colour ("+names+")";',
  '  b.title="Takes out "+names+" and the blended edge around them";',
  '}',
]);

/* 1c. basePlan's return carries where the answer came from. */
kit.replace(L, { start: retAt, end: retAt },
  ['  return {im,d,n,W,H,opaque,list,cover,gap,tol,pal,source};']);

/* 1b. and how the pair was chosen. */
kit.replace(L, { start: listAt, end: listAt + 1 }, [
  '  /* WHAT COUNTS AS THE BASE, in the order the answer can be trusted.',
  '',
  '     remembered - colours a render already taught this browser. Used at any',
  '                  size, which is the whole point: after a crop the base is a',
  '                  fringe and could never be found by looking for the biggest',
  '                  thing in the picture.',
  '     render     - the pair covers BASE_COVER of a picture, which measured',
  '                  over 280 real files means a render and never a trait.',
  '     guess      - the two biggest saturated balls, and nothing says they are',
  '                  a base. Returned so the label can explain itself, and',
  '                  never acted on.  */',
  '  let list=balls.slice(0,2);',
  '  let cover=list.reduce((a,b)=>a+b.n,0)/opaque*100;',
  '  let source = cover>=BASE_COVER && list.length>=2 ? "render" : "guess";',
  '  if(BASE_KEEP.length){',
  '    const here=[];',
  '    for(const q of BASE_KEEP){',
  '      let hit=0;',
  '      for(const c of pal){',
  '        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2<=BASE_BALL*BASE_BALL) hit+=c.n;',
  '      }',
  '      if(hit) here.push({r:q.r,g:q.g,b:q.b,n:hit});',
  '    }',
  '    if(here.length){',
  '      list=here;',
  '      cover=here.reduce((a,b)=>a+b.n,0)/opaque*100;',
  '      source="remembered";',
  '    }',
  '  }',
]);

/* 1a. the store, beside the other settings records. */
kit.replace(L, { start: decideApply, end: decideApply }, [
  '/* THE BASE THIS COLLECTION IS DRAWN ON, kept because it does not change.',
  '',
  '   A settings record rather than a guess repeated per picture. The whole',
  '   difficulty is that after a crop the base is a fringe - a few per cent of',
  '   the picture - and nothing about the picture itself says which few per',
  '   cent. A render says it unmistakably, so the render is where it is learnt',
  '   and this is where it is kept. */',
  "const BASE_ID='settings.basecolours';",
  'let BASE_KEEP=[];',
  'function applyBaseColours(items){',
  '  const rec=items.find(i=>i.id===BASE_ID);',
  '  BASE_KEEP = (rec&&Array.isArray(rec.colours))',
  '    ? rec.colours.filter(c=>c&&typeof c.r==="number").map(c=>({r:c.r|0,g:c.g|0,b:c.b|0}))',
  '    : [];',
  '}',
  'async function saveBaseColours(list){',
  '  BASE_KEEP=list.map(q=>({r:q.r,g:q.g,b:q.b}));',
  '  try{ await dbPut({id:BASE_ID, kind:"settings", at:Date.now(), colours:BASE_KEEP.slice()}); }',
  '  catch(_){ /* remembering is a convenience; failing to is not worth a dialog */ }',
  '}',
  'function applyDecideOrder(items){',
]);

/* 1a(ii). read at boot with the rest. */
const bootNow = kit.only(L, l => l === '  applyDecideOrder(items);', 'the boot call, after the insert');
kit.replace(L, { start: bootNow, end: bootNow }, [
  '  applyDecideOrder(items);',
  '  applyBaseColours(items);',
]);

const grew = kit.save(doc, ({ text, lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('  applyBaseColours(items);') !== 1) throw new Error('the boot call did not land');
  if (has('function applyBaseColours(items){') !== 1) throw new Error('applyBaseColours did not land');
  if (has('async function saveBaseColours(list){') !== 1) throw new Error('saveBaseColours did not land');
  if (has('  return {im,d,n,W,H,opaque,list,cover,gap,tol,pal,source};') !== 1)
    throw new Error('basePlan does not report its source');
  if (has('  const list=balls.slice(0,2);') !== 0) throw new Error('the old const list is still there');
  /* The refusal is CODE. A comment about refusing is not a refusal. */
  if (code.indexOf('if(pl.source==="guess")') < 0) throw new Error('the guess refusal is only a comment');
  if (code.indexOf('const BASE_ID=') < 0) throw new Error('BASE_ID is not in code');
  /* Exactly one thing writes the store, so there is one place to look when it
     remembers the wrong colours. */
  const writes = (code.match(/saveBaseColours\(/g) || []).length;
  if (writes !== 2) throw new Error('saveBaseColours should be defined once and called once, saw ' + writes);
});

console.log('index.html grew by ' + grew + ' bytes');
