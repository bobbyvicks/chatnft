/* A SECOND TAB SEES THE FIRST, AND A STALE CARD CANNOT DUPLICATE A TRAIT.

   Found 2026-09-22 by the discovery pass, ranked ninth of 39, reproduced
   by a finder and two verifiers with real clicks. Each tab draws from its
   own read of the store and redraws only after its own actions; nothing
   listened for another tab's. Tab A moved cap wip -> approved -> stfp; tab
   B still showed wip three to five seconds later, through focus and
   visibility changes. Pressing B's chip then ran setTraitStatus on the
   card's old record: it checked only that the NEW id was free, deleted the
   already-gone wip id and wrote a fresh approved copy - the store held cap
   twice, approved and stfp, and Save to cloud uploaded both. The toast said
   "cap -> approved".

   Two changes. The store's three writers tell the other tabs of this
   project that something changed, on a BroadcastChannel, at most once per
   quiet moment rather than once per write; a tab told so redraws its shelf
   and, if it is showing it, the final project page. And setTraitStatus
   re-reads the record it was handed before it moves it: if the record is
   gone, or no longer the one the card was drawn from, it refuses with
   {stale:true}, and both callers say that the trait changed in another tab
   and redraw, rather than acting on a picture of the store that is out of
   date. */
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

/* ---- 1. the writers tell the other tabs --------------------------------- */
swap('function touch(id){ if(id!=null) touchedAt.set(String(id),++touchSeq); }', [
  'function touch(id){ if(id!=null) touchedAt.set(String(id),++touchSeq); tabsTell(); }',
  '/* THE OTHER TABS OF THIS PROJECT, told that the store changed. Nothing',
  '   listened: a second tab showed a trait as wip after the first had moved',
  '   it twice, and a press on that stale card wrote the trait a second time',
  '   (measured). Every store write passes through touch, so this is told',
  '   once per quiet moment rather than once per write - a pull is hundreds of',
  '   writes. A tab told so redraws what it is showing. */',
  'const tabChan=(typeof BroadcastChannel==="function") ? new BroadcastChannel("pixelbench") : null;',
  'let tabTellTimer=null;',
  'function tabsTell(){',
  '  if(!tabChan||tabTellTimer) return;',
  '  tabTellTimer=setTimeout(()=>{ tabTellTimer=null; try{ tabChan.postMessage({db:wsDbName()}); }catch(_){ } },150);',
  '}',
  'let tabRedrawTimer=null;',
  'if(tabChan) tabChan.onmessage=(e)=>{',
  '  if(!e||!e.data||e.data.db!==wsDbName()) return;',
  '  if(tabRedrawTimer) return;',
  '  tabRedrawTimer=setTimeout(async()=>{',
  '    tabRedrawTimer=null;',
  '    try{ await renderShelf(); }catch(_){ }',
  '    try{ const land=$("land"); if(land&&land.getAttribute("data-page")==="final") await renderFinal(); }catch(_){ }',
  '  },100);',
  '};',
], 'touch');

/* ---- 2. a status change acts only on the record as it is ------------------ */
{
  const fn = kit.inFunction(L, 'async function setTraitStatus(t,next){');
  swap('  if(String(t.status||"wip")===String(next)) return {ok:true, moved:t, shared:null, same:true};', [
    '  if(String(t.status||"wip")===String(next)) return {ok:true, moved:t, shared:null, same:true};',
    '  /* THE RECORD AS IT IS, NOT AS THE CARD WAS DRAWN. Another tab may have',
    '     moved it since: a press on the stale card deleted an id that was',
    '     already gone and wrote the trait a second time (measured - the store',
    '     held cap approved and cap stfp, and Save to cloud uploaded both). */',
    '  {',
    '    let now=null; try{ now=await dbGet(t.id); }catch(_){ now=null; }',
    '    if(!now || String(now.status||"wip")!==String(t.status||"wip") || (now.layer||"")!==(t.layer||"")',
    '       || now.name!==t.name) return {ok:false, stale:true};',
    '  }',
  ], 'the same-status return', fn);
}
{
  const i = at('        const r=await setTraitStatus(t,next);', 'the chip');
  kit.replace(L, { start: i, end: i }, [
    '        const r=await setTraitStatus(t,next);',
    '        if(r.stale){ toast(t.name+" changed in another tab - the shelf has been redrawn"); renderShelf(); return; }',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function finalMove(t,next){');
  swap('  if(!r.ok) return;', [
    '  if(r.stale){ toast(t.name+" changed in another tab - the page has been redrawn"); await renderFinal(); renderShelf(); return; }',
    '  if(!r.ok) return;',
  ], 'finalMove', fn);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('new BroadcastChannel("pixelbench")');
  once('tabsTell(); }');
  once('return {ok:false, stale:true};');
  once('if(r.stale){', 2);
  /* The staleness check sits before anything is written. */
  const a = code.indexOf('async function setTraitStatus(t,next){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  if (!(body.indexOf('stale:true') < body.indexOf('await dbDel(t.id);'))) throw new Error('the check is after the write');
});

fs.renameSync(TMP, FILE);
console.log('patch540 written, ' + grew + ' bytes');
