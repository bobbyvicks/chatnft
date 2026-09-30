/* PREDICTIONS for the home guards no spec held (follow-up X4), written before
   the run.

   Task 11's fix round 4 put a check after each wait before a write or a send
   (s0AtHome, s0SendHome). Its calibration (scratchpad t11/f4/calib-final13.txt)
   removed each and ran stage0moves and stage0gate: 76 survived. These are
   the ones at Clear, the imports, Remove from server, the sort, the layer
   list and the review pass - 38 on followup/integrated - each removed in turn
   (its home call replaced by true, as t11/mutate5.cjs did) and
   tests/stage0homeguards.spec.js run whole. Each test there holds the wait
   one check sits after and moves the page there, so each mutant is predicted
   to redden the test that names its check and nothing else.

   One is predicted to survive, and says why: clearCloudNow's check after
   the post-confirm protocol read. Removing it lets the clear go on to
   relightUnsynced, whose own check stops before any write, and then to the
   check after it, which says the same words - the same clear stopped at
   the same point. It is kept as a mutant so a change to either neighbour
   that makes it matter shows up here as an unpredicted red.

   A GUARD IS FOUND, NOT NUMBERED: by the line that opens its function or
   handler, the guard's text, and which occurrence of that text it is inside
   it. The find is that line with as many lines before it as make it unique
   in the page (printed), and the mutant replaces the one home call in the
   guard line with true. A page change that moves a guard to another function
   or changes its text refuses here, before any run. */
const fs = require('fs');
const path = require('path');
const { runMutants } = require('./mutrun.cjs');

const REPO = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const EOL = PAGE.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const LINES = PAGE.split(/\r?\n/);
const HOME_CALL = /s0(AtHome|SendHome)\(s0Home\)/g;

function guard(sig, text, nth) {
  const starts = LINES.map((l, i) => (l === sig ? i : -1)).filter(i => i >= 0);
  if (starts.length !== 1) throw new Error('"' + sig + '": found ' + starts.length + ' times, need exactly 1');
  let seen = 0, at = -1;
  for (let i = starts[0] + 1; i < LINES.length && !/^\}/.test(LINES[i]); i++) {
    if (LINES[i].indexOf(text) >= 0 && ++seen === nth) { at = i; break; }
  }
  if (at < 0) throw new Error('"' + text + '" #' + nth + ' is not in ' + sig + ' (' + seen + ' found)');
  const calls = LINES[at].match(HOME_CALL) || [];
  if (calls.length !== 1) throw new Error('line ' + (at + 1) + ' has ' + calls.length + ' home calls, need exactly 1');
  let k = at;
  for (;;) {
    const find = LINES.slice(k, at + 1).join('\n');
    if (PAGE.split(find.split('\n').join(EOL)).length === 2) {
      const mutated = LINES.slice(k, at).concat([LINES[at].replace(HOME_CALL, 'true')]).join('\n');
      console.log('  ' + sig.trim() + '  line ' + (at + 1) + ': ' + LINES[at].trim().slice(0, 110));
      return { find, with: mutated };
    }
    if (--k < starts[0]) throw new Error('no unique anchor for line ' + (at + 1));
  }
}

const F = {
  saveLayers: 'async function saveLayers(){',
  retagLayer: 'async function retagLayer(items,from,to,home,s0MarkAt){',
  removeLayer: 'async function s0RemoveLayer(name){',
  renameLayer: 'async function s0RenameLayer(oldName,raw){',
  clear: "$('clearproj').onclick=async()=>{",
  sortApply: 'async function s0SortApply(plan){',
  sortgo: "$('sortgo').onclick=async()=>{",
  reviewQueue: 'async function importReviewQueue(f){',
  revart: "$('revart').onclick=async()=>{",
  revnamed: "$('revnamed').onclick=async()=>{",
  bulkImport: 'async function s0BulkImport(files,opts){',
  carryDecided: 'async function carryDecided(from,toId,home){',
  importProject: 'async function s0ImportProject(file){',
  ruleFile: 'async function importRuleFile(f){',
  cloudCollection: 'async function cloudCollection(u){',
  cloudSweep: 'async function cloudSweep(team,c,keepPaths,home){',
  relight: 'async function relightUnsynced(home){',
  clearNow: 'async function clearCloudNow(gen){',
};
const UNMADE = 'if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return; }';
const PART = 'if(!s0AtHome(s0Home)){ toast(S0_LEFT_PART); return; }';
const LEFT_IMPORT = 'if(!s0AtHome(s0Home)){ s0Left=true; break; }';
const CLEAR = 'if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR); return; }';
const RULE_UNMADE = 'if(!s0AtHome(s0Home)){ note.textContent=S0_LEFT_UNMADE+"."; return; }';
const T = (s) => s;   /* a test title, matched as a substring */

