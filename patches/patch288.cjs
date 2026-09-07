/* ROOM TO MAKE A ONE-OF-ONE.

   The weight ceiling was 99 and the floor 2, so the neutral weight - the point
   whose ratio to each end is equal - was sqrt(2*99) = 14. One drag from a
   levelled set could therefore only reach 14/2 = 7x rarer than an even share,
   which on the real layers is:

     eyes  0.46%    backgrounds  0.22%    hats  0.27%    skins  0.47%

   A trait at 0.1% of characters was not expressible at any setting, and going
   further needed a second gesture - make a sibling commoner first - which is
   an odd thing to ask of somebody planning a single rare piece.

   THE CEILING IS 5000 NOW, which puts the neutral at sqrt(2*5000) = 100 and
   one drag at 50x rarer:

     eyes  0.065%   backgrounds  0.031%   hats  0.038%   skins  0.067%

   The floor stays 2 and weight 1 keeps its meaning as "nobody has set this".

   THE ROUND TRIP IS NO LONGER EXACT EVERYWHERE, AND THAT IS MEASURED RATHER
   THAN WAVED AT. With 4,999 storable weights instead of 98, consecutive
   weights near the COMMON end are almost indistinguishable as shares - 410
   against 411 with two siblings is a difference of 0.00001 - and no slider
   resolution separates them: 500,000 positions still collided. Measured:

     weights from the even mark DOWNWARD, every layer size 2..60:
       weight error 0. Exact. That is the half that makes things rare.
     the far common end, siblings pinned at the floor:
       worst SHARE error 0.045 of a percentage point, between weights that
       are the same trait as far as a collection is concerned.

   So POS_MAX stays at 20,000, and the no-op case is made exact by a guard
   instead of by arithmetic: a release only writes when the thumb actually
   moved, compared against the position the row was rendered at. That is a
   better guarantee than an inverse that happens to hold, because it is true
   whatever the arithmetic does at the ends.

   AND A REJECTED WEIGHT NOW SAYS SO. The database checks the range, and a
   value outside it fails the insert - which surfaced as "could not reach the
   group", because nothing read the error body. That was always the trap; it
   matters more now, because this app and that constraint have to be widened
   in two separate steps and there is a window where they disagree. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the ceiling ------------------------------------------------- */
swap('const RAR_MIN=2, RAR_MAX=99, RAR_UNSET=1, POS_MAX=20000;',
  'const RAR_MIN=2, RAR_MAX=5000, RAR_UNSET=1, POS_MAX=20000;');

/* The comment above the constants records the old reasoning for POS_MAX; it is
   still true and now incomplete, so it gains what the wider range measured. */
swap(block([
  '   POS_MAX is 20,000 and that is measured, not round. The slider has to',
  '   invert exactly - position to weight and back must be the identity, or a',
  '   drag that goes nowhere rewrites the weight. At 1,000 steps two',
  '   consecutive weights collide at the common end of a small set and 802 of',
  '   the cases checked came back wrong; at 20,000 it is exact for every set',
  '   size 2..60 at every sibling level. */',
]), block([
  '   POS_MAX is 20,000 and that is measured, not round. At 1,000 steps two',
  '   consecutive weights collide at the common end of a small set and 802 of',
  '   the checked cases came back wrong.',
  '',
  '   IT NO LONGER INVERTS EXACTLY EVERYWHERE, and the ceiling of 5000 is why.',
  '   With 4,999 storable weights rather than 98, neighbouring weights near the',
  '   COMMON end are barely different as shares - 410 against 411 with two',
  '   siblings differ by 0.00001 - and no resolution separates them: 500,000',
  '   positions still collided. What was measured instead:',
  '',
  '     from the even mark DOWNWARD, every set size 2..60: weight error 0,',
  '     which is the whole half of the track that makes a trait rare;',
  '     at the far common end, siblings pinned at the floor: worst SHARE',
  '     error 0.045 of a percentage point, between weights that are the same',
  '     trait as far as a collection is concerned.',
  '',
  '   So a release writes only when the thumb actually MOVED, compared against',
  '   the position the row was rendered at. That makes the no-op exact by',
  '   construction rather than by an inverse that happens to hold. */',
]));

