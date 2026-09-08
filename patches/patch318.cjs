/* CLICKING A "LAST EDITED" ROW OPENED A BLANK EDITOR.

   Mine, shipped this morning. renderRecent did

     const open=()=>{ try{ startEditor(t); }catch(_){} };

   and startEditor's signature is (data,w,h,srcW,srcH,pal,recovered). `t` is a
   RECORD, so data was the record, w and h were undefined, `art.width=undefined`
   made a 0x0 canvas, and the try/catch meant nothing was said about any of it.

   THE SECOND HALF IS WORSE THAN THE BLANK CANVAS. Even decoded, that call sets
   no openRec and none of the three fields - so saveTrait would have treated the
   result as a NEW trait and minted a second copy under whatever name happened
   to be in the box, instead of updating the one that was clicked.

   The shelf card already does this correctly in nine lines. Rather than write
   them a third time, they move into one function that both callers use: the
   decode is the easy half, and what has to be true AFTERWARDS - fileName, the
   name, layer and status fields, and openRec - is the half worth having in one
   place.

   A failure now returns false and the caller says so. Swallowing it is what let
   a 0x0 canvas look like a feature. */
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

/* ---- 1. one way to open a saved trait --------------------------------- */
swap(block([
  'function startEditor(data,w,h,srcW,srcH,pal,recovered){',
]), block([
  '/* OPENING A TRAIT THAT IS ALREADY SAVED, in one place.',
  '',
  '   Two callers: a shelf card and a Last edited row. The second was written',
  '   as startEditor(t) - handing the RECORD to a function whose first three',
  '   arguments are pixels, a width and a height - so the canvas opened 0x0 and',
  '   a try/catch around it said nothing.',
  '',
  '   Decoding the blob is the easy half. The half worth sharing is what must be',
  '   true afterwards: fileName, the three fields, and openRec - which is how',
  '   saveTrait knows it is updating something that exists rather than minting a',
  '   new trait beside it.',
  '',
  '   Returns false rather than throwing, because both callers are click',
  '   handlers and an unhandled rejection in one is silence. */',
  'async function openTraitRecord(t){',
  '  if(!t||!t.blob||!t.w||!t.h) return false;',
  '  let d;',
  '  try{',
  '    const bm=await createImageBitmap(t.blob);',
  '    const c=document.createElement("canvas"); c.width=t.w; c.height=t.h;',
  '    const g=c.getContext("2d",{willReadFrequently:true});',
  '    g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '    d=g.getImageData(0,0,t.w,t.h);',
  '  }catch(_){ return false; }',
  '  fileName=t.name+".png";',
  '  startEditor(d.data,t.w,t.h,t.w,t.h,palette(d.data,t.w*t.h,24,64),false);',
  '  $("tname").value=t.name; $("tlayer").value=t.layer;',
  '  setChip("tstatus",t.status||"wip");',
  '  /* LAST, because startEditor clears it - its own comment says so: "set by',
  '     callers that opened a saved record". */',
  '  openRec=t;',
  '  return true;',
  '}',
  'function startEditor(data,w,h,srcW,srcH,pal,recovered){',
]));

/* ---- 2. the shelf card uses it ---------------------------------------- */
swap(block([
  '      el.onclick=async()=>{',
  '        const bm=await createImageBitmap(t.blob);',
  "        const c=document.createElement('canvas'); c.width=t.w; c.height=t.h;",
  "        const g=c.getContext('2d',{willReadFrequently:true});",
  '        g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '        const d=g.getImageData(0,0,t.w,t.h);',
  "        fileName=t.name+'.png';",
  '        startEditor(d.data,t.w,t.h,t.w,t.h,palette(d.data,t.w*t.h,24,64),false);',
  "        $('tname').value=t.name; $('tlayer').value=t.layer; setChip('tstatus',t.status||'wip');",
  '        openRec=t;',
  '      };',
]), block([
  '      el.onclick=async()=>{',
  '        if(!await openTraitRecord(t)) toast("Could not open "+(t.name||"that trait"));',
  '      };',
]));

/* ---- 3. and so does Last edited --------------------------------------- */
swap(block([
  '    const open=()=>{ try{ startEditor(t); }catch(_){} };',
]), block([
  '    /* THE BUG THIS ROW SHIPPED WITH: startEditor(t) handed a record to a',
  '       function that wanted pixels, so the editor opened 0x0 and the catch',
  '       hid it. */',
  '    const open=async()=>{',
  '      if(!await openTraitRecord(t)) toast("Could not open "+(t.name||"that trait"));',
  '    };',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function openTraitRecord(t){',
  '        if(!await openTraitRecord(t)) toast("Could not open "+(t.name||"that trait"));'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* NOBODY HANDS A RECORD TO startEditor ANY MORE. That call is the defect, and
   it type-checks fine because JavaScript will happily set width to undefined. */
if (code.indexOf('startEditor(t)') >= 0)
  throw new Error('a record is still being passed where pixels are expected');

/* ONE DECODE, TWO CALLERS. The point of extracting it is that the two cannot
   drift into opening a trait differently. */
if (code.split('async function openTraitRecord(t){').length !== 2)
  throw new Error('openTraitRecord is defined more than once');
if (code.split('openTraitRecord(t)').length !== 4)
  throw new Error('expected exactly two callers plus the definition');

/* AND IT STILL SETS WHAT A SAVE DEPENDS ON. Without openRec, saving the trait
   you just opened creates a second one beside it. */
const oStart = code.indexOf('async function openTraitRecord(t){');
const oEnd = code.indexOf('\r\nfunction startEditor(', oStart);
if (oStart < 0 || oEnd < 0) throw new Error('could not bound openTraitRecord');
const fn = code.slice(oStart, oEnd);
for (const need of ['openRec=t;', 'fileName=t.name', '$("tname").value=t.name',
  '$("tlayer").value=t.layer', 'setChip("tstatus"'])
  if (fn.indexOf(need) < 0)
    throw new Error('opening a saved trait no longer sets: ' + need);

/* openRec AFTER startEditor, which clears it. Before it, the save path is
   right back to minting a duplicate. */
if (fn.indexOf('openRec=t;') < fn.indexOf('startEditor(d.data'))
  throw new Error('openRec is set before startEditor clears it');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
