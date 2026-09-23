/* IMPORT PROJECT ON A FULL DEVICE SAYS THE DEVICE IS FULL.

   Every failed write counted as "could not be read", so a device out of
   storage reported "Imported 0 items, 310 could not be read" after trying
   all 310, and the person concluded the file was broken. The folder import
   and Load from cloud both stop on storeFull and say so; this was the one
   left. It stops at the first refusal now, says how many landed, and skips
   the settings - which are writes too - so importing the file again once
   there is room finishes the job: what landed is "already here" by its
   bytes, and the settings are applied then.

   AND A PROJECT IT COULD NOT READ IS NOT AN EMPTY ONE. A failed first read
   left the project looking empty: the file's grid, draw order and empty
   chance were taken as a restore over this project's own, and a trait
   with the same id was overwritten instead of renamed. It stops and says
   so instead. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function importProject(file){');
const one = (line, label) => kit.only(L, l => l === line, label, fn);
const swap = (line, to, label) => { const i = one(line, label); kit.replace(L, { start: i, end: i }, to); };

swap('  try{ existing=await dbAll(); }catch(_){}', [
  '  /* Not read is not empty: taken as empty, the file\'s settings replaced',
  '     this project\'s and a trait with the same id was written over. */',
  '  try{ existing=await dbAll(); }',
  '  catch(_){ toast("Could not read this project, so nothing was imported - try again"); return; }',
], 'the first read');
swap('  let added=0, renamed=0, failed=0, already=0;', [
  '  let added=0, renamed=0, failed=0, already=0, full=false;',
], 'the counters');
swap('    try{ await dbPut(rec); added++; }catch(_){ failed++; }', [
  '    /* Full is not unreadable, and the rest would be refused the same way. */',
  '    try{ await dbPut(rec); added++; }catch(e){ if(storeFull(e)){ full=true; break; } failed++; }',
  '  }',
  '  /* The settings are writes too. Left for the import that finishes the job:',
  '     what landed here is "already here" by its bytes then. */',
  '  if(full){',
  '    await renderShelf();',
  '    toast(STORE_FULL+" - "+added+" of "+doc.items.length+" imported before it filled; free some space and import the file again");',
  '    return;',
], 'the write');

/* The swaps above are scoped to importProject and each asserts one match
   there; the same read line exists in other functions, so no file-wide
   check here. */
kit.save(doc, () => {});

fs.renameSync(TMP, FILE);
console.log('patch573 written');
