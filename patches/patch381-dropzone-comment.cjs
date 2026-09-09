/* A THIRD SENTENCE OF MINE THAT DOES NOT REPRODUCE.

   Over #fixdrop I wrote that the dropzone "hung 36px past the right edge of the
   screen, and was the only horizontal overflow on the site at 375px". I took
   that from a finding rather than from a measurement, and when the test written
   to guard it passed on the page that had the defect, I measured instead.

   At 375x812 on the page before the fix: #fixdrop ran left 34 to right 379 in a
   379px viewport - it stopped exactly at the edge, not past it - inside a
   .panelbox running 15 to 360. So it overflowed its PANEL by about 19px on each
   side, which is why its dashed border was cut off, and it did not overflow the
   screen. body carries overflow-x:hidden, so a child wider than the viewport is
   clipped rather than scrolled to, and the page never scrolls sideways.

   The fix was right and is unchanged. The reason given for it was borrowed and
   overstated, which is worth more care than a fix that happens to work: the
   next person to read this would have gone looking for a horizontal scrollbar
   that was never there. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '/* .drop is 92vw, which is right on the home page where it is a centred child',
    'the dropzone comment');
  if (L[at + 3] !== '   only horizontal overflow on the site at 375px. */')
    throw new Error('the dropzone comment is not the four lines this expects');
  kit.replace(L, { start: at, end: at + 3 }, [
    '/* .drop is 92vw, which is right on the home page where it is a centred child',
    '   of .land and wrong inside a panel that is itself 92vw and padded: measured',
    '   at 375x812, the Fix pixels dropzone ran 34..379 inside a panel running',
    '   15..360, so about 19px of it hung past the panel on each side and its',
    '   dashed border was cut off.',
    '',
    '   SUPERSEDES "hung 36px past the right edge of the screen, and was the only',
    '   horizontal overflow on the site at 375px", which I took from a finding and',
    '   did not check. It stopped exactly AT the viewport edge, not past it, and',
    '   body carries overflow-x:hidden so nothing here scrolls the page sideways',
    '   in any case. The overflow was of the panel, not the screen. */',
  ]);
}

const bytes = kit.save(doc, ({ text }) => {
  const flat = text.replace(/\s+/g, ' ');
  const s = 'hung 36px past the right edge of the screen';
  const total = flat.split(s).length - 1;
  const quoted = flat.split('SUPERSEDES "' + s).length - 1;
  if (!total) throw new Error('the retracted sentence is gone entirely, so nothing records it was wrong');
  if (total !== quoted) throw new Error((total - quoted) + ' unretracted copy of it remains');
  if (flat.indexOf('measured at 375x812, the Fix pixels dropzone ran 34..379') < 0)
    throw new Error('the replacement does not give the measurement it rests on');
  if (text.indexOf('#fixdrop{width:100%;}') < 0)
    throw new Error('the fix itself was removed');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
