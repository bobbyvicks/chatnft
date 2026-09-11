/* STFP: THE TRAITS THAT ARE THE FINAL PROJECT.

   "rn we have a wip accepted and rejected i want a 'STFP' and thats a save to
   final project category and its going to be our final project traits"

   A fourth status beside wip, approved and rejected. wip is being worked on,
   approved has been looked at and passed, rejected is out - and stfp is the
   set that ships.

   WHAT IT COUNTS AS, everywhere it matters. approved was checked in four
   separate places with four copies of `st==="approved"`: whether a trait can
   be drawn onto a character, whether it goes in a generated sheet, whether it
   is sampled for the collection's palette, and whether it is packaged by the
   export. stfp counts in all four, and one function now answers that question
   for all of them rather than four literals that can drift.

   ADDITIVE, DELIBERATELY. Nothing that works today stops working: an approved
   trait is still a member of everything it was a member of, and a collection
   with no stfp trait in it behaves exactly as it does now. This is a state
   ABOVE approved, not a replacement for it - if the export should one day
   package stfp ALONE, that is a different decision and somebody should make
   it on purpose rather than discover it.

   The shelf cycle goes wip -> approved -> stfp -> rejected, which is the
   order the states happen in. Its %3 becomes the list length, or adding a
   fourth silently makes the last one unreachable.

   AND A FOLDER NAMED stfp IMPORTS AS ONE. STATUSES is what the path reader
   matches whole segments against, so traits/hats/stfp/crown.png arrives
   carrying its layer and its status the way an approved folder does. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- one answer to "is this trait part of the collection" ---------- */
{
  const at = kit.only(L, l => l === 'const STATUSES=["approved","wip","rejected"];',
    'the status list the path reader matches');
  kit.replace(L, { start: at, end: at }, [
    '/* stfp is here so a folder named stfp imports as one, the same way an',
    '   approved folder does. */',
    'const STATUSES=["approved","wip","rejected","stfp"];',
    '/* IS THIS TRAIT PART OF THE COLLECTION.',
    '',
    '   Four places asked this with their own copy of st==="approved": whether',
    '   a trait can be drawn onto a character, whether the generator may use',
    '   it, whether the collection palette samples it, and whether the export',
    '   packages it. Four literals is four chances for a new status to be a',
    '   member of some of those and not others, which is the sort of thing',
    '   nobody notices until a sheet generates without a hat in it.',
    '',
    '   stfp is the final set and approved has passed review, so both are',
    '   members. wip is decided by the caller - the generator has a checkbox',
    '   for it - and rejected never is. */',
    'function inCollection(st){',
    '  const s=String(st||"wip");',
    '  return s==="approved"||s==="stfp";',
    '}',
  ]);
}

/* ---- the four places, through it ----------------------------------- */
{
  const at = kit.only(L, l => l === '    return wip || st==="approved";', 'the compose filter');
  kit.replace(L, { start: at, end: at }, [
    '    return wip || inCollection(st);',
  ]);
  const el = kit.only(L, l => l === '  return !!wipIncluded || st==="approved";', 'the generator gate');
  kit.replace(L, { start: el, end: el }, [
    '  return !!wipIncluded || inCollection(st);',
  ]);
  const pal = kit.only(L, l => l === '  const traits=items.filter(i=>i.kind==="trait"&&(i.status||"wip")==="approved");',
    'the collection palette sample');
  kit.replace(L, { start: pal, end: pal }, [
    '  const traits=items.filter(i=>i.kind==="trait"&&inCollection(i.status));',
  ]);
  const exp = kit.only(L, l => l === '  const approved=traits.filter(t=>(t.status||"wip")==="approved");',
    'what the export packages');
  kit.replace(L, { start: exp, end: exp }, [
    '  const approved=traits.filter(t=>inCollection(t.status));',
  ]);
  const held = kit.only(L, l => l === '  const held=traits.filter(t=>(t.status||"wip")!=="approved")',
    'what the export holds back');
  kit.replace(L, { start: held, end: held }, [
    '  const held=traits.filter(t=>!inCollection(t.status))',
  ]);
  const say = kit.only(L, l => l === '    say("No trait is approved, so there is no collection to package. Set a"',
    'what the export says when there is nothing');
  if (L[say + 1] !== '      +" status on the shelf first.");')
    throw new Error('the export message is not shaped the way this expects');
  kit.replace(L, { start: say, end: say + 1 }, [
    '    say("No trait is approved or stfp, so there is no collection to"',
    '      +" package. Set a status on the shelf first.");',
  ]);
}

