/* EVERY TAP ON A STATUS BUTTON PAID FOR TWENTY THOUSAND GENERATED CHARACTERS.

   Measured at the real scale - 318 traits, 158 never-together rules, the size
   and shape of the owner's own collection:

     a render with no rules                          32 ms
     a render with the rules, memo warm             232 ms
     ONE STATUS CHANGE                            2,022 ms
       of which distributionOf, cold              1,780 ms
       distributionOf, warm                           0 ms
     the same render at a sixth of this CPU       2,705 ms

   So a status change costs two seconds here and something near twelve on a
   phone, and essentially all of it is one call. The memo is not broken - warm
   it is free - but a status change MOVES the record to a new id, which changes
   the key the memo is built from, so every one of them is a cold call. Pick,
   hide, rarity and include-wip do the same.

   Nothing is on screen for the whole of it. The button does not change colour,
   the shelf does not move, no toast appears. It reads as a dead control, so
   the natural response is to press it again and queue a second freeze behind
   the first.

   THE TILES DO NOT NEED IT TO PAINT. traitChance already computes the
   weights-alone figure - `const plain = share*present;` - before it branches
   into the simulation, and already carries it out as ch.plain so the tooltip
   can quote it. So the shelf paints from that immediately and asks again when
   the estimate is in.

   BOTH FIGURES ARE MARKED THE SAME WAY. The "~" is already the file's mark for
   "this came from running the generator rather than from arithmetic", and the
   deferred figure keeps it - so a reader never sees a number change from exact
   to estimated under them, only from one estimate to a better one. The tooltip
   says which it is.

   requestIdleCallback where there is one, with a deadline so it cannot be put
   off indefinitely, and setTimeout where there is not - Safari only grew one
   recently and this has to work there.

   WHAT THIS IS NOT. Two other things were reported on this path and both are
   measured too small to act on: the memo key is rebuilt once per tile, which
   costs 22 ms across 318 tiles rather than the fifth of a second claimed; and
   renderPlan builds 318 range sliders inside folded groups, which costs 4 ms.
   Neither is worth a change, and saying so is worth more than quietly not
   doing them. What IS still slow after this is the render itself: 232 ms warm
   here, 2,705 ms throttled, because every pick and hide rebuilds all 318
   tiles. That is a bigger change than this one and it is not in here. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- traitChance takes the distribution, or is told to wait ----- */
{
  const sig = kit.only(L, l => l === 'function traitChance(rec,items,wipIncluded){', 'traitChance');
  kit.replace(L, { start: sig, end: sig }, [
    '/* dist: a distribution to read, the string "defer" to ask for the',
    '   weights-alone figure without running the simulation, or nothing at all',
    '   for the original behaviour - which is what every caller outside',
    '   renderShelf still passes, so none of them changed. */',
    'function traitChance(rec,items,wipIncluded,dist){',
  ]);

  const r = kit.inFunction(L, 'function traitChance(rec,items,wipIncluded,dist){');
  const at = kit.only(L, l => l === '    const dist=distributionOf(items,wipIncluded);',
    'where traitChance runs the simulation', r);
  if (L[at + 1] !== '    const seen=dist.get(traitKey(rec))||0;')
    throw new Error('the simulation result is not read on the line after it is made');
  if (L[at + 2] !== '    return { pct: seen/DIST_DRAWS, why:"", estimated:true, plain:plain };')
    throw new Error('the estimate is not returned where this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '    /* THE CALLER MAY NOT WANT TO WAIT. This costs 20,000 generated',
    '       characters - 1,780 ms measured at 318 traits and 158 rules, and',
    '       something near twelve seconds on a phone - and a status change moves',
    '       a record to a new id, so it changes the memo key and every one of',
    '       them pays it cold. The shelf asks for "defer", paints the',
    '       weights-alone figure below, and asks again with a real distribution',
    '       once it has one. Marked estimated either way: the reader never sees',
    '       a number go from exact to approximate, only from one estimate to a',
    '       better one. */',
    '    if(dist==="defer")',
    '      return { pct: plain, why:"", estimated:true, plain:plain, pending:true };',
    '    const d=(dist&&typeof dist.get==="function") ? dist : distributionOf(items,wipIncluded);',
    '    const seen=d.get(traitKey(rec))||0;',
    '    return { pct: seen/DIST_DRAWS, why:"", estimated:true, plain:plain };',
  ]);
}

