/* A PREVIEW OF THE FINAL PROJECT, DRAWN FROM THE FINAL TRAITS ONLY.

   "i wannt to be able to have a *final project preview where you can see a
   preview of just the final edited traits. Make it so that the trait layer
   rules carry over as well."

   The project page already builds a character, and it draws from everything
   approved - which is the mess the final page was asked for in the first
   place. This one draws from the stfp set and nothing else, so what is on the
   canvas is what the collection will be made of.

   THE SAME TWO PRESSES THE PROJECT PAGE HAS. Randomize and Sheet of 12, so
   there is no second idea to learn about what a preview does; the difference
   is entirely which traits go in.

   THE RULES CARRY OVER BECAUSE IT IS THE SAME DRAW. The only thing this
   builds is the pools object - one array per layer, holding the stfp traits
   of that layer, plus __base for the saved references - and randomCombo and
   uniqueCombos do the rest. That is the generator's own function, so it is
   not that the rules were re-applied here, it is that there is nowhere for
   them to be missed:

     never-together   conflictsWith, inside buildCombo, against RULES
     the layer order  decideOrder on the way in, LAYERS on the way out
     always present   ALWAYS_PRESENT, so skins is never skipped
     the empty chance emptyChance, so a layer is left out as often as it is
                      when the set is generated for real
     the weights      weightedPick
     hidden layers    left out of the pools, as poolsForDistribution does

   A preview that reimplemented the draw would look identical on any project
   with no rules in it, which is every project until somebody adds one - so
   the test for this forbids a pair the set cannot avoid by chance and checks
   it never comes out.

   ONE PAINTING, TWO PAGES. The layout and paint half of drawSheet becomes
   paintCombos and both pages call it. The half that stays behind is chrome -
   which canvas, the note, the download mode, the census - and it is different
   on each page, which is why only the middle moved.

   CAP, NOT A COUNT. The sheet caps a character at SHEET_CELL because a sheet
   is an overview and the comment there records the 75.2MB canvas that came of
   not capping it. A single character passes Infinity, which fitSize hands
   straight back, so it is drawn at the size the collection actually is - the
   same thing drawCompose does for its one character. Inferring the cap from
   "is there only one" instead would have quietly changed drawSheet for a set
   with a single combination, which is a real project rather than a corner.

   IT REDRAWS WITH THE PAGE. renderFinal runs on arrival and after every add,
   removal and layer change, and the preview goes with it - a picture of a set
   that has changed underneath it is a picture of something that no longer
   exists. It keeps whichever of the two presses you last used, so a sheet
   stays a sheet.

   AND IT PUTS ITSELF AWAY when nothing has been chosen, which is how every
   project starts. A blank canvas under no explanation reads as a preview that
   is broken rather than one with nothing to draw. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the block has a shape ------------------------------------------ */
{
  const at = kit.only(L, l => l === '#finalset .fscount{font-variant-numeric:tabular-nums;}',
    'the final page count rule');
  kit.replace(L, { start: at, end: at }, [
    '#finalset .fscount{font-variant-numeric:tabular-nums;}',
    '/* THE PREVIEW. The canvas beside what it was drawn from, which is the shape',
    '   .preview and .pvinfo already use elsewhere in the page. It wraps to one',
    '   column when there is no room, so a phone gets the character full width',
    '   with the presses under it rather than a 90px stamp. */',
    '#finalset .fsprev{display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start;',
    '  margin:12px 0 6px;}',
    '#finalset .fsprev canvas{width:min(420px,72vw); height:auto; flex:none;',
    '  image-rendering:pixelated; border-radius:10px; border:1px solid var(--line);',
    '  background:',
    '    linear-gradient(45deg,var(--panel-2) 25%,transparent 25%,transparent 75%,var(--panel-2) 75%),',
    '    linear-gradient(45deg,var(--panel-2) 25%,var(--panel) 25%,var(--panel) 75%,var(--panel-2) 75%);',
    '  background-size:16px 16px; background-position:0 0,8px 8px;}',
    '#finalset .fspinfo{flex:1; min-width:190px; display:flex; flex-direction:column;',
    '  gap:9px;}',
    '#finalset .fspacts{display:flex; gap:7px; flex-wrap:wrap;}',
    '#finalset .fspinfo .note{margin:0; font-size:12px; line-height:1.55;}',
  ]);
}