/* ---- the cycle, the chips and the filter --------------------------- */
{
  const at = kit.only(L, l => l === "        const order=['wip','approved','rejected'];", 'the shelf status cycle');
  if (L[at + 1] !== "        const next=order[(order.indexOf(t.status||'wip')+1)%3];")
    throw new Error('the cycle is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '        /* The order the states happen in. */',
    "        const order=['wip','approved','stfp','rejected'];",
    '        /* order.length, not 3: a fourth state with a hard-coded 3 is a',
    '           state the cycle can never reach. */',
    "        const next=order[(order.indexOf(t.status||'wip')+1)%order.length];",
  ]);
  const filt = kit.only(L, l => l === '        <button class="mini filt" data-f="approved" aria-pressed="false">approved</button>',
    'the approved filter chip');
  kit.replace(L, { start: filt, end: filt }, [
    '        <button class="mini filt" data-f="approved" aria-pressed="false">approved</button>',
    '        <button class="mini filt" data-f="stfp" aria-pressed="false">stfp</button>',
  ]);
  const chip = kit.only(L, l => l === '            <button type="button" data-v="approved" aria-pressed="false">approved</button>',
    'the approved status chip');
  kit.replace(L, { start: chip, end: chip }, [
    '            <button type="button" data-v="approved" aria-pressed="false">approved</button>',
    '            <button type="button" data-v="stfp" aria-pressed="false"',
    '              title="Save to final project - the traits that ship.">stfp</button>',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* ONE ANSWER, and every gate asks it. */
  const ic = kit.inFunction(codeLines, 'function inCollection(st){');
  const body = codeLines.slice(ic.start, ic.end + 1).join('\n');
  if (!/return s==="approved"\|\|s==="stfp";/.test(body))
    throw new Error('stfp is not a member of the collection');
  const code = codeLines.join('\n');
  /* NO LITERAL LEFT BEHIND in the four gates - one that kept its own copy
     would make stfp a member of some of them and not others. */
  for (const stale of [
    'return wip || st==="approved";',
    'return !!wipIncluded || st==="approved";',
    'i.kind==="trait"&&(i.status||"wip")==="approved"',
    'traits.filter(t=>(t.status||"wip")==="approved")',
    'traits.filter(t=>(t.status||"wip")!=="approved")',
  ]) if (code.indexOf(stale) >= 0)
    throw new Error('a gate still tests approved by hand: ' + stale);
  if ((code.match(/inCollection\(/g) || []).length < 6)
    throw new Error('not every gate goes through the one answer');

  /* REJECTED IS STILL NEVER A MEMBER. */
  if (/return s==="approved"\|\|s==="stfp"\|\|s==="rejected"/.test(body))
    throw new Error('rejected became a member of the collection');

  /* THE CYCLE CAN REACH IT. A hard-coded 3 with four states is a state
     nothing can click to. */
  if (!/const order=\['wip','approved','stfp','rejected'\];/.test(code))
    throw new Error('the shelf cycle does not know about stfp');
  if (/\+1\)%3\]/.test(code))
    throw new Error('the cycle still steps by 3, so the fourth state is unreachable');

  /* AND IT IS ON THE PAGE, both as a chip and as a filter. */
  if (!/data-f="stfp"/.test(text))
    throw new Error('the shelf cannot filter to it');
  if (!/data-v="stfp"/.test(text))
    throw new Error('the editor cannot set it');
  /* And a folder named stfp imports as one. */
  if (!/const STATUSES=\["approved","wip","rejected","stfp"\];/.test(code))
    throw new Error('an stfp folder would import as unsorted wip');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
