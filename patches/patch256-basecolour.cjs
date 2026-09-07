/* TWO DEFECTS THE RUN OVER THE REAL FILES FOUND, BOTH IN patch254/255.

   ONE: A REMEMBERED BASE LEFT UP TO 92.4% OF THE BASE BEHIND - on the exact
   case the memory was added for. The cause is that no two renders share a
   base value: the sixteen on disk run #E6037C, #E90382, #EB0370, #EF0275 and
   so on, because whatever produces them re-encodes the colour every time. So
   the remembered pink sits about 11 from the pink in the picture in front of
   it - inside BASE_BALL, so the base IS recognised as present - but the
   tolerance is then derived by asking how far the nearest OTHER colour is,
   and the nearest other colour is the picture's own base cloud, 12 to 24
   away. The gap came out at about 12, the tolerance with it, and nine tenths
   of the base survived while the code reported success.

   The memory has to say WHICH colour, not WHERE exactly. So a remembered
   colour is now re-centred on the picture's own dominant shade near it before
   anything is measured from it, and every number downstream is then about a
   colour that is really there.

   TWO: IT WOULD HAVE CLEARED TWELVE FINISHED TRAITS BY ITSELF, taking 19.2%
   of backgrounds/I Heart Boobies.png, 5.6% of Rainbow Spiral, 4.6% of Rainbow
   Road. Those are pictures that genuinely contain the base pink, and BASE_AUTO
   _MAX could not tell them apart from a crop leftover because there is nothing
   to tell apart - 19% is a completely plausible amount of fringe.

   I cannot separate those two populations by amount and I am not going to
   pretend otherwise, so the automatic clear now happens ONLY for a render,
   where the 94.5%-against-79.1% separation is real and measured. A picture
   that merely contains the remembered colours gets the button, which is one
   click instead of the manual erasing, and which now prints the share it
   would take so the number is visible before it happens rather than after.

   BASE_AUTO_MAX is deleted rather than left unused. A constant nothing reads
   is a claim that something is guarded. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const planAt = kit.inFunction(L, 'function basePlan(){');
const keepAt = kit.only(L, l => l === '  if(BASE_KEEP.length){', 'the remembered branch', planAt);
if (L[keepAt + 1] !== '    const here=[];') throw new Error('the remembered branch is not shaped as expected');
const hereEnd = kit.only(L, l => l === '      if(hit) here.push({r:q.r,g:q.g,b:q.b,n:hit});', 'the remembered push', planAt);
const autoGate = kit.only(L, l => l === '  if(bp && bp.source!=="guess"', 'the auto-clear gate');
if (L[autoGate + 1] !== '     && (bp.source==="render" || bp.cover<=BASE_AUTO_MAX)){')
  throw new Error('the auto-clear gate is not the two lines assumed');
const maxConst = kit.only(L, l => l === 'const BASE_AUTO_MAX=40;', 'the BASE_AUTO_MAX constant');
const labelPick = kit.only(L, l => l === "  b.textContent = pl.source===\"render\"", 'the label branch');

/* ---- WRITE, STRICTLY DESCENDING BY LINE. Ascending was the bug: the auto

   gate sits at line ~4475 and rewriting it first moved every anchor below it

   by six, so the deletion missed and the check refused the write. */

/* 3. The label prints the share whatever the source, because that number is
      the only thing standing between a press and a ruined background. */
kit.replace(L, { start: labelPick, end: labelPick + 2 }, [
  '  /* The share is printed for BOTH sources. It used to be shown only for a',
  '     render, where it is least needed - a render is 95% base and obviously',
  '     so. On a remembered base it is the whole safeguard: measured over the',
  '     264 approved traits, pressing this on backgrounds/I Heart Boobies.png',
  '     takes 19.2% of it, and the only thing that can stop that is the number',
  '     being on the button beforehand. */',
  '  b.textContent="Hide the base colour ("+names+", "+Math.round(pl.cover)+"%)";',
]);

/* 1a. Re-centre a remembered colour on what is actually in the picture. */
kit.replace(L, { start: keepAt, end: hereEnd + 1 }, [
  '  if(BASE_KEEP.length){',
  '    /* RE-CENTRED, and this is the fix for the defect that mattered. No two',
  '       renders share a base value - the sixteen on disk run #E6037C, #E90382,',
  '       #EB0370, #EF0275 - so a remembered pink lands about 11 from the pink in',
  '       front of it. That is near enough to RECOGNISE and much too far to',
  '       MEASURE from: the tolerance below asks how far the nearest other colour',
  '       is, and the nearest other colour was this picture\'s own base cloud, 12',
  '       to 24 away. Tolerance 12, and 92% of the base survived.',
  '',
  '       So the remembered colour says which colour, and the picture says where',
  '       it is. Everything downstream then measures from a shade that is really',
  '       in front of it. */',
  '    const here=[];',
  '    for(const q of BASE_KEEP){',
  '      let seed=null, most=0, hit=0;',
  '      for(const c of pal){',
  '        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2>BASE_BALL*BASE_BALL) continue;',
  '        hit+=c.n;',
  '        if(c.n>most){ most=c.n; seed=c; }',
  '      }',
  '      if(!seed) continue;',
  '      /* Counted again around the seed, because the ball that matters is the',
  '         one centred on the picture, not the one centred on the memory. */',
  '      let n=0;',
  '      for(const c of pal){',
  '        if((c.r-seed.r)**2+(c.g-seed.g)**2+(c.b-seed.b)**2<=BASE_BALL*BASE_BALL) n+=c.n;',
  '      }',
  '      here.push({r:seed.r,g:seed.g,b:seed.b,n});',
  '    }',
]);

/* 1b. The dead constant goes with the branch that read it. */
kit.replace(L, { start: maxConst - 5, end: maxConst }, []);

/* 2. The automatic clear, for renders only. */
kit.replace(L, { start: autoGate, end: autoGate + 1 }, [
  '  /* RENDERS ONLY, and this is a retreat from what patch255 did. A picture',
  '     that merely CONTAINS the remembered colours cannot be told apart from a',
  '     crop leftover by how much of it there is: measured over the 264 approved',
  '     traits, clearing on that footing took 19.2% of I Heart Boobies, 5.6% of',
  '     Rainbow Spiral and 4.6% of Rainbow Road, all of which are simply pink.',
  '     No threshold separates those from a fringe, so nothing here guesses -',
  '     they get the button, which says what it would take. */',
  '  if(bp && bp.source==="render"){',
]);









const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const BASE_AUTO_MAX=40;') !== 0) throw new Error('the dead constant is still declared');
  if (code.indexOf('BASE_AUTO_MAX') >= 0) throw new Error('something still reads BASE_AUTO_MAX');
  if (has('  if(bp && bp.source==="render"){') !== 1) throw new Error('the auto gate did not land');
  if (code.indexOf('here.push({r:seed.r,g:seed.g,b:seed.b,n})') < 0)
    throw new Error('the re-centring did not land');
  /* The old, wrong push is gone - not merely superseded further down. */
  if (has('      if(hit) here.push({r:q.r,g:q.g,b:q.b,n:hit});') !== 0)
    throw new Error('the un-recentred push is still there');
  if (has('  b.textContent="Hide the base colour ("+names+", "+Math.round(pl.cover)+"%)";') !== 1)
    throw new Error('the label did not land');
});

console.log('index.html grew by ' + grew + ' bytes');
