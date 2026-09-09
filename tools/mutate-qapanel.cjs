/* Can these eleven tests fail? PREDICTIONS, written before the run.

   The panel's own risks are staleness and the undo step. The measurement is
   covered elsewhere and verified identical to the ChatNFT original; what can
   go wrong HERE is a list that goes on offering repairs after the canvas has
   moved, a repair that cannot be taken back, and a grid box that silently
   labels a 10px measurement as a 4px one.

   The two invalidation hooks are separate mutants on purpose. snapshot() sees
   every ordinary edit and restoreImage() sees undo, redo and reset; either one
   alone leaves half the routes uncovered, and only one test can tell them
   apart.
*/
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/pixelqapanel.spec.js',
  ntests: 11,
  mutants: [
    /* An edit no longer drops the report. */
    { name: 'an ordinary edit leaves the inspection standing',
      find: '  try{ if(QA) qaInvalidate("Canvas changed - scan again."); }catch(_){ }\n  undoStack.push(ctx.getImageData(0,0,art.width,art.height));',
      with: '  undoStack.push(ctx.getImageData(0,0,art.width,art.height));',
      kills: ['REPORT IS DROPPED THE MOMENT THE CANVAS MOVES'] },

    /* Undo no longer drops it - the route snapshot cannot see. */
    { name: 'undo leaves the inspection standing',
      find: '  /* Undo, redo and reset do not go through snapshot, and all three replace\n     the pixels a report was measured from. */\n  try{ if(QA) qaInvalidate("Canvas changed - scan again."); }catch(_){ }',
      with: '  /* Undo, redo and reset do not go through snapshot. */',
      kills: ['undo drops it too'] },

    /* The repair stops being undoable. */
    { name: 'applying repairs does not snapshot first',
      find: '  snapshot();\n  const put=new ImageData(out.data,out.width,out.height);',
      with: '  const put=new ImageData(out.data,out.width,out.height);',
      kills: ['ONE UNDO PUTS THEM BACK'] },

    /* The grid box stops offering what the art is drawn at. */
    { name: 'the grid box does not offer the measured size',
      find: '  const want=[...new Set([m,4,8,1])].filter(n=>n>=1&&n<=64).sort((a,b)=>a-b);',
      with: '  const want=[4,8,1].filter(n=>n>=1&&n<=64).sort((a,b)=>a-b);',
      /* CORRECTED AFTER THE FIRST RUN: predicted one red, got two, and the
         second says why this matters more than a label. With the measured size
         gone the box falls back to the smallest on the list, 1x1 native, where
         a cell IS one pixel and nothing can ever be mixed - so the mixed-cell
         count silently becomes zero on art that is full of them. The default
         grid is not a preference; it decides what the numbers mean. */
      kills: ['THE GRID OFFERS THE SIZE THE ART IS DRAWN AT',
        'the filter changes what is listed'] },

    /* Changing the grid keeps a report measured at the old one. */
    { name: 'changing the grid keeps the old report',
      find: "if($('qacell')) $('qacell').onchange=()=>qaInvalidate('Grid changed - scan again.');",
      with: "if($('qacell')) $('qacell').onchange=()=>{};",
      kills: ['changing the grid drops the report'] },

    /* Protection stops reaching the scan. */
    { name: 'protected boxes are not passed to the scan',
      find: '       protectedRects:QA_RECTS.map(r=>r.slice())});',
      with: '       protectedRects:[]});',
      kills: ['A PROTECTED BOX TAKES ITS FINDINGS OFF THE TABLE'] },

    /* A box that does not fit is accepted and breaks the next scan instead. */
    { name: 'a protected box is not checked against the canvas',
      find: '  if(w<1||h<1||x<0||y<0||r[2]>art.width||r[3]>art.height){',
      with: '  if(false){',
      kills: ['protected box that does not fit is refused by name'] },

    /* Select suggested stops respecting what the core refused. */
    { name: 'select suggested takes everything, not only the fixable',
      find: '  for(const f of qaVisible()) if(f.fixable) QA_SEL.add(f.id);',
      with: '  for(const f of qaVisible()) QA_SEL.add(f.id);',
      kills: ['SELECT SUGGESTED THEN APPLY REPAIRS THEM'] },
  ],
}));
