/* THE SHARE ESTIMATE NEVER FREEZES THE PAGE.

   Found 2026-09-22 by the discovery pass, ranked seventh of 39. With any
   Never-together rule the shelf's percentages come from distributionOf,
   which draws 20,000 characters with the rules applied. It ran as one
   synchronous task at the end of every render whose inputs had changed:
   2.0-2.9 s on the real collection (311 traits, 188 rules) on every open,
   1.6-2.0 s after every weight edit, rule change, rename and status press
   that moves a trait in or out, and roughly 10 s on a phone. Each render
   queued its own and none was cancelled, so five quick edits blocked the
   page for 8-10 s. Generate set ran it again, cold, over the final set.

   Four changes, none of which alters a single figure:

   ONE, CHEAPER DRAWS. Every layer of every draw filtered its candidates
   through conflictsWith, which rebuilt the traitKey of every trait already
   on the character for every candidate - 3.7 million calls per estimate on
   the real rules. buildCombo keeps the keys of what it has chosen beside
   the choices and asks clashesKeys, the same predicate over keys.

   TWO, IN SLICES. distributionLater makes the same 20,000 draws from the
   same seed in slices of a few milliseconds when the page is idle, with
   its own generator swapped in for each slice, so the sequence is
   identical to one uninterrupted run and so are the figures. A newer
   request for different inputs stops an older one from the same caller;
   a request for the same inputs joins the run already going.

   THREE, REMEMBERED. The last four estimates are kept in memory, keyed by
   the whole input as before, and saved on this device by a hash of that
   key. An unchanged collection opens with its figures already there and
   draws nothing. Saved, not synced, for the reason the pixel blocks are:
   it is derived, belongs to this device, and is recomputed exactly from
   what is synced.

   FOUR, A KEY THAT NAMES EVERY INPUT. The key's own contract is that every
   input which changes the answer appears in it. The decide order did not:
   buildCombo walks decideOrder(), so after importing a rules file that
   reorders decisions the shelf kept the figures for the old order until
   something else changed. It is in the key now - which matters more once
   an estimate outlives the page.

   The synchronous distributionOf stays for anyone who needs the answer
   now, and answers from what is remembered. The shelf asks
   distributionLater, which answers a remembered estimate at once; Generate
   set waits on it before it reports drift. */
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

/* ---- ONE: buildCombo keeps the keys of what it chose ---------------------- */
{
  const fnR = () => kit.inFunction(L, 'function buildCombo(pools){');
  swap('  const out=[]; let violated=false;', [
    '  const out=[]; let violated=false;',
    '  /* The keys of what is on the character, kept beside it. Filtering a layer',
    '     rebuilt every one of these for every candidate - 3.7 million traitKey',
    '     calls per estimate on the real rules. Same question, asked of keys. */',
    '  const outKeys=[];',
    '  const take=r=>{ out.push(r); outKeys.push(traitKey(r)); };',
  ], 'the combo start', fnR());
  swap('  if(base&&base.length) out.push(weightedPick(base));', ['  if(base&&base.length) take(weightedPick(base));'], 'the base pick', fnR());
  swap('    const ok = RULES.length ? p.filter(r=>!conflictsWith(r,out)) : p;',
    ['    const ok = RULES.length ? p.filter(r=>!clashesKeys(traitKey(r),outKeys)) : p;'], 'the filter', fnR());
  swap('      out.push(weightedPick(p));', ['      take(weightedPick(p));'], 'the cornered pick', fnR());
  swap('    out.push(weightedPick(ok));', ['    take(weightedPick(ok));'], 'the pick', fnR());
}
{
  const fn = kit.inFunction(L, 'function conflictsWith(rec,chosen){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* conflictsWith over keys already made: k is the candidate\'s traitKey and',
    '   keys those of the traits already chosen. The same predicate - o!==k',
    '   included, for the reason given above. buildCombo asks this, because it',
    '   has the keys and was rebuilding them for every candidate. */',
    'function clashesKeys(k,keys){',
    '  if(!RULES.length) return false;',
    '  const bad=clashSet(k);',
    '  if(!bad) return false;',
    '  for(const o of keys) if(o!==k && bad.has(o)) return true;',
    '  return false;',
    '}',
  ]);
}

