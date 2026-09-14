/* FOUR PIECES OF STATE THAT OUTLIVED THE THING THEY DESCRIBED.

   The rest of the sweep. Each was re-read in the source before it was
   touched, and one of them changed the fix.

   ONE: A DRAFT COULD BE SAVED WITH ONE PICTURE'S BYTES AND ANOTHER'S SIZE.
   autosaveNow already knows about this - the comment above it says values are
   "CAPTURED BEFORE THE ENCODE, not read after it", because toBlob runs later
   and what it describes can change underneath. It captures the draft key and
   the open record that way and then reads art.width, art.height and fileName
   INSIDE the callback. Open a trait, let an autosave start, open a different
   one before the encode finishes, and the draft is written with the first
   picture's bytes under the second one's dimensions and name - which is a
   draft that restores wrong. The rule was right and applied to half the
   fields.

   TWO: "Save to cloud" COULD BE DEAD FOR THE REST OF THE SESSION. cloudPush
   disables the button at the top and re-enables it 120 lines later, with two
   unguarded network calls in between and no try/finally. A throw there leaves
   the button disabled with no other assignment to that property anywhere in
   the file, so the only way back is a reload.

   THE OBVIOUS FIX IS WRONG HERE, and this is why it is a catch at the call
   site rather than a try/finally around the body: `saved`, `failed` and
   `unchangedSkipped` are declared INSIDE that window and read after it, so
   wrapping the body in a try block would put them out of scope for the report
   that uses them. Guarding at the binding cannot break scoping, and it also
   catches anything in the window rather than the two calls I happened to
   notice. The two are guarded as well, so an ordinary network hiccup lets the
   push finish and report instead of abandoning it.

   THREE: THE FIXER'S "measured" LABEL WAS READ WHEN THE WORKER REPLIED.
   fixStampMeasured reads the module-level fixMeasuredBlock, and it runs in
   the worker's onmessage - long after fixStepFor set it. Anything that calls
   fixStepFor in between rewrites it, and the readout keystroke handler does
   exactly that. So typing in the Pixel size box while a run is in flight
   could stamp the finished run with a label belonging to a different
   decision. patch418 fixed the other half of this - the flag not being
   cleared - and left the read.

   FOUR: PB.fix REPLACED THE PICTURE AND KEPT THE PREVIOUS ONE'S MEASUREMENT.
   fixNativeBlockFor caches on `data===FIX.src.data`, and FIX.native is
   written in exactly one place - fixLoad, right after FIX.src. PB.fix sets
   FIX.src on its own, so a scripted run inherits whatever block size the last
   file loaded by hand had. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the draft describes the picture it holds -------------------- */
{
  const at = kit.only(L, l => l === '  const key=draftId(), of=openRec&&openRec.id?openRec.id:null;',
    'what the draft captures');
  kit.replace(L, { start: at, end: at }, [
    '  const key=draftId(), of=openRec&&openRec.id?openRec.id:null;',
    '  /* THE REST OF THE RECORD, on the same line and for the same reason. The',
    '     comment above is right and was applied to half the fields: the key and',
    '     the open record were captured, and the size and the name were read',
    '     inside the toBlob callback, which runs as a later task. Open a trait,',
    '     let an autosave start, open another before the encode lands, and the',
    '     draft is written with the first picture\'s bytes under the second',
    '     one\'s dimensions and name - a draft that restores wrong. */',
    '  const W=art.width, H=art.height, nm=fileName||"untitled.png";',
  ]);
  const put = kit.only(L, l => l === '      dbPut({id:key, kind:"autosave", traitId:of, name:fileName||"untitled.png",',
    'what the draft writes');
  if (L[put + 1] !== '             w:art.width, h:art.height, blob:b, at:Date.now()})')
    throw new Error('the draft write is not shaped the way this expects');
  kit.replace(L, { start: put, end: put + 1 }, [
    '      dbPut({id:key, kind:"autosave", traitId:of, name:nm,',
    '             w:W, h:H, blob:b, at:Date.now()})',
  ]);
}

