/* THE FIXER COULD NOT PUT ANYTHING IN THE PROJECT.

   "push that to the site asap with the save to project button and the import
   files, make it tie into the project in the way where it will actually save
   to project (dead save path)"

   WHAT WAS ACTUALLY DEAD, because "dead save path" could mean three things
   and only one of them is true. #saveproj is wired to saveTrait and saveTrait
   writes a record - that path works. What did not exist was any way to REACH
   it from Fix pixels: the tab offered "Open in the editor" and "Download the
   PNG", so getting a fixed trait into the project meant opening it, retyping
   its name, choosing its layer by hand, and pressing save - once per trait,
   320 times. A batch could not do it at all; it could only hand back a zip.

   SO THE FIXER GETS THE TWO BUTTONS, and neither of them is a second saver.

   ONE WRITER. bulkImport already turns files into project records: it reads
   the trait's category out of the folder path, adopts a layer the project has
   never seen, numbers unnamed files per layer, carries the status folder,
   spots a file that MOVED between layers, and refuses a reference. That is
   492 lines of decisions, and a "save to project" that reimplemented even the
   category rule would be a second answer to what a trait's layer is. So the
   results are handed to bulkImport as Files, exactly as a folder drop is.

   WHICH MEANS THE PATH HAS TO SURVIVE THE ROUND TRIP. A File's
   webkitRelativePath is read only and a new File() has none, so the input's
   path is carried on the result and set back on the way out - without it
   every one of 320 traits would arrive in unsorted, which is the last layer
   in the draw order and the one thing the folders exist to prevent.

   AND THE NAME THAT GOES TO THE PROJECT IS THE ORIGINAL. The zip keeps the
   "-fixed" leaf because a downloaded pile wants to say what it is; a record
   does not, because readPath takes the name off the file and the trait would
   be called "cap-fixed" for the rest of its life. Same picture, two
   destinations, each named the way that destination needs.

   THE ZIP MIRRORS THE FOLDERS NOW for the same reason the record does: a flat
   pile of 320 PNGs is not something anyone can put back. An entry keeps the
   folders it came in with, so unpacking it gives the tree it was made from.
   A file dropped on its own has no folder and is unchanged.

   IMPORT A FOLDER is the other half, and it is the half that supplies the
   path at all - the ordinary picker hands over bare names. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the folder picker ------------------------------------------- */
{
  const at = kit.only(L, l => l === '  <input type="file" id="fixfile" accept="image/*" multiple hidden>',
    'the fixer file input');
  kit.replace(L, { start: at, end: at }, [
    '  <input type="file" id="fixfile" accept="image/*" multiple hidden>',
    '  <!-- THE FOLDER, which is where the trait category comes from. The',
    '       ordinary picker hands over bare filenames, so a pile chosen that way',
    '       has no category to read and every trait would land in unsorted. -->',
    '  <input type="file" id="fixfolder" webkitdirectory directory multiple hidden>',
  ]);
}

/* ---- the buttons -------------------------------------------------- */
{
  const at = kit.only(L, l => l === '    <button class="btn ghost" id="fixdl">Download the PNG</button>',
    'the single download button');
  kit.replace(L, { start: at, end: at }, [
    '    <button class="btn ghost" id="fixdl">Download the PNG</button>',
    '    <button class="btn ghost" id="fixsave" title="Put this on the shelf as a trait. The category comes from the folder it was imported from.">Save to project</button>',
  ]);
  const b = kit.only(L, l => l === '      <button class="btn" id="fixbatchdl" disabled>Download all as a zip</button>',
    'the batch download button');
  kit.replace(L, { start: b, end: b }, [
    '      <button class="btn" id="fixbatchdl" disabled>Download all as a zip</button>',
    '      <button class="btn" id="fixbatchsave" disabled title="Put all of them on the shelf, each in the category its folder names.">Save all to project</button>',
  ]);
  /* Where a folder import says what it is about to do, beside the buttons
     that will act on it rather than on another page. */
  const note = kit.only(L, l => l === '    <p class="note mono" id="fixbatchout"></p>', 'the batch line');
  kit.replace(L, { start: note, end: note }, [
    '    <p class="note mono" id="fixbatchout"></p>',
    '    <p class="note mono" id="fixsaveout"></p>',
  ]);
}

