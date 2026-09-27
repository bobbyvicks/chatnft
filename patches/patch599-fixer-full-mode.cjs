/* THE FIXER'S FULL MODE, WHICH THE TAB COULD NOT OFFER UNTIL NOW.
   (Supersedes the unapplied draft patch594, whose anchors predate patch596-598.)

   "https://github.com/Retro-Diffusion/pixel-art-fixer.git i want this coded
   into our site". What landed was fast mode only: three cheap detectors, and
   when they disagreed the engine took autocorrelation's guess and labelled it
   low confidence. The arbitration that settles those disagreements - fusion,
   varcontrast, channels, reconsearch - was never ported, and core.detect
   threw by name on mode "full".

   MEASURED BEFORE PORTING: every trait in new-traits through the reference's
   own detect(), both modes, one Python process per image (its k-means uses
   OpenCV's unseeded process-global RNG): 359 measured, 294 the same grid in
   both modes, 65 a different grid - octave errors on 5px backgrounds read as
   2.5px, non-square pixels ("Kik" 4.85 by 16.6) - which full mode settles.

   MEASURED AFTER: the port in scratchpad/pf-port, checked module by module
   against the Python, each checked again by a separate skeptic, then end to
   end: 359 of 359 traits give exactly the reference's answer in BOTH modes
   (275 took full mode's early exit, 84 went through arbitration). Timing in
   node: full 2.5 s a picture on average, 8.1 s when it arbitrates, 11.9 s at
   worst; fast 1.6 s.

   WHY FULL IS THE DEFAULT. It is the reference's answer more often, and it
   costs nothing on the default path: the Pixel size box starts at 16, and a
   size hands the engine forceStep, which skips detection altogether
   (pf-99-api.js, "api.py's force_step branch"). The extra seconds are spent
   only when the box is 0 and the tab's own decision leaves the grid to the
   detectors - which is exactly when being right matters.

   THE PAGE CHANGES WITH IT:
   - the engine text in #pfcore is the new bundle (PF_BUNDLE, refused without
     it, and refused if it still carries the old "not ported" throw);
   - the Mode menu offers full, first and selected;
   - fixSnapping() keyed on mode "fast" - equivalent while fast and scale were
     the only modes, and silently wrong the moment a third arrived: full mode
     would have ignored a ticked switch. It now says what fixersnap.spec.js
     names the rule: off in scale only (and while a size is set, patch596).
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const BUNDLE = process.env.PF_BUNDLE;
if (!BUNDLE || !fs.existsSync(BUNDLE)) throw new Error('PF_BUNDLE must name the built pixelfixer.bundle.js');
const bundle = fs.readFileSync(BUNDLE, 'utf8');
if (bundle.indexOf('</script') >= 0) throw new Error('the bundle contains </script and cannot be inlined as-is');
if (bundle.indexOf('full mode is not ported yet') >= 0) throw new Error('this bundle still refuses full mode - it is the old engine');
if (bundle.indexOf('versionFusion') < 0) throw new Error('this bundle has no fusion module');

let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';
if (text.indexOf(NL) < 0) throw new Error('index.html is not CRLF');
if (text.indexOf('function fixSizeSet(){') < 0) throw new Error('patch596 is not applied');

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 80) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}

/* ---- 1. the engine ------------------------------------------------------ */
const OPEN = '<script id="pfcore" type="text/plain">';
if (text.split(OPEN).length !== 2) throw new Error('the engine tag is missing or duplicated');
const a = text.indexOf(OPEN), b = text.indexOf('</script>', a);
if (b < 0) throw new Error('the engine tag is not closed');
const oldEngine = text.slice(a + OPEN.length, b);
text = text.slice(0, a + OPEN.length) + NL + bundle.replace(/\r?\n/g, NL).replace(/\s+$/, '') + NL + text.slice(b);

/* ---- 2. the menu -------------------------------------------------------- */
swap('<option value="fast">Quick - three detectors</option><option value="scale">Already fixed - scale only</option>',
  '<option selected value="full">Thorough - settles it when they disagree</option><option value="fast">Quick - three detectors</option><option value="scale">Already fixed - scale only</option>');
swap('title="Quick rebuilds the picture at the Pixel size, or looks for the grid itself when the size is 0. Scale only does not look at all - it takes an already-finished piece up to the collection size with its pixels untouched."',
  'title="Both rebuild the picture at the Pixel size, and look for the grid themselves only when the size is 0. Thorough runs all four detectors and settles it when they disagree - slower, and right more often. Quick stops at the three cheap ones and guesses when they disagree. Scale only does not look at all - it takes an already-finished piece up to the collection size with its pixels untouched."');
swap(['/* WHICH OF THE THREE THIS IS. "full" is still unbuilt and the select does',
  '   not offer it; it stays here because the worker takes it and a saved',
  '   settings file may carry it. */'].join(NL),
  ['/* WHICH OF THE THREE THIS IS. "full" is still unbuilt and the select does',
  '   not offer it; it stays here because the worker takes it and a saved',
  '   settings file may carry it.',
  '   SUPERSEDED 2026-09-27 (patch599): full is built, offered, and the default. */'].join(NL));

/* ---- 3. snapping follows the rule its own test states ------------------- */
swap('  return !!(b&&b.checked)&&fixMode()==="fast";\r\n}', [
  '  /* OFF IN SCALE ONLY, which is what fixersnap.spec.js names the rule. This',
  '     read ==="fast", equivalent while fast and scale were the only modes and',
  '     silently wrong the moment a third arrived: full mode would have ignored',
  '     a ticked switch and said nothing. */',
  '  return !!(b&&b.checked)&&fixMode()!=="scale";',
  '}'].join(NL));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
/* The engine parses on its own too - it runs in a Worker, not in the page. */
// eslint-disable-next-line no-new-func
new Function(bundle);
const engine = text.slice(text.indexOf(OPEN) + OPEN.length, text.indexOf('</script>', text.indexOf(OPEN)));
if (engine === oldEngine) throw new Error('the engine did not change');
if (engine.indexOf('full mode is not ported yet') >= 0) throw new Error('the page still carries the refusing engine');
if (code.indexOf('fixMode()==="fast"') >= 0) throw new Error('something still treats fast as the only detecting mode');
const sel = text.slice(text.indexOf('<select id="fixmode"'), text.indexOf('</select>', text.indexOf('<select id="fixmode"')));
for (const v of ['full', 'fast', 'scale']) if (sel.split('value="' + v + '"').length !== 2) throw new Error('the menu does not offer ' + v + ' exactly once');
if (sel.split(' selected ').length !== 2 || sel.indexOf('<option selected value="full"') < 0) throw new Error('full is not the single default');

fs.writeFileSync(FILE, text);
console.log('engine ' + oldEngine.length + ' -> ' + engine.length + ' chars; index.html ' + (text.length - before.length >= 0 ? '+' : '') + (text.length - before.length));