/* ---- 2. the cloud button always comes back -------------------------- */
{
  const at = kit.only(L, l => l === "$('cloudpush').onclick=cloudPush;", 'the push button');
  kit.replace(L, { start: at, end: at }, [
    '/* THE BUTTON COMES BACK WHATEVER HAPPENS. cloudPush disables it at the top',
    '   and re-enables it 120 lines later, and nothing else in the file assigns',
    '   that property - so a throw in between left Save to cloud dead until the',
    '   page was reloaded.',
    '',
    '   HERE RATHER THAN A try/finally AROUND THE BODY, which was the first',
    '   idea: `saved`, `failed` and `unchangedSkipped` are declared inside that',
    '   window and read after it, so a try block around it would put them out of',
    '   scope for the report that uses them. A catch at the binding cannot break',
    '   scoping and covers the whole window rather than the calls I noticed. */',
    "$('cloudpush').onclick=()=>{",
    '  Promise.resolve().then(cloudPush).catch(e=>{',
    '    try{ $("cloudpush").disabled=false; }catch(_){ }',
    '    try{ toast("Save to cloud stopped: "+((e&&e.message)||e)); }catch(_){ }',
    '  });',
    '};',
  ]);
}
{
  const at = kit.only(L, l => l === '  if(!activeWs && !failed) swept=await cloudSweep(team,c,rows.map(r=>r.path));',
    'the sweep at the end of a push');
  if (L[at + 1] !== '  await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,'
    || L[at + 2] !== '    body:JSON.stringify({layers:LAYERS})});')
    throw new Error('the tail of cloudPush is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '  /* GUARDED SEPARATELY from the catch at the binding: a network hiccup on',
    '     either of these should let the push finish and report what it did,',
    '     rather than abandoning a run that has already uploaded everything. */',
    '  try{',
    '    if(!activeWs && !failed) swept=await cloudSweep(team,c,rows.map(r=>r.path));',
    '  }catch(_){ }',
    '  try{',
    '    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,',
    '      body:JSON.stringify({layers:LAYERS})});',
    '  }catch(_){ }',
  ]);
}

/* ---- 3. the label belongs to the run that earned it ----------------- */
{
  const at = kit.only(L, l => l === 'function fixStampMeasured(r){', 'the measured stamp');
  if (L[at + 1] !== '  if(!r||!fixMeasuredBlock) return r;'
    || L[at + 2] !== '  r.confidence="high"; r.consensus="measured"; r.measuredBlock=fixMeasuredBlock;')
    throw new Error('the measured stamp is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '/* TAKES THE BLOCK IT IS STAMPING, rather than reading the module flag when',
    '   it runs. This is called from the worker\'s onmessage, long after',
    '   fixStepFor decided - and anything that calls fixStepFor in between',
    '   rewrites the flag, which the Pixel size readout does on every keystroke.',
    '   patch418 fixed the other half of this, the flag not being cleared',
    '   between runs, and left the read. */',
    'function fixStampMeasured(r,block){',
    '  const b=(block===undefined)?fixMeasuredBlock:block;',
    '  if(!r||!b) return r;',
    '  r.confidence="high"; r.consensus="measured"; r.measuredBlock=b;',
  ]);
  const call = kit.only(L, l => l === '        const r=fixStampMeasured(m.done);', 'where a run is stamped');
  kit.replace(L, { start: call, end: call }, [
    '        const r=fixStampMeasured(m.done,measured);',
  ]);
  const fn = kit.inFunction(L, 'function fixRun(){');
  const forced = kit.only(L, l => l === '    FIX.src?FIX.src.data:null, FIX.src?FIX.src.height:0);',
    'where the step is decided', fn);
  kit.replace(L, { start: forced, end: forced }, [
    '    FIX.src?FIX.src.data:null, FIX.src?FIX.src.height:0);',
    '  /* WITH the decision, not read again when the worker answers. */',
    '  const measured=fixMeasuredBlock;',
  ]);
}

