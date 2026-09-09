/* THE COLOUR BOX PUSHED FOUR TOOLS OFF THE SCREEN, AND THAT IS MY DOING.

   patch397 put the colours above the tools by wrapping both in a .leftcol
   flex column. Probed against 99cf7a5 - the page as it shipped - and against
   the tree, nine window shapes each, counting rail children whose box falls
   outside the rail's own:

     window     shipped      with the box
     1280x900   0 outside    4 outside  (rule, gridbtn, keysbtn, panbtn)
     860x640    0 outside    5 outside  (redo, rule, gridbtn, keysbtn, panbtn)
     1280x720   0 outside    1 outside  (panbtn)
     six others 0 outside    0 outside

   Zero everywhere before. So this is a regression I introduced, not a
   pre-existing overflow the box happened to reveal, and the pan tool was
   simply unreachable at the window this is most often used at.

   THE MECHANISM, WHICH IS WHY A WIDER COLUMN DID NOT FIX IT. The rail wraps
   into as many columns as its height forces (see the note above .tools), and
   the grid track has to be wide enough for the count it lands on. That worked
   because .tools WAS the grid item: its height was the row's height, definite,
   so the track could be sized knowing the wrap. Nesting it inside .leftcol
   took that away - the rail's height is now whatever the flex column leaves
   after the box, which the track sizing never sees. It sized for two columns;
   the rail wrapped into three; the third hung outside.

   Setting a min-width on the column was tried and is NOT the fix: it cleared
   five shapes and left 860x640 and 1280x720 still spilling, because the width
   needed is a function of the height and no fixed number is right at every
   shape.

   SO THE BOX GETS ITS OWN GRID ROW and the rail is a grid item again, exactly
   as it was. The stage spans both rows. Measured after, same nine shapes:
   nothing outside the rail anywhere, and the zoom is the shipped zoom at every
   one of them - 4, 5, 3, 4, 3, 3, 3, 3, 3.

   THE CAP COMES DOWN, 156px to 96px, and that is a measurement not a taste.
   Height the box takes becomes rail columns becomes stage width. At 156 the
   rail went to 279px at 860x640 against a shipped 175; at 96 it is 231, and
   at the five roomier shapes the rail is within 4px of what it always was.
   96px is two rows of swatches with the label above them, and past that the
   box scrolls - which was already true, since a real trait fills any cap. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the grid gains a row for the colours ------------------------ */
{
  const at = kit.only(L, l => l.indexOf('.app{display:grid; grid-template-columns:auto 1fr;') === 0,
    'the app grid');
  kit.replace(L, { start: at, end: at }, [
    '.app{display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto auto 1fr auto;',
  ]);
  const ar = kit.only(L, l => l.indexOf('  grid-template-areas:"head head" "opts opts" "tools stage"') === 0,
    'the app areas');
  kit.replace(L, { start: ar, end: ar }, [
    '  /* THE COLOURS GET THEIR OWN ROW, and the rail keeps being a grid item.',
    '     The rail wraps to the columns its height forces, so the track can only',
    '     be sized right when that height is the row height - definite, and',
    '     known before the track is measured. Inside a flex wrapper it was',
    '     neither, and three columns of tools hung out of a two-column track. */',
    '  grid-template-areas:"head head" "opts opts" "cols stage" "tools stage" "foot foot"; height:100dvh;}',
  ]);
}

/* ---- the wrapper goes ------------------------------------------- */
{
  const at = kit.only(L, l => l === '/* The rail and the colour box share one grid area, stacked. The border and',
    'the wrapper note');
  if (L[at + 2].indexOf('.leftcol{grid-area:tools;') !== 0)
    throw new Error('the wrapper rule is not where the note says it is');
  kit.replace(L, { start: at, end: at + 3 }, [
    '/* SUPERSEDES "the rail and the colour box share one grid area, stacked",',
    '   which is what .leftcol did and what cost the rail its definite height.',
    '   They are two grid items in two rows now; the stage spans both. */',
  ]);
}

