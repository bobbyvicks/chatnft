/* THE RUN SAYS THE COLOUR COUNT, AND THE GUIDELINE STOPS SPEAKING LIKE A
   GATE.

   ONE PAGE, TWO VERDICTS. Since ab044bc every Fix pixels run ends with
   whether the result is READY FOR THE COLLECTION - fixGateOf, four facts
   from the library's own sentence (CURRENT-REWORK-BRIEF.md:11): 1280
   square, "ZERO mixed8px cells, ZERO off-palette pixels, ZERO partial-alpha
   pixels". Elsewhere the same page holds colourBudget:16 (clothing 8) and
   the agent panel prints "16 colours of 8 allowed  -  8 over". Nothing
   reconciles them: ruleColourBudget has two callers, specCheck and
   PB.budgetFor, and fixGateOf is neither. Measured on the 311 working
   traits in the documented workflow: all 311 are ready and 121 are "over".

   THE DECISION: the gate keeps its four facts and says the colour count it
   has always computed and thrown away; the guideline keeps its number and
   stops using the words of an allowance. Why, and why not the two
   alternatives, is written above AGRULES_DEFAULT where the number lives.

   WHAT CHANGES ON SCREEN.
     - every run, single and folder, says the colour count of the result -
       a number fixGateOf has returned since ab044bc that nothing has ever
       read;
     - beside it, the project's guideline for that file's layer when the
       file has one: "13 colours, 5 past the project's colour guideline of
       8", or "3 colours, within the project's colour guideline of 16";
     - a folder run adds "N hold more colours than the project's guideline
       for their layer, the most M";
     - the agent panel says that same sentence in the same words, from the
       same function, instead of "16 colours of 8 allowed  -  8 over";
     - the rules panel lists the guideline, which it did not, and says it is
       reported and never enforced.

   AND ONE SILENT WRONG NUMBER GOES. ruleColourBudget had no guard for "no
   category", the one ruleGridFor has on purpose. #tlayer is the
   Save-to-project select, buildLayerSelect leaves it on "unsorted" and
   fixOpen never writes it, so a clothing trait straight out of the fixer
   was reported against 16 - not its guideline, and not anybody's decision.
   It returns 0 there now, and 0 means the count is printed on its own.

   No output file changes and no run changes its verdict: the four facts,
   their order and their wording are untouched, and this patch refuses to
   write if fixGateOf comes out any different. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. the guideline says what it is, and what it is about ------------- */
{
  const a = at('/* The Creator Kit brief: "at most 16 palette colours (8 for clothing),', 'the budget comment');
  const b = at('   including black #000000 outlines". */', 'the budget comment end');
  if (b !== a + 1) throw new Error('the budget comment is not two lines');
  kit.replace(L, { start: a, end: b }, [
    '/* THE COLOUR GUIDELINE. REPORTED, NEVER ENFORCED.',
    '',
    '   SUPERSEDES: \'The Creator Kit brief: "at most 16 palette colours (8 for',
    '   clothing), including black #000000 outlines".\' That sentence is true and',
    '   the quote is exact - the kit is at OneDrive/Documents/ChatGPT/pixel art_/',
    '   brank kit/Mrkt Mkrs - NFT Creator Kit and GEMINI PROMPT.txt line 15 reads',
    '   "Choose at most 16 palette colours (8 for clothing), including black',
    '   #000000 outlines." What it left out is WHICH PIECE OF WORK the kit is',
    '   talking about, and that is the whole question.',
    '',
    '   THE KIT SAYS IT ABOUT A DRAFT. guides/EXPORT CHECK.txt files the rule',
    '   under the heading "GENERATION DRAFT - 1024 x 1024 PNG": "New artwork uses',
    '   only the current palette (16 colours max; clothing 8)". The section below',
    '   it, "FINAL COLLECTION LAYER - INTEGRATOR", is the one that governs what',
    '   fixGateOf judges - "Current collection exports are 1280 x 1280" - and it',
    '   states geometry, alpha and extraction rules and NO colour cap. START',
    '   HERE.md says the same: "Work at 1024 x 1024 and keep the full frame...',
    '   It still needs extraction and a fit check before collection approval."',
    '',
    '   AND THE LIBRARY LIFTS IT, BY NAME, FOR FINISHED TRAITS. A dozen trait',
    '   records say so: new-traits/BALLOONSVILLE-RUGGER-20260904-REVIEW.md:9 "27',
    '   colours from the fixed Vivid128 project palette; no arbitrary 8/16-colour',
    '   cap."; I Am A N Shirt Project Shading v4-review.md:9 "The eight-colour',
    '   count cap was removed (maxOpaqueColors 128)."; and Coinbase Blue Jacket',
    '   Uncapped v2-review.md:3 records the owner approving the uncapped revision',
    '   on 2026-09-03. CURRENT-REWORK-BRIEF.md:44 states it standing: "Preserve',
    '   material colour families and readable shading; no arbitrary colour-count',
    '   caps, averaging or blur. Palette membership alone is not artistic',
    '   correctness."',
    '',
    '   SO IT IS NOT A FIFTH GATE FACT. Enforcing it would refuse 121 of the 311',
    '   working traits - 38.9% - forever by configuration, and per layer',
    '   (clothing 8, everything else 16), which is the layer exemption the gate',
    '   does not have; 852cd6d refused exactly that shape two commits ago at a',
    '   cost of 79. There is no way out of it for the artist either: keeping the',
    '   guideline-many biggest colours and moving the rest to the nearest kept',
    '   colour forces a move of at least dE 5.3 on every one of the 121.',
    '',
    '   AND IT IS NOT DELETED. patch344 already decided who judges it - "a trait',
    '   over budget may be exactly right and the budget may be what is wrong, and',
    '   that is the owner\'s call, not a tool\'s" - and the count is the one thing',
    '   this page can say about a file the gate passes. What was wrong was the',
    '   wording, and a panel nobody but an agent can open: #agbtn is hidden in the',
    '   markup and un-hidden only by agentMode.',
    '',
    '   THE KEYS STAY colourBudget AND colourBudgetBy. They are the field names of',
    '   a stored settings.agentrules record - applyAgentRules below reads them off',
    '   it - so renaming them would silently drop a project\'s saved number. The',
    '   words change; the keys do not. Decided 2026-09-21. */',
  ]);
}