/* ---- 4. a scripted run measures its own picture --------------------- */
{
  const at = kit.only(L, l => l.indexOf('FIX.src={data:new Uint8ClampedArray(o.data), width:o.width, height:o.height}; FIX.name=o.name||"image"; FIX.out=null;') >= 0,
    'where a scripted run sets the picture');
  kit.replace(L, { start: at, end: at }, [
    '    FIX.src={data:new Uint8ClampedArray(o.data), width:o.width, height:o.height}; FIX.name=o.name||"image"; FIX.out=null;',
    '    /* AND ITS OWN MEASUREMENT. fixNativeBlockFor caches on data identity',
    '       against FIX.src.data, and FIX.native is written in exactly one other',
    '       place - fixLoad, on the line after it sets FIX.src. Setting the',
    '       picture without it left a scripted run holding the block size of',
    '       whatever file was last opened by hand. */',
    '    FIX.native=fixNativeBlock(FIX.src.data,o.width,o.height);',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE DRAFT DESCRIBES ITS OWN BYTES. */
  const as = kit.inFunction(codeLines, 'function autosaveNow(){');
  const asb = codeLines.slice(as.start, as.end + 1).join('\n');
  if (!/const W=art\.width, H=art\.height, nm=fileName\|\|"untitled\.png";/.test(asb))
    throw new Error('the draft still reads the canvas after the encode');
  if (/w:art\.width, h:art\.height/.test(asb) || /name:fileName\|\|"untitled\.png",/.test(asb))
    throw new Error('the draft write still reads live state inside the callback');
  /* Captured BEFORE the encode starts, or this is the same bug later. */
  if (asb.indexOf('const W=art.width') > asb.indexOf('art.toBlob('))
    throw new Error('the capture happens after the encode begins');

  /* THE CLOUD BUTTON COMES BACK. */
  if (code.indexOf("$('cloudpush').onclick=cloudPush;") >= 0)
    throw new Error('a throw still leaves Save to cloud disabled');
  if (!/\.catch\(e=>\{\r?\n?[\s\S]{0,120}cloudpush"\)\.disabled=false;/.test(code)
    && code.indexOf('$("cloudpush").disabled=false; }catch(_){ }') < 0)
    throw new Error('nothing re-enables the button when the push throws');
  /* And NOT by wrapping the body: the counters it reports are declared inside
     that window and read after it. */
  const cp = kit.inFunction(codeLines, 'async function cloudPush(){');
  const cpb = codeLines.slice(cp.start, cp.end + 1).join('\n');
  if (/let saved=0, failed=0, done=0;[\s\S]*\}finally\{/.test(cpb))
    throw new Error('the body was wrapped, which scopes out the counters');
  if (!/let saved=0, failed=0, done=0;/.test(cpb))
    throw new Error('the push counters went missing');

  /* THE LABEL TRAVELS WITH THE DECISION. */
  if (!/function fixStampMeasured\(r,block\)\{/.test(code))
    throw new Error('the stamp still reads the flag when it runs');
  if (!/const r=fixStampMeasured\(m\.done,measured\);/.test(code))
    throw new Error('the worker reply is not stamped with its own run');
  const fr = kit.inFunction(codeLines, 'function fixRun(){');
  const frb = codeLines.slice(fr.start, fr.end + 1).join('\n');
  if (!/const measured=fixMeasuredBlock;/.test(frb))
    throw new Error('the run does not capture what it measured');
  if (frb.indexOf('const measured=fixMeasuredBlock;') > frb.indexOf('w.onmessage='))
    throw new Error('the capture happens after the worker can reply');

  /* A SCRIPTED RUN MEASURES ITS OWN PICTURE. */
  if (!/FIX\.native=fixNativeBlock\(FIX\.src\.data,o\.width,o\.height\);/.test(code))
    throw new Error('a scripted run still inherits the last measurement');
  /* Both writers of FIX.src set it - that is the whole property. */
  if ((code.match(/FIX\.native=fixNativeBlock\(/g) || []).length !== 2)
    throw new Error('FIX.src and FIX.native are set in different numbers of places');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
