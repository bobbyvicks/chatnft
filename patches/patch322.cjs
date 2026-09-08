/* "EDITED" AND "UNSAVED" ARE NOT THE SAME THING.

   The draft guard asked `undoStack.length` - was this canvas edited since it
   was opened. That is the right question at the moment of opening and the
   wrong one afterwards, because saving does not empty the undo stack. So:

     open Alpha, paint, SAVE, open Beta

   flushed a fresh Alpha draft on the way out, stamped later than the record it
   had just been saved into, and re-opening Alpha announced unsaved changes
   that were saved a moment earlier. Its own test caught it.

   The stack depth at the last save is the baseline. Equal means the canvas is
   the record; different means it is not. startEditor empties the stack and
   sets the baseline to zero, a successful save sets it to wherever the stack
   now stands, and everything in between is a real difference.

   CONSERVATIVE IN ONE DIRECTION, on purpose. Undoing back to exactly the saved
   state leaves a different DEPTH, so it still counts as unsaved and the draft
   is kept. That errs towards keeping somebody's work and offering it once too
   often, which is the right way round for a thing whose whole job is not
   losing strokes. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

swap(block([
  'let autoPending=null; /* debounce handle for the working-canvas autosave */',
]), block([
  'let autoPending=null; /* debounce handle for the working-canvas autosave */',
  '/* The undo depth the canvas was last SAVED at. Not "was it edited" - saving',
  '   does not empty the undo stack, so a canvas can be heavily edited and',
  '   perfectly saved at the same time, which is the normal state of a trait',
  '   somebody just pressed Save on. */',
  'let savedDepth=0;',
]));

swap(block([
  '  undoStack=[]; redoStack=[];',
]), block([
  '  undoStack=[]; redoStack=[];',
  '  /* A freshly opened canvas is the record it came from. */',
  '  savedDepth=0;',
]));

swap(block([
  '  if(of && !undoStack.length) return Promise.resolve();',
]), block([
  '  if(of && undoStack.length===savedDepth) return Promise.resolve();',
]));

swap(block([
  '    showDraftBar(null,null);',
  '    openRec=rec;',
]), block([
  '    showDraftBar(null,null);',
  '    /* THE CANVAS IS NOW THE RECORD. Without this the next open flushes a',
  '       draft of work that was just saved, and re-opening this trait offers',
  '       changes that are not changes. */',
  '    savedDepth=undoStack.length;',
  '    openRec=rec;',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['let savedDepth=0;', '  savedDepth=0;',
  '  if(of && undoStack.length===savedDepth) return Promise.resolve();',
  '    savedDepth=undoStack.length;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE OLD QUESTION IS GONE. Leaving it anywhere is leaving the defect. */
if (code.indexOf('!undoStack.length) return Promise.resolve();') >= 0)
  throw new Error('the draft guard still asks whether the canvas was ever edited');

/* THE BASELINE IS SET IN BOTH PLACES THAT MAKE A CANVAS EQUAL A RECORD:
   opening one, and saving one. Either alone leaves the flag permanently wrong
   in one direction. */
if (code.split('savedDepth=').length !== 4)
  throw new Error('expected the declaration and exactly two assignments');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