/* ---- the path is carried, or the category is lost ----------------- */
{
  const at = kit.only(L, l => l === '  FIX.name=String(file.name||"image").replace(/\\.[^.]+$/,"");',
    'where the name is taken');
  kit.replace(L, { start: at, end: at }, [
    '  FIX.name=String(file.name||"image").replace(/\\.[^.]+$/,"");',
    '  /* THE FOLDERS IT CAME IN WITH. A File chosen through the folder picker',
    '     carries them and one chosen through the ordinary picker does not, so',
    '     this is the trait\'s category or it is nothing - and nothing means the',
    '     save falls back to the name alone, which is the old behaviour. */',
    '  FIX.rel=String(file.webkitRelativePath||file.name||"image");',
  ]);
}

/* ---- and kept per result in a batch ------------------------------- */
{
  const at = kit.only(L, l => l === '    fixBatchFiles.push({name:name+"-fixed.png",', 'where a result is kept');
  if (L[at + 2].indexOf('w:oc.width, h:oc.height});') < 0)
    throw new Error('the kept result is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '    /* TWO NAMES ON PURPOSE. `name` is what the zip calls it, folders and',
    '       all, and `rel` is the path it arrived on - which is what the project',
    '       reads the category and the trait name out of. See patch402. */',
    '    fixBatchFiles.push({name:fixZipName(rel,name),',
    '      rel:rel,',
    '      data:new Uint8Array(await blob.arrayBuffer()),',
    '      w:oc.width, h:oc.height});',
  ]);
  const r = kit.inFunction(L, 'async function fixBatch(files){');
  const nm = kit.only(L, l => l === '    const name=String(file.name||("image"+(i+1))).replace(/\\.[^.]+$/,"");',
    'where the batch names one', r);
  kit.replace(L, { start: nm, end: nm }, [
    '    const name=String(file.name||("image"+(i+1))).replace(/\\.[^.]+$/,"");',
    '    const rel=String(file.webkitRelativePath||file.name||("image"+(i+1)));',
  ]);
}

