/* SAVE TO CLOUD NEVER WRITES AN OLD COPY BACK OVER AN EDIT.

   cloudPush read every record once and uploaded those copies six at a time
   for as long as the run took - minutes, for 300 traits, with the page
   usable throughout and a Stop button on it. When an upload landed,
   cloudSyncOne wrote the copy it was given back to the store marked
   synced. So a trait edited while the run was going - new pixels saved, a
   weight changed on the shelf - had its old picture sent, the old copy
   written over the edit, and the record marked as matching the server.
   saveTrait has already dropped the draft by then, so nothing could bring
   the edit back. Inside a group a push also starts by itself when the
   connection comes back, with nobody having pressed anything.

   TWO PLACES, because there are two windows. Before an upload starts: a
   record written since the run read it is read again, and the current
   copy is what goes - or nothing, when it has been removed or moved to
   another id, which the run counts and says. After it lands: a record
   written while the upload was in flight is not overwritten. The row the
   upload made is noted on it, so the next push replaces that row rather
   than colliding with it, and the record stays unsent. NOT ITS PATH: a
   record carrying a path that describes it reads as "the picture is on
   the server" to unsentOf, and the next push would send only the weight.

   cloudPatchOne, which sends a weight or order without the picture, had
   the same write and gets the same check. The mirror delete and the sweep
   at the end of a run on a personal page are skipped when anything changed
   under it, as they already are when anything failed: what this device
   holds is not a settled picture then. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

/* cloudPatchOne */
swap('async function cloudPatchOne(rec,ctx){', [
  '/* seq: the touch sequence when rec was read. A record written after it is',
  '   not overwritten with this copy. Defaults to now, for callers that read',
  '   it a moment ago. */',
  'async function cloudPatchOne(rec,ctx,seq){',
  '  const readAt=(typeof seq==="number")?seq:touchSeq;',
], 'cloudPatchOne head');
swap('    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;', [
  '    /* Edited while this was in flight: the edit is newer than what was',
  '       sent, stays unsent, and the next push sends it. */',
  '    if(rec.id && touchedSince(rec.id,readAt)) return true;',
  '    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;',
], 'cloudPatchOne write');

/* cloudSyncOne */
swap('async function cloudSyncOne(rec,ctx,why){', [
  'async function cloudSyncOne(rec,ctx,why,seq){',
  '  /* The touch sequence when rec was read - see cloudPatchOne. */',
  '  const readAt=(typeof seq==="number")?seq:touchSeq;',
], 'cloudSyncOne head');
{
  const i = at('    if((adopted||r.ok) && rec.id){ const up=Object.assign({},rec,', 'cloudSyncOne write');
  if (L[i + 1] !== '      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;') throw new Error('write line 2 moved');
  if (L[i + 2] !== '      try{ await dbPut(up); }catch(_){} }') throw new Error('write line 3 moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    '    /* EDITED WHILE THIS WAS IN FLIGHT, and what was sent is the copy from',
    '       before. Writing that back marked synced took the edit away. The',
    '       row just made is noted, so the next push replaces it rather than',
    '       colliding with it on the unique index, and the record stays unsent',
    '       - without the path, which would tell unsentOf the picture is on',
    '       the server when the one there is the old one. */',
    '    if((adopted||r.ok) && rec.id && touchedSince(rec.id,readAt)){',
    '      let cur=null; try{ cur=await dbGet(rec.id); }catch(_){ cur=null; }',
    '      if(cur && !cur.synced){ try{ await dbPut(Object.assign({},cur,{rowId:madeId, rowAt:madeAt})); }catch(_){} }',
    '    }',
    '    else if((adopted||r.ok) && rec.id){ const up=Object.assign({},rec,',
    '      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;',
    '      try{ await dbPut(up); }catch(_){} }',
  ]);
}

