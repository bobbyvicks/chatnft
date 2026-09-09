/* Can these fifteen tests fail? PREDICTIONS, written before the run.

   Almost every mutant here removes a REFUSAL, because that is where this
   tool's value is. Finding small islands is easy; a port that quietly dropped
   "dark ink is an outline or lettering" would still find every island, still
   pass every test about finding things, and would offer to erase the black
   outline of every trait in the collection.

   So each refusal gets its own mutant, and the prediction says which single
   test defends it. Where a mutant is predicted to red TWO tests it is because
   two share a fixture, and saying so in advance is what makes the run mean
   something.
*/
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/pixelqa.spec.js',
  ntests: 15,
  mutants: [
    /* THE MOST DANGEROUS ONE. Every trait is outlined in black and several
       carry writing; without this a "clean up" would eat both. */
    { name: 'dark ink is offered as a repair',
      find: '    else if(Math.max(ink[0],ink[1],ink[2])<=32) f.reason="Dark ink: preserve outlines and writing";',
      with: '    else if(false) f.reason="Dark ink: preserve outlines and writing";',
      kills: ['DARK INK IS NEVER OFFERED', 'refuses a manual-only finding'] },

    /* Silhouette and partial alpha share one branch, so they share a mutant. */
    { name: 'the canvas edge and partial opacity stop being refusals',
      find: '    else if(edge||ink[3]!==255) f.reason="Silhouette, canvas edge or partial opacity";',
      with: '    else if(false) f.reason="Silhouette, canvas edge or partial opacity";',
      kills: ['nor is one at the canvas edge', 'nor one with partial opacity'] },

    { name: 'a deliberate diagonal stair is offered as a repair',
      find: '    else if(diagonal) f.reason="Diagonal-only structure";',
      with: '    else if(false) f.reason="Diagonal-only structure";',
      kills: ['nor a diagonal-only structure'] },

    { name: 'an elongated stroke is offered as a repair',
      find: '    else if(tail>1&&Math.max(r-l,b-t)>=2*Math.min(r-l,b-t)) f.reason="Elongated thin structure: manual review";',
      with: '    else if(false) f.reason="Elongated thin structure: manual review";',
      kills: ['nor an elongated run'] },

    { name: 'an island the boundary disagrees about is repaired anyway',
      find: '    else if(dominance<0.75) f.reason="Surrounding colours disagree";',
      with: '    else if(dominance<0) f.reason="Surrounding colours disagree";',
      kills: ['NOT WHERE THE SURROUNDING COLOURS DISAGREE'] },

    { name: 'a protected area is repaired like any other',
      find: '    if(f.protected) f.reason="Protected area or its boundary";',
      with: '    if(false) f.reason="Protected area or its boundary";',
      kills: ['protected box takes its island off the table'] },

    /* The two guards on the repair itself. */
    { name: 'a repair applies to a canvas that has moved since the scan',
      find: '    ||im.data.some((v,i)=>v!==report.source[i]))',
      with: '    ||false)',
      kills: ['REFUSES A CANVAS THAT HAS MOVED'] },

    { name: 'a manual-only finding applies when its id is handed in',
      find: '    if(!f.fixable||f.protected||!f.replacement) throw Error("Manual-only or protected finding");',
      with: '    if(false) throw Error("Manual-only or protected finding");',
      kills: ['refuses a manual-only finding'] },

    /* Four-way connectivity instead of eight: diagonal ink stops being one
       thing and becomes a row of allegedly isolated dots. */
    { name: 'connectivity drops to four neighbours',
      find: '      if((dx||dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h) fn(p+dy*w+dx,dx,dy);',
      with: '      if((!dx!==!dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h) fn(p+dy*w+dx,dx,dy);',
      /* CORRECTED AFTER THE FIRST RUN: predicted one red, got two, and the
         second is the more interesting. Connectivity is not only about what
         counts as one component - it is also the BOUNDARY the agreement vote
         is taken over. The island sitting on a colour seam has 5 of its 8
         neighbours agreeing, which is 62% and refused; with four neighbours it
         becomes 3 of 4, exactly 75%, and passes. The two rules are coupled and
         nothing in either one says so. */
      kills: ['nor a diagonal-only structure',
        'NOT WHERE THE SURROUNDING COLOURS DISAGREE'] },
  ],
}));