/* ---- one painter for the label, used twice ---------------------- */
{
  const r = kit.inFunction(L, 'async function renderShelf(){');
  const at = kit.only(L, l => l === '  const cardShows=t=>shows(t)&&(!visibility.isHidden(shelfCore.recordKey(t))||visibility.reveal);',
    'the card predicate', r);
  kit.replace(L, { start: at, end: at }, [
    '  const cardShows=t=>shows(t)&&(!visibility.isHidden(shelfCore.recordKey(t))||visibility.reveal);',
    '  /* Read once rather than per tile, and captured for the deferred pass',
    '     below so it cannot answer with a different checkbox than it asked. */',
    '  const wipOn=!!($("cwip")&&$("cwip").checked);',
    '  /* Tiles whose figure is the weights-alone one until the estimate lands. */',
    '  const pctLater=[];',
    '  /* ONE PAINTER, because the label is written twice now - once while the',
    '     tile is built and once when the estimate arrives - and two copies of',
    '     this would drift the moment either sentence was edited. */',
    '  function paintPct(el,ch,t){',
    '    el.textContent=(ch.estimated?"~":"")+pctLabel(ch.pct);',
    '    el.title = ch.estimated',
    '      ? "About "+pctLabel(ch.pct)+" of generated characters would carry "+t.name',
    '        +(ch.pending',
    '          ? ". This is the figure the weights alone give; the Never-together'
      + ' rules are still being counted and it will settle in a moment."',
    '          : ". Estimated by drawing "+DIST_DRAWS.toLocaleString()+" characters with the"',
    '            +" Never-together rules applied, so the last point or so is sampling noise."',
    '            +" The weights alone would say "+pctLabel(ch.plain)+".")',
    '      : "About "+pctLabel(ch.pct)+" of generated characters would carry "+t.name',
    '        +". Worked out from this weight against the others in "+(t.layer||"unsorted")',
    '        +(ALWAYS_PRESENT.indexOf(t.layer||"unsorted")>=0',
    '          ? ", a layer every character has."',
    '          : ", and the "+Math.round(emptyChance*100)+"% chance that layer is left empty.");',
    '  }',
  ]);
}

/* ---- the tile asks for the cheap figure -------------------------- */
{
  const r = kit.inFunction(L, 'async function renderShelf(){');
  const at = kit.only(L, l => l === '        const ch=traitChance(t,items,$("cwip").checked);',
    'where a tile asks for its share', r);
  const end = kit.only(L, (l, i) => i > at && i < at + 44
    && l === '        }', 'the end of the tile share block', { start: at, end: at + 44 });
  if (L[end + 1] !== '      }') throw new Error('the share block does not close where this expects');
  kit.replace(L, { start: at, end: end }, [
    '        /* "defer" only when there is a simulation to defer: with no rules',
    '           traitChance answers from arithmetic and there is nothing to wait',
    '           for. */',
    '        const ch=traitChance(t,items,wipOn,RULES.length?"defer":undefined);',
    '        if(ch.pct===null){',
    '          pct.classList.add("never");',
    '          pct.textContent="never";',
    '          /* KEPT for a mouse, and said out loud for everything else. A title',
    '             cannot be read with a finger, and .item .pct refuses the pointer',
    '             anyway - so on a phone this was a red "never" with no reason',
    '             obtainable at all. The layer-switched-off case is the one that',
    '             matters: the trait is approved, correctly weighted, and excluded',
    '             by a control somewhere else on the page. */',
    '          pct.title=ch.why;',
    '          if(ch.why){',
    '            const why=document.createElement("span");',
    '            why.className="whynot"; why.textContent=ch.why;',
    '            el.appendChild(why);',
    '          }',
    '        } else {',
    '          paintPct(pct,ch,t);',
    '          if(ch.pending) pctLater.push({el:pct,rec:t});',
    '        }',
  ]);
}

