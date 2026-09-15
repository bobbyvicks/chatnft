/* EVERY SHELF GESTURE REBUILT THE RULE LIST AND RE-RAN A 4,000-DRAW
   SIMULATION, AND BOTH GET WORSE WITH THE NUMBER OF RULES.

   MEASURED HERE, seeding 324 traits over the 13 default layers and timing a
   second renderShelf():

     rules     per gesture     DOM nodes     <option> in #rulelist
        0          24 ms           9,381                  0
      158         242 ms          61,205             51,034
      298         408 ms         107,125             96,254

   Both numbers are per CLICK. renderShelf is called bare from 43 places - a
   status change, a rarity edit, a duplicate, a remove, a layer toggle, every
   answer in the review sheet - and each one pays the lot.

   THIS IS THE LAG THAT WAS REPORTED AND THAT I COULD NOT REPRODUCE. The
   earlier attempt measured 324 traits with NO rules, which is the 24 ms row,
   and reported honestly that there was nothing there. The population was
   wrong, not the report: the cost is traits TIMES rules, and a project that
   has been through a review pass has hundreds of rules.

   ONE: buildRules rebuilds the whole list from scratch every time. It empties
   #rulelist and, per rule, builds an "add a trait" <select> holding one option
   per distinct trait in the project - |RULES| x |traits| elements created on
   every render. The review sheet compounds it: answering "No" appends a rule
   and then awaits a full renderShelf, so the k-th No rebuilds k rows of 323
   options.

   Nothing it draws depends on anything but the trait keys and RULES, so it
   keeps a signature of those and returns when they have not moved.

   NOT A LAZY <select>. The first version filled each row's options on focus,
   which is better still - it never builds the 96,254 nodes at all. It also
   changes what a <select> IS: rulegroups.spec.js widens a rule with
   `sel.value=k; sel.onchange();`, which is how anything automating this page
   would do it, and against a lazily-filled select that assignment silently
   does nothing. A rebuild that happens once per rule change instead of once
   per click is the whole of the time cost and none of that risk.

   THE SIGNATURE CHECKS THE DOM AS WELL. A cached signature that survives
   somebody else emptying the list would leave the panel permanently blank, so
   the row count and the two pickers are counted before the skip is taken - the
   skip has to be able to notice it is wrong.

   TWO: comboStats re-runs a 4,000-draw simulation to work out how many
   characters the rules leave possible. Its neighbour distributionOf, which
   answers a related question, IS memoised on exactly the inputs that change
   it - so the problem was recognised and solved one function away.

   The memo goes on legalFraction rather than on comboStats, and that is
   deliberate. comboStats also counts the base characters and folds their
   weights in, under a comment recording that leaving them out was a measured
   bug; distCache's key is built from traitEligible, which rejects anything
   that is not kind "trait", so a memo on comboStats keyed the same way would
   hand back a stale count after a base was added. legalFraction reads two
   things and nothing else - the pools and RULES - so that is its key, and the
   bases cannot go stale in a number that never looked at them. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the rule list is rebuilt when it has changed ---- */
{
  const at = kit.only(L, l => l === 'function buildRules(traits){', 'the rule list builder');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT THE RULE LIST WAS LAST BUILT FROM.',
    '',
    '   buildRules creates |RULES| x |traits| elements - one "add a trait"',
    '   option per trait, per rule - and renderShelf calls it on every gesture',
    '   from 43 bare call sites. Measured at 324 traits: 24 ms with no rules,',
    '   242 ms at 158, 408 ms at 298, per click.',
    '',
    '   Nothing it draws depends on anything but the trait keys and RULES. */',
    'let rulesBuiltSig=null;',
    'function buildRules(traits){',
  ]);
}
{
  const fn = kit.inFunction(L, 'function buildRules(traits){');
  const at = kit.only(L, l => l === '  const keys=[...new Set(traits.map(traitKey))].sort();',
    'the rule list trait keys', fn);
  kit.replace(L, { start: at, end: at }, [
    '  const keys=[...new Set(traits.map(traitKey))].sort();',
    '  /* THE SKIP, AND ITS OWN CHECK. A signature that outlived the DOM it',
    '     describes would leave the panel blank for good, so what is on screen',
    '     is counted too - a skip has to be able to notice it is wrong. */',
    '  const sig=JSON.stringify([keys,RULES]);',
    '  if(sig===rulesBuiltSig && L.childElementCount===RULES.length',
    '     && A.options.length===keys.length && B.options.length===keys.length) return;',
    '  rulesBuiltSig=sig;',
  ]);
}

