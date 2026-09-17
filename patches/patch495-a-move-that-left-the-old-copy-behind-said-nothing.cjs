/* A MOVE THAT LEFT THE OLD COPY BEHIND SAID NOTHING.

   Renaming, restatusing or moving a trait between layers inside a group is an
   arrival of the new copy and a removal of the old one, in that order, so a
   failure halfway leaves both rather than neither. cloudMoveOne's own comment
   says so and calls it "recoverable". Nobody is told there is anything to
   recover.

   MEASURED. The upload succeeds and the DELETE of the old row answers 503:

     drop works    server rows ["hat/stfp"]                 said "hat is in
                                                            the final project"
     drop fails    server rows ["hat/approved","hat/stfp"]  said "hat is in
                                                            the final project"

   The group now holds the trait twice and the page says exactly what it says
   when everything worked. The next person to Load from cloud gets both, one of
   them renamed on the clash. The old PNG is orphaned in the bucket too - the
   image delete is driven by the rows that came back, and none did.

   TWO THINGS, AND THE FIRST IS THE ONE THAT MATTERS.

   THE DELETE IS RETRIED, the way the upload three lines earlier already is. A
   503 from a gateway is the ordinary reason this fails, the upload survives
   exactly that with three attempts and a back-off, and the removal in the same
   function got one. 401 and 403 are not retried, for the reason the upload
   gives: a definitive answer asked twice more is a clear failure made slow.

   AND WHEN IT STILL FAILS, IT SAYS SO. cloudMoveOne reads the answer instead of
   discarding it. The distinction matters and is not the obvious one: null means
   the removal could not be done, false means it was done and matched nothing -
   which for a move is the old row already being gone, and is fine. Only null
   leaves a second copy.

   THE MESSAGE NAMES THE STATE AND NOT A REMEDY. Load from cloud would bring the
   old copy down and deleting it there would remove it for everybody, which is
   probably the answer - but "probably" is how the last three wrong sentences in
   this file got written, and I have not measured that path. It says what is
   true: the old copy is still up there.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE PRECEDENT: the upload in cloudSyncOne already retries this way, and the
   401/403 rule comes from there. If that ever changes, the two should be
   reconsidered together rather than drifting. */
kit.only(L, l => l === '    for(let attempt=0; attempt<PULL_TRIES; attempt++){',
  'the upload retry loop in cloudSyncOne');

/* ---- 1. the delete is retried ----------------------------------- */

{
  const dr = kit.inFunction(L, 'async function cloudDropOne(rec){');
  const at = kit.only(L, l => l === '    const r=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",',
    'the row delete', dr);
  if (L[at + 1] !== '      headers:Object.assign({Prefer:"return=representation"},h)});')
    throw new Error('the delete is not the two lines this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    /* THREE ATTEMPTS, the same as the upload in cloudSyncOne. A 503 from a',
    '       gateway is the ordinary reason this fails, and the upload survives',
    '       exactly that; the removal in the same operation got one attempt, so a',
    '       blip left the group holding the trait twice. Measured: rows came back',
    '       ["hat/approved","hat/stfp"] and the page said the move had worked.',
    '',
    '       401 and 403 are not retried, for the reason the upload gives - a',
    '       definitive answer asked twice more is a clear failure made slow. */',
    '    let r=null;',
    '    for(let attempt=0; attempt<PULL_TRIES; attempt++){',
    '      try{',
    '        r=await fetch(SB_URL+"/rest/v1/traits?"+q,{method:"DELETE",',
    '          headers:Object.assign({Prefer:"return=representation"},h)});',
    '        if(r.ok) break;',
    '        if(r.status===401||r.status===403) return null;',
    '      }catch(_){ r=null; }',
    '      if(attempt<PULL_TRIES-1) await new Promise(x=>setTimeout(x,250*(attempt+1)));',
    '    }',
    '    if(!r||!r.ok) return null;',
  ]);
}

/* ---- 2. cloudMoveOne reads the answer --------------------------- */

{
  const mv = kit.inFunction(L, 'async function cloudMoveOne(oldRec,newRec,why){');
  const at = kit.only(L, l => l === '  await cloudDropOne(oldRec);',
    'the old-copy removal', mv);
  kit.replace(L, { start: at, end: at }, [
    '  /* READ, NOT DISCARDED. The comment above calls a half-finished move',
    '     "recoverable", which it is - but nobody was told there was anything to',
    '     recover, and the message was identical to the one a clean move gets.',
    '',
    '     null and false are not the same answer here. null is "the removal could',
    '     not be done", which leaves the old copy on the server. false is "it was',
    '     done and matched nothing", which for a move means the old row had',
    '     already gone - no second copy, nothing to say. */',
    '  const dropped=await cloudDropOne(oldRec);',
    '  if(dropped===null&&why) why.oldKept=true;',
  ]);
}

/* ---- 3. the sentence, in one place ------------------------------ */

