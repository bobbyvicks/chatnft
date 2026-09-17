/* FOUR THINGS THIS SESSION WROTE DOWN THAT ARE NOT TRUE.

   This file keeps its reasoning in comments on purpose, and a comment with a
   confident wrong claim in it survives review - somebody checking the argument
   finds the numbers do not match and stops trusting the part that was right.
   All four of these are mine, from today.

   ONE. rotateFree's doc comment now sits above rotateHalf.

     /* Rotate by any angle.
        A quarter turn is exact, so those four angles go through rotateQuarter
        ...
     function rotateHalf(){

   patch486 inserted rotateHalf between the comment and the function it
   describes. Two things wrong at once: it is attached to the wrong function,
   and its sentence "those four angles go through rotateQuarter" was made false
   by the same patch - 180 goes to rotateHalf now. Whoever reads rotateHalf
   reads a header about sampling at arbitrary angles, which is the one thing it
   does not do.

   TWO. Two wrong numbers in the argument for the out-parameter.

     "All seven call sites read this answer as true-or-false, and four tests
      replace the whole function with a stub ... would stop firing at four call
      sites at once"

   Counted: five call sites of cloudSyncOne in this file, not seven. The four
   tests is right - reimport, sameart, saywhathappened and whyitdidnotreach all
   stub it. The "four call sites at once" is the literal if(!await ...) form,
   which is two. The design is still right; the numbers arguing for it were
   inflated, which is worse than saying none.

   THREE. A comment about the updates mailbox still says a toast lasts 1.7
   seconds. patch483 made that false for exactly the long message the comment
   is about, which is the case it uses to justify the mailbox existing.

   FOUR. tests/rotation.spec.js says "rotateFree takes 90, 180 and 270 to
   rotateQuarter". It takes 90 and 270. That test still passes - it is about
   the rotxel port, not about the routing - so nothing was going to catch it.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the doc comment goes back above its function ------------ */

const DOC = [
  '/* Rotate by any angle.',
  '',
  '   A quarter turn is exact, so those four angles go through rotateQuarter and',
  '   nothing is resampled. Every other angle has to sample, and this samples',
  '   NEAREST: each destination pixel takes one whole source pixel, so no colour',
  '   is averaged into existence. The shape of a diagonal edge changes - it has',
  '   to, the grid moved under it - but the palette does not. */',
];
{
  const start = kit.only(L, l => l === DOC[0], 'the rotate-by-any-angle header');
  for (let i = 0; i < DOC.length; i++)
    if (L[start + i] !== DOC[i])
      throw new Error('the header is not the block this expects, at line ' + (start + i + 1));
  /* It must currently be followed by rotateHalf - that IS the defect. If it is
     already above rotateFree, this has run before and must refuse. */
  if (L[start + DOC.length] !== '/* A HALF TURN. Every pixel to the opposite corner, on the same canvas.')
    throw new Error('the header is not above rotateHalf; nothing to move');
  kit.replace(L, { start: start, end: start + DOC.length - 1 }, []);
}
{
  const at = kit.only(L, l => l === 'function rotateFree(deg){', 'rotateFree');
  kit.replace(L, { start: at, end: at }, [
    '/* Rotate by any angle.',
    '',
    '   NINETY AND TWO-SEVENTY are exact, so those two go through rotateQuarter',
    '   and nothing is resampled; a half turn goes to rotateHalf, which is the',
    '   same kind of exact permutation on a canvas that does not change size.',
    '   This sentence used to say "those four angles", which stopped being true',
    '   the moment 180 got its own function - and the comment was left stranded',
    '   above THAT function, describing arbitrary-angle sampling to a reader of',
    '   the one turn that does none.',
    '',
    '   Every other angle has to sample, and this samples NEAREST: each',
    '   destination pixel takes one whole source pixel, so no colour is averaged',
    '   into existence. The shape of a diagonal edge changes - it has to, the',
    '   grid moved under it - but the palette does not. */',
    'function rotateFree(deg){',
  ]);
}

