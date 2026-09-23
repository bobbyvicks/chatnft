/* GENERATE SET WRITES IN PARTS, AND NEVER WRITES A CORRUPT ZIP.

   Found 2026-09-22 by the discovery pass, ranked twelfth of 39, measured by
   a finder and a verifier. buildCollection held every character's picture
   until the whole run ended, and the button then zipped all of it in one
   synchronous pass into one Blob. About 0.65 MB a character: 1000 held
   614-651 MB and froze the page 1.3-1.6 s at the end; 2000 took the
   renderer from 152 to 1,567 MB; 3000 added 2.2 GB to the browser. The
   input allows 10,000. And zip() writes sizes and offsets with setUint32,
   which wraps silently past 4 GiB (about 6,600 characters here), and its
   entry counts with setUint16 - an archive past either limit comes out
   corrupt on a machine that survived building it.

   Two changes. zip() works out the archive's size before it writes a
   byte, and refuses - an error, said - past either limit, rather than
   wrapping. And Generate set writes the collection in parts: buildCollection
   hands its files to the button whenever they pass GEN_PART_BYTES (400 MB)
   and lets go of them, so only one part is ever held; each part is its own
   zip, downloaded as it is made, numbered continuously across parts so the
   set reads as one. A set that fits in one part downloads exactly as it
   did, under the same name.

   The parts reach the button through genPartSink, set by the button for
   the length of its own run and cleared after, rather than a third
   parameter: buildCollection's signature line is quoted by
   patchkit.spec.js as a sample and every other caller wants the files
   handed back whole, which they still are. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. zip() refuses what it cannot write -------------------------------- */
{
  const fn = kit.inFunction(L, 'function zip(files){');
  swap('  const enc=new TextEncoder(), parts=[], central=[];', [
    '  const enc=new TextEncoder(), parts=[], central=[];',
    '  /* THE FORMAT\'S LIMITS, REFUSED RATHER THAN WRAPPED. Offsets and sizes',
    '     are 32-bit and the entry count 16-bit in this (non-ZIP64) writer, and',
    '     setUint32 wraps silently: an archive past 4 GiB came out with corrupt',
    '     offsets. Worked out before a byte is written, so nothing half-built',
    '     is ever handed over. */',
    '  {',
    '    let total=22;',
    '    for(const f of files){ const nl=enc.encode(f.name).length; total+=30+nl+f.data.length+46+nl; }',
    '    if(files.length>0xFFFF || total>0xFFFFFFFF)',
    '      throw new Error("too large for one zip ("+files.length+" files, "+Math.round(total/1048576)+" MB)");',
    '  }',
  ], 'the zip head', fn);
}

/* ---- 2. the builder hands over its files in parts --------------------------- */
{
  const fn = kit.inFunction(L, 'async function buildCollection(n,onProgress){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* HOW MUCH OF A GENERATED SET IS HELD BEFORE IT IS HANDED OVER, and',
    '   where. Generate set sets the sink for the length of its own run; with',
    '   no sink the files are returned whole, as every other caller wants. A',
    '   part is handed over once it passes the budget, and let go of. */',
    'let GEN_PART_BYTES=400*1024*1024;',
    'let genPartSink=null;',
    'async function buildCollection(n,onProgress){',
  ]);
}
{
  const fnR = () => kit.inFunction(L, 'async function buildCollection(n,onProgress){');
  swap('  const files=[];', ['  const files=[];', '  let held=0;', '  const sink=genPartSink;'], 'the files', fnR());
  swap('    if(onProgress && i%20===0){ onProgress(i+1,combos.length); await new Promise(r=>setTimeout(r,0)); }', [
    '    if(onProgress && i%20===0){ onProgress(i+1,combos.length); await new Promise(r=>setTimeout(r,0)); }',
    '    /* PASSED THE BUDGET: handed over and let go of, so the set is never',
    '       held whole - 1000 characters held 614-651 MB, 3000 grew the browser',
    '       by 2.2 GB. The last part is handed over below. */',
    '    held+=files[files.length-2].data.length+files[files.length-1].data.length;',
    '    if(sink && held>=GEN_PART_BYTES && i<combos.length-1){',
    '      await sink(files.splice(0,files.length),false);',
    '      held=0;',
    '    }',
  ], 'the progress line', fnR());
  swap('  return { files, made:combos.length, asked:n, combos, sizes:sizeSpread, pool };', [
    '  if(sink && files.length) await sink(files.splice(0,files.length),true);',
    '  return { files, made:combos.length, asked:n, combos, sizes:sizeSpread, pool };',
  ], 'the return', fnR());
}