/* ---- 2. no category is not a category, and one sentence for the count ---- */
{
  const a = at('/* How many colours this category is allowed. */', 'the ruleColourBudget comment');
  const fn = kit.inFunction(L, 'function ruleColourBudget(layer){');
  if (fn.start !== a + 1) throw new Error('ruleColourBudget does not follow its comment');
  kit.replace(L, { start: a, end: fn.end }, [
    '/* HOW MANY COLOURS THE PROJECT\'S GUIDELINE ASKS OF THIS CATEGORY, or 0 for',
    '   "the rules do not say" - the same answer ruleGridFor gives, for the same',
    '   reason.',
    '',
    '   NO CATEGORY IS NOT A CATEGORY. #tlayer is the Save-to-project select,',
    '   buildLayerSelect leaves it on "unsorted" and fixOpen never writes it, so a',
    '   clothing trait straight out of the fixer was reported "of 16 allowed" -',
    '   not its guideline, and not anybody\'s decision. Where the rules are silent',
    '   the count on its own is the honest answer.',
    '',
    '   0 is not a refusal and not a quiet 16: every caller prints the count',
    '   either way and adds the guideline only when there is one. */',
    'function ruleColourBudget(layer){',
    '  const l=String(layer||"");',
    '  if(!l||l==="unsorted") return 0;',
    '  const by=AGENT_RULES.colourBudgetBy||{};',
    '  const own=by[l];',
    '  return Number.isInteger(own)&&own>=1 ? own : (AGENT_RULES.colourBudget||0);',
    '}',
    '/* THE COLOUR COUNT, SAID - WITH THE GUIDELINE WHEN THE RULES HAVE ONE.',
    '',
    '   ONE WORDING, ONE PLACE. The gate line and the agent panel are the two',
    '   sentences this page prints about how many colours a trait holds, and they',
    '   disagreed about what the number MEANS - one never mentioned it, the other',
    '   called it an allowance and counted how far "over". Two functions wording',
    '   one measurement differently is how a page comes to hold two verdicts.',
    '',
    '   "past" and "within", never "over" or "allowed": nothing here refuses',
    '   anything, and a sentence that sounds like a limit reads as one.',
    '',
    '   toLocaleString because this number is not always small. Scale only does',
    '   not apply the palette, so the count is the source\'s own: measured on',
    '   backgrounds/center.png it is 1,014,063, and the clause beside it already',
    '   groups its digits. */',
    'function colourCountNote(colours,budget){',
    '  const s=colours.toLocaleString()+" colour"+(colours===1?"":"s");',
    '  if(!budget) return s;',
    '  return colours<=budget',
    '    ? s+", within the project\'s colour guideline of "+budget',
    '    : s+", "+(colours-budget).toLocaleString()+" past the project\'s colour guideline of "+budget;',
    '}',
  ]);
}

