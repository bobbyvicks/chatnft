/* A FOLDER IS FIXED ON SEVERAL CORES.

   A batch ran one engine: decode a file, send it to the worker, wait,
   finish it on the page, then start the next. Measured on 39 real traits,
   17.1 s, of which 14.6 s was the engine - one core working, the others
   idle, and the page waiting on it.

   Now up to three engines run at once - one fewer than the machine's
   cores, one on a device that reports under 4 GB, never more than the
   folder has files. The loop is split where the engine is asked: PREPARE
   (read the file, shrink it, pick its step, send it) runs ahead for as
   many files as there are engines, and FINISH (the checks, the tile, the
   running totals) takes the answers back strictly in folder order, so
   every total, list and tile comes out in the order it did before.

   The answers cannot change with the number of engines: PF.process resets
   the k-means generator at the start of every image (982c309), so an
   image's result does not depend on what that engine ran before it.

   Stop still means "after this one": the file being finished is kept, and
   the ones already sent ahead are dropped with their engines. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = () => kit.inFunction(L, 'async function fixBatchRun(files){');
const a = kit.only(L, l => l === '  for(let i=0;i<list.length;i++){', 'the loop', fn());
const z = kit.only(L, l => l === '  if(w){ try{ w.terminate(); }catch(_){} try{ URL.revokeObjectURL(w._url); }catch(_){} }', 'the end', fn());
/* The loop's close: the last '  }' before the end, past the comment
   that sits between them. */
let close = z - 1;
while (close > a && L[close] !== '  }') close--;
if (close <= a) throw new Error('no loop close');
if (!L.slice(close + 1, z).every(l => /^\s*(\/\*|\*|[^;{}]*\*\/\s*$|[a-zA-Z_ .,()'"-]*$)/.test(l))) throw new Error('code between the loop and the end: ' + L.slice(close + 1, z).join(' | '));
const body = L.slice(a + 1, close);

if (body[0] !== '    if(fixBatchStop) break;') throw new Error('the loop does not start with the stop check');
const askAt = body.findIndex(l => l === '    const r=scale ? {ok:{data:px, width:sw, height:sh, stepX:1, stepY:1}}');
if (askAt < 0) throw new Error('the engine call moved');
if (body[askAt + 1] !== '      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:sw, height:sh,') throw new Error('the ask moved');
const askEnd = body.findIndex((l, k) => k > askAt && l === '          return s>0?s:null; })()});');
if (askEnd < 0) throw new Error('the end of the ask moved');
if (body[askEnd + 1] !== '    if(!r||r.error){ failed.push(name+" ("+((r&&r.error)||"no answer")+")"); continue; }') throw new Error('the answer check moved');

/* PREPARE: from the file to the ask, sent and not awaited. */
const prep = body.slice(1, askEnd + 1).map(l => {
  if (l === '    const r=scale ? {ok:{data:px, width:sw, height:sh, stepX:1, stepY:1}}')
    return '    const pending=scale ? Promise.resolve({ok:{data:px, width:sw, height:sh, stepX:1, stepY:1}})';
  if (l === '      : await fixAsk(w,{data:new Uint8ClampedArray(px), width:sw, height:sh,')
    return '      : fixAsk(wk,{data:new Uint8ClampedArray(px), width:sw, height:sh,';
  return l;
}).map(l => l.replace(/\bcontinue;/g, 'return null;'));
/* FINISH: from the answer to the tile. */
const fin = body.slice(askEnd + 1).map(l => {
  if (l === '    if(!r||r.error){ failed.push(name+" ("+((r&&r.error)||"no answer")+")"); continue; }')
    return '    if(!r||r.error){ failed.push(name+" ("+((r&&r.error)||"no answer")+")"); return; }';
  return l;
});
if (fin.some(l => /\bcontinue;|\bbreak;/.test(l))) throw new Error('a continue or break is left in the finish');
if (prep.some(l => /\bbreak;/.test(l))) throw new Error('a break is left in the prepare');

const ind = (lines) => lines.map(l => l ? '  ' + l : l);
kit.replace(L, { start: a, end: close }, [
  '  /* SEVERAL ENGINES, ONE ORDER. Prepare runs ahead for as many files as',
  '     there are engines, each on its own engine with one image in flight;',
  '     finish takes the answers back in folder order, so every total, list',
  '     and tile is in the order it was with one. PF.process resets its',
  '     generator per image, so the answers are the same too. */',
  '  const pool=[w];',
  '  if(!scale){ const n=fixEnginesFor(list.length);',
  '    for(let k=1;k<n;k++){ try{ pool.push(fixWorker()); }catch(_){ break; } } }',
  '  fixBatchWorkers=pool.filter(Boolean);',
  '  const prepare=async(i,wk)=>{',
  ...ind(prep),
  '    return {name:name, rel:rel, px:px, sw:sw, sh:sh, pending:pending};',
  '  };',
  '  const finish=async(job)=>{',
  '    const name=job.name, rel=job.rel, px=job.px, sw=job.sw, sh=job.sh;',
  '    const r=await job.pending;',
  ...ind(fin),
  '  };',
  '  const ahead=[]; let next=0;',
  '  for(;;){',
  '    while(ahead.length<pool.length && next<list.length && !fixBatchStop){',
  '      const i=next++; ahead.push(await prepare(i,pool[i%pool.length]));',
  '    }',
  '    if(!ahead.length) break;',
  '    const job=ahead.shift();',
  '    if(job) await finish(job);',
  '    /* "Stopping after this one": that one is kept, the ones sent ahead',
  '       are dropped with their engines below. */',
  '    if(fixBatchStop) break;',
  '  }',
  '  for(const x of pool.slice(1)){ try{ x.terminate(); }catch(_){} try{ URL.revokeObjectURL(x._url); }catch(_){} }',
  '  fixBatchWorkers=[];',
]);

/* The count, and the holder the page can see. */
{
  const i = kit.only(L, l => l === 'let fixBatchFiles=null, fixBatchStop=false, fixBatchWorker=null;', 'the batch state');
  kit.replace(L, { start: i, end: i }, [
    'let fixBatchFiles=null, fixBatchStop=false, fixBatchWorker=null, fixBatchWorkers=[];',
    '/* HOW MANY ENGINES a folder runs on: one fewer than the cores, so the page',
    '   keeps one, at most three, one on a device that says it has under 4 GB',
    '   - each engine holds its own copy of the image it is on - and never',
    '   more than there are files. A let, so a test can set it. */',
    'let FIX_ENGINES_MAX=3;',
    'function fixEnginesFor(files){',
    '  const cores=(navigator.hardwareConcurrency|0)||2;',
    '  const mem=navigator.deviceMemory;',
    '  if(typeof mem==="number" && mem<4) return 1;',
    '  return Math.max(1, Math.min(FIX_ENGINES_MAX, cores-1, files|0));',
    '}',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch583 written');
