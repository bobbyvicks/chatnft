/* THE SWITCH GOVERNED THE DOWNLOAD AND NOT THE EDITOR.

   "wait so i just spent a very long time editng a trait onn the site and when
   i go to save to grid its still saving small asf instead of 1280 like i
   specifically asked (in the fixer editor)"

   fixOpen read FIX.out and started the editor at r.width - the fixer's own
   output, 160 or 105 across - and never looked at #fixgrid at all. So "Save
   at 1280x1280" decided what the Download button wrote and what a batch wrote,
   and had nothing to do with what Open in the editor handed you. You get a
   160px canvas, you work on it, and every save from there is 160px, because
   saveTrait and download both write art.width and art.width is 160.

   That is the whole defect, and it cost somebody an evening of editing.

   The fix is that Open in the editor goes through the same canvas the save
   goes through. One switch, one answer, for all three ways out - which is
   what the switch was described as doing when it was built: "a switch both
   the single save and the batch read, so there is one answer to what a save
   is". The editor was the third way out and was never wired to it.

   THE TILES WERE ALREADY RIGHT, which is worth saying because it is why this
   went unnoticed. Clicking a result tile decodes the SAVED bytes, so it opens
   at 1280 already; only the single-image Open in the editor button was reading
   the raw result. Two doors to the same place, one of them wrong.

   WHAT THIS DOES NOT DO is change what a save means. It changes the canvas you
   are handed, and the save keeps writing exactly what is on it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const r = kit.inFunction(L, 'function fixOpen(){');
  const at = kit.only(L, l => l === '  const d=new Uint8ClampedArray(r.data);', 'where the editor is handed pixels', r);
  if (L[at + 2].indexOf('startEditor(d,r.width,r.height,r.width,r.height,') < 0)
    throw new Error('fixOpen does not start the editor where this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '  /* THROUGH THE SAVE CANVAS, not the raw result. The switch says what a',
    '     save is, and the editor is the third way out - it used to be handed',
    '     the fixer\'s own 160px answer while the Download button wrote 1280, so',
    '     an evening of editing saved at 160. See patch410. */',
    '  const c=fixGridCanvas(r);',
    '  const W=c.width, H=c.height;',
    '  const d=new Uint8ClampedArray(c.getContext("2d",{willReadFrequently:true})',
    '    .getImageData(0,0,W,H).data);',
    '  /* Released before the editor takes over: at 1280 this is 6.5 MB and the',
    '     bytes have already been copied out of it. */',
    '  c.width=1; c.height=1;',
    '  fileName=FIX.name+"-fixed.png";',
    '  startEditor(d,W,H,W,H,palette(d,W*H,24,64),false);',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const fn = kit.inFunction(codeLines, 'function fixOpen(){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');

  /* THE ONE THING. The editor must be sized by the save canvas, not by the
     raw result - otherwise the switch means something different depending on
     which button you press. */
  if (!/const c=fixGridCanvas\(r\);/.test(body))
    throw new Error('open in the editor still ignores the save switch');
  if (/startEditor\(d,r\.width,r\.height/.test(body))
    throw new Error('the editor is still sized by the raw result');
  if (!/startEditor\(d,W,H,W,H,/.test(body))
    throw new Error('the editor is not sized by the save canvas');
  /* And the 6.5 MB canvas is let go rather than left to the collector. */
  if (!/c\.width=1; c\.height=1;/.test(body))
    throw new Error('the save canvas is not released');
  /* ONE NAME, ONE START. A leftover line would set the name twice or open
     twice, which is the shape a bad range edit leaves behind. */
  if ((body.match(/startEditor\(/g) || []).length !== 1)
    throw new Error('fixOpen starts the editor more than once');
  if ((body.match(/fileName=/g) || []).length !== 1)
    throw new Error('fixOpen sets the file name more than once');

  /* THE OTHER DOOR WAS ALREADY RIGHT and must stay that way: a tile decodes
     the saved bytes, which are already at the switch's size. */
  const one = kit.inFunction(codeLines, 'async function fixOpenOne(f){');
  if (!/createImageBitmap\(new Blob\(\[f\.data\]/
    .test(codeLines.slice(one.start, one.end + 1).join('\n')))
    throw new Error('the tile stopped opening the saved bytes');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