/* ---- 3. the agent panel says the same sentence -------------------------- */
{
  const a = at('  const bits=[r.colours+" colours"+(r.budget?" of "+r.budget+" allowed":"")];', 'the spec panel colour bit');
  const b = at('  if(r.overBudget) bits.push(r.overBudget+" over");', 'the spec panel over bit');
  if (b !== a + 1) throw new Error('the two spec-panel lines are not adjacent');
  kit.replace(L, { start: a, end: b }, [
    '  /* The same sentence the run prints, from the same function. r.budget is',
    '     already ruleColourBudget for this layer, and r.overBudget stays in the',
    '     returned data for anything that wants the difference as a number - it',
    '     is 0 now for a caller with no category, which is the fix. */',
    '  const bits=[colourCountNote(r.colours,r.budget)];',
  ]);
}

/* ---- 4. the rules panel lists the rule it was leaving out ---------------- */
swap('    +"  \\u00b7  left out of cleanup: "+((AGENT_RULES.cleanupExcluded||[]).join(", ")||"none");',
  [
    '    +"  \\u00b7  left out of cleanup: "+((AGENT_RULES.cleanupExcluded||[]).join(", ")||"none")',
    '    /* THE ONE RULE THIS PANEL LEFT OUT, and it has an opinion about every',
    '       file in the collection. Said with what it is: a guideline the page',
    '       reports, not a gate it enforces. */',
    '    +"  \\u00b7  colour guideline: "+(AGENT_RULES.colourBudget||"none")',
    '      +Object.keys(AGENT_RULES.colourBudgetBy||{}).map(function(k){',
    '        return ", "+k+" "+AGENT_RULES.colourBudgetBy[k]; }).join("")',
    '      +" - reported, never enforced";',
  ], 'the rules panel last clause');

/* ---- 5. the gate line carries the count --------------------------------- */
{
  const fn = kit.inFunction(L, 'function fixGateNote(r){');
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* THE CATEGORY A RUN\'S FILE IS IN, for the rules that have one - and only',
    '   from readPath\'s `layer`, which can name a layer this project actually has',
    '   and nothing else.',
    '',
    '   NOT `folder`. readPath returns both and says which is which: "`layer`',
    '   above can only ever name a layer the project already has", and of the',
    '   folder, "The caller decides whether to adopt it - readPath only reads."',
    '   Adopting it here would answer the project\'s default 16 for any folder at',
    '   all - Downloads, or a dated export folder - which is the same number',
    '   nobody decided that this patch just removed from #tlayer, arriving by a',
    '   different door. A file whose folder is not a layer of this project gets',
    '   the count on its own, which is a real answer and not a missing one. */',
    'function fixLayerOf(rel){',
    '  return readPath(String(rel||"")).layer||"";',
    '}',
    'function fixGateNote(r,rel){',
    '  const gate=fixGateOf(r);',
    '  /* THE COUNT THE GATE ALREADY HAD. fixGateOf has returned `colours` since',
    '     ab044bc and nothing has ever read it: the one number this page computes',
    '     about a finished trait and never says. It is NOT a fifth fact - `ready`',
    '     is untouched and this clause sits after it - it is the measurement the',
    '     guideline is about, printed where the person actually is. */',
    '  return " \\u00b7 "+(gate.ready ? "ready for the collection" : "not ready for the collection: "+gate.why.map(w=>w.text).join(", "))',
    '    +" \\u00b7 "+colourCountNote(gate.colours,ruleColourBudget(fixLayerOf(rel)));',
    '}',
  ]);
}