/* ---- 2. the numbers in the out-parameter argument --------------- */

{
  const at = kit.only(L, l => l === '     AN OUT-PARAMETER, not a return value, and the shape is forced. All',
    'the out-parameter argument');
  const end = kit.only(L, l => l === '     and a stub that fills nothing, both get the message they got before.',
    'the end of that argument');
  kit.replace(L, { start: at, end: end }, [
    '     AN OUT-PARAMETER, not a return value, and the shape is forced. All',
    '     FIVE call sites read this answer as true-or-false, and four specs',
    '     replace the whole function with a stub. Returning {ok,reason} would',
    '     make every failure an object - always truthy - so the two call sites',
    '     written as if(!await cloudSyncOne(...)) would stop firing silently,',
    '     and the three that test the result some other way would start',
    '     reporting success for every failure. Writing the reason into an object',
    '     the caller supplies leaves the answer exactly as it was: a caller that',
    '     passes nothing, and a stub that fills nothing, both get the message',
    '     they got before.',
    '',
    '     THE NUMBERS WERE SEVEN AND FOUR WHEN THIS WAS WRITTEN, AND BOTH WERE',
    '     WRONG - counted from grep hits that included this comment and the ones',
    '     around it. The design they argue for is right and the arithmetic was',
    '     not, which is the shape that survives review: nobody re-counts a',
    '     number in a comment that reads confidently.',
  ]);
}

/* ---- 3. the toast duration claim -------------------------------- */

{
  const at = kit.only(L, l => l.indexOf('a line of toast that lasts 1.7 seconds is not') >= 0,
    'the toast duration claim');
  L[at] = L[at].replace('a line of toast that lasts 1.7 seconds is not',
    'a line of toast, which is gone in seconds, is not');
}

const grew = kit.save(doc, ({ text, code, lines, codeLines }) => {
  /* THE SUBJECT OF THIS PATCH IS COMMENTS, so its checks read the RAW lines.
     The first version looked for the header in codeLines, which is the text
     with the comments stripped out - it could only ever answer "gone", and it
     did. A check that cannot see what it is checking is not a check. */
  const need = (s) => { if (text.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (text.indexOf(s) >= 0) throw new Error('still there: ' + s); };

  /* The header is above rotateFree and nothing else sits between. */
  const hdr = lines.findIndex(l => l === '/* Rotate by any angle.');
  if (hdr < 0) throw new Error('the header is gone entirely');
  const close = lines.indexOf('   grid moved under it - but the palette does not. */', hdr);
  if (close < 0) throw new Error('the header does not close where expected');
  if (lines[close + 1] !== 'function rotateFree(deg){')
    throw new Error('the header is not immediately above rotateFree, it is above: '
      + lines[close + 1]);
  /* And exactly one copy of it. */
  if (lines.filter(l => l === '/* Rotate by any angle.').length !== 1)
    throw new Error('the header exists more than once');

  gone('those four angles go through rotateQuarter');
  need('   NINETY AND TWO-SEVENTY are exact, so those two go through rotateQuarter');

  gone('seven call sites read this answer');
  need('     FIVE call sites read this answer as true-or-false, and four specs');
  /* The corrected number has to match the code, so it is derived here rather
     than trusted: this is the second time these were written down. */
  const sites = codeLines.filter(l => /await cloudSyncOne\(/.test(l)).length;
  if (sites !== 5)
    throw new Error('there are ' + sites + ' call sites now, so the comment saying FIVE is wrong again');
  const bang = codeLines.filter(l => /if\(activeWs&&!await cloudSyncOne\(/.test(l)).length;
  if (bang !== 2)
    throw new Error('there are ' + bang + ' if(!await ...) sites, so "two" is wrong');

  gone('a line of toast that lasts 1.7 seconds');
});

fs.renameSync(TMP, FILE);
console.log('patch490 written, ' + grew + ' bytes');