{
  const at = kit.only(L, l => l === 'function cloudWhyNot(why){', 'cloudWhyNot');
  kit.replace(L, { start: at, end: at }, [
    '/* AND WHAT TO ADD WHEN THE NEW COPY LANDED BUT THE OLD ONE DID NOT GO.',
    '',
    '   Appended rather than instead-of, because the move DID work as far as this',
    '   browser and the group are concerned - the trait is where it should be. The',
    '   thing worth saying is that the one it replaced is still up there as well.',
    '',
    '   NO REMEDY NAMED. Load from cloud would bring the old copy down and',
    '   deleting it there would remove it for everybody, which is probably the',
    '   answer - but "probably" is how the wrong sentences in this file got',
    '   written, and that path is not measured here. This says what is true. */',
    'function cloudAlsoOld(why){',
    '  return (why&&why.oldKept) ? " - and the old copy is still on the server," +',
    '    " so the group has it twice" : "";',
    '}',
    'function cloudWhyNot(why){',
  ]);
}

/* The three messages that carry a why. */
/* BOTH LINES, because the clause has to go INSIDE the toast call. The first
   version of this only changed the closing line, which produced

     toast(activeWs && !r.shared ? A : B)+cloudAlsoOld(r.why);

   - the clause concatenated onto what toast RETURNS and thrown away. The
   message came out bare and a test caught it. The opening line gets the extra
   parenthesis that makes the conditional one operand. */
{
  const open = kit.only(L, l => l === '        toast(activeWs && !r.shared',
    'the shelf chip message start');
  if (L[open + 2] !== "          : t.name+' -> '+next); };")
    throw new Error('the chip message is not the three lines this expects');
  L[open] = '        toast((activeWs && !r.shared';
  L[open + 2] = "          : t.name+' -> '+next)+cloudAlsoOld(r.why)); };";
}
{
  const fm = kit.inFunction(L, 'async function finalMove(t,next){');
  const at = kit.only(L,
    l => l === '  toast(activeWs && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what);',
    'the finalMove toast', fm);
  L[at] = '  toast((activeWs && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what)'
    + '+cloudAlsoOld(r.why));';
}
{
  const at = kit.only(L,
    l => l === '        : "Saved "+name+" here only - "+cloudWhyNot(why))+offGrid+edged);',
    'the saveTrait message');
  L[at] = '        : "Saved "+name+" here only - "+cloudWhyNot(why))+cloudAlsoOld(why)+offGrid+edged);';
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (code.indexOf(s) >= 0) throw new Error('still there: ' + s); };

  need('function cloudAlsoOld(why){');
  need('  const dropped=await cloudDropOne(oldRec);');
  need('  if(dropped===null&&why) why.oldKept=true;');
  gone('  await cloudDropOne(oldRec);');

  /* ALL THREE MESSAGES CARRY IT, or a move made from one page says less than
     the same move made from another. */
  /* THREE CALL SITES - the shelf chip, the final-set page and the editor. The
     declaration is counted separately; the first version of this lumped them
     together and expected a fourth line that does not exist. */
  const uses = codeLines.filter(l => /cloudAlsoOld\(/.test(l)
    && l !== 'function cloudAlsoOld(why){');
  if (uses.length !== 3)
    throw new Error('cloudAlsoOld is called at ' + uses.length + ' places, expected 3: '
      + uses.map(l => l.trim().slice(0, 44)).join(' | '));
  if (!codeLines.some(l => l === 'function cloudAlsoOld(why){'))
    throw new Error('cloudAlsoOld is not declared');
  /* AND INSIDE THE CALL, not appended to what toast returns. Each of the three
     is pinned as an exact line, because "+cloudAlsoOld(...)" reads the same
     either side of the closing parenthesis and only one of them does anything. */
  for (const exact of [
    "          : t.name+' -> '+next)+cloudAlsoOld(r.why)); };",
    '  toast((activeWs && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what)+cloudAlsoOld(r.why));',
    '        : "Saved "+name+" here only - "+cloudWhyNot(why))+cloudAlsoOld(why)+offGrid+edged);',
  ]) if (codeLines.indexOf(exact) < 0)
    throw new Error('a call site is not the exact line expected: ' + exact.trim().slice(0, 60));

  /* THE RETRY IS A RETRY, not a second single attempt. */
  const dr = (() => {
    const a = codeLines.findIndex(l => l === 'async function cloudDropOne(rec){');
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  })();
  if (!dr.some(l => /for\(let attempt=0; attempt<PULL_TRIES; attempt\+\+\)/.test(l)))
    throw new Error('cloudDropOne does not retry');
  if (!dr.some(l => /if\(r\.status===401\|\|r\.status===403\) return null;/.test(l)))
    throw new Error('cloudDropOne retries a definitive refusal');
  if (!dr.some(l => /setTimeout\(x,250\*\(attempt\+1\)\)/.test(l)))
    throw new Error('cloudDropOne retries without backing off');
  /* And still reads the removed rows, which is what drives the image delete. */
  if (!dr.some(l => /removed=await r\.json\(\)/.test(l)))
    throw new Error('cloudDropOne no longer reads what it removed');
});

fs.renameSync(TMP, FILE);
console.log('patch495 written, ' + grew + ' bytes');