/* ---- 2. the block itself ------------------------------------------------ */
{
  const at = kit.only(L, l => l === '    <div id="finallayers"></div>',
    'the layer list');
  kit.replace(L, { start: at, end: at }, [
    '    <!-- WHAT THE COLLECTION LOOKS LIKE. Drawn from the stfp traits only,',
    '         through the same randomCombo the generator uses, so the',
    '         Never-together rules and the layer order are not re-applied here -',
    '         there is nowhere for them to be missed. Above the list because the',
    '         question this page answers is "is this set right", and the picture',
    '         answers it before the inventory does. -->',
    '    <div class="fsprev" id="fsprev" hidden>',
    '      <canvas id="fpcanvas" width="160" height="160"',
    '        aria-label="A character built from the traits in the final project"></canvas>',
    '      <div class="fspinfo">',
    '        <div class="fspacts">',
    '          <button class="mini" type="button" id="fprand"',
    '            title="Draw another character from the traits in the final project">Randomize</button>',
    '          <button class="mini" type="button" id="fpsheet"',
    '            title="Draw twelve different characters from the traits in the final project">Sheet of 12</button>',
    '        </div>',
    '        <p class="note" id="fpnote"></p>',
    '      </div>',
    '    </div>',
    '    <div id="finallayers"></div>',
  ]);
}

/* ---- 3. one painting, two pages ---------------------------------------- */
{
  /* THE MIDDLE OF drawSheet, LIFTED OUT. Everything from the grid arithmetic
     to handing the scratch tile back; nothing above it (which pools, which
     canvas) and nothing below it (the note, the download mode, the census). */
  const at = kit.only(L, l => l === 'async function drawSheet(count){', 'the sheet');
  kit.replace(L, { start: at, end: at }, [
    '/* LAY CHARACTERS OUT ON A CANVAS AND PAINT THEM.',
    '',
    '   Lifted out of drawSheet so the final project page can draw with exactly',
    '   this and not a second copy of it. What stayed behind is chrome - which',
    '   pools, which canvas, what to say afterwards - and that differs per page,',
    '   which is why only the middle moved.',
    '',
    '   cap is the longest side one character may take. THE SHEET IS AN OVERVIEW,',
    '   SO IT IS DRAWN AT OVERVIEW SIZE: this sized the canvas to twelve full',
    '   traits and reached 5126x3844 - 75.2 MB, measured - for a picture the CSS',
    '   shows at min(900px,72vw). A 320 cell is 5.0 MB and is still being scaled',
    '   DOWN at 900px, so the screen this set is judged on loses nothing.',
    '',
    '   A SINGLE CHARACTER PASSES Infinity, which fitSize hands straight back, so',
    '   it is drawn at the size the collection is - what drawCompose does for its',
    '   one character. Reading the cap off the COUNT instead would have quietly',
    '   changed drawSheet for a set with one combination in it, which is an',
    '   ordinary small project rather than a corner.',
    '',
    '   Each character is still composited at the FULL canvas size, into one',
    '   scratch tile reused across the sheet, so paintTrait is handed exactly the',
    '   canvas it was handed before and every whole-number scale it works out is',
    '   unchanged. Only the copy onto the sheet is smaller.',
    '',
    '   The one-column arithmetic falls out rather than being a branch:',
    '   1*(w+GAP)-GAP is w. */',
    'async function paintCombos(cv,combos,W,H,cap){',
    '  const got=(combos||[]).length;',
    '  if(!cv) return 0;',
    '  if(!got){ cv.width=1; cv.height=1; return 0; }',
    '  /* From what was actually drawn: laying out for what was ASKED for when',
    '     fewer came back leaves a band of empty canvas that reads as a',
    '     rendering fault. */',
    '  const cols=Math.min(4,got), rows=Math.ceil(got/cols), GAP=2;',
    '  const cell=fitSize(W,H,cap);',
    '  cv.width=cols*(cell.w+GAP)-GAP; cv.height=rows*(cell.h+GAP)-GAP;',
    '  const g=cv.getContext("2d");',
    '  g.imageSmoothingEnabled=false;',
    '  g.clearRect(0,0,cv.width,cv.height);',
    '  const tile=document.createElement("canvas"); tile.width=W; tile.height=H;',
    '  const tg=tile.getContext("2d"); tg.imageSmoothingEnabled=false;',
    '  for(let i=0;i<got;i++){',
    '    tg.clearRect(0,0,W,H);',
    '    for(const r of combos[i]){',
    '      const bm=await cBitmap(r);',
    '      paintTrait(tg,bm,0,0,W,H);',
    '    }',
    '    const ox=(i%cols)*(cell.w+GAP), oy=Math.floor(i/cols)*(cell.h+GAP);',
    '    g.drawImage(tile,ox,oy,cell.w,cell.h);',
    '  }',
    '  /* Handed back rather than left at the collection size. */',
    '  tile.width=1; tile.height=1;',
    '  return got;',
    '}',
    'async function drawSheet(count){',
  ]);
}
{
  /* And drawSheet calls it instead of carrying it. */
  const fn = kit.inFunction(L, 'async function drawSheet(count){');
  const from = kit.only(L, l => l === '  const cols=Math.min(4,got), rows=Math.ceil(got/cols), GAP=2;',
    'the sheet layout', fn);
  const to = kit.only(L, l => l === '  tile.width=1; tile.height=1;',
    'the scratch tile being handed back', fn);
  kit.replace(L, { start: from, end: to }, [
    '  const cv=$("ccanvas");',
    '  /* THE LAYOUT AND THE PAINT ARE paintCombos NOW, shared with the final',
    '     project page. SHEET_CELL is what makes this a sheet rather than twelve',
    '     full-size characters, and the reason is written down there. */',
    '  await paintCombos(cv,combos,W,H,SHEET_CELL);',
  ]);
}