/* ---- TWO, THREE, FOUR: the estimate ------------------------------------ */
{
  const fn = kit.inFunction(L, 'function distributionOf(items,wipIncluded){');
  const body = L.slice(fn.start, fn.end + 1);
  const must = [
    '  const key=JSON.stringify([elig,RULES,emptyChance,!!wipIncluded,LAYERS,[...HIDDEN_LAYERS].sort()]);',
    '  if(distCache && distKey===key) return distCache;',
    '  withSeed(DIST_SEED,()=>{',
    '  distCache=count; distKey=key;',
  ];
  for (const m of must) if (body.indexOf(m) < 0) throw new Error('distributionOf moved: ' + m);
  if (fn.end - fn.start + 1 !== 35) throw new Error('distributionOf is ' + (fn.end - fn.start + 1) + ' lines, not 35');
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* THE KEY: everything that can change the answer. Split out so the shelf,',
    '   the synchronous estimate and the sliced one cannot disagree about it.',
    '   decideOrder() is in it because buildCombo walks that order and a rule',
    '   bites whichever of its pair is decided later - it was missing, so an',
    '   import that reordered decisions left the old order\'s figures up. */',
    'function distKeyOf(items,wipIncluded){',
    '  const elig=(items||[]).filter(t=>traitEligible(t,wipIncluded)&&!HIDDEN_LAYERS.has(t.layer||"unsorted"))',
    '    .map(t=>traitKey(t)+":"+traitWeight(t)).sort();',
    '  /* HIDDEN_LAYERS is named in the key as well as filtered out of elig. The',
    '     filter alone would be exact, but the key\'s whole contract is that every',
    '     input which changes the answer appears in it. */',
    '  return JSON.stringify([elig,RULES,emptyChance,!!wipIncluded,LAYERS,[...HIDDEN_LAYERS].sort(),decideOrder()]);',
    '}',
    '/* REMEMBERED ESTIMATES. Four in memory, because the shelf, the include-wip',
    '   tick and Generate set\'s final set are different inputs and one slot made',
    '   them evict each other. The same four saved on this device under a hash',
    '   of the key - the key itself runs to tens of kilobytes with the rules in',
    '   it - so an unchanged collection opens without drawing anything.',
    '   distCache and distKey still name the last one answered. */',
    'const DIST_KEEP=4;',
    'const distMemo=new Map();',
    'function distStoreKey(){ return "pb.dist."+wsDbName(); }',
    '/* 53 bits, and the key\'s length is kept beside it: two keys that collide',
    '   on both are not a thing this page will meet. */',
    'function distHash(s){',
    '  let h1=0xdeadbeef, h2=0x41c6ce57;',
    '  for(let i=0;i<s.length;i++){',
    '    const c=s.charCodeAt(i);',
    '    h1=Math.imul(h1^c,2654435761); h2=Math.imul(h2^c,1597334677);',
    '  }',
    '  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);',
    '  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);',
    '  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);',
    '}',
    'function distSaved(){',
    '  try{ const s=JSON.parse(localStorage.getItem(distStoreKey())||"[]"); return Array.isArray(s)?s:[]; }',
    '  catch(_){ return []; }',
    '}',
    'function distRecall(key){',
    '  if(distCache && distKey===key) return distCache;',
    '  let c=distMemo.get(key);',
    '  if(!c){',
    '    const h=distHash(key);',
    '    const e=distSaved().find(x=>x&&x.h===h&&x.len===key.length&&x.n===DIST_DRAWS);',
    '    if(e&&Array.isArray(e.c)&&e.c.length){',
    '      try{ c=new Map(e.c); }catch(_){ c=null; }',
    '    }',
    '    if(!c) return null;',
    '  }',
    '  distKeep(key,c,false);',
    '  return c;',
    '}',
    'function distKeep(key,count,save){',
    '  distMemo.delete(key); distMemo.set(key,count);',
    '  while(distMemo.size>DIST_KEEP) distMemo.delete(distMemo.keys().next().value);',
    '  distCache=count; distKey=key;',
    '  if(!save) return;',
    '  try{',
    '    const h=distHash(key);',
    '    const keep=distSaved().filter(x=>x&&x.h!==h);',
    '    keep.unshift({h:h, len:key.length, n:DIST_DRAWS, c:[...count]});',
    '    localStorage.setItem(distStoreKey(),JSON.stringify(keep.slice(0,DIST_KEEP)));',
    '  }catch(_){}',
    '}',
    '/* One character drawn and counted. The only place the estimate draws, so',
    '   the synchronous and sliced runs cannot count differently. */',
    'function distDraw(pools,count){',
    '  for(const r of randomCombo(pools)){',
    '    const k=traitKey(r); count.set(k,(count.get(k)||0)+1);',
    '  }',
    '}',
    'function distributionOf(items,wipIncluded){',
    '  const key=distKeyOf(items,wipIncluded);',
    '  const had=distRecall(key);',
    '  if(had) return had;',
    '  const pools=poolsForDistribution(items,wipIncluded);',
    '  const count=new Map();',
    '  /* The estimator\'s own draws are not the collection\'s failures. randomCombo',
    '     counts a miss whenever a draw cannot satisfy the rules, and this makes',
    '     20,000 of them to work out a percentage - none of which anybody asked for',
    '     or kept. Measured before this: generating a 1-character collection left',
    '     ruleMisses at 200, and asking the shelf for one trait\'s chance took it to',
    '     20,200, which the sheet then reported as characters.',
    '',
    '     Saved and restored rather than zeroed afterwards: uniqueCombos owns the',
    '     zeroing, and an estimate can be asked for at any moment - including',
    '     between generating a collection and reading the number off it. */',
    '  const misses=ruleMisses;',
    '  withSeed(DIST_SEED,()=>{',
    '    for(let i=0;i<DIST_DRAWS;i++) distDraw(pools,count);',
    '  });',
    '  ruleMisses=misses;',
    '  /* An empty distribution is not an answer, and caching one is what turned a',
    '     single mis-ordered render into a permanent 0.00% on every tile. Left',
    '     uncached, any later call recomputes and repairs itself. */',
    '  if(!count.size) return count;',
    '  distKeep(key,count,true);',
    '  return count;',
    '}',
    '/* THE SAME ESTIMATE WITHOUT STOPPING THE PAGE. 20,000 draws in one task was',
    '   2.0-2.9 s on the real collection and about ten seconds on a phone, on',
    '   every open and after every edit that changed an input.',
    '',
    '   The draws are made in slices of a few milliseconds when the page is idle.',
    '   Each slice swaps in this run\'s own generator and puts the page\'s back,',
    '   so the run draws exactly the sequence one uninterrupted withSeed would,',
    '   and anything drawing between slices draws from its own source. ruleMisses',
    '   is put back after every slice, for the reason distributionOf gives.',
    '',
    '   ONE RUN PER CALLER. A request for different inputs stops the caller\'s',
    '   older run - five quick weight edits used to cost five full estimates -',
    '   and a request for the same inputs joins it. The pools are read at the',
    '   first slice, not at the request, because the shelf asks before the',
    '   compose rows that cPools reads are built. The key is taken again at the',
    '   end, and a run whose inputs moved underneath it is not remembered.',
    '',
    '   Resolves to the Map, or to null when stopped or when nothing was drawn. */',
    'const DIST_SLICE_MS=12;',
    'const distRuns=new Map();',
    'function distributionLater(items,wipIncluded,lane){',
    '  const key=distKeyOf(items,wipIncluded);',
    '  const had=distRecall(key);',
    '  if(had) return Promise.resolve(had);',
    '  const who=lane||"shelf";',
    '  const was=distRuns.get(who);',
    '  if(was&&was.key===key) return was.promise;',
    '  if(was) was.stop=true;',
    '  const run={key:key, stop:false, promise:null};',
    '  run.promise=new Promise(resolve=>{',
    '    const gen=mulberry32(DIST_SEED>>>0);',
    '    const count=new Map();',
    '    let pools=null, drawn=0;',
    '    const end=v=>{ if(distRuns.get(who)===run) distRuns.delete(who); resolve(v); };',
    '    const later=f=>{',
    '      if(typeof requestIdleCallback==="function") requestIdleCallback(f,{timeout:250});',
    '      else setTimeout(f,0);',
    '    };',
    '    const slice=()=>{',
    '      if(run.stop){ end(null); return; }',
    '      /* Answered meanwhile by someone who could not wait. */',
    '      const done=distRecall(key);',
    '      if(done){ end(done); return; }',
    '      const until=performance.now()+DIST_SLICE_MS;',
    '      const src=rngSource, misses=ruleMisses;',
    '      rngSource=gen;',
    '      try{',
    '        if(!pools) pools=poolsForDistribution(items,wipIncluded);',
    '        do{ distDraw(pools,count); drawn++; }',
    '        while(drawn<DIST_DRAWS && ((drawn&15)!==0 || performance.now()<until));',
    '      }catch(_){ rngSource=src; ruleMisses=misses; end(null); return; }',
    '      rngSource=src; ruleMisses=misses;',
    '      if(drawn<DIST_DRAWS){ later(slice); return; }',
    '      if(!count.size || distKeyOf(items,wipIncluded)!==key){ end(null); return; }',
    '      distKeep(key,count,true);',
    '      end(count);',
    '    };',
    '    later(slice);',
    '  });',
    '  distRuns.set(who,run);',
    '  return run.promise;',
    '}',
  ]);
}

