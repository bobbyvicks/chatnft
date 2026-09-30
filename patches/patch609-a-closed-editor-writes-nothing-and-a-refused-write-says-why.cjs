/* FOLLOW-UP BATCH E: A CLOSED EDITOR WRITES NOTHING, AND A REFUSED WRITE
   SAYS WHY (page only). On top of the stage-0 build, main 91eb861
   (patches 600-607, frozen). Items S21 and X3 of followups/candidates.md,
   batch E of followups/plan.md.

   S21. closeEditor writes the drawing's last draft where it was drawn and
   then hides the editor, but it clears neither the canvas (ctx) nor the
   record it holds (openRec), and autosaveNow asked only whether there was
   a canvas. So every later caller wrote the closed editor's canvas again,
   into whichever project was current by then, as that trait's draft (or as
   the unattached AUTO_ID draft): the tab hidden (visibilitychange), the
   tab left (pagehide), a trait opened from the shelf (openTraitRecord's
   flush) and a sign-in the server ended (sessionEnded). Reproduced on
   91eb861's page (tests/closededitorwritesnothing.spec.js, all four
   callers red): after a switch, the group gained a draft of its own trait
   holding the other project's drawing, and a draft the group already had
   for that trait was written over.
   The fix is in autosaveNow alone, so no caller changes (sessionEnded and
   the handlers stay as they are, which keeps batch C's ground clear): with
   the editor hidden and no autosave waiting, it writes nothing. "Waiting"
   is read before the timer is cleared, so the timer's own call, and
   s0FlushAutosave's and s0DraftLanded's calls for one still waiting, still
   write. closeEditor's own call comes before it hides the editor, so the
   drawing's last draft is still written where it was drawn. It answers
   true, as for a trait opened and closed unchanged: nothing needed
   writing. (Every caller that reaches it with the editor hidden ignores
   the answer.)
   FIX ROUND 1 (review E): "nothing needed writing" was false in one case.
   closeEditor hides the editor whatever its own write answers, so when
   that write is refused (or the encode gives nothing) the drawing is only
   on the hidden canvas, and the next caller's write was its second
   chance. Measured, same page, no switch, closeEditor's draft write
   refused once and then the tab hidden: 91eb861 wrote the drawing then
   (pixels 20); the first build of this patch wrote nothing, and the
   drawing was gone at the next open. So autosaveNow notes the last draft
   write that did not land (draftUnwritten: its key, the store it went to,
   whose drawing it was), and a closed editor still writes while all three
   are what they were (draftStillOwed). A switch or another account still
   gets nothing. A write of that key that lands, in any store, ends it.

   X3. dbPut, dbDel and dbClear rejected with the transaction's error from
   its error handler. That runs when a request fails, before the
   transaction aborts, and the transaction's error is still null then, so
   a refusal raised on a request reached every caller as null (measured on
   91eb861's page, Chromium and WebKit: tests/refusedwritesayswhy.spec.js).
   The request's own error is the event's target at that moment: they
   reject with it now (dbRefused), and with a named DOMException if a
   browser ever gives neither. The abort path is dbAborted, as it was.
   WebKit's private-style storage refuses every picture on the request with
   UnknownError "Error preparing Blob/File data to be stored in object
   store" (Task 16 Step 2b; measured again here). The owner's answer to
   question 5: say clearly that pictures cannot be kept in a private
   window, and suggest a normal one. storeNoPictures recognises that
   refusal and STORE_NO_PICTURES says it. Like a full device it is met by
   every later picture write the same way (storeStops is the two), so the
   folder import, the project-file import and Load from cloud stop at the
   first one and say so, as they already did for a full device; the
   autosave's message and Save's name it. The autosave's message also
   names a full device now, which it did not.
   NOT NAMED: an autosave refused for any other reason keeps its sentence
   word for word, because tests/stage0reload.spec.js pins that exact text
   (its "a draft write storage refuses" test rejects with a plain Error).
   Naming every other refusal there changes that expectation, which needs
   a ruling; it is reported, not done. Save names any refusal by its name,
   as it always tried to - it was reading null.

   Anchored on exact-once text of 91eb861's page. finish() pins each change
   where it sits.
   INTEGRATION (followup/integrated, after patch608): batch A's patch608
   runs first in the chain and changes dbPut - a fourth argument (was), and
   it resolves with whether it put, so its tail reads res(put) where this
   patch was written against res(). dbPut's swap and its two finish() pins
   are re-anchored on 608's text with the same meaning: only onerror
   changes (to dbRefused), and 608's res(put) and signature are kept. The
   dbDel and dbClear swaps, and every other anchor, are as written. */
