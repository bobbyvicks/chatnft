/* HIDING ONE TRAIT REBUILT THE COMPOSE PANEL, THE PLAN, THE RECENT LIST AND
   THE REVIEW SHOT.

   Five things on the shelf change only what is SHOWN: hide, show-only, "show
   hidden", the three status filters, and the search box. Not one of them
   changes a record. Every one of them called renderShelf, which reads all 318
   records out of IndexedDB, re-runs eleven apply passes over them, rebuilds the
   tiles, and then rebuilds four panels that cannot have changed - buildCompose
   alone is 147 ms of a 232 ms render here, and the whole thing is 2,705 ms at a
   sixth of this CPU.

   So typing in the search box costs a full render per pause, hiding a trait
   costs one, and pressing a status filter costs one.

   renderShelf takes a flag now. A view-only render:

     reuses the records the last full render read, rather than reading them all
       back - nothing that calls it this way has changed one
     skips the eleven apply passes, which read settings out of those same
       records and would arrive at the same answers
     skips renderRecent, buildLayerPanel, renderReview, renderPlan and
       buildCompose, all of which are functions of the RECORDS and not of what
       is on screen

   It still does everything that depends on the view: the count and the size
   census, the working-space banner, the pick bar, and the tiles themselves.

   THE FLAG IS OPT-IN, so every one of the fifteen other calls to renderShelf is
   unchanged by construction - a caller that does not know about this gets the
   full render it always got. The five that pass it are the five listed above,
   and the check below names them.

   WHAT MAKES REUSING THE RECORDS SAFE. A view-only render is asked for by a
   handler that has just changed a view variable and nothing else. If anything
   else did change a record in the meantime, the write path calls renderShelf
   with no flag, which re-reads - so the stale copy cannot outlive the next real
   change. The copy is dropped whenever a full render runs. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the flag, and what it skips -------------------------------- */
{
  const sig = kit.only(L, l => l === 'async function renderShelf(){', 'renderShelf');
  kit.replace(L, { start: sig, end: sig }, [
    '/* The records the last full render read, so a view-only one does not read',
    '   them all back. Dropped and refilled by every full render. */',
    'let shelfItems=null;',
    '/* viewOnly: this call changed what is SHOWN and nothing else - hide,',
    '   show-only, show-hidden, a status filter, the search box. It reuses the',
    '   records above, skips the apply passes over them, and skips the four',
    '   panels that are functions of the records rather than of the view.',
    '   Opt-in, so every caller that does not pass it is unchanged. */',
    'async function renderShelf(viewOnly){',
  ]);

  const r = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const read = kit.only(L, l => l === "  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;",
    'where the records are read', r);
  kit.replace(L, { start: read, end: read }, [
    '  /* A view-only render reuses what the last full one read. Nothing that',
    '     asks for one has changed a record, and anything that DOES change a',
    '     record calls this with no flag, which reads again. */',
    '  if(viewOnly && shelfItems){ items=shelfItems; }',
    "  else try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;",
  ]);

  const r2 = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const apply = kit.only(L, l => l === '  applyLayers(items);', 'the first apply pass', r2);
  kit.replace(L, { start: apply, end: apply }, [
    '  /* THE APPLY PASSES READ SETTINGS OUT OF THE RECORDS, so with the same',
    '     records they reach the same answers. Kept together and skipped',
    '     together rather than one at a time, because a half-applied set is a',
    '     worse thing to reason about than either end of it. */',
    '  if(!viewOnly){',
    '  shelfItems=items;',
    '  applyLayers(items);',
  ]);
  const r3 = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const last = kit.only(L, l => l === '  applyAgentRules(items);', 'the last apply pass', r3);
  kit.replace(L, { start: last, end: last }, [
    '  applyAgentRules(items);',
    '  }',
  ]);
}

/* ---- and the four panels at the end ------------------------------ */
{
  const r = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const recent = kit.only(L, l => l === '  renderRecent(items);', 'the recent list', r);
  kit.replace(L, { start: recent, end: recent }, [
    '  /* A function of the records, not of what is on screen. */',
    '  if(!viewOnly) renderRecent(items);',
  ]);
  const r2 = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const panel = kit.only(L, l => l === '  buildLayerPanel(items);', 'the layer panel', r2);
  kit.replace(L, { start: panel, end: panel }, ['  if(!viewOnly) buildLayerPanel(items);']);
  const r3 = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const rev = kit.only(L, l => l === '  renderReview();', 'the review shot', r3);
  kit.replace(L, { start: rev, end: rev }, ['  if(!viewOnly) renderReview();']);
  const r4 = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const plan = kit.only(L, l => l === '  renderPlan(items);', 'the plan', r4);
  kit.replace(L, { start: plan, end: plan }, ['  if(!viewOnly) renderPlan(items);']);
  const r5 = kit.inFunction(L, 'async function renderShelf(viewOnly){');
  const comp = kit.only(L, l => l === '  buildCompose(items);', 'the compose panel', r5);
  kit.replace(L, { start: comp, end: comp }, [
    '  /* 147 ms of a 232 ms render, and a function of the records alone. */',
    '  if(!viewOnly) buildCompose(items);',
  ]);
}

