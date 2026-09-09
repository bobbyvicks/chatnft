/* THE OUTLINE GREW THE TRAIT. IT SHOULD RECOLOUR ITS EDGE.

   "can we change the ouline function so its 'change outer pixels to black and
   itll change the pixels that are touching the N E W outside grid to the size
   of our fixed grid size (easier outline, instead of us adding pixels"

   The tool added a ring OUTSIDE the silhouette: the trait got bigger by the
   thickness, every time. What is wanted is the opposite - take the trait's own
   outermost pixels and change them. Nothing is added, the silhouette does not
   move, and a trait that was drawn to fit its box still fits it.

   That is a different operation, not a setting on the old one, so it is a
   switch and it is on by default. Adding a ring is still there, unticked, for
   the case where a border really is meant to sit outside the art.

   ONE GRID CELL, which is what "to the size of our fixed grid size" asks for.
   The Snap control already turned a thickness into cells; it gains "the
   collection grid", which is the canvas over projectGrid - 8 real pixels on a
   1280 trait at 160 cells, 1 on the fixer's own 160x160 output - and that is
   the default now. So one step of thickness is one cell of the grid the
   collection is built on, whatever size the trait is open at.

   N, E AND W, WRITTEN OUT THAT WAY IN THE ASK, so that is the default: a pixel
   counts as outer when the empty space is above it, to its left or to its
   right. Not below. On this collection that is deliberate - a hoodie runs off
   the bottom of the frame, and outlining the cut would draw a black line
   across the middle of a character. Both sides are offered, because a trait
   that floats clear of the bottom edge wants its underside outlined too, and
   which of the two is right is a fact about the trait rather than about the
   tool.

   THE COLOURS RUN OUTSIDE IN HERE, which is the other way round from the ring
   version and follows from what the band is: ring 1 is the trait's outermost
   pixel, ring 2 the one behind it. One colour - black, untouched - is the
   whole of the ask. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the switch, and which sides count as outside ------------------ */
{
  const at = kit.only(L, l => l === '        <div class="olrow" style="align-items:flex-start">',
    'the colour row');
  kit.replace(L, { start: at, end: at - 1 }, [
    '        <!-- THE OPERATION, not a setting on it: one changes the trait\'s own',
    '             pixels, the other adds pixels around it. See patch408. -->',
    '        <div class="olrow">',
    '          <label class="olchk" style="margin-left:0"><input type="checkbox" id="olinward" checked>',
    '            Change the trait\'s own outer pixels</label></div>',
    '        <div class="olrow"><label for="olsides">Outside is</label>',
    '          <select id="olsides" aria-label="Which sides count as outside" style="margin-left:auto">',
    '            <option value="new" selected>above, left and right</option>',
    '            <option value="all">all four sides</option></select></div>',
  ]);
}

/* ---- the grid as a snap size --------------------------------------- */
{
  /* auto and "1 cell" share one line, and "1 cell" carried the selected
     attribute - so this one replacement both adds the grid option and moves
     the default onto it. A second edit looking for the old line afterwards
     found nothing, because this had already eaten it. */
  const at = kit.only(L, l => l === '            <option value="auto">auto</option><option value="1" selected>1 cell</option>',
    'the snap options');
  kit.replace(L, { start: at, end: at }, [
    '            <option value="grid" selected>the collection grid</option>',
    '            <option value="auto">auto</option><option value="1">1 cell</option>',
  ]);
}
{
  const at = kit.only(L, l => l.indexOf('function snapValue(){ const v=$("olsnap").value;') === 0,
    'the snap reader');
  if (L[at + 1].indexOf('return v==="auto"') < 0)
    throw new Error('the snap reader is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '/* THE COLLECTION\'S CELL, IN THE PIXELS THIS TRAIT IS OPEN AT. A trait saved',
    '   at 1280 on a 160 cell grid has 8-pixel cells; the fixer\'s own output of',
    '   the same trait is 160 across and has 1. Same cell either way, which is',
    '   the point of asking for it by name rather than by a number. */',
    'function gridCellPx(){',
    '  const cells=Math.max(1,projectGrid|0);',
    '  const w=(typeof art!=="undefined"&&art&&art.width)?art.width:cells;',
    '  return Math.max(1,Math.round(w/cells));',
    '}',
    'function snapValue(){ const v=$("olsnap").value;',
    '  if(v==="grid") return Math.max(1,Math.min(64,gridCellPx()));',
    '  return v==="auto" ? Math.max(1,Math.min(16,Math.round(gridBlock))) : (parseInt(v,10)||1); }',
  ]);
}

