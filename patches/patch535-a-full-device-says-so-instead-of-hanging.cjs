/* A FULL DEVICE SAYS SO INSTEAD OF HANGING.

   Found 2026-09-22 by the discovery pass, ranked fifth of 39, reproduced by
   three probes in Chromium. A write over the storage quota aborts its
   transaction at commit with QuotaExceededError and fires no error event.
   dbPut, dbDel and dbClear settled only on complete or error, so their
   promise never settled at all. An import froze at 38 of 311 with its note
   on "Reading..."; Load from cloud froze at 51 of 311 with its button
   disabled for good; Save never reached its "Could not save"; the autosave
   comment's promise to say when a write is refused could not be kept. And
   the partial store left behind is the one that, before patch531, made the
   next Save to cloud delete the rest from the server.

   The three writes now reject on abort, as dbApplyShelfRecords and the
   draft move already did. The three places a person meets it say what it
   is: Save says the device is out of storage space; Load from cloud stops
   at the first refusal rather than failing every remaining picture one
   after another, re-enables its button, and says how many were saved here
   before the device filled; an import stops the same way and says the
   same. Autosave already reported a refused write - it now receives one. */
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

/* ---- 1. the writes settle on abort -------------------------------------- */
const TAIL = "  t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }";
const TAIL2 = "  t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t)); }); }";
{
  const hits = L.map((l, i) => l === TAIL ? i : -1).filter(i => i >= 0);
  if (hits.length !== 3) throw new Error('expected the three write tails, found ' + hits.length);
  for (const i of hits) L[i] = TAIL2;
  const p = at("async function dbPut(rec){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{", 'dbPut');
  kit.replace(L, { start: p, end: p }, [
    '/* SETTLED ON ABORT TOO. A write over the storage quota aborts at commit',
    '   with QuotaExceededError and fires no error event, so a promise waiting',
    '   only for complete or error never settled: an import froze at 38 of 311,',
    '   Load from cloud at 51 with its button dead, Save never said it failed.',
    '   dbApplyShelfRecords already listened for abort; these three did not. */',
    'function dbAborted(t){ return t.error || new DOMException("The write was aborted","AbortError"); }',
    'function storeFull(e){ return !!e && (e.name==="QuotaExceededError" || /quota/i.test(String(e.message||""))); }',
    'const STORE_FULL="this device is out of storage space";',
    "async function dbPut(rec){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{",
  ]);
}

/* ---- 2. Save says what it is ------------------------------------------ */
swap("  }catch(e){ toast('Could not save: '+(e&&e.name||'storage error')); return false; }", [
  "  }catch(e){ toast('Could not save: '+(storeFull(e) ? STORE_FULL+' - Download it to keep it, then free some space'",
  "    : (e&&e.name||'storage error'))); return false; }",
], 'the save failure');

/* ---- 3. the pull stops at the first refusal and says so ---------------- */
{
  const pullR = () => kit.inFunction(L, 'async function cloudPull(opts){');
  swap('  let added=0, renamed=0, failed=0, done=0, skipped=0;', ['  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false;'], 'the pull counters', pullR());
  swap('    while(next<wanted.length){', ['    while(next<wanted.length && !full){'], 'the puller loop', pullR());
  swap('      }catch(_){ failed++; }', [
    '      }catch(e){',
    '        /* The device is full: every picture after this would be refused',
    '           the same way, so the pull stops here and says so. */',
    '        if(storeFull(e)){ full=true; return; }',
    '        failed++;',
    '      }',
  ], 'the puller catch', pullR());
  swap('  if(failed) bits.push(failed+" could not be read");', [
    '  if(failed) bits.push(failed+" could not be read");',
    '  if(full) bits.push(STORE_FULL+" - "+added+" of "+wanted.length+" saved here; free some space and Load again");',
  ], 'the pull note', pullR());
}

/* ---- 4. the import stops at the first refusal and says so -------------- */
{
  const impR = () => kit.inFunction(L, 'async function bulkImport(files){');
  swap('  let ok=0,failed=0,refs=0,oversized=0,strips=0,renamed=0;', ['  let ok=0,failed=0,refs=0,oversized=0,strips=0,renamed=0,full=false;'], 'the import counters', impR());
  swap('    }catch(_){ failed++; }', [
    '    }catch(e){',
    '      /* Full: the rest would be refused the same way. Stopped and said. */',
    '      if(storeFull(e)){ full=true; break; }',
    '      failed++;',
    '    }',
  ], 'the import catch', impR());
  swap('  if(failed) bits.push(failed+" could not be read");', [
    '  if(failed) bits.push(failed+" could not be read");',
    '  if(full) bits.push(STORE_FULL+" - "+ok+" of "+list.length+" imported before it filled; free some space and import the rest");',
  ], 'the import note', impR());
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('t.onabort=()=>rej(dbAborted(t));', 3);
  once('function storeFull(e){');
  once('storeFull(e)', 4);
  once('if(full) bits.push(STORE_FULL', 2);
  if (times("t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }")) throw new Error('a write still waits only for complete or error');
});

fs.renameSync(TMP, FILE);
console.log('patch535 written, ' + grew + ' bytes');