/* ---- and the estimate lands afterwards --------------------------- */
{
  const r = kit.inFunction(L, 'async function renderShelf(){');
  const at = kit.only(L, l => l === '  buildCompose(items);', 'the last line of renderShelf', r);
  kit.replace(L, { start: at, end: at }, [
    '  buildCompose(items);',
    '  /* THE ESTIMATE, ONCE THE TAP HAS BEEN ANSWERED. Everything above has',
    '     painted by now, so the 1,780 ms this costs is spent with the shelf on',
    '     screen rather than in front of it. Idle time where the browser offers',
    '     it, with a deadline so it cannot be postponed forever, and a plain',
    '     timeout where it does not - Safari only grew requestIdleCallback',
    '     recently.',
    '',
    '     isConnected, because a second render may have replaced every one of',
    '     these elements while this was waiting: writing into a detached tile is',
    '     harmless but pointless, and the render that replaced it has its own',
    '     pass queued. */',
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
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ code, codeLines }) => {
  const tc = kit.inFunction(codeLines, 'function traitChance(rec,items,wipIncluded,dist){');
  const tcBody = codeLines.slice(tc.start, tc.end + 1).join('\n');
  if (!/if\(dist==="defer"\)/.test(tcBody))
    throw new Error('traitChance cannot be asked to skip the simulation');
  if (!/pending:true/.test(tcBody))
    throw new Error('a deferred answer does not say it is provisional');
  if (!/dist&&typeof dist\.get==="function"/.test(tcBody))
    throw new Error('traitChance cannot be handed a distribution to read');
  /* And the original path survives for every other caller. */
  if (!/distributionOf\(items,wipIncluded\)/.test(tcBody))
    throw new Error('traitChance can no longer compute a distribution of its own');

  const rs = kit.inFunction(codeLines, 'async function renderShelf(){');
  const body = codeLines.slice(rs.start, rs.end + 1).join('\n');
  if (!/traitChance\(t,items,wipOn,RULES\.length\?"defer":undefined\)/.test(body))
    throw new Error('the shelf still asks for the simulation while building tiles');
  if (/\$\("cwip"\)\.checked\)/.test(body.replace(/const wipOn[^\n]*\n/, '')))
    throw new Error('a tile still reads the checkbox for itself');
  if (!/requestIdleCallback\(finish/.test(body))
    throw new Error('nothing schedules the estimate');
  if (!/e\.el\.isConnected/.test(body))
    throw new Error('the deferred pass writes into tiles that may be gone');
  if ((body.match(/paintPct\(/g) || []).length !== 3)
    throw new Error('the label painter is not declared once and used twice');

  /* Every other caller of traitChance passes three arguments and must still
     get the simulation - stated over the whole file, not over the one that
     changed. */
  const calls = codeLines.filter(l => /traitChance\(/.test(l) && !/function traitChance/.test(l));
  const deferring = calls.filter(l => /"defer"/.test(l));
  if (deferring.length !== 1)
    throw new Error(deferring.length + ' call sites defer, expected exactly 1');

  /* THE ARITHMETIC OF THE CHEAP FIGURE, run. plain is share*present and must
     be a probability, or the tile paints nonsense until the estimate lands. */
  const from = code.indexOf('function traitChance(rec,items,wipIncluded,dist){');
  if (from < 0) throw new Error('cannot find traitChance to exercise it');
  const seg = code.slice(from, from + 4000);
  if (!/const plain = share\*present;/.test(seg))
    throw new Error('the weights-alone figure is not computed before the branch');
  if (seg.indexOf('const plain = share*present;') > seg.indexOf('if(dist==="defer")'))
    throw new Error('the deferred answer is returned before the figure it returns exists');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