'use strict';
const s0 = require('./stage0-common.cjs');
const kit = require(require('path').join(s0.REPO, 'tools', 'patchkit.cjs'));
const NL = s0.NL;
const doc = s0.start([
  ['async function s0Refuse(after){', 'patch602 is not applied (s0Refuse)'],
  ['function s0DraftLanded(', 'patch606 is not applied (s0DraftLanded)'],
]);

/* ---- X3: the refusal, named, and the words for a window without pictures */
doc.swap('const STORE_FULL="this device is out of storage space";', [
  'const STORE_FULL="this device is out of storage space";',
  '/* FOLLOW-UP X3 (patch609): A REFUSAL NAMES ITSELF. A request that fails',
  '   fires its error event on the transaction too, before the transaction',
  '   aborts - and until it aborts the transaction\'s error is null, so',
  '   dbPut, dbDel and dbClear rejected with null (measured, Chromium and',
  '   WebKit) and every message downstream said "storage error", "could not',
  '   be read" or nothing. The request that failed is the event\'s target,',
  '   and its error is the refusal. */',
  'function dbRefused(t,ev){',
  '  const q=ev&&ev.target;',
  '  return (q&&q!==t&&q.error) || t.error || new DOMException("The browser refused the write and gave no reason","UnknownError");',
  '}',
  '/* A WINDOW THAT CANNOT KEEP PICTURES. WebKit\'s private-style storage',
  '   refuses every picture with this (Task 16 Step 2b, measured; inferred,',
  '   not measured, for a private window on an iPhone). The owner\'s answer:',
  '   say so clearly, and suggest a normal window. Like a full device, every',
  '   later picture write meets it the same way, so what stops for one stops',
  '   for both (storeStops). */',
  'function storeNoPictures(e){ return !!e && e.name==="UnknownError" && String(e.message||"").indexOf("Blob/File data")>=0; }',
  'const STORE_NO_PICTURES="this window cannot keep pictures, as a private window cannot - open PixelBench in a normal window";',
  'function storeStops(e){ return storeFull(e) || storeNoPictures(e); }',
]);

const OLD_TAIL = '  t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t)); }); }';
const NEW_TAIL = '  t.oncomplete=()=>res(); t.onerror=(ev)=>rej(dbRefused(t,ev)); t.onabort=()=>rej(dbAborted(t)); }); }';
/* INTEGRATION (after patch608): dbPut's tail is 608's, res(put). The same
   swap on it - onerror only. */
const OLD_PUT_TAIL = OLD_TAIL.replace('res()', 'res(put)');
const NEW_PUT_TAIL = NEW_TAIL.replace('res()', 'res(put)');
doc.swap(['  else s.put(rec);', OLD_PUT_TAIL], ['  else s.put(rec);', NEW_PUT_TAIL]);
doc.swap(["  const t=d.transaction(STORE,'readwrite'); t.objectStore(STORE).delete(id);", OLD_TAIL],
  ["  const t=d.transaction(STORE,'readwrite'); t.objectStore(STORE).delete(id);", NEW_TAIL]);
doc.swap(["  const t=d.transaction(STORE,'readwrite'); t.objectStore(STORE).clear();", OLD_TAIL],
  ["  const t=d.transaction(STORE,'readwrite'); t.objectStore(STORE).clear();", NEW_TAIL]);

