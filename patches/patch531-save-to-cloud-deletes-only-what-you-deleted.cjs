/* SAVE TO CLOUD DELETES ONLY WHAT YOU DELETED.

   Found 2026-09-22 by the discovery pass, ranked first of 39, reproduced by
   four independent probes. On your own page cloudPush treated this device's
   store as the whole collection: it read every server row, deleted each one
   whose path was not on this device, then swept every picture not in this
   device's list. Nothing recorded what had been deleted here, so a trait
   removed on purpose looked exactly like one that never arrived. Measured:
   a phone holding 1 new trait against 311 on the server deleted all 311
   rows and all 311 pictures in 31 s, and said "Saved 1 to the cloud,
   removed 311 no longer here, removed 311 old images". A Load cut short
   after 51 made the next Save delete the other 260; a device that last
   loaded 261 deleted the 50 added since. The server copy is the backup,
   and the button that destroyed it was the one the status line told you to
   press first.

   The rule now: a server row is deleted only because this device deleted
   that trait. The two routes that remove a trait on purpose - the tile's
   remove button (dbDelShared) and an import that replaces an old copy with
   a new one (cloudDropOne) - write a removal record, {rowId, path}, into
   settings.gone when there is no group to tell live. Save to cloud deletes
   exactly the rows those records name, never one a live record here still
   uses, and forgets each record once its row is gone. A row this device
   simply does not hold is kept, and the note says how many and what to
   press. Clearing the project on this device writes no removal records: a
   device resetting itself is the eviction case, not a decision about the
   server.

   The sweep keeps every picture a server row still names, read after the
   uploads, as well as this device's own. It used to keep only this
   device's list, which is what took the 311 pictures. With no reliable
   read of the rows it does not sweep at all.

   Load from cloud leaves a removed trait removed: a row named by a removal
   record is not downloaded again before the Save that deletes it. And the
   status line counts a pending removal as a change not yet sent, rather
   than as a file "only there" for Load to fetch. */
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

