/* MANY WEIGHTS SET AT ONCE ARE ONE WRITE AND ONE REQUEST, NOT ONE EACH.

   Found 2026-09-22 by the discovery pass, ranked twenty-first of 39,
   measured by a verifier on the real layer counts. Planning a set - the
   first slider release on a layer, or "Set the rest to normal" - gives
   every unplanned trait the normal weight, and did it through setRarity one
   trait at a time: a store write, then, in a group, a PATCH by row id,
   awaited before the next. At 100 ms round trips the first release on
   backgrounds (47 traits) took 5.2 s and 47 requests, never more than one
   in flight; "Set the rest to normal" over 264 traits took 29 s. Every one
   of those traits gets the same number.

   setRarityMany writes them in one store transaction and, in a group,
   sends one PATCH per hundred rows (id=in.(...)), reading back which rows
   answered. What each outcome means is setRarity's, unchanged: a trait the
   group took is done; one it could not reach, or a personal page with no
   group to tell, is marked unsent for Save to cloud to patch (patch528);
   a refusal of the value is said once and marks nothing, since sending
   again would be refused again. The slider's own trait still goes through
   setRarity, being one.

   Measuring the batch showed the single send's blind spot: a PATCH that
   matches no row, because the row is gone, answers 200 with nothing in it,
   and cloudRarity called that sent. It asks for the rows back now, and an
   empty answer is not a delivery - the trait is marked unsent, and Save to
   cloud's patch then falls through to the upload it needs (patch528). */
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

{
  const fn = kit.inFunction(L, 'async function setRarity(rec,w){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* THE SAME WEIGHT FOR MANY TRAITS, as one store write and, in a group, one',
    '   PATCH per hundred rows. setRarity one at a time took 5.2 s for the 47',
    '   backgrounds and 29 s for "Set the rest to normal" over 264, one request',
    '   in flight (measured at 100 ms round trips). The outcomes mean what',
    '   setRarity\'s do. Returns how many changed. */',
    'const RARITY_BATCH=100;',
    'async function setRarityMany(recs,w){',
    '  const v = Math.round(w)===RAR_UNSET ? RAR_UNSET',
    '    : Math.max(RAR_MIN,Math.min(RAR_MAX,Math.round(w)||RAR_NORMAL));',
    '  const changed=(recs||[]).filter(r=>r && (typeof r.rarity==="number" ? r.rarity : RAR_UNSET)!==v)',
    '    .map(r=>Object.assign({},r,{rarity:v}));',
    '  if(!changed.length) return 0;',
    '  await dbApplyShelfRecords([],changed);',
    '  const behind=[];',
    '  const onServer=changed.filter(r=>r.rowId);',
    '  if(!activeWs){ for(const r of onServer) if(r.synced) behind.push(r); }',
    '  else {',
    '    let refused=false;',
    '    for(let i=0;i<onServer.length;i+=RARITY_BATCH){',
    '      const part=onServer.slice(i,i+RARITY_BATCH);',
    '      let got=null, status=0, body="";',
    '      try{',
    '        const h=await sbHeaders({"Content-Type":"application/json",Prefer:"return=representation"});',
    '        if(h){',
    '          const r=await fetch(SB_URL+"/rest/v1/traits?id=in.("+part.map(x=>encodeURIComponent(x.rowId)).join(",")+")",',
    '            {method:"PATCH", headers:h, body:JSON.stringify({rarity:v})});',
    '          status=r.status;',
    '          if(r.ok){ try{ got=await r.json(); }catch(_){ got=[]; } }',
    '          else { try{ body=await r.text(); }catch(_){ } }',
    '        }',
    '      }catch(_){ got=null; }',
    '      if(status===400 && /rarity/i.test(body)){ refused=true; continue; }',
    '      const answered=new Set((Array.isArray(got)?got:[]).map(x=>x&&x.id));',
    '      for(const r of part) if(!answered.has(r.rowId) && r.synced) behind.push(r);',
    '    }',
    '    if(refused) toast("The group will not take a rarity of "+v+" - its limit is lower than this page allows. Saved here only.");',
    '  }',
    '  if(behind.length) await dbApplyShelfRecords([],behind.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));',
    '  return changed.length;',
    '}',
  ]);
}
/* ---- the single send reads back its row too ------------------------------ */
{
  const fn = kit.inFunction(L, 'async function cloudRarity(rec){');
  swap('    const h=await sbHeaders({"Content-Type":"application/json"});', [
    '    /* return=representation, so a PATCH that matched no row - the row is',
    '       gone - is not read as sent. It answers 200 with nothing in it. */',
    '    const h=await sbHeaders({"Content-Type":"application/json",Prefer:"return=representation"});',
  ], 'the single headers', fn);
  const f2 = kit.inFunction(L, 'async function cloudRarity(rec){');
  swap('    if(r&&r.ok) return "ok";', [
    '    if(r&&r.ok){',
    '      let rows=null; try{ rows=await r.json(); }catch(_){ rows=null; }',
    '      return (Array.isArray(rows)&&rows.length===0) ? "unreachable" : "ok";',
    '    }',
  ], 'the single answer', f2);
}
{
  const i = at('        for(const r of g.rows)', 'the slider loop');
  if (L[i + 1] !== '          if(r.id!==t.id && !rarityPlanned(r) && await setRarity(r,RAR_NORMAL)) also++;') throw new Error('the slider loop moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '        /* The rest of the set at normal, as one write and one request. */',
    '        also=await setRarityMany(g.rows.filter(r=>r.id!==t.id && !rarityPlanned(r)),RAR_NORMAL);',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function seedRarity(list){');
  swap('  let done=0;', ['  let done=0;', '  /* One write and one request for the lot. */'], 'the seed counter', fn);
  swap('  for(const t of want){ if(await setRarity(t,RAR_NORMAL)) done++; }', ['  done=await setRarityMany(want,RAR_NORMAL);'], 'the seed loop', fn);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('async function setRarityMany(recs,w){');
  once('setRarityMany(', 3);
  if (times('await setRarity(r,RAR_NORMAL)') || times('await setRarity(t,RAR_NORMAL)')) throw new Error('a loop of single weights is left');
});

fs.renameSync(TMP, FILE);
console.log('patch548 written, ' + grew + ' bytes');