/* ---- the two ways out --------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixBatchDownload(){', 'the zip button');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE ZIP ENTRY KEEPS ITS FOLDERS. A flat pile of 320 PNGs cannot be put',
    '   back anywhere; the same tree can. The leaf still says -fixed, because a',
    '   download wants to say what it is - the project gets the original name',
    '   instead, from `rel`. */',
    'function fixZipName(rel,name){',
    '  const parts=String(rel||"").split(/[\\\\/]/).filter(Boolean);',
    '  parts.pop();',
    '  return (parts.length?parts.join("/")+"/":"")+name+"-fixed.png";',
    '}',
    '/* A FILE THE PROJECT CAN READ A CATEGORY OUT OF.',
    '',
    '   webkitRelativePath is read only and a new File() has none, so it is',
    '   defined back on. Without it bulkImport sees a bare name, finds no',
    '   folder, and every trait in the run lands in unsorted - which is last in',
    '   the draw order, so the whole point of the folders is lost silently. */',
    'function fileWithPath(bytes,rel){',
    '  const parts=String(rel||"image.png").split(/[\\\\/]/).filter(Boolean);',
    '  const base=parts[parts.length-1]||"image.png";',
    '  const f=new File([bytes],base,{type:"image/png"});',
    '  try{ Object.defineProperty(f,"webkitRelativePath",{value:parts.join("/")}); }catch(_){ }',
    '  return f;',
    '}',
    'function fixSaveSay(m){ const el=$("fixsaveout"); if(el) el.textContent=m; }',
    '/* INTO THE PROJECT BY THE DOOR AN IMPORT USES.',
    '',
    '   bulkImport is the one thing that turns files into records - the layer',
    '   out of the folder, a layer the project has never seen adopted, the',
    '   status folder, the per-layer numbering, a trait that moved between',
    '   layers, a reference refused. A save that did its own version of any of',
    '   that would be a second answer to what a trait\'s layer is. */',
    'async function fixSaveFiles(files,say){',
    '  if(!files.length){ say("Nothing to save yet."); return 0; }',
    '  if(typeof mayUse==="function"&&!mayUse()) return 0;',
    '  say("Saving "+files.length+" to the project…");',
    '  try{ await bulkImport(files); }',
    '  catch(e){ say("Could not save: "+((e&&e.message)||e)); return 0; }',
    '  const withFolder=files.filter(f=>String(f.webkitRelativePath||"").indexOf("/")>=0).length;',
    '  say(files.length+" sent to the project"',
    '    +(withFolder?" · "+withFolder+" filed by their folder":"")',
    '    +(withFolder<files.length?" · "+(files.length-withFolder)',
    '      +" had no folder, so they are in unsorted":"")',
    '    +". Open the project to see them.");',
    '  return files.length;',
    '}',
    'async function fixSaveOne(){',
    '  const r=FIX.out; if(!r){ fixSaveSay("Nothing fixed yet."); return; }',
    '  const c=fixGridCanvas(r);',
    '  const blob=await new Promise(res=>c.toBlob(res,"image/png"));',
    '  c.width=1; c.height=1;',
    '  const bytes=new Uint8Array(await blob.arrayBuffer());',
    '  await fixSaveFiles([fileWithPath(bytes,FIX.rel||(FIX.name+".png"))],fixSaveSay);',
    '}',
    'async function fixSaveBatch(){',
    '  const list=fixBatchFiles||[];',
    '  await fixSaveFiles(list.map(f=>fileWithPath(f.data,f.rel||f.name)),fixBatchSay);',
    '}',
  ]);
}

/* ---- the wiring --------------------------------------------------- */
{
  const at = kit.only(L, l => l === '  $("fixdl").onclick=fixDownload;', 'the download wiring');
  kit.replace(L, { start: at, end: at }, [
    '  $("fixdl").onclick=fixDownload;',
    '  $("fixsave").onclick=()=>{ fixSaveOne(); };',
    '  $("fixbatchsave").onclick=()=>{ fixSaveBatch(); };',
    '  /* The folder picker is a second way into the same two paths, so a folder',
    '     of one behaves like a file of one and a folder of many is a batch. */',
    '  const fd=$("fixfolder");',
    '  if(fd){ fd.onchange=()=>{ took([...fd.files].filter(x=>/\\.(png|jpe?g|webp|gif)$/i.test(x.name))); fd.value=""; }; }',
  ]);
  /* The drop area offers it, because a hidden input nobody can reach is not
     a feature. */
  const d = kit.only(L, l => l === '  d.onclick=()=>f.click();', 'the drop click');
  kit.replace(L, { start: d, end: d }, [
    '  d.onclick=()=>f.click();',
    '  const fb=$("fixfolderbtn");',
    '  if(fb) fb.onclick=e=>{ e.stopPropagation(); const x=$("fixfolder"); if(x) x.click(); };',
  ]);
  const cap = kit.only(L, l => l === '    <span>or click to choose one · PNG, JPG, WEBP or GIF</span>',
    'the drop caption again');
  kit.replace(L, { start: cap, end: cap }, [
    '    <span>or click to choose one · PNG, JPG, WEBP or GIF</span>',
    '    <button class="mini" id="fixfolderbtn" type="button" title="Choose a folder. The folder each file sits in is what names its trait category.">Import a folder</button>',
  ]);
}

