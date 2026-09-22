/* A PULL WRITES NOTHING THIS DEVICE TOUCHED AFTER THE PULL'S SNAPSHOT.

   cloudPull reads the server's rows once, then the store once, and writes
   from those snapshots hundreds of awaits later: a repair per matched row,
   a download per new or newer row. It runs on every page load, quietly,
   while the person is already working. groupCatchUp then read the store
   AGAIN and deleted every synced record whose row was not in the server
   snapshot.

   Measured 2026-09-22 on the working copy, with the rows request taking
   800ms: open the page, add a trait to the final project while the
   catch-up is still loading, and the move lands - the new row is on the
   server, the old one is gone. Then the catch-up finishes. The old row is
   still in its snapshot and nothing local matches it any more, so it is
   downloaded as if a teammate had just added it; the deletion pass then
   finds the NEW record synced with a row the snapshot never saw and deletes
   it, saying "1 removed by someone else". The page holds the trait as it
   was before the press, the server holds it as after, and the next open
   swaps them again. A weight changed in the same window is put back by the
   repair; a teammate's newer picture downloading while the person moves
   the trait brings the old record back beside the new one. A person who
   reloads and starts working straight away, on a project of three hundred
   traits, is inside that window every time.

   A first draft compared each record at write time with the copy the plan
   was made from. That covers the repair and the replacing download and
   misses the case measured: the store is read AFTER the rows, so the moved
   record is simply absent and the stale row reads as new.

   ONE RULE INSTEAD: a pull never writes an id this device touched after the
   pull's snapshot of the server. Every local write goes through dbPut,
   dbDel or dbApplyShelfRecords, and each now records the id it touched and
   a sequence number. The pull takes the sequence before it asks for the
   rows, and at write time asks whether the id it is about to write - or,
   for a row with no local match, the id that row would take - was touched
   since. At write time and not at plan time: the plan is minutes old by
   the end of a cold pull, and a plan-time check was measured to add
   nothing a write-time check did not already refuse. Touched means the person changed it and
   the pull's answer is stale by construction. Skipped, and counted in the
   note. The deletion pass reads the store BEFORE the pull, so the set it
   may delete from is the set the server snapshot answers for. */
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

/* ---- 1. the touch log, at the three write chokepoints ------------------- */
swap("async function dbPut(rec){ const d=await db(); return new Promise((res,rej)=>{", [
  '/* WHAT THIS DEVICE TOUCHED, AND IN WHAT ORDER. Every local write of a',
  '   record notes its id against a rising sequence, so a pull - which plans',
  '   from a snapshot and writes hundreds of awaits later - can tell a record',
  '   it may write from one the person has changed since. Session-only; the',
  '   pull\'s own writes count too, harmlessly, because it writes each id once',
  '   and asks before it does. */',
  'let touchSeq=0;',
  'const touchedAt=new Map();',
  'function touch(id){ if(id!=null) touchedAt.set(String(id),++touchSeq); }',
  'function touchedSince(id,seq){ return id!=null && (touchedAt.get(String(id))||0)>seq; }',
  "async function dbPut(rec){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{",
], 'dbPut');
swap("async function dbDel(id){ const d=await db(); return new Promise((res,rej)=>{", [
  "async function dbDel(id){ touch(id); const d=await db(); return new Promise((res,rej)=>{",
], 'dbDel');
{
  const fn = kit.inFunction(L, 'async function dbApplyShelfRecords(deleteIds,records){');
  swap('  const d=await db();', [
    '  for(const id of deleteIds) touch(id);',
    '  for(const r of records) touch(r&&r.id);',
    '  const d=await db();',
  ], 'dbApplyShelfRecords', fn);
}

/* ---- 2. the pull takes the sequence before it asks for the rows ---------- */
/* Recomputed at every use: each insertion moves the function's end. */
const pullR = () => kit.inFunction(L, 'async function cloudPull(opts){');
swap('  const got=await cloudRows(c,h);', [
  '  /* THE MOMENT THE SNAPSHOT ANSWERS FOR. Anything touched here after this',
  '     is newer than what the server is about to say. */',
  '  const seqAt=touchSeq;',
  '  const got=await cloudRows(c,h);',
], 'the row snapshot', pullR());
swap('  let added=0, renamed=0, failed=0, done=0;', ['  let added=0, renamed=0, failed=0, done=0, skipped=0;'], 'the counters', pullR());

/* ---- 3. every download remembers the id its row would take -------------- */
swap('        wanted.push({row:row, id:cur.id, name:cur.name, layer:layer, status:status,',
  ['        wanted.push({row:row, id:cur.id, name:cur.name, layer:layer, status:status, base:baseId,'], 'the replacing download', pullR());
