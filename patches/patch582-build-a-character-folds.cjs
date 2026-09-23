/* BUILD A CHARACTER FOLDS, SO THE TRAITS ARE ON THE FIRST SCREEN.

   The project page opens on "Build a character", first by request (a shelf
   of a few hundred tiles above it meant scrolling past all of them to
   reach it), with a preview 900 px wide by request. Together that made the
   first screen the preview and nothing else, with the traits - the thing
   the page is for - starting about 1,700 px down.

   Both requests stand. The panel stays first and the preview keeps its
   size; the panel folds now, as Your project already does, to its heading
   and its buttons. It starts folded, and remembers the choice. Randomize
   and Sheet of 12 open it, since what they make is only visible there,
   without changing what is remembered. Generate set and Download work
   folded - their note sits outside the fold.

   And the Final review box above the shelf is as wide as the sections
   around it: it was the one project-page section left at the default. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

swap('      <h2>Build a character</h2>', [
  '      <h2><button class="projfold" id="composefold" type="button" aria-controls="composebody"',
  '        aria-expanded="false" title="Show the preview">Build a character<span class="fold" aria-hidden="true">▾</span></button></h2>',
], 'the heading');
swap('    <div class="cwrap">', ['    <div class="cwrap" id="composebody">'], 'the preview');
swap('#proj.folded .projfold .fold{transform:rotate(-90deg);}', [
  '#proj.folded .projfold .fold{transform:rotate(-90deg);}',
  '#compose.folded .projfold .fold{transform:rotate(-90deg);}',
  '/* The preview and the dropdowns; the buttons and the note stay. */',
  '#compose.folded .cwrap{display:none;}',
], 'the fold style');
swap('#proj,#compose,#layers{width:min(1180px,92vw);}', [
  '#proj,#compose,#layers,#review{width:min(1180px,92vw);}',
], 'the width rule');

{
  const i = at('const PLAN_KEY="chatnft.planfold";', 'after the project fold');
  kit.replace(L, { start: i, end: i }, [
    '/* THE SAME FOLD, FOR BUILD A CHARACTER. First on the page by request, with a',
    '   preview 900 px wide by request, it was the whole first screen and the',
    '   traits began about 1,700 px down. Folded it is a heading and a row of',
    '   buttons. It starts folded - no stored choice means folded - and keeps',
    '   whichever the person picks. */',
    'const COMPOSE_KEY="chatnft.composefold";',
    'function composeFold(on,remember){',
    '  const sec=$("compose"), h=$("composefold");',
    '  if(!sec) return;',
    '  sec.classList.toggle("folded",!!on);',
    '  if(h){',
    '    h.setAttribute("aria-expanded", on?"false":"true");',
    '    h.title = on ? "Show the preview" : "Hide the preview";',
    '  }',
    '  if(remember!==false){ try{ localStorage.setItem(COMPOSE_KEY, on?"1":"0"); }catch(_){} }',
    '}',
    '(function(){',
    '  const h=$("composefold"); if(!h) return;',
    '  h.onclick=()=>composeFold(!$("compose").classList.contains("folded"));',
    '  let open=false; try{ open=localStorage.getItem(COMPOSE_KEY)==="0"; }catch(_){}',
    '  composeFold(!open,false);',
    '})();',
    'const PLAN_KEY="chatnft.planfold";',
  ]);
}
/* What these two make is only visible unfolded. Opened for it, and not
   remembered: pressing Randomize is not choosing how the page opens. */
swap("$('crand').onclick=composeRandom;", [
  "$('crand').onclick=()=>{ composeFold(false,false); return composeRandom(); };",
], 'Randomize');
swap("$('csheet').onclick=()=>drawSheet(12);", [
  "$('csheet').onclick=()=>{ composeFold(false,false); return drawSheet(12); };",
], 'Sheet of 12');

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch582 written');
