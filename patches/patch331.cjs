/* REVISIT: the half of "skip / revisit" that was not built.

   The handoff asks for "previous/next, skip/revisit". Skip marks an entry and
   moves on, which is the easy half. Getting BACK to what was skipped - or to
   anything still unfinished - had no answer at all: with 317 entries and a
   pass done over several sittings, finding the next pending one meant pressing
   Next until it appeared. That is not a queue, it is a list you scroll.

   So: jump to the next entry that is not finished, in either direction, and
   say when it wrapped rather than silently starting again from the top. An
   entry is finished when BOTH answers are in - artwork and name - which is the
   same definition the progress count uses, so the two can never disagree about
   what is left.

   AND KEYS, because 317 of anything is a keyboard job. Bound only while the
   review panel is on screen, the editor is closed, and the focus is not in a
   field - the last one matters because the name box sits inside this panel and
   a single-letter shortcut that eats a keystroke while somebody is typing a
   name is worse than no shortcut. The editor's own handler already returns the
   moment #app is hidden, so there is nothing to collide with.

   The count says what is left as well as what is done. "12 of 317, 3 finished"
   answers a question nobody asked; the one being asked at trait 200 is how
   many are still to go. */
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

/* ---- 1. the button and the hint --------------------------------------- */
swap(block([
  '        <button class="mini" id="revskip">Skip</button>',
  '        <button class="mini" id="revnext">Next</button>',
]), block([
  '        <button class="mini" id="revskip">Skip</button>',
  '        <button class="mini" id="revnext">Next</button>',
  '        <button class="mini" id="revleft"',
  '          title="Jump to the next entry that still needs an answer, wrapping round at the end. Skipping marks an entry; this is how you come back to it.">Next unfinished</button>',
]));

swap(block([
  '    <div id="reviewbody" hidden>',
]), block([
  '    <div id="reviewbody" hidden>',
  '      <p class="note" id="revkeys">N next \\u00b7 P previous \\u00b7 U next unfinished'
  + ' \\u00b7 A artwork \\u00b7 S skip \\u00b7 O open</p>',
]));

/* ---- 2. what is left, in the count ------------------------------------ */
swap(block([
  '  count.textContent=(i+1)+" of "+REVIEW.entries.length+", "+done+" finished";',
]), block([
  '  /* What is LEFT, not only what is done. At entry 200 of 317 the question',
  '     is how many are still to go, and subtracting two numbers in your head',
  '     is a thing a count should have saved you. */',
  '  const left=REVIEW.entries.length-done;',
  '  count.textContent=(i+1)+" of "+REVIEW.entries.length+", "+done+" finished"',
  '    +(left?", "+left+" left":"");',
]));

/* ---- 3. the jump ------------------------------------------------------- */
swap(block([
  'async function reviewGo(delta){',
]), block([
  '/* The next entry still wanting an answer, in either direction.',
  '',
  '   Finished means BOTH answers are in, which is the same test the progress',
  '   count uses - one definition, so the count and the jump can never disagree',
  '   about what is left.',
  '',
  '   Wraps, because a pass done over several sittings starts wherever it left',
  '   off and the remaining work is on both sides of that. It SAYS when it',
  '   wrapped: silently reappearing at the top of a 317-entry queue looks like',
  '   the button did nothing. */',
  'const reviewDone=e=>!!(e&&e.artworkAccepted&&e.nameAccepted);',
  'async function reviewJump(dir){',
  '  if(!REVIEW||!REVIEW.entries.length) return false;',
  '  const n=REVIEW.entries.length, from=reviewIndex();',
  '  for(let k=1;k<=n;k++){',
  '    const i=((from+dir*k)%n+n)%n;',
  '    if(reviewDone(REVIEW.entries[i])) continue;',
  '    /* Came all the way round to where it started: this is the only one',
  '       left, and moving to it would look like nothing happened. */',
  '    if(i===from){ toast("This is the only one still unanswered"); return false; }',
  '    const wrapped = dir>0 ? i<from : i>from;',
  '    REVIEW.activeId=REVIEW.entries[i].id;',
  '    await saveReview();',
  '    await renderReview();',
  '    if(wrapped) toast("Wrapped round to the "+(dir>0?"start":"end"));',
  '    return true;',
  '  }',
  '  toast("Every entry has both answers");',
  '  return false;',
  '}',
  'async function reviewGo(delta){',
]));

/* ---- 3b. one definition, used by the count and the export too --------- */
swap(block([
  '  const done=REVIEW.entries.filter(e=>e.artworkAccepted&&e.nameAccepted).length;',
]), block([
  '  const done=REVIEW.entries.filter(reviewDone).length;',
]));