/* ---- 2. and the share the rules leave is worked out when it has changed ---- */
{
  const at = kit.only(L, l => l === 'function legalFraction(by){', 'the legal share');
  kit.replace(L, { start: at, end: at }, [
    '/* THE SHARE THE RULES LEAVE, kept until something it depends on moves.',
    '',
    '   4,000 draws, each tested against every rule, re-run on every non-viewOnly',
    '   renderShelf. Measured at 324 traits: 0 ms with no rules, 144 ms at 158.',
    '',
    '   KEYED ON WHAT THIS FUNCTION READS, which is why the memo is here and',
    '   not on comboStats. comboStats also counts the base characters and folds',
    '   their weights in - there is a comment recording that leaving them out',
    '   was a measured bug - and the key distributionOf uses is built from',
    '   traitEligible, which rejects anything that is not kind "trait". A memo',
    '   on comboStats keyed that way would go stale the moment a base was added',
    '   or re-weighted. This reads the pools and RULES and nothing else. */',
    'let legalCache=null, legalKey="";',
    'function legalFraction(by){',
  ]);
}
{
  const fn = kit.inFunction(L, 'function legalFraction(by){');
  const at = kit.only(L, l => l === '  if(!layers.length) return 1;', 'the empty-pools bail', fn);
  kit.replace(L, { start: at, end: at }, [
    '  if(!layers.length) return 1;',
    '  /* The pools IN ORDER, because the draw picks by index against a fixed',
    '     seed - the same traits in a different order is a different answer. */',
    '  const key=JSON.stringify([layers.map(l=>[l,(by.get(l)||[]).map(traitKey)]),RULES]);',
    '  if(legalCache!==null && legalKey===key) return legalCache;',
  ]);
  const fn2 = kit.inFunction(L, 'function legalFraction(by){');
  const ret = kit.only(L, l => l === '  return legal/LEGAL_SAMPLES;', 'the legal share result', fn2);
  kit.replace(L, { start: ret, end: ret }, [
    '  legalCache=legal/LEGAL_SAMPLES; legalKey=key;',
    '  return legalCache;',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const code = codeLines.join('\n');

  /* THE RULE LIST SKIPS, AND CAN NOTICE IT IS WRONG. */
  const br = kit.inFunction(codeLines, 'function buildRules(traits){');
  const brb = codeLines.slice(br.start, br.end + 1).join('\n');
  if (!/const sig=JSON\.stringify\(\[keys,RULES\]\);/.test(brb))
    throw new Error('the rule list has no signature to compare against');
  if (!/if\(sig===rulesBuiltSig && L\.childElementCount===RULES\.length/.test(brb))
    throw new Error('the skip does not check the DOM it claims describes RULES');
  if (!/&& A\.options\.length===keys\.length && B\.options\.length===keys\.length\) return;/.test(brb))
    throw new Error('the skip would survive the two pickers being emptied');
  if (!/rulesBuiltSig=sig;/.test(brb))
    throw new Error('the signature is never recorded, so the skip never fires');
  /* The skip must come BEFORE the work, or it is a very expensive no-op. */
  if (brb.indexOf('rulesBuiltSig=sig;') > brb.indexOf('L.innerHTML="";'))
    throw new Error('the skip sits after the rebuild it is meant to avoid');
  /* NOT lazily filled: rulegroups.spec.js sets sel.value directly, which is
     how anything automating this page does it, and a lazily-filled select
     swallows that assignment in silence. */
  if (/addEventListener\("pointerdown"/.test(brb) || /add\.onfocus=/.test(brb))
    throw new Error('the row picker fills on demand, so setting its value does nothing');

  /* AND THE SIMULATION IS KEPT ON ITS OWN INPUTS. */
  const lf = kit.inFunction(codeLines, 'function legalFraction(by){');
  const lfb = codeLines.slice(lf.start, lf.end + 1).join('\n');
  if (!/const key=JSON\.stringify\(\[layers\.map\(l=>\[l,\(by\.get\(l\)\|\|\[\]\)\.map\(traitKey\)\]\),RULES\]\);/.test(lfb))
    throw new Error('the simulation is keyed on something other than what it reads');
  if (!/if\(legalCache!==null && legalKey===key\) return legalCache;/.test(lfb))
    throw new Error('the simulation never reads its own memo');
  if (!/legalCache=legal\/LEGAL_SAMPLES; legalKey=key;/.test(lfb))
    throw new Error('the simulation never fills its memo');
  /* !==null rather than truthy: a share of 0 is a real answer - every draw
     broke a rule - and a truthy test would recompute it every time, which is
     the slowest case recomputing forever. */
  if (/if\(legalCache && legalKey===key\)/.test(lfb))
    throw new Error('a share of zero would never be cached, which is the slowest case');
  /* The key must be built AFTER the trivial bail, or an empty project pays
     for a key it never uses. */
  if (lfb.indexOf('const key=JSON.stringify') < lfb.indexOf('if(!layers.length) return 1;'))
    throw new Error('the key is built before the bail that makes it pointless');
  /* comboStats itself is NOT memoised - see the note above legalFraction. */
  const cs = kit.inFunction(codeLines, 'function comboStats(items,wipIncluded){');
  if (/Cache/.test(codeLines.slice(cs.start, cs.end + 1).join('\n')))
    throw new Error('comboStats grew a memo, which goes stale when a base changes');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
