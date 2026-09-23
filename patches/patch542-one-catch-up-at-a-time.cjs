/* ONE CATCH-UP AT A TIME.

   Found 2026-09-22 by the discovery pass, ranked fourteenth of 39, measured
   by three probes. A session that opened on your own page leaves
   groupCaughtUp false. Entering a group - the dropdown, an invite, creating
   one - runs wsSwitch, which calls cloudRender, which starts a catch-up
   without awaiting it because groupCaughtUp is false, and then awaits one
   of its own. Two pulls planned from the same empty snapshot and both
   downloaded every picture: 622 storage requests for 311 pictures, 132 MB
   instead of 66, the shelf full at 37 s instead of 21 on a modelled 32 Mbit
   line, and a note saying "150 changed here while loading, kept as changed"
   about changes nobody made (patch526's guard correctly refusing the
   second pull's writes, after it had downloaded them).

   groupCatchUp is single-flight now: a call while one is running for the
   same project joins it rather than starting another. A switch to another
   project in between starts a fresh one, as it must. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
{
  const i = at('async function groupCatchUp(){', 'groupCatchUp');
  kit.replace(L, { start: i, end: i }, [
    '/* ONE AT A TIME, per project. Entering a group from your own page started',
    '   two - cloudRender\'s, unawaited, and wsSwitch\'s own - and both downloaded',
    '   every picture (measured: 622 requests for 311, 132 MB for 66). A call',
    '   while one runs for the same project joins it. */',
    'let catchUpFlight=null, catchUpFlightGen=-1;',
    'async function groupCatchUp(){',
    '  if(catchUpFlight && catchUpFlightGen===wsGen) return catchUpFlight;',
    '  catchUpFlightGen=wsGen;',
    '  const p=groupCatchUpRun();',
    '  catchUpFlight=p;',
    '  try{ return await p; } finally{ if(catchUpFlight===p) catchUpFlight=null; }',
    '}',
    'async function groupCatchUpRun(){',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('async function groupCatchUp(){') !== 1 || times('async function groupCatchUpRun(){') !== 1) throw new Error('the two functions are not there once each');
  if (times('groupCatchUpRun()') !== 2) throw new Error('only the wrapper calls the run'); /* the declaration and the one call */
});

fs.renameSync(TMP, FILE);
console.log('patch542 written, ' + grew + ' bytes');