/* ---- 2. the tile box follows the constants ------------------------- */
swap("      rar.className='rar'; rar.type='number'; rar.min='1'; rar.max='99';",
  "      rar.className='rar'; rar.type='number'; rar.min='1'; rar.max=String(RAR_MAX);");
swap('        const v=Math.max(1,Math.min(99,parseInt(rar.value,10)||1));',
  block([
    '        /* From the constants, not from a repeated 99. The box and the',
    '           slider bound one column and a number typed here that the store',
    '           refuses comes back as "could not reach the group". */',
    '        const v=Math.max(RAR_UNSET,Math.min(RAR_MAX,parseInt(rar.value,10)||RAR_UNSET));',
  ]));

/* ---- 3. a release only writes when the thumb moved ------------------ */
swap('    sl.value=String(posOfMult(n*(w0/tot),n));',
  block([
    '    sl.value=String(posOfMult(n*(w0/tot),n));',
    '    /* Where this row was DRAWN. A release compares against it rather than',
    '       trusting the arithmetic to invert: at the common end of a wide range',
    '       two neighbouring weights share a position, so a round trip can come',
    '       back one off and a drag that went nowhere would rewrite the weight. */',
    '    sl.dataset.at=sl.value;',
  ]));

swap(block([
  '      sl.onchange=async()=>{',
  '        const O=othersOf(t.id);',
]), block([
  '      sl.onchange=async()=>{',
  '        /* Nothing moved, nothing is written - and nothing is re-rendered',
  '           either, so opening the section and clicking about cannot churn',
  '           271 records or bump anybody\'s updated_at. */',
  '        if(sl.value===sl.dataset.at) return;',
  '        sl.dataset.at=sl.value;',
  '        const O=othersOf(t.id);',
]));

/* ---- 4. a rejected weight says so ---------------------------------- */
swap(block([
  '    const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),',
  '      {method:"PATCH", headers:h, body:JSON.stringify({rarity:rec.rarity})});',
  '    return !!(r&&r.ok);',
  '  }catch(_){ return false; }',
]), block([
  '    const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),',
  '      {method:"PATCH", headers:h, body:JSON.stringify({rarity:rec.rarity})});',
  '    if(r&&r.ok) return true;',
  '    /* THE RANGE IS THE DATABASE\'S, AND IT CAN DISAGREE WITH THIS PAGE.',
  '       Widening the column and shipping the page are two steps, so there is a',
  '       window where a weight this app allows is one the store refuses - and',
  '       every failure here used to read as "could not reach the group",',
  '       because nothing looked at the reason. A 400 with a check-constraint',
  '       body is not a network problem and must not be reported as one. */',
  '    let why=""; try{ why=await r.text(); }catch(_){ }',
  '    if(r && r.status===400 && /rarity/i.test(why))',
  '      toast("The group will not take a rarity of "+rec.rarity',
  '        +" - its limit is lower than this page allows. Saved here only.");',
  '    return false;',
  '  }catch(_){ return false; }',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

if (code.indexOf('const RAR_MIN=2, RAR_MAX=5000, RAR_UNSET=1, POS_MAX=20000;') < 0)
  throw new Error('the ceiling did not move');
for (const s of ["rar.max=String(RAR_MAX);", '    sl.dataset.at=sl.value;',
  '        if(sl.value===sl.dataset.at) return;', '    if(r&&r.ok) return true;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* No bare 99 may remain as a rarity bound: the box, the clamp and the solver
   all take it from the constant now, or they drift the next time it moves. */
if (code.indexOf("rar.max='99'") >= 0) throw new Error('the box still hardcodes 99');
if (code.indexOf('Math.min(99,parseInt(rar.value') >= 0)
  throw new Error('the clamp still hardcodes 99');

/* And the neutral is still derived, not typed. */
if (code.indexOf('const RAR_NORMAL=Math.round(Math.sqrt(RAR_MIN*RAR_MAX));') < 0)
  throw new Error('RAR_NORMAL stopped being derived');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