/* ---- 4. the pools, the draw, and the sentence under it ----------------- */
{
  const at = kit.only(L, l => l === 'async function renderFinal(){', 'the final page render');
  kit.replace(L, { start: at, end: at }, [
    '/* THE POOLS THE FINAL PROJECT WOULD BE GENERATED FROM.',
    '',
    '   One array per layer holding the stfp traits of that layer, plus __base for',
    '   the saved references - the shape buildCombo reads, and the same shape',
    '   poolsForDistribution builds. The ONLY difference from that one is which',
    '   traits go in: it asks traitEligible, which is approved-or-stfp and wip',
    '   when wip is ticked, and this asks for stfp and nothing else. That one',
    '   difference is the whole feature.',
    '',
    '   Hidden layers are left out here rather than filtered later, for the same',
    '   reason the compose rows leave them out: no pool means buildCombo skips',
    '   the layer, and filtering afterwards would paint a trait the collection',
    '   does not contain. */',
    'function finalPools(items){',
    '  const out={};',
    '  const refs=(items||[]).filter(i=>i&&i.kind==="ref");',
    '  if(refs.length) out.__base=refs;',
    '  for(const t of (items||[])){',
    '    if(!t||t.kind!=="trait") continue;',
    '    if(String(t.status||"wip")!=="stfp") continue;',
    '    const l=t.layer||"unsorted";',
    '    if(HIDDEN_LAYERS.has(l)) continue;',
    '    if(!out[l]) out[l]=[];',
    '    out[l].push(t);',
    '  }',
    '  return out;',
    '}',
    '/* Which of the two presses was last used. Kept so that a set changing under',
    '   a sheet redraws as a sheet: the picture is answering a question about the',
    '   whole set, and dropping to one character would be answering a different',
    '   one without being asked. */',
    'let fpMode=1;',
    '/* DRAW THE FINAL PROJECT.',
    '',
    '   n characters, through randomCombo and uniqueCombos, which is the generator',
    '   draw - so the Never-together rules, the layer order, the always-present',
    '   layers, the weights and the empty chance all apply because this never',
    '   had a chance to lose them.',
    '',
    '   Sized from the FINAL traits rather than the whole collection, because',
    '   that is the collection this is a preview of. autoCanvas memoises one',
    '   answer at a time, so alternating between this page and the project page',
    '   recomputes - arithmetic over cached per-record blocks, with no decoding,',
    '   which is what blockOf is for. */',
    'async function finalPreview(n,items){',
    '  const box=$("fsprev"), cv=$("fpcanvas"), note=$("fpnote");',
    '  if(!box||!cv) return 0;',
    '  const pools=finalPools(items);',
    '  const layers=Object.keys(pools).filter(k=>k!=="__base");',
    '  const traits=layers.reduce((a,k)=>a+pools[k].length,0);',
    '  /* PUT AWAY RATHER THAN LEFT BLANK. Nothing chosen is how every project',
    '     starts, and an empty canvas under no explanation reads as a preview',
    '     that is broken rather than one with nothing to draw. The subtitle',
    '     above already says what to do about it. */',
    '  if(!traits){ box.hidden=true; if(note) note.textContent=""; return 0; }',
    '  box.hidden=false;',
    '  const want=Math.max(1,n|0);',
    '  const combos=want===1 ? (()=>{ const c=randomCombo(pools); return c&&c.length?[c]:[]; })()',
    '    : uniqueCombos(pools,want);',
    '  const S=await autoCanvas(items.filter(i=>i&&i.kind==="trait"',
    '    && String(i.status||"wip")==="stfp"));',
    '  /* Infinity for one character so fitSize hands the size back unchanged and',
    '     it is drawn at the size the collection is; the sheet is an overview and',
    '     caps, for the reason written on paintCombos. */',
    '  const got=await paintCombos(cv,combos,S,S,want===1?Infinity:SHEET_CELL);',
    '  if(note){',
    '    const head = got===1',
    '      ? "One character from the "+traits+" trait"+(traits===1?"":"s")',
    '      : got+" different characters from the "+traits+" trait"+(traits===1?"":"s");',
    '    /* WHAT IT DREW FROM, because "only the final traits" is the claim the',
    '       picture itself cannot make. */',
    '    const from = " in the final project, over "+layers.length+" layer"',
    '      +(layers.length===1?"":"s")+".";',
    '    /* Asking for more than the set holds is a fact about the set rather',
    '       than a failure, and it is the most useful thing this can say: a',
    '       collection of twelve characters is a small collection. */',
    '    const shortBy = (want>1 && got<want)',
    '      ? " Asked for "+want+" and the set could only give "+got+" different." : "";',
    '    /* The one case where what was drawn disagrees with the rules list. */',
    '    const missed = ruleMisses',
    '      ? " The Never-together rules could not be met on "+ruleMisses+" draw"',
    '        +(ruleMisses===1?"":"s")+" - the final set is over-constrained." : "";',
    '    const bare = got===0 ? " Nothing could be drawn from it." : "";',
    /* SAID BECAUSE IT IS NOT TRUE YET. buildCollection - the only thing that
       mints the set - takes its pools from cPools(), the project page rows,
       which hold everything approved. So this is a picture of a collection the
       app has no button to produce, and a note that let it be mistaken for the
       one Generate set makes would be true about the rules and false about the
       pool, sitting under a picture whose whole claim IS the pool. */
    '    const mismatch=" Generate set on the project page still draws from every"',
    '      +" approved trait, not only from these.";',
    '    note.textContent=head+from',
    '      +" The Never-together rules, the layer order and the empty chance are"',
    '      +" the ones a character is generated with."+shortBy+missed+bare+mismatch;',
    '  }',
    '  return got;',
    '}',
    'async function renderFinal(){',
  ]);
}
{
  /* Drawn at the end, once the list it sits above is built. */
  const fn = kit.inFunction(L, 'async function renderFinal(){');
  const at = kit.only(L, l => l === '  const warn=$("finalwarn");',
    'the bare layer warning', fn);
  kit.replace(L, { start: at, end: at }, [
    '  /* AFTER THE LIST, because the list is the cheap half and the preview',
    '     decodes pictures - and because this runs on every add, removal and',
    '     layer change, not only on arrival. A preview of a set that has changed',
    '     under it is a picture of something that no longer exists. */',
    '  try{ await finalPreview(fpMode,items); }catch(_){ }',
    '  const warn=$("finalwarn");',
  ]);
}

