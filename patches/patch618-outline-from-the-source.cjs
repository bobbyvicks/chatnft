/* patch618: THE OUTLINE PASS READS THE SOURCE: A SKIN'S THICK OUTLINE STAYS
   THICK AT SIZE 8, AND A THIN DRAWN OUTLINE THE VOTE BROKE IS STILL CLEANED.

   The all-traits audit (scratchpad/fix8/audit/REPORT.txt) found two faults in
   the outline pass (fixOutlineOnce), both because it judged the outline from
   the cells after the vote instead of from the picture:
   - at size 8 it thinned every skin's 16 px outline (2 cells) to 1 cell (31
     skins); the owner chose "Keep the source's thick outline";
   - its gate skipped shapes whose thin outline the vote had already broken
     (7 clothing traits: Coinbase Blue Jacket, Cyan Battle Axe, Hyperliquid
     Polo...), so their outline was left in dots.
   The pass now takes the picture the engine was given (fixOutlineSource) and
   [S1] still works on a shape the cell gate skipped when 80%+ of its source
   edge is a DRAWN dark line (mean width 2 px or more; 1 px traced hairlines
   are left as today) - ring only, nothing peeled; [S2] at Pixel size 8 only,
   keeps the outline as many cells thick as the source draws it (a falling
   black share marks the line's inner edge; a rising one, like a lens ring
   behind the outline, does not count). Without the picture it is the pass
   it was, byte for byte (424/424 runs). Built and verified in scratchpad/
   fix8/round3..round4/outline; the text is patches/assets/patch618-outline.js.

   The readouts say what happened: "outline made one cell thick" or "outline
   kept N cells thick, as drawn"; the switch is "Clean black outline".

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const fs = require('fs'), path = require('path');
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;
const PASTE = fs.readFileSync(path.join(__dirname, 'assets', 'patch618-outline.js'), 'utf8').replace(/\r\n/g, '\n').split('\n');
const at = (re, from) => { for (let i = from || 0; i < PASTE.length; i++) if (re.test(PASTE[i])) return i; throw new Error('paste: no ' + re); };
const closeAfter = i => { for (let k = i; k < PASTE.length; k++) if (PASTE[k] === '}') return k; throw new Error('paste: unterminated at ' + i); };
const p1 = at(/^\/\* fixOutlineOnce\(cells, opts\)/), p1e = closeAfter(at(/^function fixOutlineSource\(/));
const p2 = at(/^\/\* THE OUTLINE PASS, on the cell grid/), p2e = closeAfter(at(/^function fixOutlineBatchSaid\(/));
const PART1 = PASTE.slice(p1, p1e + 1).join(NL), PART2 = PASTE.slice(p2, p2e + 1).join(NL);

const page = fs.readFileSync(s0.FILE, 'utf8');
if (page.indexOf('function fixOutlineSource(') >= 0) throw new Error('patch618 is already applied');
const doc = s0.start([['function fixOutlineOnce(c, opts) {', 'fixOutlineOnce is not in this page']]);
const region = (startText, endFrom) => {
  const a = page.indexOf(startText); if (a < 0 || page.indexOf(startText, a + 1) >= 0) throw new Error('expected one ' + startText.slice(0, 50));
  const f = page.indexOf(endFrom, a); if (f < 0) throw new Error('no ' + endFrom);
  const e = page.indexOf(NL + '}' + NL, f); return page.slice(a, e + NL.length + 1);
};
/* 1. the comment, OUTLINE_SKIP_LAYERS, fixOutlineOnce -> the new ones and fixOutlineSource */
doc.swap(region('/* fixOutlineOnce(cells, opts) - "peel and retrace"', 'function fixOutlineOnce(c, opts) {'), PART1);
/* 2. the page block: counters, fixOutlineWanted, fixOutlineApply -> the new one, fixOutlineSaid, fixOutlineBatchSaid */
doc.swap(region('/* THE OUTLINE PASS, on the cell grid, after the palette.', 'function fixOutlineApply(out,rel){'), PART2);
/* 3. the callers hand over the picture the engine was given */
doc.swap('        const oln=fixOutlineApply(r,FIX.rel);', '        const oln=fixOutlineApply(r,FIX.rel,src);');
doc.swap('      fixOutlineApply(out,rel);', '      fixOutlineApply(out,rel,{data:px,width:sw,height:sh});');
/* 4. the readouts */
doc.swap('          +(oln&&oln.cells ? " \\u00b7 outline made one cell thick ("+oln.cells.toLocaleString()+" cell"+(oln.cells===1?"":"s")+" changed)" : "")',
  '          +fixOutlineSaid(oln)');
doc.swap('  fixOutlined=0; fixOutlineCells=0;' + NL, '  fixOutlined=0; fixOutlineCells=0; fixOutlinedThick=0;' + NL);
doc.swap('+(fixOutlined?" \\u00b7 "+fixOutlined+" outline"+(fixOutlined===1?"":"s")+" made one cell thick":"")', '+fixOutlineBatchSaid()');
/* 5. the switch's words */
doc.swap('title="Make the black outline exactly one cell thick: close its gaps, thin the doubled parts back to the fill, keep every spike and the line art inside. Only on shapes that are drawn with a black outline; backgrounds, chains, eyes, mouths and ears are left alone.">',
  'title="Clean up the black outline: close its gaps, thin the doubled parts back to the fill, keep every spike and the line art inside. One cell thick; at Pixel size 8 a line the picture draws thicker keeps its thickness (a 16 px line stays 2 cells). Only on shapes that are drawn with a black outline; backgrounds, chains, eyes, mouths and ears are left alone.">');
doc.swap('      <span>One-cell black outline</span></label>', '      <span>Clean black outline</span></label>');

doc.finish(({ code, must }) => {
  must('function fixOutlineSource(pic, W, H) {', 'fixOutlineSource');
  must('function fixOutlineApply(out,rel,srcPic){', 'fixOutlineApply takes the picture');
  must('const oln=fixOutlineApply(r,FIX.rel,src);', 'the single run passes the picture');
  must('fixOutlineApply(out,rel,{data:px,width:sw,height:sh});', 'the folder run passes the picture');
  must('+fixOutlineSaid(oln)', 'the single readout');
  must('+fixOutlineBatchSaid()', 'the folder readout');
  if (code.indexOf('made one cell thick ("+oln.cells') >= 0) throw new Error('the old readout is still there');
});
