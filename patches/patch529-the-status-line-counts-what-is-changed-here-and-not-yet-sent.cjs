/* THE STATUS LINE COUNTS WHAT IS CHANGED HERE AND NOT YET SENT.

   cloudStatus compares the two copies by file path - cloudPath on every
   local record against the paths the server's rows carry - and prints
   "They match." when the sets are equal. cloudstatus.spec.js made that
   sentence true of the files. Since patch525 a record can be changed here
   and unsent while its file is on the server under the same path: a
   reweight or a reorder on a personal page, a weight whose live patch
   failed in a group, or an older failed picture upload that a pull once
   put a path on. For all of those the path is on both sides, the sets are
   equal, and the panel says "They match." while Save to cloud would still
   send something - the one sentence that stops somebody looking, said in
   the one case it should not be.

   The status now counts the records that are unsent and on a server row
   whose path is on the server - the ones the path comparison cannot see -
   and says so: "Files match, but 1 changed here and not yet sent - Save to
   cloud sends it." When files differ as well, the count is folded into
   the sentence that already names the button. Keyed on the synced flag
   alone, not on the word unsent:"meta", because the older failed-picture
   shape is unsent too and Save to cloud sends it too. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };
const fnR = () => kit.inFunction(L, 'async function cloudStatus(u){');

/* ---- 1. the count, beside the two one-sided ones ------------------------ */
swap('  let onlyHere=null, onlyThere=null;', ['  let onlyHere=null, onlyThere=null, unsent=0;'], 'the counters', fnR());
swap('        onlyThere=[...remotePaths].filter(p=>!here.has(p)).length;', [
  '        onlyThere=[...remotePaths].filter(p=>!here.has(p)).length;',
  '        /* CHANGED HERE AND NOT SENT, with its file on the server under the',
  '           same path - the case the two sets cannot see. Since patch525 a',
  '           reweight or a reorder leaves exactly this behind; so does an',
  '           older failed picture upload a pull once put a path on. Keyed on',
  '           the flag, because Save to cloud sends both. */',
  '        unsent=localPaths.filter(i=>!i.synced && i.rowId && remotePaths.has(cloudPath(team,c,i))).length;',
], 'the unsent count', fnR());

/* ---- 2. the sentences say it ---------------------------------------------- */
{
  const fn = fnR();
  const i = at('  let advice;', 'the advice', fn);
  const want = [
    '  let advice;',
    '  if(onlyHere===null||onlyThere===null){',
  ];
  if (L[i + 1] !== want[1]) throw new Error('the advice head moved');
  kit.replace(L, { start: i, end: i }, [
    '  let advice;',
    '  const pend = unsent ? unsent+" changed here and not yet sent" : "";',
    '  const sends = unsent===1 ? "it" : "them";',
  ]);
}
swap('    advice=". They match.";', [
  '    /* "They match" is the sentence that stops somebody looking, so it is',
  '       not said of a copy that still has something to send. */',
  '    advice = unsent ? ". Files match, but "+pend+" - Save to cloud sends "+sends+"." : ". They match.";',
], 'the match sentence', fnR());
swap('    advice=". Save to cloud to upload the "+onlyHere+" that "+(onlyHere===1?"is":"are")+" only here.";', [
  '    advice=". Save to cloud to upload the "+onlyHere+" that "+(onlyHere===1?"is":"are")+" only here"',
  '      +(unsent ? " and send the "+pend : "")+".";',
], 'the only-here sentence', fnR());
swap('    advice=". Load from cloud to fetch the "+onlyThere+" that "+(onlyThere===1?"is":"are")+" only there.";', [
  '    advice=". Load from cloud to fetch the "+onlyThere+" that "+(onlyThere===1?"is":"are")+" only there"',
  '      +(unsent ? "; "+pend+" - Save to cloud sends "+sends : "")+".";',
], 'the only-there sentence', fnR());
swap('    advice=". "+onlyHere+" only here and "+onlyThere+" only there"', [
  '    advice=". "+onlyHere+" only here"+(unsent ? ", "+pend : "")+" and "+onlyThere+" only there"',
], 'the both sentence', fnR());

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('unsent=localPaths.filter(i=>!i.synced && i.rowId && remotePaths.has(cloudPath(team,c,i))).length;');
  once('". Files match, but "+pend+" - Save to cloud sends "+sends+"."');
  once('". They match."');
  once('" and send the "+pend');
  once('"; "+pend+" - Save to cloud sends "+sends');
  once('" only here"+(unsent ? ", "+pend : "")+" and "');
  /* Every branch of the advice reads the count. */
  const a = code.indexOf('async function cloudStatus(u){'), b = code.indexOf('\n}', a);
  if ((code.slice(a, b).match(/\bpend\b/g) || []).length < 5) throw new Error('a branch of the advice does not read the count');
});

fs.renameSync(TMP, FILE);
console.log('patch529 written, ' + grew + ' bytes');
