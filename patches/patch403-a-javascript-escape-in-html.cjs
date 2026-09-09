/* THE SWITCH SAYS "Save at 1280×1280" ON SCREEN.

   patch398 wrote the label as

     <span>Save at 1280×1280</span>

   which is a JavaScript escape sitting in HTML. HTML does not interpret it,
   so the seven characters are shown exactly as typed - the one control this
   whole feature is steered by, with a backslash-u in the middle of it.

   Every other × in that patch is inside a JS string, where the escape is
   correct and does render. This is the only one that crossed into markup.

   FOUND BY LOOKING AT THE PAGE, not by the suite. Eight tests cover what the
   switch DOES - 1280 on, native off, position kept, nearest neighbour, the
   readout, the batch - and not one of them read the words next to it, because
   I wrote them all from the same idea of what mattered. A screenshot found it
   in one glance. The check below is the cheap general form: no JS escape may
   appear in markup anywhere in the file, so the next one fails at the patch
   rather than on the page. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = kit.only(L, l => l === '      <span>Save at 1280\\u00d71280</span></label>', 'the switch label');
kit.replace(L, { start: at, end: at }, [
  '      <span>Save at 1280×1280</span></label>',
]);

const bytes = kit.save(doc, ({ text }) => {
  if (/Save at 1280\\u00d71280/.test(text))
    throw new Error('the label still carries the escape');
  if (text.indexOf('<span>Save at 1280×1280</span>') < 0)
    throw new Error('the label does not say the size');

  /* NO JS ESCAPE MAY SIT IN MARKUP. The body is everything after the last
     </script>, which is where the page's markup lives; a \\u in there is
     always this bug, because nothing parses it. */
  const bodyAt = text.lastIndexOf('</' + 'script>');
  if (bodyAt < 0) throw new Error('the page has no script to end');
  const markup = text.slice(0, text.indexOf('<' + 'script'))
    + text.slice(bodyAt);
  const bad = markup.match(/\\u[0-9a-fA-F]{4}/g);
  if (bad) throw new Error(bad.length + ' javascript escape(s) in markup: ' + bad.join(', '));
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