/* ---- S21: a closed editor writes nothing - unless its own write did not
   land, and the store and the account are still the ones it was drawn in
   (fix round 1) */
doc.swap([
  'function autosaveNow(){',
  '  clearTimeout(autoPending); autoPending=null;',
  '  if(!ctx) return Promise.resolve(false);',
], [
  '/* FOLLOW-UP S21, fix round 1 (patch609): THE DRAFT WRITE THAT DID NOT LAND.',
  '   closeEditor hides the editor whatever its own write answers. When that',
  '   write is refused, or the encode gives nothing, the drawing is only on',
  '   the hidden canvas, and the next caller\'s write was its second chance:',
  '   on 91eb861 the tab hidden after a refused close wrote it (measured).',
  '   The closed-editor answer in autosaveNow took that chance away, so the',
  '   last draft write that did not land is noted here - its key, the store',
  '   it went to and whose drawing it was - and a closed editor still writes',
  '   while all three are what they are now. After a switch, or with another',
  '   account signed in, it still writes nothing.',
  '   A write of that key that lands, in any store, ends it: either it is',
  '   this drawing, written, or the canvas has since been loaded with',
  '   another picture and the refused drawing is gone from it. Kept past a',
  '   landing in another store, it would file that store\'s picture here',
  '   once the page came back (measured, by a mutant). */',
  'let draftUnwritten=null;',
  'function draftStillOwed(){',
  '  const u=draftUnwritten;',
  '  return !!u && u.key===draftId() && u.db===wsDbName() && u.by===s0Uid();',
  '}',
  'function autosaveNow(){',
  '  const waiting=!!autoPending;   /* FOLLOW-UP S21 (patch609): read before it is cleared */',
  '  clearTimeout(autoPending); autoPending=null;',
  '  if(!ctx) return Promise.resolve(false);',
  '  /* FOLLOW-UP S21 (patch609): A CLOSED EDITOR WRITES NOTHING. closeEditor',
  '     writes the drawing\'s last draft before it hides the editor, and keeps',
  '     ctx and openRec - so the tab hidden or left, a trait opened from the',
  '     shelf and a sign-in the server ended all wrote the closed canvas',
  '     again, into whichever project was current by then: after a switch,',
  '     as a draft of the other project\'s trait of the same id, or over the',
  '     draft that trait already had (measured). With the editor hidden and',
  '     nothing waiting there is nothing to write. A write still waiting',
  '     (the timer\'s own call, or s0FlushAutosave\'s and s0DraftLanded\'s for',
  '     one) is written as before.',
  '     SUPERSEDED IN PART (fix round 1): "nothing to write" was false when',
  '     closeEditor\'s own write did not land. The drawing was then only on',
  '     the canvas, and this answer lost it (measured). That write is still',
  '     owed, in its own store and for its own account: draftStillOwed. */',
  '  if($("app").hidden && !waiting && !draftStillOwed()) return Promise.resolve(true);',
]);

/* ---- X3: the autosave's message names a full device and a window
   without pictures; any other refusal keeps its sentence (stage0reload
   pins it word for word) */
