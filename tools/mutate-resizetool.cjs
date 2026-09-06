/* PREDICTIONS for tests/resizetool.spec.js - "Resize sits below Move, and the
   panel keeps up with the drag".

   Declared here, BEFORE the run.

   Six tests, and two of them are about something NOT happening - a drag that
   costs one undo step rather than twenty, and a stray click that costs none.
   A test that counts to zero is the easiest kind to write wrong, so the two
   mutants that matter most here are the ones that make the count go UP, and
   the one that proves the guard producing that zero has not simply turned undo
   off for everybody.
*/
/* WHAT HAPPENED, added after the run: all seven reddened exactly the tests
   predicted and nothing else, first time. The two worth naming are the pair
   around the guard - `if(false) return;` reds only the stray-click test and
   `if(true) return;` reds only the pencil control - because that is what says
   the zero one of them counts is a real zero rather than undo being off. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/resizetool.spec.js',
  ntests: 6,
  mutants: [
    {
      /* The rail order this change was asked for, put back the way it was:
         pencil, eraser, fill, move, PICK, transform - so the thing directly
         below Move is the eyedropper. */
      name: 'the rail goes back to Move, Pick, Transform',
      find: `    <button class="tool" data-tool="transform" aria-pressed="false" title="Resize and rotate by dragging the box on the art (R)"><svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/></svg><span class="k">R</span></button>
    <button class="tool" data-tool="pick" aria-pressed="false" title="Eyedropper (I)"><svg viewBox="0 0 24 24"><path d="m4 20 1-4 9-9 3 3-9 9-4 1Z"/><path d="m15 5 2-2a2 2 0 0 1 3 3l-2 2"/></svg><span class="k">I</span></button>`,
      with: `    <button class="tool" data-tool="pick" aria-pressed="false" title="Eyedropper (I)"><svg viewBox="0 0 24 24"><path d="m4 20 1-4 9-9 3 3-9 9-4 1Z"/><path d="m15 5 2-2a2 2 0 0 1 3 3l-2 2"/></svg><span class="k">I</span></button>
    <button class="tool" data-tool="transform" aria-pressed="false" title="Resize and rotate by dragging the box on the art (R)"><svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/></svg><span class="k">R</span></button>`,
      kills: ['sits directly below Move in the rail'],
      /* And NOTHING else. Both buttons still exist, the key still works, the
         badge still reads R, and the tool behaves the same wherever it sits -
         which is the point: the rail order is a separate claim from the tool
         working, and only one test should be measuring it. */
    },
    {
      /* Half of "it has a key like every other tool": the badge on the button
         is what tells somebody the key EXISTS without opening the help. */
      name: 'the button loses its R badge but keeps the key',
      find: `</svg><span class="k">R</span></button>`,
      with: `</svg></button>`,
      kills: ['and has a key, like every other tool'],
    },
    {
      /* The other half: the key is in the table but points somewhere else.
         Together these two say that test asserts the badge AND the behaviour
         rather than either one twice. */
      name: 'R is in the shortcuts table but selects the wrong tool',
      find: `  {show:'R', desc:'Resize and rotate', keys:['r'], run:()=>selectTool('transform')},`,
      with: `  {show:'R', desc:'Resize and rotate', keys:['r'], run:()=>selectTool('move')},`,
      kills: ['and has a key, like every other tool'],
    },
    {
      /* The staleness that was reported: the fields read the old size until
         the pointer came up. */
      name: 'the Size fields stop following the drag',
      find: `      $("rsw").value=Math.max(1,Math.round(w/z));
      $("rsh").value=Math.max(1,Math.round(h/z));`,
      with: `      ;`,
      kills: ['the Size fields count with the drag'],
      /* NOT the undo-step test and NOT the commit: the drag still resizes the
         canvas to 16x16 at pointerup, which is exactly why this was invisible
         to every test that only looked at the result. */
    },
    {
      /* THE REGRESSION THE SPEC EXISTS TO STOP - somebody making the drag
         "properly live" by writing pixels per frame. snapshot() pushes a full
         getImageData; twenty frames is twenty steps, and on a real canvas it
         evicts the user's earlier edits inside a second. */
      name: 'the drag snapshots on every frame',
      find: `  const live=(w,h)=>{ art.style.width=w+"px"; art.style.height=h+"px";`,
      with: `  const live=(w,h)=>{ snapshot(); art.style.width=w+"px"; art.style.height=h+"px";`,
      kills: ['but the pixels are still only written once, at the end'],
      /* NOT the Size-fields test: the fields still count with the drag, and
         the canvas still commits 16x16. The two tests use nearly the same
         twenty-frame gesture and this is what separates them. */
    },
    {
      /* The pre-existing leak, restored: every transform click that missed a
         handle fell through to snapshot() and left an undo step that did
         nothing when used. */
      name: 'a stray click on the canvas costs an undo step again',
      find: `  if(tool==="transform") return;`,
      with: `  if(false) return;`,
      kills: ['and a click that misses a handle costs nothing'],
      /* NOT the pencil control - the guard never applied to it. */
    },
    {
      /* THE ONE THAT PROVES THE CONTROL IS A CONTROL. A guard that skipped the
         snapshot for every tool would pass the stray-click test perfectly and
         quietly take undo away from drawing. */
      name: 'the guard swallows the snapshot for every tool, not just transform',
      find: `  if(tool==="transform") return;
  snapshot();`,
      with: `  if(true) return;
  snapshot();`,
      kills: ['the pencil still snapshots, which is what that guard must not break'],
      /* And the stray-click test MUST SURVIVE this, because zero is still
         zero. If it moved, the two tests would not be a pair. */
    },
  ],
});
process.exit(bad ? 1 : 0);