/* ---- 5. the two presses ------------------------------------------------- */
{
  const at = kit.only(L, l => l === "$('csheet').onclick=()=>drawSheet(12);",
    'the sheet button');
  kit.replace(L, { start: at, end: at }, [
    "$('csheet').onclick=()=>drawSheet(12);",
    '/* THE SAME TWO PRESSES ON THE FINAL PAGE, against the final set. They set',
    '   the mode as well as drawing, so the next render - an add, a removal, a',
    '   layer change - comes back as whichever of the two you were looking at. */',
    "if($('fprand')) $('fprand').onclick=async()=>{",
    '  fpMode=1;',
    '  let items=[]; try{ items=await dbAll(); }catch(_){ return; }',
    '  await finalPreview(1,items);',
    '};',
    "if($('fpsheet')) $('fpsheet').onclick=async()=>{",
    '  fpMode=12;',
    '  let items=[]; try{ items=await dbAll(); }catch(_){ return; }',
    '  await finalPreview(12,items);',
    '};',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* THE DRAW IS THE GENERATOR'S. This is the request - "make it so that the
     trait layer rules carry over" - and the only way it holds is by going
     through the function that already applies them. */
  const fp = kit.inFunction(codeLines, 'async function finalPreview(n,items){');
  const fpb = codeLines.slice(fp.start, fp.end + 1).join('\n');
  if (!/randomCombo\(pools\)/.test(fpb) || !/uniqueCombos\(pools,want\)/.test(fpb))
    throw new Error('the preview draws its own characters instead of using the generator');
  for (const leaked of ['conflictsWith', 'weightedPick', 'decideOrder', 'ALWAYS_PRESENT',
    'emptyChance', 'buildCombo']) {
    if (fpb.indexOf(leaked) >= 0)
      throw new Error('the preview re-applies ' + leaked + ' itself, which is a second copy of the rules');
  }

  /* AND THE POOL IS THE FINAL SET. A preview built from cPools would show the
     whole approved collection, which is the thing this page exists to escape. */
  const pl = kit.inFunction(codeLines, 'function finalPools(items){');
  const plb = codeLines.slice(pl.start, pl.end + 1).join('\n');
  if (!/if\(String\(t\.status\|\|"wip"\)!=="stfp"\) continue;/.test(plb))
    throw new Error('the preview draws from traits that are not in the final project');
  if (!/if\(HIDDEN_LAYERS\.has\(l\)\) continue;/.test(plb))
    throw new Error('a layer the collection leaves out would be painted into the preview');
  if (!/out\.__base=refs;/.test(plb))
    throw new Error('the base character is left out of the preview');
  if (fpb.indexOf('cPools(') >= 0 || fpb.indexOf('cItems') >= 0)
    throw new Error('the preview reads the project page pool rather than the final set');

  /* ONE PAINTING, TWO PAGES. */
  const pc = kit.inFunction(codeLines, 'async function paintCombos(cv,combos,W,H,cap){');
  const pcb = codeLines.slice(pc.start, pc.end + 1).join('\n');
  if (!/const cell=fitSize\(W,H,cap\);/.test(pcb))
    throw new Error('the cap is not what decides the size, so the count does');
  if (!/const bm=await cBitmap\(r\);/.test(pcb) || !/paintTrait\(tg,bm,0,0,W,H\);/.test(pcb))
    throw new Error('the paint stopped going through paintTrait, which is what keeps pixels square');
  if (!/tile\.width=1; tile\.height=1;/.test(pcb))
    throw new Error('the scratch tile is left at the collection size');
  const ds = kit.inFunction(codeLines, 'async function drawSheet(count){');
  const dsb = codeLines.slice(ds.start, ds.end + 1).join('\n');
  if (!/await paintCombos\(cv,combos,W,H,SHEET_CELL\);/.test(dsb))
    throw new Error('the sheet no longer goes through the shared painting');
  /* AND IT KEPT NONE OF IT. A copy left behind is a copy that drifts. */
  for (const gone of ['const cols=Math.min(4,got)', 'createElement("canvas"); tile.width=W']) {
    if (dsb.indexOf(gone) >= 0)
      throw new Error('the sheet still carries its own copy of the layout: ' + gone);
  }
  /* THE SHEET STILL CAPS. Its 75.2MB canvas is the reason SHEET_CELL exists. */
  if (dsb.indexOf('Infinity') >= 0)
    throw new Error('the sheet stopped capping, which is the 75MB canvas back');
  /* AND THE SINGLE CHARACTER DOES NOT. */
  if (!/want===1\?Infinity:SHEET_CELL/.test(fpb))
    throw new Error('one character is drawn at overview size rather than at the size of the set');

  /* IT PUTS ITSELF AWAY WITH NOTHING TO DRAW, and says what it drew from when
     there is. */
  if (!/if\(!traits\)\{ box\.hidden=true;/.test(fpb))
    throw new Error('an empty final project leaves a blank canvas with no explanation');
  if (!/box\.hidden=false;/.test(fpb))
    throw new Error('the preview never comes back once it has been put away');
  if (!/" in the final project, over "\+layers\.length\+" layer"/.test(fpb))
    throw new Error('the preview does not say what it drew from');
  /* AND THAT IT SAYS WHAT IT IS NOT. */
  if (!/Generate set on the project page still draws from every/.test(fpb))
    throw new Error('the preview lets the set it shows be mistaken for the one that gets made');

  /* IT REDRAWS WITH THE PAGE, and keeps which of the two presses you used. */
  const rf = kit.inFunction(codeLines, 'async function renderFinal(){');
  const rfb = codeLines.slice(rf.start, rf.end + 1).join('\n');
  if (!/try\{ await finalPreview\(fpMode,items\); \}catch\(_\)\{ \}/.test(rfb))
    throw new Error('the preview does not follow the set it is a preview of');
  if (!/let fpMode=1;/.test(code))
    throw new Error('there is no memory of which press was used');
  if (!/fpMode=12;/.test(code) || !/fpMode=1;\n  let items/.test(code))
    throw new Error('the presses do not record which one was used');

  /* THE BLOCK EXISTS AND IS HIDDEN TO BEGIN WITH, like every other section on
     the page - the page rules only ever ADD display:none. */
  if (text.indexOf('<div class="fsprev" id="fsprev" hidden>') < 0)
    throw new Error('there is no preview block');
  if (text.indexOf('<canvas id="fpcanvas"') < 0)
    throw new Error('there is nothing to draw on');
  for (const id of ['fprand', 'fpsheet', 'fpnote'])
    if (text.indexOf('id="' + id + '"') < 0)
      throw new Error('the preview is missing its ' + id);
  /* INSIDE #finalset, so the page rules carry it and it needs none of its own. */
  const sec = text.indexOf('<section class="proj pg-final" id="finalset"');
  const prev = text.indexOf('<div class="fsprev" id="fsprev"');
  const list = text.indexOf('<div id="finallayers">');
  if (!(sec >= 0 && prev > sec && list > prev))
    throw new Error('the preview is not inside the final page above its list');
  /* AND THE LIST IS STILL A DIRECT CHILD of the section, which is what the
     existing tests read through. */
  if (text.indexOf('    <div id="finallayers"></div>') < 0)
    throw new Error('the layer list moved, and three tests read it where it was');

  if (text.indexOf('#finalset .fsprev{') < 0)
    throw new Error('the preview block has no style, so it has no layout');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
