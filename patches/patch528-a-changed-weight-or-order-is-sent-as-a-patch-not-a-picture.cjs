/* A CHANGED WEIGHT OR ORDER IS SENT AS A PATCH, NOT A PICTURE.

   patch525 made every change the server has not got say so: on a personal
   page a reweight or a reorder marks the record unsent, and the next Save
   to cloud sends it. Save to cloud knew one way to send a record - upload
   the picture, delete the row, insert a new one - so a reorder of a whole
   layer on a personal page queued every picture in it for re-upload, about
   a gigabyte on the real collection to move some integers. The commit that
   shipped 525 said so and called it the honest cost. It is a cost with a
   cheaper honest form, which the group page already uses: cloudRarity
   PATCHes the row by id and touches no storage, and the shelf move RPC
   does the same for order.

   Two changes. markUnsent kept dropping the record's stored path, a habit
   inherited from the status-change block it replaced, where the path was
   genuinely stale. It now keeps the path when the path still describes the
   record - same name, layer and status, which is what the path is made of
   - and drops it only when the identity moved. And Save to cloud, meeting
   a record that is unsent but whose row and path still stand, PATCHes the
   row's weight and order by id instead of uploading; if the PATCH matches
   no row, the row is gone and the record takes the full upload it would
   have taken anyway. The note says how many went that way.

   THE RECORD SAYS WHICH KIND OF CHANGE IT HOLDS. A kept path is not enough
   to choose the patch: an older pull put paths on unsent records too, and
   a record whose picture failed to upload months ago could still be sitting
   in somebody's store with a path that describes it. Patching its row would
   mark it synced and never send the picture. So the two places that mark a
   metadata change write unsent:"meta" on the record, both senders clear it
   on success, and only a record carrying the word is patched; every other
   unsent record is uploaded as before. stillnotsent.spec.js holds exactly
   such a record and caught the first draft of this.

   The path's tail is built in one place now, cloudTail, which cloudPath
   uses; the two had to agree and there was no reason to write it twice. */
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

/* ---- 1. the tail, in one place ------------------------------------------ */
{
  const i = at('const cloudPath=(team,c,it)=>team+"/"+c.id+"/"+', 'cloudPath');
  const want = [
    '  (it.kind==="ref"?"ref":"trait")+"-"+String(it.name).replace(/[^a-z0-9._-]+/gi,"-")+',
    '  "-"+(it.layer||"none")+"-"+(it.status||"none")+".png";',
  ];
  if (L[i + 1] !== want[0] || L[i + 2] !== want[1]) throw new Error('cloudPath body is not the two lines expected');
  kit.replace(L, { start: i, end: i + 2 }, [
    '/* THE FILE NAME A RECORD HAS ON THE SERVER, from the three things that',
    '   identify it. Kept apart from the folder so a record can be asked whether',
    '   its stored path still describes it. */',
    'const cloudTail=(it)=>(it.kind==="ref"?"ref":"trait")+"-"+String(it.name).replace(/[^a-z0-9._-]+/gi,"-")+',
    '  "-"+(it.layer||"none")+"-"+(it.status||"none")+".png";',
    'const cloudPath=(team,c,it)=>team+"/"+c.id+"/"+cloudTail(it);',
  ]);
}

/* ---- 2. markUnsent keeps a path that still describes the record --------- */
{
  const fn = kit.inFunction(L, 'async function markUnsent(rec){');
  swap('  delete honest.path;', [
    '  /* THE PATH STAYS WHEN IT STILL DESCRIBES THE RECORD - a reweight or a',
    '     reorder leaves name, layer and status alone, and the picture is still',
    '     at that path. Dropped when the identity moved, because then the path',
    '     names the server\'s old object. And the record SAYS which kind of',
    '     change it holds: unsent:"meta" means only weight or order moved and',
    '     the picture at the path is the server\'s. A record unsent for any',
    '     other reason - a picture that could not be uploaded - carries no',
    '     such word, and Save to cloud uploads it. The word is the only thing',
    '     that lets a row be patched instead; a kept path alone is not enough,',
    '     because an older pull put paths on unsent records too. */',
    '  if(stored.path && String(stored.path).slice(-cloudTail(stored).length)===cloudTail(stored)) honest.unsent="meta";',
    '  else { delete honest.path; delete honest.unsent; }',
  ], 'the path drop', fn);
}

/* ---- 3. the patch, beside the live one it mirrors ------------------------ */
{
  const fn = kit.inFunction(L, 'async function cloudRarity(rec){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* SEND A WEIGHT AND AN ORDER WITHOUT THE PICTURE, for Save to cloud. The',
    '   record is unsent but its row and path still stand, so the row is',
    '   patched by id - what cloudRarity does live in a group - and the record',
    '   is marked synced on the row that answered. false when no row answered:',
    '   the row is gone, and the caller uploads as it would have. */',
    'async function cloudPatchOne(rec,ctx){',
    '  if(!rec||!rec.rowId) return false;',
    '  try{',
    '    const h=(ctx&&ctx.h)||await sbHeaders({"Content-Type":"application/json"});',
    '    if(!h) return false;',
    '    const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),',
    '      {method:"PATCH", headers:Object.assign({Prefer:"return=representation"},h),',
    '       body:JSON.stringify({rarity:(typeof rec.rarity==="number"?rec.rarity:1),',
    '         shelf_order:(typeof rec.shelfOrder==="number"?rec.shelfOrder:null)})});',
    '    if(!r.ok) return false;',
    '    let rows=[]; try{ rows=await r.json(); }catch(_){ rows=[]; }',
    '    if(!Array.isArray(rows)||rows.length!==1) return false;',
    '    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;',
    '    try{ await dbPut(up); }catch(_){}',
    '    return true;',
    '  }catch(_){ return false; }',
    '}',
  ]);
}