/* ---- the box: its own area, a smaller cap, the column edge ------- */
{
  const at = kit.only(L, l => l.indexOf('.colbox{flex:none; max-height:156px;') === 0, 'the colour box');
  kit.replace(L, { start: at, end: at + 1 }, [
    '.colbox{grid-area:cols; max-height:96px; overflow-y:auto; padding:10px 10px 8px;',
    '  border-right:1px solid var(--line); border-bottom:1px solid var(--line);',
    '  background:var(--panel);}',
  ]);
  /* SUPERSEDES "156px shows six rows": the number was chosen against the box
     alone, and the thing it has to be chosen against is the rail. */
  /* BOTH ENDS ANCHORED, not one end and a count. A first version took the
     line four back from the middle of this note and left its opening /* behind
     as an orphan, which then ran on and swallowed the replacement whole - a
     comment that eats the next comment, and every check still passed because
     they all read rules. */
  const top = kit.only(L, l => l === '/* THE COLOURS, ALWAYS ON SCREEN. A FIXED cap rather than a share of the',
    'the top of the cap note');
  const why = kit.only(L, l => l === '   cannot push the tools out of view. */', 'the end of the cap note');
  if (why < top) throw new Error('the cap note ends before it begins');
  kit.replace(L, { start: top, end: why }, [
    '/* THE COLOURS, ALWAYS ON SCREEN, AND CAPPED BY WHAT THE RAIL NEEDS. A',
    '   fixed cap rather than a share of the column, because a percentage takes',
    '   more of a tall window than a short one, which is backwards. 96px is the',
    '   label and two rows of swatches; past that it scrolls, so a trait with',
    '   ninety colours cannot push the tools out of view. It is 96 and not the',
    '   156 first written because every pixel of height here comes back as a',
    '   rail column: at 156 the rail was 279px wide at 860x640 against a',
    '   shipped 175, at 96 it is 231, and at the roomier shapes it is within',
    '   4px of what it always was. */',
  ]);
}

/* ---- the rail draws its own edge again --------------------------- */
{
  const at = kit.near(L, '  background:transparent;}', -1,
    'flex-wrap:wrap; align-content:flex-start;', 'the rail background');
  kit.replace(L, { start: at, end: at }, [
    '  border-right:1px solid var(--line); background:var(--panel);}',
  ]);
}

/* ---- the phone had a rule for a wrapper that no longer exists ---- */
{
  const at = kit.only(L, l => l === '  .leftcol{display:block; border-right:none;}', 'the phone wrapper rule');
  kit.replace(L, { start: at, end: at }, []);
  const note = kit.only(L, l => l === '     door. .leftcol stops being a column and is just the strip. */',
    'the phone note');
  kit.replace(L, { start: note, end: note }, [
    '     door. There is no column here to stop being one - the rail is the',
    '     only thing in that area and it lies down. */',
  ]);
}

