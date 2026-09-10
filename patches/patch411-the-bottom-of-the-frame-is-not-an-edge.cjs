/* THE SAVE DREW THE LINE THE OUTLINE HAD BEEN TOLD NOT TO.

   "the outline adds a black line at the bottom of the screen, specifically
   asked for it to not be like that"

   IT IS NOT THE OUTLINE. Measured, starting from a trait with no black in it
   at all, on a canvas big enough for the save rule to run:

     state                       black on the bottom row
                                 canvas      after a save
     nothing done yet            0           244
     outline at N, E and W       2           244
     outline at all four sides   244         244

   The outline is doing exactly what it was asked: two pixels, which are the
   left and right edges of the shape where they meet the bottom row. Every one
   of those saves comes out with a full line anyway, and the first row of the
   table is the one that settles it - the line appears with no outline run at
   all.

   blackenEdge is what draws it. It repaints the outermost opaque pixels black
   on the way out, and treats the canvas boundary as empty unless the art
   fills that whole edge. A hoodie runs off the bottom without filling the
   full width of it, so every pixel on the last row has nothing below it and
   is an outer pixel by that rule.

   SO THE BOTTOM OF THE FRAME STOPS COUNTING AS AN EDGE. Crossing it is
   covered, always, the way it already is for an edge the art fills.

   WHAT THIS KEEPS. The other three boundaries are unchanged, and the note
   above this rule is right about why: a hat cropped at the top still wants
   its outline there. An interior edge is untouched - a trait that ends above
   the bottom of the canvas has real empty space under it and is still
   outlined. A background fills all four edges, so nothing about it changes
   either way; that was measured on the real 317 when this rule was written
   and the 58 backgrounds are exactly the files that fill every edge.

   ONE ANSWER, which is the actual principle here. The outline tool asks which
   sides count as outside and defaults to above, left and right. A save that
   then drew the fourth side made the tool's answer a suggestion. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const r = kit.inFunction(L, 'function blackenEdge(t,W,H){');
  const at = kit.only(L, l => l === '        const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT)&&(yy<H||fullB);',
    'the off-canvas test', r);
  kit.replace(L, { start: at, end: at }, [
    '        /* THE BOTTOM OF THE FRAME IS NOT AN EDGE OF THE ART.',
    '',
    '           SUPERSEDES the fourth clause, which was `(yy<H||fullB)` and made',
    '           a trait running off the bottom an outer pixel all the way',
    '           across. Measured on a trait with no black in it: 0 black on the',
    '           bottom row before a save, 244 after, with no outline run at all.',
    '           A hoodie is cut by the frame there, not shaped by it, and a line',
    '           drawn across the cut lands in the middle of a character.',
    '',
    '           The other three are unchanged and the note above is right about',
    '           why: a hat cropped at the top still wants its outline there. An',
    '           edge INSIDE the canvas is untouched, so a trait that ends above',
    '           the bottom still gets outlined underneath. */',
    '        const covered=(xx>=0||fullL)&&(xx<W||fullR)&&(yy>=0||fullT);',
  ]);
  /* fullB is now unread, and a computed value nobody reads is the thing that
     makes the next reader wonder what it was for. */
  const r2 = kit.inFunction(L, 'function blackenEdge(t,W,H){');
  const decl = kit.only(L, l => l === '  let fullT=true, fullB=true, fullL=true, fullR=true;',
    'where the edges are counted', r2);
  kit.replace(L, { start: decl, end: decl }, [
    '  /* fullB is gone with the clause that read it - see the note below. The',
    '     bottom is still SCANNED for nothing, so it is not scanned. */',
    '  let fullT=true, fullL=true, fullR=true;',
  ]);
  const r3 = kit.inFunction(L, 'function blackenEdge(t,W,H){');
  const loop = kit.only(L, l => l === '  for(let x=0;x<W;x++){ if(!m[x]) fullT=false; if(!m[(H-1)*W+x]) fullB=false; }',
    'the top and bottom scan', r3);
  kit.replace(L, { start: loop, end: loop }, [
    '  for(let x=0;x<W;x++){ if(!m[x]) fullT=false; }',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const fn = kit.inFunction(codeLines, 'function blackenEdge(t,W,H){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');

  /* THE ONE CHANGE. Crossing the bottom must never make a pixel outer. */
  if (/\(yy<H\|\|fullB\)/.test(body))
    throw new Error('the bottom of the frame still counts as an edge');
  if (!/const covered=\(xx>=0\|\|fullL\)&&\(xx<W\|\|fullR\)&&\(yy>=0\|\|fullT\);/.test(body))
    throw new Error('the off-canvas test is not the three-sided one');
  /* AND THE OTHER THREE ARE UNTOUCHED, or this quietly turned the rule off. */
  for (const k of ['fullT', 'fullL', 'fullR'])
    if (!new RegExp(k).test(body)) throw new Error(k + ' went with it');
  /* Nothing left computing a value no one reads. */
  if (/fullB/.test(body))
    throw new Error('fullB is still computed and never read');
  /* An edge INSIDE the canvas is still an edge - that is the neighbour test
     below the off-canvas one, and removing it would turn the rule off. */
  if (!/if\(!m\[yy\*W\+xx\]\)\{ empty=true; break; \}/.test(body))
    throw new Error('an interior edge stopped being an edge');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