/* ---- what the two operations are ----------------------------------- */
{
  const at = kit.only(L, l => l === 'function olColourFor(k,list){', 'the colour picker');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* WHICH OPERATION. Changing the trait\'s own edge, or adding a ring around',
    '   it - not two settings on one thing, which is why it reads as a switch',
    '   rather than a direction. */',
    'function olInward(){ const b=$("olinward"); return !b||b.checked; }',
    '/* WHICH SIDES COUNT AS OUTSIDE, as offsets. Above, left and right by',
    '   default: a trait that runs off the bottom of the frame has no silhouette',
    '   there, and outlining the cut draws a line across the character. */',
    'function olSides(){',
    '  const v=$("olsides")?$("olsides").value:"new";',
    '  return v==="all" ? [[0,-1],[1,0],[-1,0],[0,1]] : [[0,-1],[1,0],[-1,0]];',
    '}',
  ]);
}

/* ---- the band, taken out of the trait rather than added to it ------ */
{
  const r = kit.inFunction(L, 'function outlinePlan(){');
  const at = kit.only(L, l => l === '  const grown=dilateB(filled,bw,bh,t);', 'where the ring is grown', r);
  kit.replace(L, { start: at, end: at - 1 }, [
    '  /* THE TRAIT\'S OWN OUTER CELLS, and how far in each one sits.',
    '',
    '     Depth is measured by walking OUT from a cell in each chosen direction',
    '     until the silhouette ends, and taking the shortest of those walks. So',
    '     depth 1 is a cell with empty space immediately above, left or right of',
    '     it, depth 2 is the cell behind that one, and the band is everything up',
    '     to the thickness. Capped at t+1 steps because nothing deeper is used,',
    '     which is what keeps this cheap on a 160-cell grid. */',
    '  if(olInward()){',
    '    const dirs=olSides();',
    '    const inB=new Uint8Array(bw*bh);',
    '    for(let by=0;by<bh;by++) for(let bx=0;bx<bw;bx++){',
    '      const p=by*bw+bx;',
    '      if(!filled[p]) continue;',
    '      let best=t+1;',
    '      for(const [dx,dy] of dirs){',
    '        let n=1, x=bx+dx, y=by+dy;',
    '        while(n<=t){',
    '          if(x<0||y<0||x>=bw||y>=bh||!filled[y*bw+x]) break;',
    '          n++; x+=dx; y+=dy;',
    '        }',
    '        if(n<best) best=n;',
    '      }',
    '      if(best<=t) inB[p]=best;',
    '    }',
    '    const band=new Uint8Array(W*H), dep=new Uint8Array(W*H);',
    '    for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
    '      const k=inB[((y/B)|0)*bw+((x/B)|0)];',
    '      if(!k) continue;',
    '      const p=y*W+x;',
    '      /* ONLY WHERE THERE IS ART. The block grid is coarser than the',
    '         pixels, so an edge block covers empty pixels too, and colouring',
    '         those would grow the trait - which is the thing this exists not',
    '         to do. */',
    '      if(d[p*4+3]<128) continue;',
    '      band[p]=1; dep[p]=k;',
    '    }',
    '    let bn=0; for(let p=0;p<NP;p++) if(band[p]) bn++;',
    '    return {ring:band,depth:dep,n:bn,holes:null,hcol:null,hn:0,',
    '      W:W,H:H,B:B,t:t,src:d,inward:true};',
    '  }',
  ]);
}

/* ---- the outermost ring, which the two orders disagree about ------- */
{
  const r = kit.inFunction(L, 'function outlinePreview(){');
  const at = kit.only(L, l => l === '    const col=String(olColourFor(t||1,list)||"#000000").toLowerCase();',
    'the warning colour', r);
  kit.replace(L, { start: at, end: at }, [
    '    /* OUTERMOST, and the two operations count in opposite directions:',
    '       adding a ring puts colour 1 against the art and colour t furthest',
    '       out, while changing the trait\'s own edge makes colour 1 the outer',
    '       pixel. The border rule replaces whichever one is on the outside. */',
    '    const col=String(olColourFor(olInward()?1:(t||1),list)||"#000000").toLowerCase();',
  ]);
}

/* ---- and the panel says which it will do --------------------------- */
{
  const r = kit.inFunction(L, 'function olSaid(){');
  const at = kit.only(L, l => l === '  const per=[];', 'where the rings are listed', r);
  kit.replace(L, { start: at, end: at }, [
    '  const per=[];',
    '  /* Written outside-in when that is the order the colours land in, so the',
    '     line reads the way the picture will look from the edge inwards. */',
  ]);
  const btn = kit.only(L, l => l === '$(\'oladd\').onclick=applyOutline;', 'the add button');
  kit.replace(L, { start: btn, end: btn }, [
    '$(\'oladd\').onclick=applyOutline;',
    '/* The button says which of the two it is about to do, and the readout',
    '   follows the switch as well as the thickness. */',
    '$("olinward").addEventListener("change",()=>{ olBtnText(); outlinePreview(); });',
    '$("olsides").addEventListener("change",outlinePreview);',
    'function olBtnText(){',
    '  const b=$("oladd"); if(!b) return;',
    '  b.dataset.verb = olInward() ? "Change outer pixels" : "Add outline";',
    '}',
    'olBtnText();',
  ]);
  /* The label the preview writes has to use that verb rather than one word. */
  const r2 = kit.inFunction(L, 'function outlinePreview(){');
  const lab = kit.only(L, l => l.indexOf('      $("oladd").textContent = (plan.n||plan.hn)') === 0,
    'the button label', r2);
  if (L[lab + 1].indexOf('? "Add outline ("') < 0)
    throw new Error('the button label is not shaped the way this expects');
  kit.replace(L, { start: lab, end: lab + 2 }, [
    '      const verb=$("oladd").dataset.verb||"Add outline";',
    '      $("oladd").textContent = (plan.n||plan.hn)',
    '        ? verb+" ("+plan.n.toLocaleString()+" cells"+(plan.hn?", patch "+plan.hn:"")+")"',
    '        : verb;',
  ]);
}