doc.swap([
  '    art.toBlob(b=>{',
  '      if(!b){ done(false); return; }',
  '      dbPut({id:key, kind:"autosave", traitId:of, name:nm,',
  '             w:W, h:H, blob:b, at:Date.now()},"person",by)',
  '        .then(()=>done(true), ()=>{',
  '          try{ toast("Could not save your work to this browser - copy it out"',
  '            +" with Download before closing the tab."); }catch(_){}',
], [
  '    art.toBlob(b=>{',
  '      /* FOLLOW-UP S21, fix round 1 (patch609): the store this write goes to',
  '         (dbPut opens it in this call), noted with a write that does not',
  '         land - an encode that gave nothing, or a refusal. */',
  '      const into=wsDbName();',
  '      if(!b){ draftUnwritten={key:key, db:into, by:by}; done(false); return; }',
  '      dbPut({id:key, kind:"autosave", traitId:of, name:nm,',
  '             w:W, h:H, blob:b, at:Date.now()},"person",by)',
  '        .then(()=>{',
  '          /* FOLLOW-UP S21, fix round 1 (patch609): landed - nothing of this key is owed now. */',
  '          if(draftUnwritten&&draftUnwritten.key===key) draftUnwritten=null;',
  '          done(true);',
  '        }, (e)=>{',
  '          draftUnwritten={key:key, db:into, by:by};   /* FOLLOW-UP S21, fix round 1 (patch609) */',
  '          /* FOLLOW-UP X3 (patch609): and why, when it is one a person can act on. */',
  '          const why=storeFull(e) ? STORE_FULL : storeNoPictures(e) ? STORE_NO_PICTURES : "";',
  '          try{ toast(why ? "Could not save your work to this browser: "+why+". Copy it out"',
  '            +" with Download before closing the tab."',
  '            : "Could not save your work to this browser - copy it out"',
  '            +" with Download before closing the tab."); }catch(_){}',
]);

/* ---- X3: Save */
doc.swap([
  "  }catch(e){ toast('Could not save: '+(storeFull(e) ? STORE_FULL+' - Download it to keep it, then free some space'",
  "    : (e&&e.name||'storage error'))); return false; }",
], [
  "  }catch(e){ toast('Could not save: '+(storeFull(e) ? STORE_FULL+' - Download it to keep it, then free some space'",
  "    : storeNoPictures(e) ? STORE_NO_PICTURES+'. Download it to keep it'   /* FOLLOW-UP X3 (patch609) */",
  "    : (e&&e.name||'storage error'))); return false; }",
]);

/* ---- X3: the folder import stops, and says why */
doc.swap([
  '      /* Full: the rest would be refused the same way. Stopped and said. */',
  '      if(storeFull(e)){ full=true; break; }',
], [
  '      /* Full: the rest would be refused the same way. Stopped and said. */',
  '      /* FOLLOW-UP X3 (patch609): and so is every picture in a window that',
  '         cannot keep pictures. full holds the refusal, for the words. */',
  '      if(storeStops(e)){ full=e; break; }',
]);
doc.swap('  if(full) bits.push(STORE_FULL+" - "+ok+" of "+list.length+" imported before it filled; free some space and import the rest");',
  '  if(full) bits.push(storeNoPictures(full) ? STORE_NO_PICTURES+" - "+ok+" of "+list.length+" imported"   /* FOLLOW-UP X3 (patch609) */' + NL
  + '    : STORE_FULL+" - "+ok+" of "+list.length+" imported before it filled; free some space and import the rest");');

/* ---- X3: the project-file import stops, and says why */
doc.swap('    try{ await dbPut(rec); added++; }catch(e){ if(storeFull(e)){ full=true; break; } failed++; }',
  '    try{ await dbPut(rec); added++; }catch(e){ if(storeStops(e)){ full=e; break; } failed++; }   /* FOLLOW-UP X3 (patch609): full holds the refusal */');
doc.swap('    toast(STORE_FULL+" - "+added+" of "+doc.items.length+" imported before it filled; free some space and import the file again");', [
  '    toast(storeNoPictures(full) ? STORE_NO_PICTURES+" - "+added+" of "+doc.items.length+" imported"   /* FOLLOW-UP X3 (patch609) */',
  '      : STORE_FULL+" - "+added+" of "+doc.items.length+" imported before it filled; free some space and import the file again");',
]);

