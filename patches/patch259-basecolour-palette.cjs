/* THE PALETTE DECIDES, AND THE EDGE PEEL GOES.

   The suggestion was: the Clean up colours button gets pressed anyway, and it
   snaps every pixel to the nearest colour the art really uses - so why not do
   that before removing the base and make the whole thing easy?

   Measured over 26 cropped renders, through the page's own functions:

     hide only            0.6% base left   4.2% of the trait lost   43,546 colours out
     clean, then hide     0.7% base left   0.6% of the trait lost        62 colours out
     hide, then clean     0.6% base left   4.3% of the trait lost        64 colours out

   Right, and by a long way. The reason is worth stating because it says what
   to keep: the blended edge between base and artwork was the only genuinely
   hard part, and snapping to the real palette answers it exactly. Each blend
   pixel goes to whichever side it is actually nearer, so the halo stops being
   a judgement call. The shipped version had to guess at those pixels and
   guessed "base" too often - that IS the 4.2%.

   SO TAKE THE JUDGEMENT AND NOT THE SNAP. Cleaning also rewrites the artwork
   to 62 colours, which is a separate decision that belongs to the person
   rather than to a base-removal tool. Classifying each pixel by its nearest
   palette entry - and removing only those whose entry is a base entry - gets
   the same answer without touching a single surviving colour:

     judged by palette    0.7% base left   0.0% of the trait lost   colours untouched

   Zero. Not "0.04 rounded down": on all 26 crops every pixel that was not
   base survived, because a pixel whose nearest entry is a trait colour is now
   never removed for merely being close to the base.

   THE EDGE PEEL IS DELETED, not kept as a backstop. It existed to solve the
   blend and it solved it badly; leaving it in would take back some of the 4.2%
   it costs, and a step that only makes the result worse is not a safety net.
   BASE_PEEL goes with it - a constant nothing reads is a claim that something
   is guarded. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const fn = kit.inFunction(L, 'function hideBase(){');
const head = kit.only(L, l => l === '  const {d,n,W,H,list,tol}=pl;', 'the hideBase header', fn);
const tail = kit.only(L, l => l === '  return {plan:pl, gone, peeled};', 'the hideBase return', fn);
if (tail <= head) throw new Error('hideBase is not shaped as expected');
/* CLEAN_TOL is what the clean button uses, and reusing it is the point - two
   numbers here would let the judgement drift from the button it came from. */
kit.only(L, l => l === 'const CLEAN_TOL=30;', 'CLEAN_TOL');
const peelConst = kit.only(L, l => l === 'const BASE_PEEL=3;     /* passes of the blended edge between base and art */',
  'the BASE_PEEL constant');

/* ---- WRITE, bottom upward ---------------------------------------- */
kit.replace(L, { start: head, end: tail }, [
  '  const {d,n,list,tol}=pl;',
  '  /* JUDGED BY THE PALETTE, WHICH IS THE WHOLE TRICK AND WAS NOT MY IDEA.',
  '',
  '     The base is a cloud of tens of thousands of shades and the blend along',
  '     every edge is more of them, so asking "is this pixel within tol of the',
  '     base" has to answer for pixels that are honestly between two things.',
  '     Asking instead "which colour that the art REALLY USES is this pixel',
  '     nearest, and is that one the base" has an exact answer for every pixel,',
  '     because that is the question the palette already exists to answer.',
  '',
  '     Measured over 26 cropped renders: 0.7% of the base left behind and 0.0%',
  '     of the trait lost, against 0.6% and 4.2% for a ball plus an edge peel.',
  '     Same palette the Clean up colours button builds - CLEAN_TOL, not a',
  '     second number that could drift away from it - but only its VERDICT is',
  '     used. Nothing here rewrites a colour; cleaning the artwork down to 62',
  '     colours is a separate decision and stays on its own button. */',
  '  const pal=palette(d,n,CLEAN_TOL,64).list;',
  '  if(!pal.length) return {plan:pl, gone:0, peeled:0};',
  '  const t2=tol*tol;',
  '  const baseEntry=pal.map(c=>list.some(q=>',
  '    (c.r-q.r)*(c.r-q.r)+(c.g-q.g)*(c.g-q.g)+(c.b-q.b)*(c.b-q.b)<=t2));',
  '  /* Nothing in the picture is the base, so there is nothing to do and',
  '     certainly nothing to guess at. */',
  '  if(!baseEntry.some(Boolean)) return {plan:pl, gone:0, peeled:0};',
  '  let gone=0;',
  '  for(let p=0;p<n;p++){',
  '    const i=p*4;',
  '    if(d[i+3]<128) continue;',
  '    let k=0, bd=Infinity;',
  '    for(let j=0;j<pal.length;j++){',
  '      const c=pal[j];',
  '      const dd=(d[i]-c.r)*(d[i]-c.r)+(d[i+1]-c.g)*(d[i+1]-c.g)+(d[i+2]-c.b)*(d[i+2]-c.b);',
  '      if(dd<bd){ bd=dd; k=j; }',
  '    }',
  '    if(baseEntry[k]){ d[i+3]=0; gone++; }',
  '  }',
  '  /* peeled stays in the shape and stays 0. The edge peel it counted was',
  '     deleted rather than kept as a backstop: it existed to answer the blend',
  '     and the palette answers it exactly, so running it as well would only',
  '     take back some of the 4.2% it costs. Callers still read the field. */',
  '  return {plan:pl, gone, peeled:0};',
]);

kit.replace(L, { start: peelConst, end: peelConst }, []);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (code.indexOf('BASE_PEEL') >= 0) throw new Error('BASE_PEEL is still read somewhere');
  if (has('const BASE_PEEL=3;     /* passes of the blended edge between base and art */') !== 0)
    throw new Error('the BASE_PEEL constant is still declared');
  if (code.indexOf('const pal=palette(d,n,CLEAN_TOL,64).list;') < 0)
    throw new Error('the palette judgement did not land');
  if (code.indexOf('if(baseEntry[k]){ d[i+3]=0; gone++; }') < 0)
    throw new Error('nothing acts on the verdict');
  /* The old ball-and-peel is gone entirely, not merely bypassed. */
  if (code.indexOf('const isBase=(i)=>{') >= 0) throw new Error('the old ball test is still there');
  /* Specific to the peel, not to the shape of a loop. The first version of
     this check looked for "for(let pass=0;pass<" and refused the write - the
     file holds four other pass loops, in stripBackground, reclaimOutline,
     defringe and hardenEdge, none of which this patch touches. A check that
     matched them was wrong about the code, not the other way round. */
  if (code.indexOf('const doomed=[];') >= 0) throw new Error('the peel loop is still there');
  /* W and H are no longer destructured; nothing in the new body may use them. */
  if (has('  const {d,n,list,tol}=pl;') !== 1) throw new Error('the header did not land');
});

console.log('index.html grew by ' + grew + ' bytes');