/* ---- and the markup ---------------------------------------------- */
{
  const at = kit.only(L, l => l === '  <!-- THE LEFT COLUMN: colours on top, tools under them. One grid area,',
    'the markup note');
  if (L[at + 3] !== '  <div class="leftcol">')
    throw new Error('the wrapper is not three lines under its note');
  kit.replace(L, { start: at, end: at + 3 }, [
    '  <!-- The colours, then the tools. Two rows of one grid column: see',
    '       patch399 for why the rail cannot be nested inside anything. -->',
  ]);
  const nav = kit.only(L, l => l === '  <nav class="tools" aria-label="Tools">', 'the tool rail');
  let close = -1;
  for (let i = nav + 1; i < L.length && i < nav + 80; i++) if (L[i] === '  </nav>') { close = i; break; }
  if (close < 0) throw new Error('the tool rail does not close within eighty lines');
  if (L[close + 1] !== '  </div>')
    throw new Error('the wrapper does not close where it was put');
  kit.replace(L, { start: close + 1, end: close + 1 }, []);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text }) => {
  /* The word itself still appears, on purpose: the note above the rule names
     what it supersedes. So this asks for the rule and the element, not the
     string - a check that scans prose finds its own explanation. */
  if (/\.leftcol\s*\{/.test(text)) throw new Error('a rule for the wrapper is still here');
  if (/class="leftcol"/.test(text)) throw new Error('the wrapper element is still here');
  if (text.indexOf('id="colbox"') < 0) throw new Error('the colour box is gone');
  if (text.indexOf('id="palrail"') < 0) throw new Error('the always-open strip is gone');

  const css = text.slice(0, text.indexOf('</' + 'style>'));
  /* THE COMMENTS HAVE TO CLOSE. Replacing part of a note leaves its opening
     behind, and CSS comments do not nest - the orphan runs on and eats the
     note that replaced it, silently, with every rule still where it should
     be. This happened here once. Scanned rather than counted, because two
     openers and two closers can still be in the wrong order. */
  for (let i = 0, open = -1; i < css.length - 1; i++) {
    if (css[i] === '/' && css[i + 1] === '*') {
      if (open >= 0) {
        const line = css.slice(0, i).split('\n').length;
        throw new Error('a comment opens inside an open one at line ' + line +
          ', so the one begun at line ' + css.slice(0, open).split('\n').length + ' never closed');
      }
      open = i; i++;
    } else if (css[i] === '*' && css[i + 1] === '/') { open = -1; i++; }
  }
  /* THE ROWS AND THE AREAS HAVE TO AGREE. Five area strings against four row
     sizes is a silent bug: the fifth row is auto and the stage stops being
     the one that grows. Counted, not eyeballed. */
  /* BOTH READS START AT .app. An unanchored search for the areas found the
     account card's three-row grid four hundred lines earlier and reported it
     as a mismatch against .app's five rows - the right refusal for the wrong
     reason, which is the shape that would have passed had the counts agreed. */
  const appAt = css.indexOf('.app{display:grid;');
  if (appAt < 0) throw new Error('the app grid rule cannot be found');
  const appCss = css.slice(appAt);
  const rows = /^\.app\{display:grid; grid-template-columns:auto 1fr; grid-template-rows:([^;]+);/.exec(appCss);
  if (!rows) throw new Error('the app grid rule cannot be read');
  const areas = /grid-template-areas:((?:"[^"]*" ?)+);/.exec(appCss);
  if (!areas) throw new Error('the app areas cannot be read');
  const nRows = rows[1].trim().split(/\s+/).length;
  const nAreas = areas[1].match(/"[^"]*"/g).length;
  if (nRows !== nAreas)
    throw new Error('the grid has ' + nRows + ' row sizes and ' + nAreas + ' area rows');
  if (!/"cols stage" "tools stage"/.test(areas[1]))
    throw new Error('the colours and the tools are not stacked beside the stage');
  if (rows[1].trim() !== 'auto auto auto 1fr auto')
    throw new Error('the stage row is not the one that grows: ' + rows[1]);

  /* The box takes the area, the cap comes down, and both draw the edge - or
     the column has a seam halfway down it. */
  if (!/\.colbox\{grid-area:cols; max-height:96px; overflow-y:auto;/.test(css))
    throw new Error('the colour box does not take its own row at the measured cap');
  const boxHead = css.slice(css.indexOf('.colbox{grid-area:cols;'));
  if (!/border-right:1px solid var\(--line\)/.test(boxHead.slice(0, boxHead.indexOf('}'))))
    throw new Error('the colour box does not draw the column edge');
  const railHead = css.slice(css.indexOf('.tools{grid-area:tools;'));
  if (!/border-right:1px solid var\(--line\); background:var\(--panel\);/
    .test(railHead.slice(0, railHead.indexOf('}'))))
    throw new Error('the rail does not draw the column edge, so the edge stops at the box');
  /* THE RAIL IS A GRID ITEM, WHICH IS THE WHOLE FIX. Nothing may wrap it. */
  const navAt = text.indexOf('<nav class="tools"');
  const before = text.slice(text.lastIndexOf('<', navAt - 1), navAt);
  if (/<div/.test(before))
    throw new Error('something opens right before the rail again');
  if (!/\.colbox\{display:none;\}/.test(css))
    throw new Error('the colour box is not put away on a phone');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