/* ---- 1. the removal records, beside the shared delete ------------------- */
{
  const fn = kit.inFunction(L, 'async function dbDelShared(rec){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* WHAT THIS DEVICE REMOVED ON PURPOSE, and the server has not been told.',
    '   On your own page nothing is sent live, so a deletion waits for Save to',
    '   cloud - and Save to cloud must be able to tell a trait removed here from',
    '   one that never arrived. It used to delete every row this device did not',
    '   hold: measured, a phone with 1 trait against 311 on the server deleted',
    '   all 311 rows and pictures. One record, a list of {rowId, path}. */',
    'const GONE_ID="settings.gone";',
    'async function goneLoad(){',
    '  try{ const r=await dbGet(GONE_ID); return (r&&Array.isArray(r.rows))?r.rows:[]; }catch(_){ return []; }',
    '}',
    'function goneKey(g){ return g&&g.rowId ? "r:"+g.rowId : "p:"+(g&&g.path||""); }',
    '/* The removal record a server row answers to, or null. By row id when the',
    '   record knows one; by path only when it does not. */',
    'function goneMatch(list,row){',
    '  if(!row) return null;',
    '  return list.find(g=>(g.rowId&&row.id===g.rowId)||(!g.rowId&&g.path&&row.path===g.path))||null;',
    '}',
    'async function goneAdd(rec){',
    '  /* Nothing to remove from the server for a trait that never reached it. */',
    '  if(!rec||!(rec.rowId||rec.path)) return;',
    '  const list=await goneLoad();',
    '  const g={rowId:rec.rowId||null, path:rec.path||null, name:rec.name||"", at:Date.now()};',
    '  if(list.some(x=>goneKey(x)===goneKey(g))) return;',
    '  list.push(g);',
    '  try{ await dbPut({id:GONE_ID, kind:"settings", rows:list, at:Date.now()}); }catch(_){}',
    '}',
    'async function goneForget(keys){',
    '  if(!keys.length) return;',
    '  const drop=new Set(keys);',
    '  const list=(await goneLoad()).filter(g=>!drop.has(goneKey(g)));',
    '  try{ await dbPut({id:GONE_ID, kind:"settings", rows:list, at:Date.now()}); }catch(_){}',
    '}',
    'async function dbDelShared(rec){',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function dbDelShared(rec){');
  swap('  if(!activeWs) return true;', [
    '  /* Your own page: removed here, and remembered, so the next Save to',
    '     cloud removes it there - and only it. */',
    '  if(!activeWs){ await goneAdd(rec); return true; }',
  ], 'the personal branch', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudDropOne(rec){');
  swap('  if(!activeWs) return null;', [
    '  /* No group to tell now. An import replacing an old copy calls this, and',
    '     the old row is one this device removed on purpose - remembered for',
    '     Save to cloud. null still: nothing was removed yet. */',
    '  if(!activeWs){ await goneAdd(rec); return null; }',
  ], 'cloudDropOne personal', fn);
}

/* ---- 2. Save to cloud deletes only the recorded removals ------------------ */
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  const i = at('  let stale=0;', 'the stale block', fn);
  const want = [
    '  let stale=0;',
    '  if(!activeWs && !failed){',
    '    try{',
    '      const here=new Set(items.map(i=>cloudPath(team,c,i)));',
    '      const got=await cloudRows(c,h,"id,path");',
    '      if(got.ok && !got.truncated){',
    '        const dead=got.rows.filter(r=>r.path && !here.has(r.path));',
    '        for(const d of dead){',
    '          const q="id=eq."+encodeURIComponent(d.id);',
    '          const del=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",headers:h});',
    '          if(del.ok) stale++;',
    '        }',
    '      }',
    '    }catch(_){ }',
    '  }',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the stale block moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '  /* SUPERSEDES THE MIRROR DELETE ABOVE. "The server copy becomes what is on',
    '     this device" was the rule, and it has no way to tell a trait removed',
    '     here from one that never arrived here: measured, a phone with 1 trait',
    '     against 311 on the server deleted all 311 rows and pictures, a Load cut',
    '     short after 51 made the next Save delete the other 260. A row is',
    '     deleted now only because a removal record (goneAdd) names it, never',
    '     while a live record here still uses it, and every other row this',
    '     device does not hold is kept and counted. serverPaths is what the',
    '     rows still name after the uploads, for the sweep below. */',
    '  let stale=0, notHere=0, serverPaths=null;',
    '  if(!activeWs && !failed){',
    '    try{',
    '      const here=new Set(items.map(i=>cloudPath(team,c,i)));',
    '      const live=new Set(items.map(i=>i.rowId).filter(Boolean));',
    '      const gone=await goneLoad();',
    '      const got=await cloudRows(c,h,"id,path");',
    '      if(got.ok && !got.truncated){',
    '        const kept=[], done=[];',
    '        for(const r of got.rows){',
    '          const g=goneMatch(gone,r);',
    '          if(g && !live.has(r.id) && !(r.path && here.has(r.path))){',
    '            const q="id=eq."+encodeURIComponent(r.id);',
    '            const del=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",headers:h});',
    '            if(del.ok){ stale++; done.push(goneKey(g)); continue; }',
    '          }',
    '          kept.push(r);',
    '          if(!g && r.path && !here.has(r.path) && !live.has(r.id)) notHere++;',
    '        }',
    '        /* A removal whose row is already gone has nothing left to do. */',
    '        const ids=new Set(got.rows.map(r=>r.id)), paths=new Set(got.rows.map(r=>r.path));',
    '        for(const g of gone) if(g.rowId ? !ids.has(g.rowId) : !paths.has(g.path)) done.push(goneKey(g));',
    '        await goneForget(done);',
    '        serverPaths=kept.map(r=>r.path).filter(Boolean);',
    '      }',
    '    }catch(_){ serverPaths=null; }',
    '  }',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  swap('    if(!activeWs && !failed) swept=await cloudSweep(team,c,rows.map(r=>r.path));', [
    '    /* Every picture a server row still names is kept, as well as this',
    '       device\'s own; keeping only this device\'s list is what took the 311',
    '       pictures. No reliable read of the rows, no sweep. */',
    '    if(!activeWs && !failed && serverPaths) swept=await cloudSweep(team,c,[...new Set(rows.map(r=>r.path).concat(serverPaths))]);',
  ], 'the sweep', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  swap('  if(stale) bits.push("removed "+stale+" no longer here");', [
    '  if(stale) bits.push("removed "+stale+" you deleted here");',
    '  /* Kept, and said, so the person knows the server holds more than this',
    '     device and which button brings it here. */',
    '  if(notHere) bits.push(notHere+" on the server "+(notHere===1?"is":"are")+" not on this device, kept"',
    '    +" - Load from cloud brings "+(notHere===1?"it":"them")+" here");',
  ], 'the note', fn);
}

/* ---- 3. Load leaves a removed trait removed -------------------------------- */
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  swap('  const taken=new Set(existing.map(i=>i.id));', [
    '  const taken=new Set(existing.map(i=>i.id));',
    '  /* Removed here and not yet removed there: not downloaded again. */',
    '  const goneList=await goneLoad();',
  ], 'the pull head', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  swap('    const baseId=row.kind==="ref"?("ref_"+row.name):("t_"+row.name+"_"+layer+"_"+status);', [
    '    const baseId=row.kind==="ref"?("ref_"+row.name):("t_"+row.name+"_"+layer+"_"+status);',
    '    if(goneMatch(goneList,row)) continue;',
  ], 'the pull skip', fn);
}

/* ---- 4. the status line counts a pending removal as unsent ---------------- */
{
  const fn = kit.inFunction(L, 'async function cloudStatus(u){');
  swap('          remotePaths=new Set(got.rows.map(r=>r.path).filter(Boolean));', [
    '          /* A row this device removed on purpose is not "only there" for Load',
    '             to fetch - it is a removal waiting for Save to cloud. */',
    '          const gl=await goneLoad();',
    '          pendingGone=got.rows.filter(r=>goneMatch(gl,r)).length;',
    '          remotePaths=new Set(got.rows.filter(r=>!goneMatch(gl,r)).map(r=>r.path).filter(Boolean));',
  ], 'the status paths', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudStatus(u){');
  swap('  let localPaths=null, remotePaths=null, remoteFloor=false;', ['  let localPaths=null, remotePaths=null, remoteFloor=false, pendingGone=0;'], 'the status vars', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudStatus(u){');
  swap('        unsent=localPaths.filter(i=>!i.synced && i.rowId && remotePaths.has(cloudPath(team,c,i))).length;', [
    '        unsent=localPaths.filter(i=>!i.synced && i.rowId && remotePaths.has(cloudPath(team,c,i))).length+pendingGone;',
  ], 'the status unsent', fn);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('const GONE_ID="settings.gone";');
  once('await goneAdd(rec);', 2);
  once('if(!activeWs){ await goneAdd(rec); return true; }');
  once('if(!activeWs){ await goneAdd(rec); return null; }');
  once('await goneForget(done);');
  once('if(goneMatch(goneList,row)) continue;');
  once('+pendingGone;');
  /* The push never deletes a row for being absent here any more. */
  const p = code.indexOf('async function cloudPush(){'), pe = code.indexOf('\n}', p);
  const body = code.slice(p, pe);
  if (body.indexOf('!here.has(r.path));') >= 0) throw new Error('the mirror delete is still there');
  if ((body.match(/method:"DELETE"/g) || []).length !== 1) throw new Error('cloudPush has an unexpected number of row deletes');
  const d = body.indexOf('method:"DELETE"'), gm = body.indexOf('const g=goneMatch(gone,r);');
  if (!(gm >= 0 && gm < d)) throw new Error('the row delete is not behind a removal record');
  if (body.indexOf('rows.map(r=>r.path).concat(serverPaths)') < 0) throw new Error('the sweep keeps only this device');
  /* Clearing the project on this device writes no removal records. */
  const cl = code.indexOf('if(rec.kind==="trait"||rec.kind==="ref"){ await dbDel(rec.id); removed++; }');
  if (cl < 0) throw new Error('the clear loop moved');
});

fs.renameSync(TMP, FILE);
console.log('patch531 written, ' + grew + ' bytes');
