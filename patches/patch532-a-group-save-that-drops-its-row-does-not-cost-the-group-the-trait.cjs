/* A GROUP SAVE THAT DROPS ITS ROW DOES NOT COST THE GROUP THE TRAIT.

   Found 2026-09-22 by the discovery pass, ranked second of 39, reproduced
   by a finder and a verifier. Saving an edited trait in a group runs
   cloudSyncOne: upload the picture (three attempts), DELETE the old row,
   then INSERT the new one - with ONE attempt. A 503 or a dropped
   connection on that insert left the group with no row for the trait.
   The saving device kept it as unsent; every teammate's next open ran
   groupCatchUp, saw a synced record the server no longer listed, and
   deleted it as "removed by someone else". Measured: 3 rows became 2 on
   the server and on the teammate.

   The plan's sketch - insert first, as cloudMoveOne does, or PATCH in
   place - does not fit. The server's unique key is collection, kind, name,
   layer and status, which an in-place save keeps, so an insert-first
   collides with the row it replaces; and a PATCH keeps the old row id, so
   a teammate's pull takes the row-id branch and never downloads the new
   picture. The delete-then-insert is what makes a saved edit reach
   anybody. So two changes, one on each side of the window.

   The insert gets the upload's retry: three attempts, stopping on a
   definite answer. A retry after an attempt whose answer was lost can meet
   the unique key with a 409 - the first attempt landed. That row is
   adopted, read back by its identity, rather than reported as refused;
   refused would leave the record pointing at the deleted row, and every
   later save from this device would collide the same way.

   And a teammate does not delete a trait whose picture is still in the
   group's storage. Every real removal takes the picture with it -
   cloudDropOne deletes the files of the rows it removed, Clear the cloud
   deletes the files first - so a row missing beside a picture present is a
   save that has not finished, not a deletion. The storage is listed only
   when there is something to decide, and a listing that fails decides
   nothing: kept, and asked again next open. The note says how many were
   kept and why. The listing is the sweep's, lifted into bucketPaths so the
   two cannot disagree about what the bucket holds. */
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
const expect = (i, want, label) => { for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error(label + ' moved at +' + k + ': ' + L[i + k]); };

/* ---- 1. the insert is retried, and a landed-but-lost insert adopted ------ */
{
  const syncR = () => kit.inFunction(L, 'async function cloudSyncOne(rec,ctx,why){');
  const i = at('    const r=await fetch(SB_URL+"/rest/v1/traits",{method:"POST",', 'the insert', syncR());
  const want = [
    '    const r=await fetch(SB_URL+"/rest/v1/traits",{method:"POST",',
    '      headers:Object.assign({Prefer:"return=representation"},h),',
    '      body:JSON.stringify([{collection_id:c.id, team_id:team, owner:u.id,',
    '        kind:rec.kind, name:rec.name,',
    '        layer:rec.layer||"unsorted", status:rec.status||"wip",',
    '        rarity:(typeof rec.rarity==="number"?rec.rarity:1),',
    '        shelf_order:(typeof rec.shelfOrder==="number"?rec.shelfOrder:null),',
    '        w:rec.w||1, h:rec.h||1, path:p}])});',
  ];
  expect(i, want, 'the insert');
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '    /* THE UPLOAD\'S RETRY, FOR THE ROW TOO. The delete above has already',
    '       run, so one failed insert here left the group with no row for this',
    '       trait - and every teammate\'s next open deleted it as "removed by',
    '       someone else" (measured, 3 rows became 2). A definite answer is not',
    '       retried. A 409 on a RETRY means an earlier attempt landed and its',
    '       answer was lost: that row is read back by its identity and adopted.',
    '       Reported as refused, the record would keep pointing at the deleted',
    '       row and every later save from here would collide the same way. */',
    '    const rowBody=JSON.stringify([{collection_id:c.id, team_id:team, owner:u.id,',
    '        kind:rec.kind, name:rec.name,',
    '        layer:rec.layer||"unsorted", status:rec.status||"wip",',
    '        rarity:(typeof rec.rarity==="number"?rec.rarity:1),',
    '        shelf_order:(typeof rec.shelfOrder==="number"?rec.shelfOrder:null),',
    '        w:rec.w||1, h:rec.h||1, path:p}]);',
    '    const ident="collection_id=eq."+c.id',
    '        +"&kind=eq."+encodeURIComponent(rec.kind||"trait")',
    '        +"&name=eq."+encodeURIComponent(rec.name)',
    '        +"&layer=eq."+encodeURIComponent(rec.layer||"unsorted")',
    '        +"&status=eq."+encodeURIComponent(rec.status||"wip");',
    '    let r=null, adopted=null;',
    '    for(let attempt=0; attempt<PULL_TRIES; attempt++){',
    '      try{',
    '        r=await fetch(SB_URL+"/rest/v1/traits",{method:"POST",',
    '          headers:Object.assign({Prefer:"return=representation"},h), body:rowBody});',
    '        if(r.ok) break;',
    '        if(r.status===409 && attempt>0){',
    '          try{',
    '            const g=await fetch(SB_URL+"/rest/v1/traits?select=id,updated_at&"+ident,{headers:h});',
    '            const found=g.ok ? await g.json() : [];',
    '            if(Array.isArray(found) && found.length===1) adopted=found[0];',
    '          }catch(_){ }',
    '          break;',
    '        }',
    '        if(!cloudLater(r.status)) break;',
    '      }catch(_){ r=null; }',
    '      if(attempt<PULL_TRIES-1) await new Promise(x=>setTimeout(x,250*(attempt+1)));',
    '    }',
    '    if(!r && !adopted) return say("unreachable");',
  ]);
  swap('    if(!r.ok) return say(r.status===403 ? "notallowed"', ['    if(!adopted && !r.ok) return say(r.status===403 ? "notallowed"'], 'the refusal', syncR());
  swap('    if(r.ok){ try{ const made=(await r.json())[0]||{}; madeId=made.id||null; madeAt=made.updated_at||null; }', [
    '    if(adopted){ madeId=adopted.id||null; madeAt=adopted.updated_at||null; }',
    '    else if(r.ok){ try{ const made=(await r.json())[0]||{}; madeId=made.id||null; madeAt=made.updated_at||null; }',
  ], 'the made row', syncR());
  swap('    if(r.ok && rec.id){ const up=Object.assign({},rec,', ['    if((adopted||r.ok) && rec.id){ const up=Object.assign({},rec,'], 'the synced write', syncR());
}