/* ---- X3: Load from cloud stops, and says why */
doc.swap([
  '        /* The device is full: every picture after this would be refused',
  '           the same way, so the pull stops here and says so. */',
  '        if(storeFull(e)){ full=true; return; }',
], [
  '        /* The device is full: every picture after this would be refused',
  '           the same way, so the pull stops here and says so. */',
  '        /* FOLLOW-UP X3 (patch609): and so is every picture in a window that',
  '           cannot keep pictures. full holds the refusal, for the words. */',
  '        if(storeStops(e)){ full=e; return; }',
]);
doc.swap('  if(full) bits.push(STORE_FULL+" - "+added+" of "+wanted.length+" saved here; free some space and Load again");',
  '  if(full) bits.push(storeNoPictures(full) ? STORE_NO_PICTURES+" - "+added+" of "+wanted.length+" saved here"   /* FOLLOW-UP X3 (patch609) */' + NL
  + '    : STORE_FULL+" - "+added+" of "+wanted.length+" saved here; free some space and Load again");');

doc.finish(({ code, must }) => {
  const count = (s) => code.split(s).length - 1;
  /* X3: the three writes reject with the refusal; none with t.error at onerror. */
  must('function dbRefused(t,ev){' + NL + '  const q=ev&&ev.target;' + NL
    + '  return (q&&q!==t&&q.error) || t.error || new DOMException("The browser refused the write and gave no reason","UnknownError");' + NL + '}',
    'dbRefused is not there');
  must('  else s.put(rec);' + NL + NEW_PUT_TAIL, 'dbPut does not reject with the request\'s error');
  must("t.objectStore(STORE).delete(id);" + NL + NEW_TAIL, 'dbDel does not reject with the request\'s error');
  must("t.objectStore(STORE).clear();" + NL + NEW_TAIL, 'dbClear does not reject with the request\'s error');
  if (count(OLD_TAIL) !== 0) throw new Error('a write still rejects with t.error at onerror: ' + count(OLD_TAIL));
  if (count(OLD_PUT_TAIL) !== 0) throw new Error('dbPut still rejects with t.error at onerror: ' + count(OLD_PUT_TAIL));
  if (count('rej(dbRefused(t,ev))') !== 3) throw new Error('expected dbRefused in exactly dbPut, dbDel and dbClear, found ' + count('rej(dbRefused(t,ev))'));
  for (const f of ['async function dbPut(rec,wk,uid,was){', 'async function dbDel(id){', 'async function dbClear(){']) {
    const at = code.indexOf(f), next = code.indexOf(NL + 'async function ', at + 1);
    if (at < 0 || next < 0 || code.slice(at, next).indexOf('rej(dbRefused(t,ev))') < 0)
      throw new Error(f + ' does not hold its own dbRefused');
  }
  /* X3: the words, and where they are read. */
  must('function storeNoPictures(e){ return !!e && e.name==="UnknownError" && String(e.message||"").indexOf("Blob/File data")>=0; }', 'storeNoPictures is not there');
  must('function storeStops(e){ return storeFull(e) || storeNoPictures(e); }', 'storeStops is not there');
  if (count('storeStops(e)){ full=e;') !== 3) throw new Error('expected the folder import, the file import and the pull to stop on storeStops, found ' + count('storeStops(e)){ full=e;'));
  if (count('storeFull(e)){ full=true;') !== 0) throw new Error('a loop still stops on a full device alone');
  if (count('storeNoPictures(full) ? STORE_NO_PICTURES+" - "') !== 3) throw new Error('expected three stop messages to name a window without pictures, found ' + count('storeNoPictures(full) ? STORE_NO_PICTURES+" - "'));
  /* (The trailing comment on the first line leaves three spaces in code.) */
  must("? STORE_FULL+' - Download it to keep it, then free some space'" + NL
    + "    : storeNoPictures(e) ? STORE_NO_PICTURES+'. Download it to keep it'   " + NL
    + "    : (e&&e.name||'storage error'))); return false; }", 'Save does not name a window without pictures');
  must('          const why=storeFull(e) ? STORE_FULL : storeNoPictures(e) ? STORE_NO_PICTURES : "";' + NL
    + '          try{ toast(why ? "Could not save your work to this browser: "+why+". Copy it out"' + NL
    + '            +" with Download before closing the tab."' + NL
    + '            : "Could not save your work to this browser - copy it out"' + NL
    + '            +" with Download before closing the tab."); }catch(_){}', 'the autosave\'s message does not say why');
  /* S21: in autosaveNow, "waiting" read first, then the timer cleared, the
     no-canvas answer, and the closed-editor answer - before the key, the
     record and the encode are taken. */
  const lines = kit.lines(code);
  const an = kit.inFunction(lines, 'function autosaveNow(){');
  const body = lines.slice(an.start + 1, an.end).filter(l => l.trim() !== '');
  const want = ['  const waiting=!!autoPending;', '  clearTimeout(autoPending); autoPending=null;', '  if(!ctx) return Promise.resolve(false);',
    '  if($("app").hidden && !waiting && !draftStillOwed()) return Promise.resolve(true);'];
  for (let i = 0; i < want.length; i++)
    if (body[i].replace(/\s+$/, '') !== want[i]) throw new Error('autosaveNow line ' + (i + 1) + ' is not "' + want[i] + '": ' + body[i]);
  if (body[want.length].indexOf('const key=draftId()') < 0) throw new Error('the closed-editor answer is not before the key is taken: ' + body[want.length]);
  if (count('!!autoPending') !== 1) throw new Error('expected one read of a waiting autosave, found ' + count('!!autoPending'));
  /* Fix round 1: what is owed, just before autosaveNow; noted on both ways a
     write does not land, with the store the write went to; ended by a
     landing of that key; and written nowhere else. */
  must('let draftUnwritten=null;' + NL + 'function draftStillOwed(){' + NL + '  const u=draftUnwritten;' + NL
    + '  return !!u && u.key===draftId() && u.db===wsDbName() && u.by===s0Uid();' + NL + '}' + NL + 'function autosaveNow(){',
    'draftStillOwed is not there, just before autosaveNow');
  const trimmed = body.map(l => l.replace(/\s+$/, ''));
  const seq = (from, next, why) => {
    const at = trimmed.indexOf(from);
    if (at < 0 || trimmed.indexOf(from, at + 1) >= 0) throw new Error(why + ': "' + from + '" is not in autosaveNow exactly once');
    for (let k = 0; k < next.length; k++)
      if (trimmed[at + 1 + k] !== next[k]) throw new Error(why + ': expected "' + next[k] + '", found "' + trimmed[at + 1 + k] + '"');
  };
  seq('    art.toBlob(b=>{', ['      const into=wsDbName();',
    '      if(!b){ draftUnwritten={key:key, db:into, by:by}; done(false); return; }',
    '      dbPut({id:key, kind:"autosave", traitId:of, name:nm,'],
    'the store is not taken just before the write, or an encode that gave nothing is not noted');
  seq('             w:W, h:H, blob:b, at:Date.now()},"person",by)', ['        .then(()=>{',
    '          if(draftUnwritten&&draftUnwritten.key===key) draftUnwritten=null;',
    '          done(true);',
    '        }, (e)=>{',
    '          draftUnwritten={key:key, db:into, by:by};',
    '          const why=storeFull(e) ? STORE_FULL : storeNoPictures(e) ? STORE_NO_PICTURES : "";'],
    'a landed write does not end what is owed, or a refused one is not noted');
  if (count('draftUnwritten=') !== 4) throw new Error('expected draftUnwritten written in exactly four places (declared, two notes, one end), found ' + count('draftUnwritten='));
  if (count('draftStillOwed()') !== 2) throw new Error('expected draftStillOwed declared once and read once (the closed-editor answer), found ' + count('draftStillOwed()'));
  /* closeEditor still writes before it hides: its first line is the call. */
  const ce = kit.inFunction(lines, 'async function closeEditor(){');
  if (lines[ce.start + 1] !== '  const flushed=autosaveNow();' || lines[ce.start + 2].indexOf('$("app").hidden=true;') < 0)
    throw new Error('closeEditor no longer writes before it hides the editor');
});
