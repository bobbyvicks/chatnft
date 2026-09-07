/* THERE IS NO WAY TO ACTUALLY START FRESH.

   Asked for directly: "i want to remove all the stuff thats on the site (all
   the groups and everything) i have all the files and want to start fresh".
   The server side of that is done. The browser side cannot be done from the
   page at all.

   Clear removes traits and the reference and deliberately keeps everything
   else, and its comment gives the reason, which is a good one:

     "The rules kept here will name traits that are gone. That is deliberate
      and is what this file does everywhere else: a stranded rule is SHOWN as
      stranded rather than dropped, because dropping it throws away an
      instruction somebody gave."

   That decision is right for the case it was written for - clearing traits to
   re-import a corrected folder, where the rules still describe the same
   collection. It is wrong for the case of starting a different collection, and
   there was no way to say which one you meant. The only way to get a clean
   browser was DevTools, which also throws away the sign-in.

   SO THE BUTTON ASKS A SECOND QUESTION, and only when there is something to
   lose by not asking. Cancel keeps the old behaviour exactly - that is the
   recorded decision, unchanged and still the default - and OK removes the
   rules, the answers behind them, the draw order, the grid, the base colour
   and the autosaved image.

   The second question names the counts rather than the records: "103 rules and
   58 answers" is a thing somebody can weigh, and "6 settings records" is not. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const head = kit.only(L, l => l === "$('clearproj').onclick=async()=>{", 'the Clear handler');
const ask = kit.only(L,
  l => l === "  if(!confirm('Remove every saved trait and the reference from this browser?')) return;",
  'the confirmation');
if (ask !== head + 1) throw new Error('the confirmation is not the first line of the handler');
const loop = kit.only(L, l => l === '  let removed=0, kept=0;', 'the removal loop');

/* Every id the second question will remove, and the globals it resets. All
   read from their own declarations rather than retyped, so a rename refuses
   this patch instead of leaving a record behind that nothing clears. */
for (const c of ["const LAYERS_ID='settings.layers';", "const DECIDE_ID='settings.decideorder';",
  "const DECISIONS_ID='settings.decisions';", "const GRID_ID='settings.grid';",
  "const RULES_ID='settings.rules';", "const BASE_ID='settings.basecolours';",
  'const AUTO_ID="autosave.working";']) {
  kit.only(L, l => l === c, 'the id ' + c.slice(6, 22));
}
kit.only(L, l => l === 'const DEFAULT_LAYERS=[' || l.indexOf('const DEFAULT_LAYERS=') === 0,
  'DEFAULT_LAYERS');

/* ---- WRITE, bottom upward ---------------------------------------- */

kit.replace(L, { start: loop, end: loop }, [
  '  /* THE SECOND QUESTION, asked only when there is something to answer it',
  '     about. Cancel is the behaviour above, unchanged: the rules stay and are',
  '     shown as stranded. OK is what "start fresh" means and there was no way',
  '     to say it before - the only clean browser was DevTools, which also',
  '     throws away the sign-in.',
  '',
  '     Counted before anything is removed, and named as counts rather than as',
  '     records: "103 rules and 58 answers" can be weighed and "6 settings',
  '     records" cannot. */',
  '  let alsoSettings=false;',
  '  {',
  '    const have=[];',
  '    if(RULES.length) have.push(RULES.length+" rule"+(RULES.length===1?"":"s"));',
  '    if(DECISIONS.length) have.push(DECISIONS.length+" answer"+(DECISIONS.length===1?"":"s"));',
  '    if(DECIDE_ORDER.length) have.push("the draw order");',
  '    if(BASE_KEEP.length) have.push("the base colour");',
  '    if(projectGrid!==160) have.push("the "+projectGrid+" cell grid");',
  '    if(have.length)',
  '      alsoSettings=confirm("Also remove "+have.join(", ")',
  '        +"?\\n\\nCancel keeps them. They will name traits that are gone, which is"',
  '        +" what you want if you are re-importing the same collection.");',
  '  }',
  '  let removed=0, kept=0;',
]);

/* The removal itself, after the loop that clears traits. */
/* Three of these in the file, so it is found by the line BELOW it rather than
   by its own text - which is the normal way to anchor here, not the fallback. */
const after = kit.near(L, '  }catch(_){}', 1, 'currentShelfVisibility().showAll();',
  'the close of the removal loop');
kit.replace(L, { start: after, end: after }, [
  '  }catch(_){}',
  '  if(alsoSettings){',
  '    /* The autosave goes with them. It holds the last image being edited, and',
  '       leaving it behind reopens a picture from a collection that no longer',
  '       exists. */',
  '    for(const id of [RULES_ID,DECISIONS_ID,DECIDE_ID,GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID]){',
  '      try{ await dbDel(id); kept--; }catch(_){}',
  '    }',
  '    RULES=[]; DECISIONS=[]; DECIDE_ORDER=[]; BASE_KEEP=[];',
  '    projectGrid=160;',
  '    const box=$("rsgrid"); if(box) box.value=projectGrid;',
  '    LAYERS=DEFAULT_LAYERS.slice();',
  '    HIDDEN_LAYERS.clear();',
  '    /* Not saveLayers(): that would write the record back that was just',
  '       deleted, AND PATCH the default layer list over whatever the group has',
  '       on the server. Clearing this browser is not a change to the',
  '       collection. */',
  '    try{ buildLayerSelect(); }catch(_){}',
  '    try{ renderRules(); }catch(_){}',
  '    try{ baseLabel(); }catch(_){}',
  '  }',
]);

kit.replace(L, { start: ask, end: ask }, [
  "  if(!confirm('Remove every saved trait and the reference from this browser?')) return;",
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('  let alsoSettings=false;') !== 1) throw new Error('the second question did not land');
  if (code.indexOf('alsoSettings=confirm(') < 0) throw new Error('nothing asks the second question');
  if (code.indexOf('if(alsoSettings){') < 0) throw new Error('nothing acts on the answer');
  /* Every one of the seven records is really deleted, not just listed in the
     comment above the loop. */
  if (code.indexOf('[RULES_ID,DECISIONS_ID,DECIDE_ID,GRID_ID,BASE_ID,LAYERS_ID,AUTO_ID]') < 0)
    throw new Error('the id list is not in code');
  /* The recorded decision survives: the first question and its answer are
     untouched, so cancelling the second leaves the old behaviour exactly. */
  if (has("  if(!confirm('Remove every saved trait and the reference from this browser?')) return;") !== 1)
    throw new Error('the original confirmation was disturbed');
  /* And saveLayers is NOT called here - it would rewrite the deleted record
     and PATCH the defaults over the group's layer list. */
  const fn = code.slice(code.indexOf("$('clearproj').onclick"), code.indexOf("$('clearproj').onclick") + 2600);
  if (fn.indexOf('saveLayers') >= 0) throw new Error('clearing writes the layer list back');
});

console.log('index.html grew by ' + grew + ' bytes');