/* ---- the shelf: a remembered estimate at once, otherwise later ---------- */
{
  const fnR = () => kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const f = fnR();
  const i = at('  if(pctLater.length){', 'the deferred pass', f);
  const want = [
    '  if(pctLater.length){',
    '    const finish=()=>{',
    '      let dist=null;',
    '      try{ dist=distributionOf(items,wipOn); }catch(_){ return; }',
    '      for(const e of pctLater){',
    '        if(!e.el.isConnected) continue;',
    '        let ch=null;',
    '        try{ ch=traitChance(e.rec,items,wipOn,dist); }catch(_){ continue; }',
    '        if(!ch||ch.pct===null) continue;',
    '        paintPct(e.el,ch,e.rec);',
    '      }',
    '    };',
    '    if(typeof requestIdleCallback==="function") requestIdleCallback(finish,{timeout:1200});',
    '    else setTimeout(finish,0);',
    '  }',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the deferred pass moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '  if(pctLater.length){',
    '    /* In slices, and superseded by the next render that asks about',
    '       different inputs - see distributionLater. An estimate already',
    '       worked out for these inputs, this visit or a saved one, resolves at',
    '       once and is painted before the browser draws a frame. */',
    '    distributionLater(items,wipOn).then(dist=>{',
    '      if(!dist) return;',
    '      for(const e of pctLater){',
    '        if(!e.el.isConnected) continue;',
    '        let ch=null;',
    '        try{ ch=traitChance(e.rec,items,wipOn,dist); }catch(_){ continue; }',
    '        if(!ch||ch.pct===null) continue;',
    '        paintPct(e.el,ch,e.rec);',
    '      }',
    '    });',
    '  }',
  ]);
}

/* ---- Generate set: the drift report waits on the sliced estimate -------- */
{
  const i = at('    const cstat=comboStats(r.pool,false);', 'the report');
  kit.replace(L, { start: i, end: i }, [
    '    /* shareDrift asks every trait its chance over the final set, which is',
    '       an estimate of its own when rules exist - 0.8 to 2.6 s in one task.',
    '       Worked out in slices first, so shareDrift answers from memory. */',
    '    if(RULES.length) await distributionLater(r.pool,false,"set");',
    '    const cstat=comboStats(r.pool,false);',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('function distributionLater(items,wipIncluded,lane){');
  once('function clashesKeys(k,keys){');
  once('distDraw(pools,count)', 3);
  once('distributionLater(', 3);
  once('function distKeyOf(items,wipIncluded){');
  once('distKeyOf(', 4);
  if (times('conflictsWith(r,out)')) throw new Error('buildCombo still rebuilds keys');
  if (times('requestIdleCallback(finish')) throw new Error('the one-task finish is still there');
});

fs.renameSync(TMP, FILE);
console.log('patch550 written, ' + grew + ' bytes');