/* ---- 2. one listing of the bucket, for the sweep and the catch-up ------- */
{
  const fn = kit.inFunction(L, 'async function cloudSweep(team,c,keepPaths){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* WHAT THE GROUP\'S STORAGE HOLDS under this collection. Lifted out of',
    '   cloudSweep so the sweep and the catch-up cannot disagree about it; the',
    '   rules are the sweep\'s own, recorded below: page until an EMPTY batch',
    '   (never a short one), and a listing that hits the page bound is not an',
    '   answer. ok:false means "could not tell", never "empty". */',
    'async function bucketPaths(team,c,h){',
    '  try{',
    '    h=h||await sbHeaders({"Content-Type":"application/json"});',
    '    if(!h) return {ok:false, list:[], paths:new Set()};',
    '    const prefix=team+"/"+c.id;',
    '    const found=[]; let offset=0;',
    '    for(let page=0;;page++){',
    '      if(page>=SWEEP_MAX_PAGES) return {ok:false, list:found, paths:new Set(found)};',
    '      const r=await fetch(SB_URL+"/storage/v1/object/list/traits",{method:"POST",headers:h,',
    '        body:JSON.stringify({prefix:prefix, limit:SWEEP_PAGE, offset:offset})});',
    '      if(!r.ok) return {ok:false, list:found, paths:new Set(found)};',
    '      const batch=await r.json();',
    '      if(!Array.isArray(batch)||!batch.length) break;',
    '      for(const o of batch) if(o&&o.name) found.push(prefix+"/"+o.name);',
    '      offset+=batch.length;',
    '    }',
    '    return {ok:true, list:found, paths:new Set(found)};',
    '  }catch(_){ return {ok:false, list:[], paths:new Set()}; }',
    '}',
    'async function cloudSweep(team,c,keepPaths){',
  ]);
}
{
  const swR = () => kit.inFunction(L, 'async function cloudSweep(team,c,keepPaths){');
  const fn = swR();
  const a = at('  const prefix=team+"/"+c.id;', 'the sweep prefix', fn);
  expect(a, ['  const prefix=team+"/"+c.id;', '  let found=[], offset=0;'], 'the sweep head');
  kit.replace(L, { start: a, end: a + 1 }, ['  /* The listing is bucketPaths now; the two rules below are its rules. */', '  const b=await bucketPaths(team,c,h);']);
  const t = at('  let truncated=false;', 'the sweep loop', swR());
  const loop = [
    '  let truncated=false;',
    '  for(let page=0;;page++){',
    '    if(page>=SWEEP_MAX_PAGES){ truncated=true; break; }',
    '    const r=await fetch(SB_URL+"/storage/v1/object/list/traits",{method:"POST",headers:h,',
    '      body:JSON.stringify({prefix:prefix, limit:SWEEP_PAGE, offset:offset})});',
    '    if(!r.ok) return 0;',
    '    const batch=await r.json();',
    '    if(!Array.isArray(batch)||!batch.length) break;',
    '    for(const o of batch) if(o&&o.name) found.push(prefix+"/"+o.name);',
    '    offset+=batch.length;',
    '  }',
  ];
  expect(t, loop, 'the sweep loop');
  kit.replace(L, { start: t, end: t + loop.length - 1 }, []);
  swap('  if(truncated) return 0;', ['  if(!b.ok) return 0;', '  const found=b.list;'], 'the sweep refusal', swR());
}

