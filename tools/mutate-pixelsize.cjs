/* Can these nine tests fail? PREDICTIONS, written before the run.

   The warning is three branches and each can fail on its own, so it gets three
   mutants rather than one. Two of them are a pair: silence on a size that does
   not fit, and noise on one that does. A suite that only catches the first
   passes a panel that warns about 5 on 10px art, which is the clean case the
   whole tool is for.

   THE LAST MUTANT IS PREDICTED TO SURVIVE, and that is the point. The flat
   fast path in blockTop is a speed change with no behaviour in it, so turning
   it off must red nothing. The first time this ran it reddened three tests -
   the slow path was hard-coding flat:false, true only because the fast path
   always got there first. That is now fixed and this mutant is the proof.
*/
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/pixelsize.spec.js',
  ntests: 9,
  mutants: [
    /* The repair stops being undoable. Rewriting pixels across a whole canvas
       with no way back is the worst thing this could do. */
    { name: 'Tidy does not snapshot before it rewrites the canvas',
      /* Plain \n: the runner converts anchors to the file's own line ending,
         so a \r written here becomes a doubled one and matches nothing. */
      find: '  snapshot();\n  ctx.putImageData(im,0,0);',
      with: '  ctx.putImageData(im,0,0);',
      kills: ['ONE PRESS OF UNDO PUTS THE STRAYS BACK'] },

    /* A no-op that still lands in the history: undo then appears to do
       nothing, which is how somebody decides undo is broken. */
    { name: 'a tidy that changes nothing still pushes an undo step',
      find: '  if(!r.pixels){ toast("Every "+n+"px block was already one colour"); return; }',
      with: '  if(false){ toast("Every "+n+"px block was already one colour"); return; }',
      kills: ['does not land in the history'] },

    /* The cost stops being reported before the press. */
    { name: 'the report does not say what the repair would change',
      find: '    pixels+=n*n-b.n;',
      with: '    pixels+=0;',
      kills: ['WHAT THE REPAIR WOULD COST', '4 AND 8 ARE OFFERED'] },

    /* Silence everywhere: both warned cases go quiet. */
    { name: 'no size is ever warned about',
      find: '  el.title = (m<2||n===m) ? ""',
      with: '  el.title = (true) ? ""',
      kills: ['4 AND 8 ARE OFFERED', 'A COARSER SIZE IS WARNED ABOUT'] },

    /* Only the "does not divide" branch goes quiet. */
    { name: 'a size that does not divide the art says nothing',
      find: '      ? n+" does not divide the "+m+"px this art is drawn at, so tidying at "',
      with: '      ? ""+(0*n)+(0*m)+"" && "" || "" || ',
      kills: ['4 AND 8 ARE OFFERED'] },

    /* Only the coarser branch goes quiet - the one a real trait found. */
    { name: 'a coarser size says nothing',
      find: '      : (n>m',
      with: '      : (false',
      kills: ['A COARSER SIZE IS WARNED ABOUT'] },

    /* And the opposite: the finer case, which is safe, gets warned about. */
    { name: 'a finer size is warned about as well',
      find: '        : ""));',
      with: '        : "warned"));',
      kills: ['a FINER size says nothing of the sort'] },

    /* The measurement stops reaching the box: the row keeps the fallback it
       was built with before the art was measured. */
    { name: 'the measured block does not select itself',
      find: '  try{ buildPixelSizes(gridBlock); pixelSizeReport(); }catch(_){ }',
      with: '  try{ buildPixelSizes(); pixelSizeReport(); }catch(_){ }',
      kills: ['SAYS WHAT THE ART IS DRAWN AT', 'flattens exactly those blocks'] },

    /* PREDICTED TO SURVIVE. A speed change with no behaviour in it. */
    { name: 'the flat fast path is turned off (should change nothing)',
      find: '  if(same) return {flat:true, top:first, n:n*n};',
      with: '  if(false) return {flat:true, top:first, n:n*n};',
      kills: [] },
  ],
}));