/* ---- 6. both single-run call sites hand it the path --------------------- */
swap('        +(FIX.decode==="png" ? " kept exactly, byte for byte" : " kept translucent; this file was read by the browser ("+FIX.decodeWhy+"), which rounds their colour") : "")+fixGateNote(r));',
  ['        +(FIX.decode==="png" ? " kept exactly, byte for byte" : " kept translucent; this file was read by the browser ("+FIX.decodeWhy+"), which rounds their colour") : "")+fixGateNote(r,FIX.rel));'],
  'the scale-only gate clause');
swap('          +fixGateNote(r)', ['          +fixGateNote(r,FIX.rel)'], 'the engine-path gate clause');

/* ---- 7. the folder run counts them, and never judges them --------------- */
swap('let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixBrowserRead=[], fixGateReady=0, fixGateWhy=null, fixRecutAt=[];',
  ['let fixGridlessFellAt=[], fixGridlessFellKept=1, fixMarksDroppedTotal=0, fixMarksDroppedFiles=0, fixNoisyFiles=0, fixAlphaFiles=0, fixAlphaPixels=0, fixBrowserRead=[], fixGateReady=0, fixGateWhy=null, fixRecutAt=[], fixGatePast=0, fixGatePastMost=0;'],
  'the folder-run counters');
swap('  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixBrowserRead=[]; fixGateReady=0; fixGateWhy=new Map(); fixRecutAt=[];',
  ['  fixGridlessFellAt=[]; fixGridlessFellKept=1; fixMarksDroppedTotal=0; fixMarksDroppedFiles=0; fixNoisyFiles=0; fixAlphaFiles=0; fixAlphaPixels=0; fixBrowserRead=[]; fixGateReady=0; fixGateWhy=new Map(); fixRecutAt=[]; fixGatePast=0; fixGatePastMost=0;'],
  'the folder-run reset');
swap('      else for(const w of gt.why) fixGateWhy.set(w.kind,(fixGateWhy.get(w.kind)||0)+1); }',
  [
    '      else for(const w of gt.why) fixGateWhy.set(w.kind,(fixGateWhy.get(w.kind)||0)+1);',
    '      /* AND THE COLOUR COUNT, WHICH THE GATE DOES NOT JUDGE. Counted here',
    '         because `rel` is in scope and the layer is the only thing that gives',
    '         the guideline a number - a file in a folder this project has no',
    '         layer for has none, and then there is nothing to count. */',
    '      const bd=ruleColourBudget(fixLayerOf(rel));',
    '      if(bd&&gt.colours>bd){ fixGatePast++;',
    '        if(gt.colours>fixGatePastMost) fixGatePastMost=gt.colours; } }',
  ], 'the folder-run gate counter');

/* ---- 8. and the folder note says it, without a verdict ------------------ */
{
  const a = at('  const gateNote = fixBatchFiles.length', 'the folder gate note');
  const end = at('    : "";', 'the folder gate note end', { start: a, end: a + 4 });
  kit.replace(L, { start: end, end: end }, [
    '    : "";',
    '  /* THE COUNT BESIDE THE VERDICT, NOT INSIDE IT. The gate passed all of',
    '     these; this is the other thing the page knows about them. No',
    '     parentheses: the clause before this one uses them for the reasons a file',
    '     was held back, and a second bracket reads as more of those. */',
    '  const pastNote = fixGatePast',
    '    ? " \\u00b7 "+fixGatePast+(fixGatePast===1?" holds":" hold")+" more colours than'
      + ' the project\'s guideline for their layer, the most "+fixGatePastMost.toLocaleString()',
    '    : "";',
  ]);
}
swap('  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+marksNote+noisyNote+recutNote+unfitNote+offNote+alphaNote+readNote+shrunkNote+palNote+gateNote',
  ['  fixBatchSay(fixBatchFiles.length+" of "+list.length+" done in "+secs+"s"+movedNote+unhonNote+raggedNote+smallNote+noGridNote+marksNote+noisyNote+recutNote+unfitNote+offNote+alphaNote+readNote+shrunkNote+palNote+gateNote+pastNote'],
  'the folder sentence');

