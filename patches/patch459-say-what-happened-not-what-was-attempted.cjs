/* THREE MESSAGES THAT COUNTED THE ATTEMPT AND CALLED IT THE RESULT.

   From the same sweep. The standing rule in this file is that an operation
   which did not happen has to say so, and these three said the opposite.

   ONE: "Imported 40 files" WHEN THE GROUP GOT NONE. bulkImport uploads each
   record with `if(activeWs) await cloudSyncOne(trec, await uploadCtx());` and
   throws the answer away. cloudSyncOne returns null on a failed upload after
   three tries, on a 401 or 403, and on a missing user, team or collection -
   so with an expired token every trait in a folder can fail to reach the
   group while the note says forty were imported. The traits ARE here, which
   is why this is a wrong message rather than lost work; but somebody who
   believes the group has them will find out much later.

   The same call two hundred lines up, for a reference image, had the same
   hole.

   TWO: "Moved 40 traits" WHEN THE GROUP STILL HAS THE OLD ONES. sortApply
   does `if(activeWs) await cloudMoveOne(old,rec);` and discards it. Two other
   places in this file already get this right - the shelf cycle at the tile
   and bulkMoveLayer both keep the result and say "here only" when it is
   false - so this is the odd one out rather than a new idea.

   THREE: THE FIXER'S SAVE COUNTED THE FILES IT WAS HANDED. fixSaveFiles says
   `files.length+" sent to the project"` and returns it. bulkImport drops
   files on four paths without throwing - a bitmap that will not decode, one
   over the size ceiling, a palette strip, and a catch around the whole
   per-file body - so fixing a folder of 320 and having one PNG fail to decode
   reported 320 sent and 319 written. It reported the intention.

   So bulkImport RETURNS its counters now. It already had every one of them in
   scope at the line that builds its own report; nothing new is counted except
   the two cloud failures, and the one caller that needs them uses them. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the import counts what reached the group -------------------- */
{
  const fn = kit.inFunction(L, 'async function bulkImport(files){');
  const at = kit.only(L, l => l === '  let ok=0,failed=0,refs=0,oversized=0,strips=0,renamed=0;',
    'the import counters', fn);
  kit.replace(L, { start: at, end: at }, [
    '  let ok=0,failed=0,refs=0,oversized=0,strips=0,renamed=0;',
    '  /* WHAT DID NOT REACH THE GROUP. cloudSyncOne returns null on a failed',
    '     upload, on a 401 or 403, and when there is no user, team or',
    '     collection to write to - and both call sites threw that away, so a',
    '     folder could import forty traits into this browser, upload none of',
    '     them, and say "Imported 40 files". */',
    '  let notShared=0;',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function bulkImport(files){');
  const ref = kit.only(L, l => l === '        if(activeWs) await cloudSyncOne(rrec, await uploadCtx());',
    'the reference upload', fn);
  kit.replace(L, { start: ref, end: ref }, [
    '        if(activeWs&&!await cloudSyncOne(rrec, await uploadCtx())) notShared++;',
  ]);
  const fn2 = kit.inFunction(L, 'async function bulkImport(files){');
  const tr = kit.only(L, l => l === '        if(activeWs) await cloudSyncOne(trec, await uploadCtx());',
    'the trait upload', fn2);
  kit.replace(L, { start: tr, end: tr }, [
    '        if(activeWs&&!await cloudSyncOne(trec, await uploadCtx())) notShared++;',
  ]);
}
{
  const fn3 = kit.inFunction(L, 'async function bulkImport(files){');
  const at = kit.only(L, l => l === '  if(failed) bits.push(failed+" could not be read");',
    'what the import says about failures', fn3);
  kit.replace(L, { start: at, end: at }, [
    '  if(failed) bits.push(failed+" could not be read");',
    '  /* SAID, because the alternative is finding out when a teammate opens the',
    '     project and half the collection is not there. The traits are in this',
    '     browser either way - this is a wrong message, not lost work - and',
    '     Save to cloud is the thing that fixes it. */',
    '  if(notShared) bits.push(notShared+" saved here only - the group did not get "',
    '    +(notShared===1?"it":"them")+", press Save to cloud when you are back");',
  ]);
}

/* ---- 2. and it hands the numbers back ------------------------------- */
{
  const at = kit.only(L, l => l === '  toast("Imported "+ok+" file"+(ok===1?"":"s"));',
    'what the import toasts');
  if (L[at + 1] !== '}')
    throw new Error('bulkImport does not end the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  toast("Imported "+ok+" file"+(ok===1?"":"s"));',
    '  /* THE COUNTERS, FOR A CALLER THAT HAS ITS OWN MESSAGE TO WRITE. This',
    '     returned nothing, so the fixer\'s Save to project reported the number',
    '     of files it HANDED OVER rather than the number written - and four',
    '     paths in here drop a file without throwing. Every one of these was',
    '     already in scope for the report above. */',
    '  return {ok, failed, oversized, strips, refs, notShared,',
    '    skipped:failed+oversized+strips};',
    '}',
  ]);
}

/* ---- 3. the fixer's save says what was written ---------------------- */
{
  const at = kit.only(L, l => l === '  try{ await bulkImport(files); }', 'the fixer save');
  if (L[at + 1] !== '  catch(e){ say("Could not save: "+((e&&e.message)||e)); return 0; }')
    throw new Error('the fixer save is not shaped the way this expects');
  const end = kit.only(L, l => l === '  return files.length;', 'what the fixer save returns');
  kit.replace(L, { start: at, end: end }, [
    '  let r=null;',
    '  try{ r=await bulkImport(files); }',
    '  catch(e){ say("Could not save: "+((e&&e.message)||e)); return 0; }',
    '  /* WHAT WAS WRITTEN, not what was handed over. bulkImport drops a file on',
    '     four paths without throwing - a bitmap that will not decode, one past',
    '     the size ceiling, a palette strip, and a catch around the whole',
    '     per-file body - so this said 320 when 319 arrived.',
    '',
    '     The fallback keeps the old number if bulkImport ever stops answering,',
    '     because a save that worked and said nothing is worse than a save that',
    '     worked and counted optimistically. */',
    '  const wrote=r&&typeof r.ok==="number" ? r.ok : files.length;',
    '  const withFolder=files.filter(f=>String(f.webkitRelativePath||"").indexOf("/")>=0).length;',
    '  say(wrote+" sent to the project"',
    '    +(withFolder?" \\u00b7 "+withFolder+" filed by their folder":"")',
    '    +(withFolder<files.length?" \\u00b7 "+(files.length-withFolder)',
    '      +" had no folder, so they are in unsorted":"")',
    '    +(r&&r.skipped?" \\u00b7 "+r.skipped+" could not be saved":"")',
    '    +(r&&r.notShared?" \\u00b7 "+r.notShared+" here only, not sent to the group":"")',
    '    +". Open the project to see them.");',
    '  return wrote;',
  ]);
}

/* ---- 4. and a sort says when the group kept the old ones ------------ */
{
  const at = kit.only(L, l => l === '  let made=0, moved=0, refused=[], failed=0;', 'the sort counters');
  kit.replace(L, { start: at, end: at }, [
    '  let made=0, moved=0, refused=[], failed=0;',
    '  /* Moved here but not for anybody else. The tile status cycle and',
    '     bulkMoveLayer both keep this answer and say so; this discarded it. */',
    '  let stranded=0;',
  ]);
  const fn = kit.inFunction(L, 'async function sortApply(plan){');
  const mv = kit.only(L, l => l === '      if(activeWs) await cloudMoveOne(old,rec);', 'the sort move', fn);
  kit.replace(L, { start: mv, end: mv }, [
    '      if(activeWs&&!await cloudMoveOne(old,rec)) stranded++;',
  ]);
  const fn2 = kit.inFunction(L, 'async function sortApply(plan){');
  const ret = kit.only(L, l => l === '  return {made, moved, refused, failed};', 'what the sort returns', fn2);
  kit.replace(L, { start: ret, end: ret }, [
    '  return {made, moved, refused, failed, stranded};',
  ]);
}
{
  const at = kit.only(L, l => l === '  toast("Moved "+r.moved+" trait"+(r.moved===1?"":"s"));',
    'what the sort toasts');
  kit.replace(L, { start: at, end: at }, [
    '  toast("Moved "+r.moved+" trait"+(r.moved===1?"":"s")',
    '    +(r.stranded?" - "+r.stranded+" here only, the group still has the old"',
    '      +(r.stranded===1?" one":" ones"):""));',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');
  /* NOTHING UPLOADS WITHOUT LOOKING AT THE ANSWER. */
  if (/if\(activeWs\) await cloudSyncOne\(/.test(code))
    throw new Error('an upload still throws its answer away');
  if (/if\(activeWs\) await cloudMoveOne\(/.test(code))
    throw new Error('a move still throws its answer away');

  /* THE IMPORT HANDS ITS COUNTERS BACK, and says what did not reach the
     group. */
  const bi = kit.inFunction(codeLines, 'async function bulkImport(files){');
  const bib = codeLines.slice(bi.start, bi.end + 1).join('\n');
  if (!/return \{ok, failed, oversized, strips, refs, notShared,/.test(bib))
    throw new Error('the import still tells its caller nothing');
  if ((bib.match(/notShared\+\+/g) || []).length !== 2)
    throw new Error('one of the two uploads is still not counted');
  if (!/notShared\+" saved here only/.test(bib))
    throw new Error('the import does not say what the group missed');

  /* AND THE FIXER SAVE REPORTS WHAT WAS WRITTEN. */
  const fs2 = kit.inFunction(codeLines, 'async function fixSaveFiles(files,say){');
  const fsb = codeLines.slice(fs2.start, fs2.end + 1).join('\n');
  if (/say\(files\.length\+" sent to the project"/.test(fsb))
    throw new Error('the fixer save still counts the files it was handed');
  if (!/const wrote=r&&typeof r\.ok==="number" \? r\.ok : files\.length;/.test(fsb))
    throw new Error('the fixer save does not read what was written');
  if (!/return wrote;/.test(fsb))
    throw new Error('the fixer save still returns the count it was handed');
  /* The fallback matters: a save that worked and said nothing is worse than
     one that counted optimistically. */
  if (!/: files\.length;/.test(fsb))
    throw new Error('a missing answer would report nothing at all');

  /* AND THE SORT SAYS WHEN THE GROUP KEPT THE OLD ONES. */
  const sa = kit.inFunction(codeLines, 'async function sortApply(plan){');
  const sab = codeLines.slice(sa.start, sa.end + 1).join('\n');
  if (!/stranded\+\+/.test(sab) || !/return \{made, moved, refused, failed, stranded\};/.test(sab))
    throw new Error('the sort does not carry what the group missed');
  if (!/r\.stranded\+" here only, the group still has the old"/.test(code))
    throw new Error('the sort does not say it');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
