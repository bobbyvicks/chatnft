/* Can these six tests fail? PREDICTIONS, written before the run.

   This changes a DELIBERATE rule, so the mutants are aimed at the two ways of
   getting that wrong in opposite directions: going back to framing everything,
   and going too far by never outlining at the canvas edge at all. The second
   is the dangerous one - it would silently take the outline off the 94 real
   traits whose art genuinely runs off a side, and the background test cannot
   see it.

   The per-edge mutants matter for the same reason: a rule that asked "does the
   art touch the frame anywhere" instead of "is THIS edge filled" passes the
   background case and quietly drops the outline down the sides of a trait that
   bleeds off the top.
*/
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/blackedge.spec.js',
  ntests: 6,
  mutants: [
    /* Straight back to the old rule: off canvas is always empty. */
    { name: 'off-canvas counts as empty again, so a background is framed',
      find: '        const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT)&&(yy<H||fullB);',
      with: '        const covered=false;',
      /* CORRECTED AFTER THE FIRST RUN: predicted one red, got two. The
         one-filled-edge fixture bleeds off the top, so restoring the old
         rule frames it there too. Two tests defend this line, not one. */
      kills: ['A BACKGROUND THAT FILLS THE CANVAS GETS NO FRAME',
        'ONE FILLED EDGE DOES NOT EXCUSE THE OTHER THREE'] },

    /* Too far the other way: nothing at the canvas edge is ever an art edge. */
    { name: 'the canvas edge is never an edge of the art',
      find: '        const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT)&&(yy<H||fullB);',
      with: '        const covered=true;',
      kills: ['CROPPED AT THE FRAME KEEPS ITS OUTLINE',
        'ONE FILLED EDGE DOES NOT EXCUSE THE OTHER THREE'] },

    /* Per edge, not per canvas: any filled edge excuses all of them. */
    { name: 'one filled edge excuses every side',
      find: '        const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT)&&(yy<H||fullB);',
      with: '        const covered=fullT||fullB||fullL||fullR;',
      kills: ['ONE FILLED EDGE DOES NOT EXCUSE THE OTHER THREE'] },

    /* An edge measured wrong: the left column read as always filled. */
    { name: 'the left edge is assumed filled rather than measured',
      find: '  for(let y=0;y<H;y++){ if(!m[y*W]) fullL=false; if(!m[y*W+W-1]) fullR=false; }',
      with: '  for(let y=0;y<H;y++){ if(!m[y*W+W-1]) fullR=false; }',
      kills: ['ONE FILLED EDGE DOES NOT EXCUSE THE OTHER THREE'] },

    /* The rule that was already there, which none of this should touch. */
    { name: 'an empty neighbour on canvas no longer makes an edge',
      find: '      if(!m[yy*W+xx]){ empty=true; break; }',
      with: '      if(false){ empty=true; break; }',
      /* CORRECTED AFTER THE FIRST RUN: the cropped-trait test SURVIVES this,
         and should. Its art sits at x=10..29 with clear canvas either side,
         so every outline in it comes from running off the top - the
         off-canvas half of the rule. The on-canvas half is what the
         shape-in-the-middle test is for. */
      kills: ['a shape in the middle is outlined exactly as before',
        'ONE FILLED EDGE DOES NOT EXCUSE THE OTHER THREE',
        'AND THE CORNER'] },
  ],
}));