/* ---- 3. the button downloads each part as it is made ---------------------- */
{
  const fnR = () => kit.inFunction(L, "$('cgenzip').onclick=async()=>{");
  swap('    const r=await buildCollection(n,(done,total)=>{', [
    '    /* EACH PART DOWNLOADED AS IT IS MADE. One part keeps the name it always',
    '       had; more than one are numbered, and the note says how many. */',
    '    let partsMade=0;',
    '    const download=(b,name)=>{',
    '      const u=URL.createObjectURL(b), a=document.createElement("a");',
    '      a.href=u; a.download=name;',
    '      document.body.appendChild(a); a.click(); a.remove();',
    '      setTimeout(()=>URL.revokeObjectURL(u),4000);',
    '    };',
    '    genPartSink=async(files,last)=>{',
    '      const count=files.filter(f=>f.name.indexOf("images/")===0).length;',
    '      if(last && !partsMade){ download(zip(files),"buildanft-collection-"+count+".zip"); partsMade=1; return; }',
    '      partsMade++;',
    '      download(zip(files),"buildanft-collection-part-"+partsMade+".zip");',
    '      $("cnote").textContent="Part "+partsMade+" downloaded ("+count+" characters)...";',
    '    };',
    '    let r;',
    '    try{',
    '    r=await buildCollection(n,(done,total)=>{',
  ], 'the build call', fnR());
  const i = at('    });', 'the build call close', fnR());
  kit.replace(L, { start: i, end: i }, ['    });', '    }finally{ genPartSink=null; }']);
  const j = at('    const b=zip(r.files), u=URL.createObjectURL(b), a=document.createElement("a");', 'the old zip', fnR());
  const want = [
    '    const b=zip(r.files), u=URL.createObjectURL(b), a=document.createElement("a");',
    '    a.href=u; a.download="buildanft-collection-"+r.made+".zip";',
    '    document.body.appendChild(a); a.click(); a.remove();',
    '    setTimeout(()=>URL.revokeObjectURL(u),4000);',
  ];
  for (let k = 0; k < want.length; k++) if (L[j + k] !== want[k]) throw new Error('the old download moved at +' + k + ': ' + L[j + k]);
  kit.replace(L, { start: j, end: j + want.length - 1 }, [
    '    /* Downloaded already, part by part, by the sink above. */',
  ]);
  swap('      +" from the final project, with metadata."+short+missed+sizeLine(r.sizes)', [
    '      +" from the final project, with metadata"+(partsMade>1 ? ", in "+partsMade+" zip files so no more than one is held at a time" : "")',
    '      +"."+short+missed+sizeLine(r.sizes)',
  ], 'the note', fnR());
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('throw new Error("too large for one zip (');
  once('let GEN_PART_BYTES=400*1024*1024;');
  once('await sink(files.splice(0,files.length),false);');
  once('if(sink && files.length) await sink(files.splice(0,files.length),true);');
  once('}finally{ genPartSink=null; }');
  once('async function buildCollection(n,onProgress){');
  const a = code.indexOf("$('cgenzip').onclick=async()=>{"), b = code.indexOf('\n};', a);
  if (code.slice(a, b).indexOf('zip(r.files)') >= 0) throw new Error('the button still zips the whole set');
});

fs.renameSync(TMP, FILE);
console.log('patch541 written, ' + grew + ' bytes');
