/* GENERATE SET SAYS HOW MANY CHARACTERS CAME OUT WITH NO TRAIT.

   The sheet preview says "note N came out with nothing but a base", and
   the set that is downloaded and minted - drawn the same way - said
   nothing about it, so a collection could ship with bare bases in it and
   the only screen that knew was the preview. It says it now.

   And both count the same thing: a character with no trait on it. The
   sheet counted one with one item or fewer, which in a project with no
   base is a character with ONE trait, reported as "nothing but a base". */
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

swap('  const empties=combos.filter(c=>c.length<=1).length;', [
  '  const empties=bareCount(combos);',
], 'the sheet count');
swap('function buildCombo(pools){', [
  '/* Characters with no trait on them - a base alone, or nothing. Counted by',
  '   kind, not length: with no base in the project, one item is one trait. */',
  'function bareCount(combos){',
  '  return (combos||[]).filter(c=>!(c||[]).some(x=>x&&x.kind==="trait")).length;',
  '}',
  'function buildCombo(pools){',
], 'buildCombo');
swap('      +"."+short+missed+sizeLine(r.sizes)', [
  '      +"."+short+missed',
  '      /* The sheet has always said this; the set that ships did not. */',
  '      +(bareCount(r.combos) ? " "+bareCount(r.combos)+" of them came out with no trait on them, only the base." : "")',
  '      +sizeLine(r.sizes)',
], 'the set note');

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch580 written');