/* ---- and a new trait opens on the grid, not on a guess ------------- */
{
  /* SUPERSEDES "the grid guessed". That line exists so a block size chosen for
     the last picture does not carry into the next one, and it picked auto
     because auto was the only answer that did not come from somewhere else.
     The collection grid is a better answer for the same reason: derived from
     the project rather than from whatever was open before, and the same cell
     whatever size the trait is open at. */
  const at = kit.only(L, l => l === '  $("olsnap").value="auto";',
    'where a new trait resets the snap');
  kit.replace(L, { start: at, end: at }, [
    '  $("olsnap").value="grid";',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  for (const id of ['olinward', 'olsides'])
    if (text.indexOf('id="' + id + '"') < 0) throw new Error('there is no ' + id);
  if (!/<input type="checkbox" id="olinward" checked>/.test(text))
    throw new Error('changing the trait own pixels is not the default, which is the ask');
  if (!/<option value="new" selected>above, left and right<\/option>/.test(text))
    throw new Error('the sides do not default to the three that were asked for');
  if (!/<option value="grid" selected>the collection grid<\/option>/.test(text))
    throw new Error('the thickness is not a grid cell by default');
  /* AND OPENING A TRAIT DOES NOT PUT IT BACK ON A GUESS. The markup default
     only holds until the first image resets it, which it does on every open. */
  if (/\$\("olsnap"\)\.value="auto";/.test(code))
    throw new Error('a new trait resets the snap to a guess, past the default');
  if (!/\$\("olsnap"\)\.value="grid";/.test(code))
    throw new Error('a new trait does not open on the collection grid');

  /* THE GRID CELL IS DERIVED, not typed. */
  const gc = kit.inFunction(codeLines, 'function gridCellPx(){');
  const gb = codeLines.slice(gc.start, gc.end + 1).join('\n');
  if (!/projectGrid/.test(gb) || !/art\.width/.test(gb))
    throw new Error('the cell size is not the canvas over the project grid');

  /* NOTHING IS ADDED. The inward band must come out of the silhouette and
     must never colour a transparent pixel - that is the whole ask. */
  const plan = kit.inFunction(codeLines, 'function outlinePlan(){');
  const pb = codeLines.slice(plan.start, plan.end + 1).join('\n');
  const inward = pb.slice(pb.indexOf('if(olInward()){'), pb.indexOf('inward:true};'));
  if (!inward) throw new Error('there is no inward band');
  if (/dilateB/.test(inward))
    throw new Error('the inward band grows the silhouette, which is what it exists not to do');
  if (!/if\(d\[p\*4\+3\]<128\) continue;/.test(inward))
    throw new Error('the inward band can colour a transparent pixel, which adds to the trait');
  /* The three sides are the default and the fourth is reachable. */
  const sd = kit.inFunction(codeLines, 'function olSides(){');
  const sb = codeLines.slice(sd.start, sd.end + 1).join('\n');
  if (!/\[\[0,-1\],\[1,0\],\[-1,0\],\[0,1\]\]/.test(sb) || !/\[\[0,-1\],\[1,0\],\[-1,0\]\]/.test(sb))
    throw new Error('the sides are not the two sets this offers');

  /* The old operation still exists, unticked. */
  if (!/const grown=dilateB\(filled,bw,bh,t\);/.test(pb))
    throw new Error('adding a ring outside is gone rather than unticked');

  /* THE OUTERMOST RING IS THE ONE THE BORDER RULE REPLACES, and the two
     operations count in opposite directions. */
  const pv = kit.inFunction(codeLines, 'function outlinePreview(){');
  if (!/olColourFor\(olInward\(\)\?1:\(t\|\|1\),list\)/
    .test(codeLines.slice(pv.start, pv.end + 1).join('\n')))
    throw new Error('the warning names the wrong end of the band');
  /* And the button says which operation it is. */
  if (!/b\.dataset\.verb = olInward\(\) \? "Change outer pixels" : "Add outline";/.test(code))
    throw new Error('the button does not say which of the two it will do');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