const SITES = [
  /* the layer list */
  ['saveLayers: what the group was sent is kept for the project shown only', F.saveLayers, 'if(s0AtHome(s0Home)) sharedLayerSig', 1, [T('layers: saveLayers, the page moving during its PATCH')]],
  ['retagLayer: no trait moved after the page left', F.retagLayer, 'if(!s0AtHome(s0Home)) break;', 1, [T('layers: retagLayer, the page moving during the first trait')]],
  ['retagLayer: the rules retargeted only at home', F.retagLayer, 'if(s0AtHome(s0Home)) await retargetRules(ruleMoves);', 1, [T('layers: retagLayer, the page moving during the last trait')]],
  ['removeLayer: not made after its read', F.removeLayer, UNMADE, 1, [T('layers: removal, the page moving during its read of the store')]],
  ['removeLayer: the list of the project shown is not changed', F.removeLayer, PART, 1, [T('layers: removal, the page moving during the move of its traits')]],
  ['renameLayer: not made after its read', F.renameLayer, UNMADE, 1, [T('layers: rename, the page moving during its read of the store')]],
  ['renameLayer: the list of the project shown is not changed', F.renameLayer, PART, 1, [T('layers: rename, the page moving during the move of its traits')]],
  /* Clear */
  ['Clear: the settings in memory are the project shown', F.clear, PART, 1, [T('Clear: the page moving during the last settings removal')]],
  /* the sort */
  ['sortApply: no trait moved after the page left', F.sortApply, 'if(!s0AtHome(s0Home)){ failed++; break; }', 1, [T('sort: the page moving during its read of the store')]],
  ['sortApply: the rules retargeted only at home', F.sortApply, 'if(s0AtHome(s0Home)) await retargetRules(', 1, [T('sort: the page moving during a trait')]],
  ['Move them: the paint order only at home', F.sortgo, 'if(s0AtHome(s0Home)) try{ painted=await applyPaintOrder(sortOrder); }', 1, [T('sort: Move them')]],
  /* the review pass */
  ['review queue: a trait stamped only at home', F.reviewQueue, 'if(s0AtHome(s0Home)) try{ await dbPut(', 1, [T('review: loading a queue, the page moving during its read of the store')]],
  ['review queue: the pass is the project shown\'s', F.reviewQueue, 'if(!s0AtHome(s0Home)){ say(S0_LEFT_UNMADE+"."); return false; }', 1, [T('review: loading a queue, the page moving during its last stamp')]],
  ['review queue: its order applied only at home', F.reviewQueue, 'if(s0AtHome(s0Home)) try{ painted=await applyPaintOrder(', 1, [T('review: loading a queue with an order')]],
  ['accept artwork: said when not saved', F.revart, UNMADE, 1, [T('review: accepting the artwork')]],
  ['accept a new name: no rename after the page left', F.revnamed, UNMADE, 1, [T('review: accepting a new name')]],
  ['accept the name: the pass of the project shown is not marked', F.revnamed, UNMADE, 2, [T('review: accepting the name as it is')]],
  /* the imports */
  ['folder import: not made after its protocol read', F.bulkImport, UNMADE, 1, [T('folder import: the page moving during its protocol read')]],
  ['folder import: a reference written only at home', F.bulkImport, LEFT_IMPORT, 1, [T('folder import: a reference')]],
  ['folder import: a trait written only at home', F.bulkImport, LEFT_IMPORT, 2, [T('folder import: a trait, the page moving')]],
  ['folder import: a status move\'s old record removed only at home', F.bulkImport, LEFT_IMPORT, 3, [T('folder import: a file moved to another status, the page moving while its weight is carried')]],
  ['folder import: a rename\'s old record removed only at home', F.bulkImport, LEFT_IMPORT, 4, [T('folder import: a file renamed')]],
  ['folder import: the page leaving is said, and the layers not saved', F.bulkImport, 'if(!s0AtHome(s0Home)) s0Left=true;', 1, [T('folder import: the page moving during its redraw')]],
  ['carryDecided: the carried weight written only at home', F.carryDecided, 'if(!s0AtHome(s0Home)) return false;', 1, [T('folder import: a file moved to another status, the page moving during carryDecided')]],
  ['project import: nothing written after the page left', F.importProject, 'const s0Go=()=>{', 1, [T('project import')]],
  ['rules file: a layer order applied only at home', F.ruleFile, RULE_UNMADE, 1, [T('rules file: a layer order')]],
  ['rules file: its order applied only at home', F.ruleFile, RULE_UNMADE, 2, [T('rules file: rules and an order')]],
  ['rules file: its rules written only at home', F.ruleFile, RULE_UNMADE, 3, [T('rules file: rules, the page moving while the order is applied')]],
  ['rules file: its draw order written only at home', F.ruleFile, 'if(ordered&&s0AtHome(s0Home)) await saveDecideOrder();', 1, [T('rules file: rules with an order')]],
  /* Remove from server */
  ['cloudCollection: no project made after the page left', F.cloudCollection, 'if(!s0SendHome(s0Home)) return null;', 1, [T('Remove from server: the collection lookup of a group with no project')]],
  ['clearCloudNow: stops after the collection lookup', F.clearNow, CLEAR, 1, [T('Remove from server: the page moving during the collection lookup')]],
  ['clearCloudNow: stops after the row count', F.clearNow, CLEAR, 2, [T('Remove from server: another account signed in')]],
  ['clearCloudNow: no repair after the page left', F.clearNow, 'if(!s0AtHome(s0Home)){ say(S0_LEFT_CLEAR); return; }', 1, [T('Remove from server, called with no press')]],
  ['clearCloudNow: stops after the post-confirm read (masked: predicted to survive)', F.clearNow, CLEAR, 3, []],
  ['relightUnsynced: nothing relit after the page left', F.relight, 'if(!s0AtHome(s0Home)) break;', 1, [T('Remove from server: the page moving during the relight\'s read: nothing of team7')]],
  ['clearCloudNow: stops after the relight', F.clearNow, CLEAR, 4, [T('Remove from server: the page moving during the relight\'s read: it stops there')]],
  ['cloudSweep: no picture removed after the page left', F.cloudSweep, 'if(!s0SendHome(s0Home)) return 0;', 1, [T('Remove from server: the page moving during the pictures listing')]],
  ['clearCloudNow: no rows removed after the pictures, once the page left', F.clearNow, 'if(!s0SendHome(s0Home)){ say(S0_LEFT_CLEAR_PART); return; }', 1, [T('Remove from server: the page moving while the pictures are removed')]],
];

console.log('THE SITES');
const mutants = SITES.map(([name, sig, text, nth, kills]) => Object.assign({ name, kills }, guard(sig, text, nth)));
mutants.push({
  name: 'CONTROL: a word nothing here pins',
  find: 'const S0_LEFT_IMPORT="stopped: you left the project first - import the rest there";',
  with: 'const S0_LEFT_IMPORT="stopped: you left the project first - import the rest there ";',
  kills: [],
});
console.log('');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/stage0homeguards.spec.js',
  ntests: 44,
  mutants,
}));
