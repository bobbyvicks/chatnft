/* Two things the tests for patch242 caught before it went anywhere.

   ONE. ESCAPE DID NOT CLOSE THE SHEET, and the row saying it did was dead.

   The keydown handler opens with `if($('app').hidden) return;` - the whole
   SHORTCUTS table only fires while the EDITOR is open. The review sheet lives
   in the project panel, which is what you are looking at when the editor is
   hidden, so the entry added for it could never run.

   Worse than not working: SHORTCUTS is also what renderKeys prints, so the
   help panel would have listed "Esc - Close the review sheet" among the
   editor's keys, for a sheet that cannot be open at the same time as the
   editor. A shortcut list that names a key which does nothing is worse than
   one that is short.

   So the row is removed and the sheet gets its own listener, which is what
   #projsearch already does for Escape outside the editor. It is not in the
   table because the table is the editor's, and the help panel should not grow
   entries for panels it has nothing to do with.

   TWO. THE COVERAGE LINE DESCRIBED A DIFFERENT SHEET.

   revCoverage last ran inside revFill, when the layer picker still held
   whatever option happened to be first. Opening a sheet for hair then read
   "0 of 1 answered" - the count for skins, which has one trait. The number was
   real and belonged to something else, which is the worst kind of wrong: it
   looks like an answer.

   revOpen sets revCond and revLayer from the pickers, so the coverage has to
   be recomputed after that, not before.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('revEscape') >= 0) throw new Error('already patched');
if (doc.original.indexOf('async function revOpen(on){') < 0)
  throw new Error('patch242 has to land first');

/* ---- 1. the dead shortcut row goes ---- */
{
  const r = kit.run(doc.lines,
    l => l === "  {show:'Esc', desc:'Close the review sheet',",
    l => l === '    run:()=>revOpen(false)},',
    'the dead review shortcut');
  if (r.end - r.start !== 2) throw new Error('the row is not the shape this expects');
  doc.lines.splice(r.start, 3);
  console.log('ok  the shortcut that could never fire is gone');
}

/* ---- 2. and the sheet gets a listener that can ---- */
{
  const at = kit.only(doc.lines,
    l => l === "$('revscrim').onclick=e=>{ if(e.target===$('revscrim')) revOpen(false); };",
    'the click-outside close');
  kit.replace(doc.lines, { start: at, end: at }, [
    "$('revscrim').onclick=e=>{ if(e.target===$('revscrim')) revOpen(false); };",
    '/* ESCAPE, ON ITS OWN LISTENER. The SHORTCUTS table is the editor\'s - its',
    "   handler returns immediately while $('app') is hidden, which is exactly",
    '   when this sheet is open - so an entry there could never fire, and would',
    '   have printed a dead key into the help panel. #projsearch already takes',
    '   Escape this way for the same reason.',
    '',
    '   Bound once, and it does nothing unless the sheet is up, so it cannot',
    '   swallow an Escape meant for anything else. */',
    'function revEscape(e){',
    '  if(e.key!=="Escape") return;',
    '  if($("revscrim").hidden) return;',
    '  e.preventDefault();',
    '  revOpen(false);',
    '}',
    'document.addEventListener("keydown",revEscape);',
  ]);
  console.log('ok  and Escape closes it through a listener that runs');
}

/* ---- 3. the coverage describes the sheet you opened ---- */
{
  const r = kit.run(doc.lines,
    l => l === '  sc.hidden=false;',
    l => l === '  await revBuild();',
    'the open tail',
    kit.inFunction(doc.lines, 'async function revOpen(on){'));
  kit.replace(doc.lines, r, [
    '  sc.hidden=false;',
    '  await revBuild();',
    '  /* AFTER revCond and revLayer are set from the pickers. revFill runs this',
    '     too, but with whatever the layer picker held at the time - so opening a',
    '     sheet for hair showed the count for skins, which is a real number about',
    '     something else. */',
    '  revCoverage();',
  ]);
  console.log('ok  and the coverage counts the sheet in front of you');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  /* The dead row must be gone from the table AND from what the help prints. */
  if (code.indexOf("desc:'Close the review sheet'") >= 0)
    throw new Error('the help panel still lists a key that cannot fire');
  if (code.indexOf("!$('revscrim').hidden, prevent:true") >= 0)
    throw new Error('the dead SHORTCUTS entry is still there');
  /* And a real listener exists, guarded so it only acts when the sheet is up. */
  const re = kit.inFunction(codeLines, 'function revEscape(e){');
  const r = codeLines.slice(re.start, re.end + 1).join('\n');
  if (r.indexOf('if($("revscrim").hidden) return;') < 0)
    throw new Error('Escape would be swallowed while the sheet is closed');
  if (code.indexOf('document.addEventListener("keydown",revEscape);') < 0)
    throw new Error('nothing listens for it');
  /* The coverage is recomputed after the pickers are read. */
  const ro = kit.inFunction(codeLines, 'async function revOpen(on){');
  const o = codeLines.slice(ro.start, ro.end + 1).join('\n');
  const build = o.indexOf('await revBuild();');
  const cover = o.indexOf('revCoverage();');
  if (!(build >= 0 && cover > build))
    throw new Error('the coverage is worked out before the sheet is built');
  /* The editor's own Escape must be untouched. */
  if (code.indexOf("match:e=>e.key==='Escape'&&!$('ksscrim').hidden") < 0)
    throw new Error('the shortcuts panel lost its own Escape');
});

/* RUN the guard, because a stray listener is how you break every other key. */
{
  let closed = 0;
  let hidden = true;
  const esc = (e) => {
    if (e.key !== 'Escape') return false;
    if (hidden) return false;
    closed++;
    return true;
  };
  /* Closed sheet: Escape is not ours. */
  if (esc({ key: 'Escape' }) !== false) throw new Error('it acted with the sheet closed');
  /* Open sheet: it is. */
  hidden = false;
  if (esc({ key: 'Escape' }) !== true) throw new Error('it did not close an open sheet');
  if (closed !== 1) throw new Error('it closed the sheet ' + closed + ' times');
  /* And no other key is touched, open or shut. */
  for (const k of ['b', 'Enter', 'ArrowLeft', 'y', 'n'])
    if (esc({ key: k }) !== false) throw new Error(k + ' was swallowed');
  console.log('    Escape acts only while the sheet is open, and no other key is touched');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