/* ---- 3b. the other two writers of the flag agree about the word ----------- */
{
  const fn = kit.inFunction(L, 'async function setRarity(rec,w){');
  swap('  if((sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced) await dbPut({...next, synced:false});',
    ['  if((sent==="unreachable"||sent==="nogroup") && next.rowId && next.synced) await dbPut({...next, synced:false, unsent:"meta"});'],
    'the rarity mark', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudSyncOne(rec,ctx,why){');
  const i = at('    if(r.ok && rec.id){ try{ await dbPut(Object.assign({},rec,', 'the synced write', fn);
  if (L[i + 1] !== '      {synced:true, rowId:madeId, path:p, rowAt:madeAt})); }catch(_){} }') throw new Error('the synced write is not the two lines expected');
  kit.replace(L, { start: i, end: i + 1 }, [
    '    /* Whatever the record was unsent for, it is sent now. */',
    '    if(r.ok && rec.id){ const up=Object.assign({},rec,',
    '      {synced:true, rowId:madeId, path:p, rowAt:madeAt}); delete up.unsent;',
    '      try{ await dbPut(up); }catch(_){} }',
  ]);
}

/* ---- 4. Save to cloud takes the cheaper honest form ----------------------- */
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  swap('  let saved=0, failed=0, done=0;', ['  let saved=0, failed=0, done=0, patched=0;'], 'the counters', fn);
}
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  const i = at('    if(it.synced && it.rowId && it.path===p){ unchangedSkipped++; rows.push({path:p}); }', 'the skip', fn);
  if (L[i + 1] !== '    else fresh.push(it);') throw new Error('the push classification is not the two lines expected');
  kit.replace(L, { start: i, end: i + 1 }, [
    '    if(it.synced && it.rowId && it.path===p){ unchangedSkipped++; rows.push({path:p}); }',
    '    /* UNSENT, BUT THE ROW AND THE PICTURE STILL STAND: only the weight or',
    '       the order changed, so the row is patched rather than the picture',
    '       re-uploaded. A reorder of a layer used to queue every picture in it. */',
    '    else if(!it.synced && it.unsent==="meta" && it.rowId && it.path===p && it.kind==="trait") fresh.push({light:true, it:it});',
    '    else fresh.push({light:false, it:it});',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  const i = at('      const it=fresh[next++];', 'the pusher', fn);
  const want = [
    '      const okd=await cloudSyncOne(it,ctx);',
    '      if(okd){ saved++; rows.push({path:cloudPath(team,c,it)}); }',
    '      else failed++;',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + 1 + k] !== want[k]) throw new Error('the pusher body moved at +' + k);
  kit.replace(L, { start: i, end: i + want.length }, [
    '      const job=fresh[next++], it=job.it;',
    '      /* The patch first for a light one; a row that is gone falls through',
    '         to the upload it would have had. */',
    '      let okd=false;',
    '      if(job.light && await cloudPatchOne(it,ctx)){ okd=true; patched++; }',
    '      else if(await cloudSyncOne(it,ctx)){ okd=true; saved++; }',
    '      if(okd) rows.push({path:cloudPath(team,c,it)});',
    '      else failed++;',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  swap('  if(unchangedSkipped) bits.push(unchangedSkipped+" already up to date");', [
    '  if(unchangedSkipped) bits.push(unchangedSkipped+" already up to date");',
    '  if(patched) bits.push(patched+" updated without re-uploading the picture");',
  ], 'the note', fn);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('const cloudTail=(it)=>');
  once('const cloudPath=(team,c,it)=>team+"/"+c.id+"/"+cloudTail(it);');
  once('cloudTail(', 3);      /* cloudPath, two in markUnsent; the definition is an arrow */
  once('async function cloudPatchOne(rec,ctx){');
  once('cloudPatchOne(', 2);
  once('fresh.push({light:true, it:it});');
  once('it.unsent==="meta"');
  once('honest.unsent="meta"');
  once('unsent:"meta"');
  once('delete up.unsent;', 2);
  once('fresh.push({light:false, it:it});');
  once('bits.push(patched+" updated without re-uploading the picture")');
  /* The push no longer reads fresh entries as records. */
  const p = code.indexOf('async function cloudPush(){'), pe = code.indexOf('\n}', p);
  const body = code.slice(p, pe);
  if (body.indexOf('fresh.push(it)') >= 0) throw new Error('a bare record still enters fresh');
  if (body.indexOf('const job=fresh[next++], it=job.it;') < 0) throw new Error('the pusher does not unpack the job');
  /* markUnsent still drops the path when the identity moved. */
  const m = code.indexOf('async function markUnsent(rec){'), me = code.indexOf('\n}', m);
  if (code.slice(m, me).indexOf('delete honest.path;') < 0) throw new Error('markUnsent never drops the path');
});

fs.renameSync(TMP, FILE);
console.log('patch528 written, ' + grew + ' bytes');