swap(block([
  '    finished:REVIEW.entries.filter(e=>e.artworkAccepted&&e.nameAccepted).length,',
]), block([
  '    finished:REVIEW.entries.filter(reviewDone).length,',
]));

/* The third spelling of the same question, routed through the one definition
   like the other two. */
swap(block([
  '  $("revwas").className="note"+((e.artworkAccepted&&e.nameAccepted)?" revdone":"");',
]), block([
  '  $("revwas").className="note"+(reviewDone(e)?" revdone":"");',
]));

/* ---- 4. wired, and on the keyboard ------------------------------------- */
swap(block([
  "$('revnext').onclick=()=>reviewGo(1);",
]), block([
  "$('revnext').onclick=()=>reviewGo(1);",
  "$('revleft').onclick=()=>reviewJump(1);",
  '/* THE KEYBOARD, for a queue of 317.',
  '',
  '   Only while the panel is on screen, the editor is closed and the focus is',
  '   not in a field. The last is not optional: the name box lives inside this',
  '   panel, and a single-letter shortcut that swallows a keystroke mid-name is',
  '   worse than having no shortcut at all.',
  '',
  '   The editor\'s own handler returns as soon as #app is hidden, which is',
  '   exactly when this one is allowed to act, so the two cannot both fire. */',
  "document.addEventListener('keydown',e=>{",
  '  if(!REVIEW) return;',
  "  if(!$('app').hidden) return;",
  "  const body=$('reviewbody');",
  '  if(!body||body.hidden||!body.getBoundingClientRect().height) return;',
  '  if(e.metaKey||e.ctrlKey||e.altKey) return;',
  '  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.target.isContentEditable;',
  '  if(typing) return;',
  "  const k=e.key.toLowerCase();",
  "  const hit={n:()=>reviewGo(1), p:()=>reviewGo(-1), u:()=>reviewJump(1),",
  "    a:()=>$('revart').click(), s:()=>$('revskip').click(), o:()=>$('revopen2').click()}[k];",
  '  if(!hit) return;',
  '  e.preventDefault();',
  '  hit();',
  '});',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function reviewJump(dir){', 'const reviewDone=e=>',
  "$('revleft').onclick=()=>reviewJump(1);", '  if(typing) return;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['revleft', 'revkeys'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* ONE DEFINITION OF FINISHED. Two would let the count and the jump disagree
   about what is left, which is the one thing a queue must be right about. */
/* The LAMBDA form is what a duplicate definition looks like. The first
   version of this check matched a bare substring, which also fired inside
   nameOnly's !e.artworkAccepted&&e.nameAccepted - a different question. */
if (code.indexOf('e=>e.artworkAccepted&&e.nameAccepted') >= 0)
  throw new Error('finished is still spelled out somewhere instead of using reviewDone');
if (code.split('filter(reviewDone)').length !== 3)
  throw new Error('the count and the export do not both use the one definition');

const jStart = code.indexOf('async function reviewJump(dir){');
const jEnd = code.indexOf('\r\nasync function reviewGo(', jStart);
if (jStart < 0 || jEnd < 0) throw new Error('could not bound reviewJump');
const fn = code.slice(jStart, jEnd);

/* IT SAYS WHEN IT WRAPPED. Reappearing at the top of 317 without a word looks
   exactly like a button that did nothing. */
if (fn.indexOf('Wrapped round to the') < 0)
  throw new Error('wrapping is silent');
/* AND IT DOES NOT PRETEND TO MOVE WHEN THERE IS NOWHERE TO GO. */
if (fn.indexOf('if(i===from){') < 0)
  throw new Error('landing back on the current entry reads as a move');

/* THE KEYS DO NOT FIRE WHILE SOMEBODY IS TYPING A NAME - the name box is
   inside this very panel. */
const kStart = code.indexOf("document.addEventListener('keydown',e=>{\r\n  if(!REVIEW) return;");
if (kStart < 0) throw new Error('could not find the review key handler');
const keys = code.slice(kStart, kStart + 900);
if (keys.indexOf('if(typing) return;') < 0)
  throw new Error('the shortcuts fire while a field has focus');
if (keys.indexOf("if(!$('app').hidden) return;") < 0)
  throw new Error('the shortcuts fire while the editor is open');
if (keys.indexOf('e.metaKey||e.ctrlKey||e.altKey') < 0)
  throw new Error('the shortcuts swallow browser and system combinations');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
