/* THE PHONE: THE ART OPENS AT A QUARTER OF THE SIZE IT COULD, AND THE BOTTOM
   BAR SPENDS A WHOLE ROW ON THINGS A FINGER CANNOT USE.

   "mobile editing is impossible with how small the grid is, it should be as
   big as it can possibly be to fit squarely onto the screen ... also i really
   think the bottom bar is too full and cluttered still"

   Measured at 375x812 with a 160-cell trait open:

     header    62px
     tools    107px   two rows of eleven buttons
     stage    347px   and the canvas inside it is 160x160
     footer    82px   TWO rows
     side     214px

   The canvas was 8% of the screen. It should be 320x320, and the reason it was
   not is timing, not arithmetic: fitZoom runs inside startEditor, before the
   panel has settled to its height, so it measures a stage that is still
   growing and floors to 1x. Pixel art scales in whole steps, so being one step
   out is the difference between 160 and 320 - a quarter of the area. Calling
   it again once the layout has settled is the whole fix, and it explains why
   this was easy to miss: OPENING A SECOND IMAGE ALREADY WORKED, because by
   then the stage was the size it was going to be.

   THE BOTTOM BAR. Its first row is "Cell -", "Under -" and "Brush 1x1". The
   first two are readouts of what is under the POINTER, and a phone has no
   pointer to hover with - they say "-" until a finger is on the glass and are
   hidden underneath it when one is. The zoom row also carries Move, and Move
   is $('zpan').onclick=()=>{ $('panbtn').click(); ... } - it presses the pan
   button that is already in the tool rail three rows above it.

   Dropping those three puts Brush and the zoom controls on ONE row: 49 + 44 +
   40 + 44 + 47 and the gaps, against 375 of screen. The bar halves and the 42px
   goes to the art.

   AND THE SHEET SWIPES FROM ANYWHERE. It already dragged, but only by the 34px
   handle, which is a small target to find and nothing about it says a swipe is
   what it wants. A drag downward anywhere on the panel now closes it, as long
   as the panel is scrolled to its top - which is the one moment a downward
   drag cannot have meant "scroll up", so it costs the scrolling nothing. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const fold = kit.only(L, l => l === '  foldDefaults();', 'the end of startEditor');
const foot = kit.only(L, l => l === '  footer{gap:11px; padding:7px 14px; flex-wrap:wrap;} .hint{display:none;}',
  'the phone footer rule');
const gripUp = kit.only(L, l => l === '  grip.addEventListener("pointercancel",()=>{ y0=null; });', 'the grip drag');
/* The three the footer loses, by id, so a rename refuses this rather than
   hiding nothing and looking like it worked. */
for (const id of ['id="pos"', 'id="under"', 'id="zpan"'])
  if (!L.some(l => l.indexOf(id) >= 0)) throw new Error('no element with ' + id);
kit.only(L, l => l === 'function sideDown(on,remember){' || l.indexOf('function sideDown(') === 0, 'sideDown');

/* ---- WRITE, bottom upward ---------------------------------------- */

/* 3. A swipe anywhere on the sheet, not only on the handle. */
kit.replace(L, { start: gripUp, end: gripUp }, [
  '  grip.addEventListener("pointercancel",()=>{ y0=null; });',
  '  /* AND FROM ANYWHERE ON THE SHEET. The handle worked and is 34px tall in a',
  '     panel of several hundred, so the gesture was there and nothing pointed',
  '     at it.',
  '',
  '     Only while the panel is scrolled to its top. That is the one moment a',
  '     downward drag cannot also have meant "scroll up", so this costs the',
  '     scrolling nothing - and the guard is what keeps it from fighting the',
  '     content, which is the usual way a sheet like this goes wrong.',
  '',
  '     Not on a control: a drag that starts on a button is somebody pressing',
  '     the button and moving their thumb a little. */',
  '  let sy=null, sfrom=0;',
  '  side.addEventListener("pointerdown",e=>{',
  '    if(e.target.closest("button,input,select,textarea,label,.sw,.grip")) return;',
  '    sy=e.clientY; sfrom=side.scrollTop;',
  '  },{passive:true});',
  '  side.addEventListener("pointermove",e=>{',
  '    if(sy===null || isDown()) return;',
  '    if(sfrom>0 || side.scrollTop>0){ sy=null; return; }',
  '    if(e.clientY-sy>48){ sideDown(true); sy=null; }',
  '  },{passive:true});',
  '  side.addEventListener("pointerup",()=>{ sy=null; },{passive:true});',
  '  side.addEventListener("pointercancel",()=>{ sy=null; },{passive:true});',
]);

/* 2. The bottom bar. */
kit.replace(L, { start: foot, end: foot }, [
  '  footer{gap:11px; padding:7px 14px; flex-wrap:wrap;} .hint{display:none;}',
  '  /* ONE ROW, not two. #pos and #under read out the cell under the POINTER,',
  '     and a phone has none to hover with: they say "-" until a finger is on',
  '     the glass and are underneath it when one is. #zpan is Move, and its',
  '     handler is literally $("panbtn").click() - the same pan button already',
  '     in the tool rail. Measured: the bar was 82px over two rows and the three',
  '     of them were the whole reason for the second. */',
  '  #pos,#under,#zpan{display:none;}',
]);

/* 1. The zoom, once the layout has settled. */
kit.replace(L, { start: fold, end: fold }, [
  '  foldDefaults();',
  '  /* AND FIT AGAIN, ONCE THE LAYOUT HAS SETTLED. fitZoom above runs while the',
  '     panel is still finding its height, so on a phone it measured a stage',
  '     that was still growing and floored to 1x - and pixel art scales in whole',
  '     steps, so one step out is a quarter of the area. Measured at 375x812: a',
  '     160-cell trait opened at 160px in a stage that could hold 320.',
  '',
  '     Two frames: one for the layout to happen, one to measure it. Idempotent,',
  '     so on a screen that was already right this changes nothing - which is',
  '     why opening a SECOND image always looked fine and this went unnoticed. */',
  '  requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(ctx) fitZoom(); }));',
]);

const grew = kit.save(doc, ({ lines, text, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('  #pos,#under,#zpan{display:none;}') !== 1) throw new Error('the footer rule did not land');
  if (code.indexOf('requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(ctx) fitZoom(); }));') < 0)
    throw new Error('the deferred fit did not land');
  if (code.indexOf('if(e.clientY-sy>48){ sideDown(true); sy=null; }') < 0)
    throw new Error('the sheet swipe did not land');
  /* The guard that stops the swipe fighting the panel's own scrolling is CODE,
     not a promise in the comment above it. */
  if (code.indexOf('if(sfrom>0 || side.scrollTop>0){ sy=null; return; }') < 0)
    throw new Error('the scroll guard did not land');
  /* The three hidden elements still EXIST - this hides them on a phone, it
     does not delete controls the desktop uses. */
  for (const id of ['id="pos"', 'id="under"', 'id="zpan"'])
    if (text.indexOf(id) < 0) throw new Error(id + ' was removed rather than hidden');
});

console.log('index.html grew by ' + grew + ' bytes');