/* ---- the five callers that only change the view ------------------ */
{
  const hide = kit.only(L, l => l === "        renderShelf(); announceShelf((hidden?'Showing ':'Hidden ')+t.name+'.');",
    'the hide button');
  kit.replace(L, { start: hide, end: hide },
    ["        renderShelf(true); announceShelf((hidden?'Showing ':'Hidden ')+t.name+'.');"]);

  const only = kit.only(L, l => l === "        renderShelf(); announceShelf('Showing only '+t.name+'.');",
    'the show-only button');
  kit.replace(L, { start: only, end: only },
    ["        renderShelf(true); announceShelf('Showing only '+t.name+'.');"]);

  const reveal = kit.only(L, l => l === "  renderShelf(); announceShelf(state.reveal?'Temporarily hidden traits are visible.':'Hidden traits are concealed.');",
    'the show-hidden button');
  kit.replace(L, { start: reveal, end: reveal },
    ["  renderShelf(true); announceShelf(state.reveal?'Temporarily hidden traits are visible.':'Hidden traits are concealed.');"]);

  const filt = kit.only(L, l => l === '    renderShelf(); };', 'the status filter buttons');
  kit.replace(L, { start: filt, end: filt }, ['    renderShelf(true); };']);

  const search = kit.only(L, l => l === '    renderShelf();'
    && true, 'the search box', kit.run(L, l => l === "$('projsearch').addEventListener('input',()=>{",
    l => l === '});', 'the search listener'));
  kit.replace(L, { start: search, end: search }, ['    renderShelf(true);']);

  const esc = kit.only(L, l => l === "  if(e.key==='Escape'){ $('projsearch').value=''; shelfQuery=''; renderShelf(); }",
    'the search escape');
  kit.replace(L, { start: esc, end: esc },
    ["  if(e.key==='Escape'){ $('projsearch').value=''; shelfQuery=''; renderShelf(true); }"]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ codeLines }) => {
  const r = kit.inFunction(codeLines, 'async function renderShelf(viewOnly){');
  const body = codeLines.slice(r.start, r.end + 1).join('\n');

  /* Every one of the five panels is behind the flag. */
  for (const [call, why] of [
    ['renderRecent(items)', 'the recent list'],
    ['buildLayerPanel(items)', 'the layer panel'],
    ['renderReview()', 'the review shot'],
    ['renderPlan(items)', 'the plan'],
    ['buildCompose(items)', 'the compose panel'],
  ]) {
    const line = codeLines.slice(r.start, r.end + 1).find(l => l.indexOf(call) >= 0);
    if (!line) throw new Error(why + ' is gone from the render');
    if (line.indexOf('if(!viewOnly)') < 0)
      throw new Error(why + ' still runs on a view-only render');
  }

  /* AND THE TILES ARE NOT. A version that skipped those too would be fast and
     would not draw the change the person just made. */
  if (/if\(!viewOnly\)[^\n]*shelfTile/.test(body))
    throw new Error('a view-only render skips the tiles, which is the one thing it must do');
  if (!/const body=\$\('projbody'\); body\.innerHTML='';/.test(body))
    throw new Error('the shelf body is no longer rebuilt at all');

  /* The reuse cannot outlive a real change: a full render always re-reads and
     re-fills the copy. */
  if (!/if\(viewOnly && shelfItems\)\{ items=shelfItems; \}/.test(body))
    throw new Error('a view-only render still reads every record back');
  if (!/shelfItems=items;/.test(body))
    throw new Error('a full render does not refill the copy, so the reuse goes stale');
  const fill = body.indexOf('shelfItems=items;');
  const guard = body.indexOf('if(!viewOnly){');
  if (guard < 0 || fill < guard)
    throw new Error('the copy is refilled outside the full-render branch');

  /* EXACTLY the five view handlers ask for it, counted over the whole file so
     a sixth added carelessly is caught. */
  const asks = codeLines.filter(l => /renderShelf\(true\)/.test(l));
  if (asks.length !== 6)
    throw new Error(asks.length + ' calls ask for a view-only render, expected 6'
      + ' (hide, only, show-hidden, the filters, the search box and its Escape)');
  for (const a of asks) {
    if (!/(announceShelf|renderShelf\(true\); \};|shelfQuery=''|^    renderShelf\(true\);$)/.test(a))
      throw new Error('a view-only render is asked for somewhere unexpected: ' + a.trim().slice(0, 60));
  }
  /* And the ones that change records still do not. */
  for (const [needle, why] of [
    ['await dbDel(t.id);', 'a status change'],
    ['bulkMoveToLayer', 'a bulk move'],
  ]) if (!codeLines.some(l => l.indexOf(needle) >= 0)) throw new Error(why + ' is gone');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