swap('    wanted.push({row:row, id:id, name:name, layer:layer, status:status});',
  ['    wanted.push({row:row, id:id, name:name, layer:layer, status:status, base:baseId});'], 'the plain download', pullR());

/* ---- 4. and again at write time --------------------------------------- */
{
  const i = at('  for(const rp of repair){', 'the repair loop', pullR());
  if (L[i + 1] !== '    if(!wsStill(gen)) break;' || L[i + 2] !== '    try{') throw new Error('the repair loop head moved');
  kit.replace(L, { start: i + 1, end: i + 1 }, [
    '    if(!wsStill(gen)) break;',
    '    /* At write time, not plan time: the plan is minutes old by the end of',
    '       a cold pull, and the person may have changed this record between',
    '       two of these writes. Measured: a weight changed while the catch-up',
    '       was loading was put back by the repair. */',
    '    if(touchedSince(rp.oldId,seqAt)){ skipped++; continue; }',
  ]);
}
{
  const i = at('        await dbPut(rec); added++;', 'the download write', pullR());
  if (L[i - 1] !== '        if(!wsStill(gen)) return;') throw new Error('the download write is not where expected');
  kit.replace(L, { start: i, end: i }, [
    '        /* The download was the long await; the person may have moved the',
    '           trait while the picture was on its way. And a row with no local',
    '           match whose id here was touched since the snapshot is not a',
    "           teammate's new trait: it is the row this device moved away from",
    '           while the snapshot was in flight. Measured - the old copy came',
    '           back as a download and the new one was then "removed by someone',
    '           else". Asked here rather than at plan time, because the plan is',
    '           minutes old by the end of a cold pull and this covers both. */',
    '        if(touchedSince(w.id,seqAt)||touchedSince(w.base,seqAt)){ skipped++; done++; say(); continue; }',
    '        await dbPut(rec); added++;',
  ]);
}
swap('  if(failed) bits.push(failed+" could not be read");', [
  '  if(failed) bits.push(failed+" could not be read");',
  '  if(skipped) bits.push(skipped+" changed here while loading, kept as changed");',
], 'the note', pullR());

/* ---- 5. the deletion pass reads the store before the pull ---------------- */
{
  const fn = kit.inFunction(L, 'async function groupCatchUp(){');
  swap('    const onServer=await cloudPull({quiet:true, keepMine:true});', [
    '    /* READ BEFORE THE PULL. This is the set the server snapshot answers',
    '       for; a record that appears while the pull runs - a move made by the',
    '       person - is synced with a row the snapshot never saw, and read',
    '       afterwards it was deleted as "removed by someone else". Measured. */',
    '    const mine=(await dbAll()).filter(i=>(i.kind==="trait"||i.kind==="ref")&&i.synced);',
    '    const onServer=await cloudPull({quiet:true, keepMine:true});',
  ], 'the catch-up pull', fn);
  const i = at('      const mine=(await dbAll()).filter(i=>(i.kind==="trait"||i.kind==="ref")&&i.synced);', 'the late read', kit.inFunction(L, 'async function groupCatchUp(){'));
  kit.replace(L, { start: i, end: i }, []);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('function touch(id){');
  once('function touchedSince(id,seq){');
  once('touch(', 5);            /* the definition, dbPut, dbDel, two in dbApplyShelfRecords */
  once('touchedSince(', 4);     /* the definition, one at the repair, two at the download */
  once('const seqAt=touchSeq;');
  once('base:baseId', 2);
  once('skipped++', 2);
  once('if(skipped) bits.push(');
  /* The sequence is taken before the rows are asked for. */
  const p = code.indexOf('async function cloudPull(opts){');
  if (code.indexOf('const seqAt=touchSeq;', p) > code.indexOf('await cloudRows(c,h);', p)) throw new Error('seqAt taken after the rows');
  /* Every store write touches. */
  for (const s of ['async function dbPut(rec){ touch(rec&&rec.id);', 'async function dbDel(id){ touch(id);']) if (code.indexOf(s) < 0) throw new Error('missing: ' + s);
  const g = code.indexOf('async function groupCatchUp(){'), ge = code.indexOf('\n}', g);
  const body = code.slice(g, ge);
  if ((body.match(/const mine=/g) || []).length !== 1) throw new Error('groupCatchUp reads mine an unexpected number of times');
  if (body.indexOf('const mine=') > body.indexOf('await cloudPull(')) throw new Error('mine is still read after the pull');
});

fs.renameSync(TMP, FILE);
console.log('patch526 written, ' + grew + ' bytes');