/* cloudPush: the read, the queue, the tail. */
const push = kit.inFunction(L, 'async function cloudPush(){');
swap('  try{ items=(await dbAll()).filter(i=>i.kind==="trait"||i.kind==="ref"); }catch(_){}', [
  '  /* Taken before the read: anything written after it is read again before',
  '     it is sent. */',
  '  const readSeq=touchSeq;',
  '  try{ items=(await dbAll()).filter(i=>i.kind==="trait"||i.kind==="ref"); }catch(_){}',
], 'the push read');
swap('  let saved=0, failed=0, done=0, patched=0, streak=0, broke=false;', [
  '  let saved=0, failed=0, done=0, patched=0, streak=0, broke=false;',
  '  /* Removed, or moved to another id, after the read and before its turn. */',
  '  let changed=0;',
], 'the counters');
{
  const i = kit.only(L, l => l === '      const job=fresh[next++], it=job.it;', 'the job', push);
  const j = kit.only(L, l => l === '      else if(await cloudSyncOne(it,ctx,why)){ okd=true; saved++; }', 'the send', push);
  if (j - i > 8) throw new Error('the send is not where it was');
  const between = L.slice(i + 1, j);
  const patchAt = between.findIndex(l => l === '      if(job.light && await cloudPatchOne(it,ctx)){ okd=true; patched++; }');
  if (patchAt < 0) throw new Error('the patch line moved');
  const kept = between.slice(0, patchAt);
  kit.replace(L, { start: i, end: j }, [
    '      const job=fresh[next++];',
    '      let it=job.it, light=job.light, seq=readSeq;',
    '      /* WRITTEN SINCE THE READ - an edit saved, a weight changed, while',
    '         the run was on earlier items. The copy in hand is older than the',
    '         store, and sending it sent the old picture and then wrote it back',
    '         over the edit. The current copy goes instead. */',
    '      if(touchedSince(it.id,readSeq)){',
    '        seq=touchSeq;',
    '        let cur=null; try{ cur=await dbGet(it.id); }catch(_){ cur=null; }',
    '        const p=cur&&cloudPath(team,c,cur);',
    '        if(!cur) changed++;',
    '        else if(cur.synced && cur.rowId && cur.path===p){ unchangedSkipped++; rows.push({path:p}); }',
    '        else { it=cur; light=!cur.synced && cur.unsent==="meta" && !!cur.rowId && cur.path===p && cur.kind==="trait"; }',
    '        if(it!==cur){ done++; if(done%10===0||done===fresh.length) say(); continue; }',
    '      }',
    ...kept,
    '      if(light && await cloudPatchOne(it,ctx,seq)){ okd=true; patched++; }',
    '      else if(await cloudSyncOne(it,ctx,why,seq)){ okd=true; saved++; }',
  ]);
}
swap('  if(!activeWs && !failed && !notTried){', [
  '  /* Nor after one that something changed under. */',
  '  if(!activeWs && !failed && !notTried && !changed){',
], 'the mirror delete');
swap('    if(!activeWs && !failed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))]);', [
  '    if(!activeWs && !failed && !changed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))]);',
], 'the sweep');
swap('  if(notTried) bits.push(notTried+" not tried - "+(broke ? "the server stopped answering, so the rest wait for the next press" : "stopped"));', [
  '  if(notTried) bits.push(notTried+" not tried - "+(broke ? "the server stopped answering, so the rest wait for the next press" : "stopped"));',
  '  if(changed) bits.push(changed+" moved or removed while this ran - Save to cloud again to send "+(changed===1?"it":"them"));',
], 'the summary');

kit.save(doc, ({ code }) => {
  if (code.split('cloudSyncOne(it,ctx,why,seq)').length - 1 !== 1) throw new Error('the push passes seq');
  if (code.split('touchedSince(rec.id,readAt)').length - 1 !== 2) throw new Error('both writes check');
});

fs.renameSync(TMP, FILE);
console.log('patch570 written');