/* ---- the save buttons follow the work ----------------------------- */
{
  const at = kit.only(L, l => l === '  $("fixbatchdl").disabled=!fixBatchFiles.length;', 'where the zip button wakes');
  kit.replace(L, { start: at, end: at }, [
    '  $("fixbatchdl").disabled=!fixBatchFiles.length;',
    '  $("fixbatchsave").disabled=!fixBatchFiles.length;',
  ]);
  /* And the worker is only revoked if one was built. */
  const rev = kit.only(L, l => l === '  try{ URL.revokeObjectURL(w._url); }catch(_){}',
    'where the batch worker url is dropped');
  if (L[rev - 1] !== '  if(w) try{ w.terminate(); }catch(_){}')
    throw new Error('the batch tidy-up is not shaped the way this expects');
  kit.replace(L, { start: rev - 1, end: rev }, [
    '  /* Guarded together: scale mode never built one, and reaching into',
    '     w._url on null threw into a catch that hid it. */',
    '  if(w){ try{ w.terminate(); }catch(_){} try{ URL.revokeObjectURL(w._url); }catch(_){} }',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  for (const id of ['fixsave', 'fixbatchsave', 'fixfolder', 'fixfolderbtn', 'fixsaveout'])
    if (text.indexOf('id="' + id + '"') < 0) throw new Error('there is no ' + id);
  if (!/id="fixfolder" webkitdirectory directory multiple/.test(text))
    throw new Error('the folder picker does not ask for a folder');

  /* ONE WRITER. A save must go through bulkImport and must not build a
     record itself, or there are two answers to what a trait's layer is. */
  const sf = kit.inFunction(codeLines, 'async function fixSaveFiles(files,say){');
  const body = codeLines.slice(sf.start, sf.end + 1).join('\n');
  if (!/await bulkImport\(files\)/.test(body))
    throw new Error('the save does not go through the import');
  if (/dbPut|readPath|LAYERS|shelfOrder|kind:'trait'|kind:"trait"/.test(body))
    throw new Error('the save builds a record of its own');

  /* THE PATH SURVIVES, or every trait lands in unsorted. */
  const fw = kit.inFunction(codeLines, 'function fileWithPath(bytes,rel){');
  const fwb = codeLines.slice(fw.start, fw.end + 1).join('\n');
  if (!/Object\.defineProperty\(f,"webkitRelativePath"/.test(fwb))
    throw new Error('the file does not carry its folders');
  if (!/FIX\.rel=String\(file\.webkitRelativePath\|\|file\.name/.test(code))
    throw new Error('a single load does not remember where it came from');
  if (!/const rel=String\(file\.webkitRelativePath\|\|file\.name/.test(code))
    throw new Error('a batch does not remember where each one came from');
  if (!/rel:rel,/.test(code))
    throw new Error('the batch result does not carry the path');

  /* TWO NAMES, EACH FOR ITS DESTINATION. The zip keeps -fixed; the record
     must not, or the trait is called cap-fixed for good. */
  const zn = kit.inFunction(codeLines, 'function fixZipName(rel,name){');
  const znb = codeLines.slice(zn.start, zn.end + 1).join('\n');
  if (!/name\+"-fixed\.png"/.test(znb)) throw new Error('the zip stopped saying what it is');
  if (/-fixed/.test(fwb)) throw new Error('the project name carries the zip suffix');
  const sb = kit.inFunction(codeLines, 'async function fixSaveBatch(){');
  const sbb = codeLines.slice(sb.start, sb.end + 1).join('\n');
  if (!/f\.rel\|\|f\.name/.test(sbb))
    throw new Error('the batch save uses the zip name instead of the path');

  /* The buttons are wired and wake with the work. */
  if (!/\$\("fixsave"\)\.onclick/.test(code)) throw new Error('the save button does nothing');
  if (!/\$\("fixbatchsave"\)\.onclick/.test(code)) throw new Error('the batch save button does nothing');
  if (!/\$\("fixbatchsave"\)\.disabled=!fixBatchFiles\.length;/.test(code))
    throw new Error('the batch save button never wakes up');
  /* And the null worker is not reached into. */
  if (/^\s*try\{ URL\.revokeObjectURL\(w\._url\); \}catch/m.test(code))
    throw new Error('the batch still revokes a url on a worker it may not have');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
