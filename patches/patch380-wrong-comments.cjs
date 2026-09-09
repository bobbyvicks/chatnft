/* TWO SENTENCES I WROTE THIS SESSION THAT ARE NOT TRUE, AND ONE DEAD RULE.

   All three were caught by people reading the work rather than by any test,
   which is the reason to fix them: a wrong sentence in a confident tone
   survives review, and both of these were written to explain a change somebody
   will read long after the change is ordinary.

   1. "a miss here opens the trait rather than doing nothing", over the
      three-column shelf tool row. Challenged, so it was measured rather than
      argued. At 375x812 with touch on and the tiles scrolled into view, a tap
      in the 6px gap between two per-tile buttons lands on DIV.shelftools, and
      .shelftools stops nothing - so it reaches the tile's own handler. One of
      three such taps opened the editor; the other two did not. The sentence is
      right about the code and wrong to say "a miss opens the trait" as though
      it always does.

   2. "a phone fires resize repeatedly as the URL bar collapses during an
      ordinary scroll", over the coalesced resize listener. False for the only
      screen the listener does anything on. The guard is !$("app").hidden; .app
      is height:100dvh under html,body{height:100%}; and the editor document
      does not scroll at 375x812 - so there is no page scroll there for a URL
      bar to collapse against. On the shelf, where you do scroll, the guard
      returns immediately. What is really left is rotation and the keyboard,
      which fire resize for real. The coalescing is still right and the reason
      given for it was not.

   3. `.cur input[type=color]{width:30px; height:30px;}` matches no element.
      The colour well was an input when that rule was written and is a button
      now - .cur holds #clbtn and #curhex and nothing else, read off the markup
      rather than assumed. The rule is labelled rather than deleted, because it
      records what the control used to be.

   NOT IN THE PAGE, so not fixed here: patch376's own header says "#clbtn
   becomes 30 x 30 beside the swatch the same block already grew to 30", which
   is the same invented reason. It is corrected in that file's header, where it
   lives; index.html never carried it.

   Nothing about the page's behaviour changes in this patch. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 3: the dead rule, labelled where it sits ------------------- */
{
  const dead = kit.only(L, l => l === '  .cur input[type=color]{width:30px; height:30px;}',
    'the dead colour-input rule');
  kit.replace(L, { start: dead, end: dead }, [
    '  /* MATCHES NOTHING TODAY. The colour well was an input when this was',
    '     written and is a button now (#clbtn, sized just below), so .cur holds no',
    '     input at all - read off the markup, not assumed: .cur contains #clbtn',
    '     and #curhex and nothing else. Kept rather than deleted because it',
    '     records what the control used to be, and labelled so nobody leans on',
    '     it for a size the button gets from its own rule. */',
    '  .cur input[type=color]{width:30px; height:30px;}',
  ]);
}

/* ---- 1: what a miss actually does -------------------------------- */
{
  const at = kit.only(L, l => l === '  /* FIVE ACROSS IS 24px EACH. Two rows of three is about 40 wide and 36',
    'the per-tile row comment');
  if (L[at + 1] !== '     tall, and a miss here opens the trait rather than doing nothing. */')
    throw new Error('the per-tile row comment is not the two lines this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* FIVE ACROSS IS 24px EACH. Two rows of three is about 40 wide and 36',
    '     tall.',
    '',
    '     WHAT A MISS COSTS, measured rather than asserted: a tap in the 6px gap',
    '     between two of these lands on the .shelftools container, which stops',
    '     nothing, so it reaches the tile\'s own handler and can open the trait.',
    '     One of three gap taps opened the editor in the run. SUPERSEDES "a miss',
    '     here opens the trait rather than doing nothing", which said always and',
    '     meant sometimes. */',
  ]);
}

/* ---- 2: the resize comment claims a scroll that cannot happen ---- */
{
  const at = kit.only(L, l => l === '/* COALESCED INTO A FRAME. fitZoom reaches contentBox, which reads the whole',
    'the resize comment');
  if (L[at + 5] !== '   them one. Same condition as before, evaluated when the frame runs. */')
    throw new Error('the resize comment is not the six lines this expects');
  kit.replace(L, { start: at, end: at + 5 }, [
    '/* COALESCED INTO A FRAME. fitZoom reaches contentBox, which reads the whole',
    '   canvas with getImageData - 6.25 MB at the collection size, measured at',
    '   3.3 ms a call here. A burst of resizes becomes one call rather than one',
    '   each. Same condition as before, evaluated when the frame runs.',
    '',
    '   SUPERSEDES "a phone fires resize repeatedly as the URL bar collapses',
    '   during an ordinary scroll". Measured, and false for the only screen this',
    '   listener does anything on: the guard is !$("app").hidden, .app is',
    '   height:100dvh under html,body{height:100%}, and the editor document does',
    '   not scroll at all at 375x812 - so there is no page scroll there to',
    '   collapse a URL bar. On the shelf, where you do scroll, the guard returns',
    '   immediately. What is left is rotation and the keyboard, which fire resize',
    '   for real and are worth one frame instead of several. Smaller than the',
    '   sentence it replaces claimed, and still the right shape. */',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, lines }) => {
  /* EVERY COPY OF A RETRACTED SENTENCE HAS TO BE INSIDE ITS OWN RETRACTION.

     A first version asserted the sentences were simply gone and refused a
     correct edit, because a correction QUOTES what it replaces - the check
     found its own explanation. That is the trap patchkit's code() exists for,
     and it cannot help here: the comments ARE the change, so stripping them
     strips the thing being checked. Counting, and requiring the count to equal
     the number sitting behind SUPERSEDES, works either way.

     Whitespace is flattened first because a wrapped comment splits a sentence
     across a line and a plain indexOf would find neither the old copy nor the
     new one. */
  const flat = text.replace(/\s+/g, ' ');
  const retracted = [
    'a miss here opens the trait rather than doing nothing',
    'a phone fires resize repeatedly as the URL bar collapses',
  ];
  for (const s of retracted) {
    const total = flat.split(s).length - 1;
    const quoted = flat.split('SUPERSEDES "' + s).length - 1;
    if (!total)
      throw new Error('"' + s.slice(0, 34) + '..." is gone entirely, so nothing records that it was wrong');
    if (total !== quoted)
      throw new Error((total - quoted) + ' copy of "' + s.slice(0, 34) + '..." still stands unretracted');
  }

  /* AND THE CLAIM THE THIRD CORRECTION RESTS ON, read rather than trusted:
     .cur really does hold no colour input. */
  const cur = lines.findIndex(l => l.indexOf('<div class="cur">') >= 0);
  if (cur < 0) throw new Error('the colour row is gone');
  let depth = 0, end = cur;
  for (let i = cur; i < lines.length && i < cur + 30; i++) {
    depth += (lines[i].match(/<div\b/g) || []).length;
    depth -= (lines[i].match(/<\/div>/g) || []).length;
    if (depth <= 0) { end = i; break; }
  }
  const inside = lines.slice(cur, end + 1).join('\n');
  if (/type=["']color["']/.test(inside))
    throw new Error('there IS a colour input in .cur, so the label is the wrong way round');
  if (inside.indexOf('id="clbtn"') < 0)
    throw new Error('the colour button is not in .cur, so the label describes the wrong markup');

  /* The behaviour the earlier patches landed is untouched. */
  for (const needle of ['#clbtn{width:30px; height:30px;}',
    '.shelftools{grid-template-columns:repeat(3,', 'let fitPending=0;']) {
    if (text.indexOf(needle) < 0) throw new Error('a comment fix removed ' + needle);
  }
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