/* ---- 3. a missing row beside a present picture is not a deletion -------- */
{
  const fn = kit.inFunction(L, 'async function groupCatchUp(){');
  const i = at('        let gone=0;', 'the deletion pass', fn);
  const want = [
    '        let gone=0;',
    '        for(const it of mine){',
    '          if(!wsStill(gen)) break;',
    '          if(touchedSince(it.id,seq0)) continue;',
    '          if(onServer.has(shelfCore.recordKey(it))) continue;',
    '          await dbDel(it.id); gone++;',
    '        }',
    '        if(gone) toast(gone+" removed by someone else");',
  ];
  expect(i, want, 'the deletion pass');
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '        const cand=[];',
    '        for(const it of mine){',
    '          if(touchedSince(it.id,seq0)) continue;',
    '          if(onServer.has(shelfCore.recordKey(it))) continue;',
    '          cand.push(it);',
    '        }',
    '        /* A ROW MISSING BESIDE A PICTURE PRESENT IS A SAVE THAT HAS NOT',
    '           FINISHED, NOT A DELETION. Saving an edit deletes the row and',
    '           inserts it again; an insert that failed left a teammate\'s trait',
    '           rowless, and this deleted it from everybody (measured, 3 became',
    '           2). Every real removal takes the picture with it. Listed only',
    '           when there is something to decide; a listing that fails decides',
    '           nothing, and the question is asked again next open. */',
    '        let files=null;',
    '        if(cand.some(it=>it.path)){',
    '          try{',
    '            const u=await sbUser(), team=await cloudTeam();',
    '            const c=u ? await cloudCollection(u) : null;',
    '            if(team && c){ const b=await bucketPaths(team,c); if(b.ok) files=b.paths; }',
    '          }catch(_){ files=null; }',
    '        }',
    '        let gone=0, kept=0;',
    '        for(const it of cand){',
    '          if(!wsStill(gen)) break;',
    '          if(it.path && (files===null || files.has(it.path))){ kept++; continue; }',
    '          await dbDel(it.id); gone++;',
    '        }',
    '        const said=[];',
    '        if(gone) said.push(gone+" removed by someone else");',
    '        if(kept) said.push(kept+" kept - missing from the group\'s list, but "+(kept===1?"its picture is":"their pictures are")',
    '          +" still there, so a teammate\'s save may not have finished");',
    '        if(said.length) toast(said.join("; "));',
  ]);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('async function bucketPaths(team,c,h){');
  once('bucketPaths(', 3);
  /* bucketPaths, and cloudFilesLeft's one-page "is anything left" - a
     different question, left as it is. */
  once('/storage/v1/object/list/traits', 2);
  once('if(r.status===409 && attempt>0){');
  once('if(!adopted && !r.ok) return say(');
  once('if((adopted||r.ok) && rec.id){');
  once('if(it.path && (files===null || files.has(it.path))){ kept++; continue; }');
  /* The insert is inside the retry loop. */
  const s = code.indexOf('async function cloudSyncOne(rec,ctx,why){'), se = code.indexOf('\n}', s);
  const body = code.slice(s, se);
  const loopAt = body.indexOf('for(let attempt=0; attempt<PULL_TRIES; attempt++){', body.indexOf('const rowBody='));
  const postAt = body.indexOf('r=await fetch(SB_URL+"/rest/v1/traits",{method:"POST",');
  if (!(loopAt >= 0 && postAt > loopAt)) throw new Error('the insert is not inside the retry');
  /* The sweep lists through the helper and still refuses on a failed listing. */
  const w = code.indexOf('async function cloudSweep(team,c,keepPaths){'), we = code.indexOf('\n}', w);
  const sw = code.slice(w, we);
  if (sw.indexOf('const b=await bucketPaths(team,c,h);') < 0 || sw.indexOf('if(!b.ok) return 0;') < 0) throw new Error('the sweep does not use the helper');
});

fs.renameSync(TMP, FILE);
console.log('patch532 written, ' + grew + ' bytes');
