/* TWO PEER BUTTONS STACKED INSTEAD OF SHARING A ROW.

   .btn is width:100%, which is right for a button that is the only one in its
   section and wrong the moment there are two: .savebar wraps, so Resize and
   Fit to grid took a line each and the Transform panel grew 44 pixels in a
   side panel this project has already been told is too full.

   Measured in the phone viewport at 375 wide: each button is 355 across and
   "Fit to grid" is eleven characters, so half a row is not tight. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 60) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}

swap('.savebar{display:flex; gap:8px; align-items:center; flex-wrap:wrap;}',
  ['.savebar{display:flex; gap:8px; align-items:center; flex-wrap:wrap;}',
    '/* Buttons that are peers share a row. .btn is width:100% so that a lone',
    '   button fills its section, and inside a row of two that is exactly what',
    '   makes each take a line of its own - which cost the Transform panel 44',
    '   pixels of height for no reading gain. */',
    '.btnrow .btn{flex:1; width:auto;}'].join(NL));

swap('      <div class="savebar">' + NL + '        <button class="btn ghost" id="rsgo">Resize</button>',
  '      <div class="savebar btnrow">' + NL + '        <button class="btn ghost" id="rsgo">Resize</button>');

if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('class="savebar btnrow"').length !== 2)
  throw new Error('the row class is not on exactly one savebar');
/* Every other savebar keeps the stacking behaviour it had. */
const style = text.slice(text.indexOf('<style'), text.indexOf('</style>'));
if (style.indexOf('.btnrow .btn{flex:1; width:auto;}') < 0) throw new Error('the rule did not land');
if (style.indexOf('.btn{width:100%;') < 0) throw new Error('the default width rule went');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