/* ---- what has to be true afterwards ------------------------------------- */
const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };

  /* THE WORDS OF AN ALLOWANCE ARE GONE FROM EVERY SENTENCE. */
  never('" of "+r.budget+" allowed"');
  never('bits.push(r.overBudget+" over")');

  /* THE GATE IS UNTOUCHED, CHARACTER FOR CHARACTER. The decision is about what
     the page SAYS beside the verdict, so the function that reaches the verdict
     must come out of this patch identical - compared against the file as it
     was, not against a list of reasons I remembered to type. */
  const bound = (t) => {
    const c = kit.code(kit.scriptOf(t));
    const a = c.indexOf('function fixGateOf(r){'), b = c.indexOf('function fixTranslucent(', a);
    if (a < 0 || b < 0) throw new Error('could not bound fixGateOf');
    return c.slice(a, b);
  };
  const gate = bound(doc.original), now = bound(doc.lines.join(doc.EOL));
  if (gate !== now) throw new Error('fixGateOf changed - the verdict is not this patch\'s to move');
  for (const reason of ['no("it is not saved at "+CANVAS_SIDE)', 'no("it is not square")',
    'no("its 8px blocks are not one colour")', 'no("it has part-transparent pixels"',
    'no("it has colours off the palette"'])
    if (now.indexOf(reason) < 0) throw new Error('the gate lost a reason: ' + reason);
  if ((now.match(/no\(/g) || []).length !== 5)
    throw new Error('the gate refuses for a different number of reasons than five');
  if (/colourBudget|colourCountNote/.test(now))
    throw new Error('the gate now reads the colour guideline - that is the decision reversed');

  /* THE COUNT IS SAID, ONCE, FROM ONE FUNCTION. */
  for (const s of ['function colourCountNote(colours,budget){',
    'const bits=[colourCountNote(r.colours,r.budget)];',
    'function fixLayerOf(rel){',
    '  return readPath(String(rel||"")).layer||"";',
    'function fixGateNote(r,rel){',
    '+" \\u00b7 "+colourCountNote(gate.colours,ruleColourBudget(fixLayerOf(rel)));',
    'fixGateNote(r,FIX.rel)',
    'const bd=ruleColourBudget(fixLayerOf(rel));',
    '+palNote+gateNote+pastNote']) need(s);
  /* ONE WORDING: defined once, and said by the run and the panel. A third
     caller would be a third sentence about the same measurement. */
  const times = (re) => (code.match(re) || []).length;
  if (times(/colourCountNote\(/g) !== 3)
    throw new Error('colourCountNote: 1 definition + 2 callers expected, found '
      + times(/colourCountNote\(/g) + ' mentions');
  if (times(/fixLayerOf\(/g) !== 3)
    throw new Error('fixLayerOf: 1 definition + 2 callers expected, found '
      + times(/fixLayerOf\(/g) + ' mentions');
  /* AND THE FOLDER NAME IS NOT ADOPTED AS A CATEGORY, here or anywhere. */
  never('p.layer||p.folder');

  /* NO CATEGORY IS NOT A CATEGORY. */
  need('  if(!l||l==="unsorted") return 0;');

  /* THE GUIDELINE ITSELF IS UNCHANGED - this patch decides what is SAID about
     the number, and changing the number is a different decision. */
  need('colourBudget:16, colourBudgetBy:{clothing:8},');
  need('PB.budgetFor=function(layer){ return ruleColourBudget(layer); };');
  need('overBudget:budget?Math.max(0,used.size-budget):0,');

  /* THE SENTENCES, EXERCISED. The one function that words all three is pure
     arithmetic on two numbers, so it can be carved out and run. */
  const a = code.indexOf('function colourCountNote(colours,budget){');
  const b = code.indexOf('\n}', a);
  const note = new Function(code.slice(a, b + 2) + '\nreturn colourCountNote;')();
  const is = (got, want) => { if (got !== want) throw new Error('sentence: got "' + got + '", want "' + want + '"'); };
  is(note(3, 0), '3 colours');
  is(note(1, 0), '1 colour');
  is(note(3, 16), '3 colours, within the project\'s colour guideline of 16');
  is(note(8, 8), '8 colours, within the project\'s colour guideline of 8');
  is(note(13, 8), '13 colours, 5 past the project\'s colour guideline of 8');
  is(note(255, 16), '255 colours, 239 past the project\'s colour guideline of 16');
  is(note(1014063, 16), '1,014,063 colours, 1,014,047 past the project\'s colour guideline of 16');
});

fs.renameSync(TMP, FILE);
console.log('patch513 written, ' + grew + ' bytes');
