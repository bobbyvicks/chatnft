/* THREE THINGS THE DISCOVERY PASS SET ASIDE AS NOT WORTH A PLANNED FIX.

   Found 2026-09-22 and listed under "Dropped, and why", each with a small
   thing still worth doing.

   THE STATUS BUTTON ON A TOUCH SCREEN is 20 px tall on every tile, and a
   miss by 10 px or more opens the editor instead. Chromium's touch
   adjustment covered most misses in the verifier's runs; iOS WebKit was not
   tested. Under (hover:none) it is 30 px now, the size this file already
   gives the remove and fix buttons for a thumb.

   mergeDecisions SAID IT WAS ORDER-INDEPENDENT, and on a tie - same source,
   same millisecond - the later of the two wins. Both verifiers showed no
   user effect, because every caller passes the incoming list second, and
   that is what lets an answer just given here beat one from the same
   millisecond. The comment now says so; the behaviour is kept.

   canvasDataUrl had no caller since the Ask Claude button went (d76de2b). */
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

/* After the button's own rule, not in the (hover:none) block above it: the
   same specificity, so whichever comes later wins, and a font size set
   up there was undone here. */
swap('.item .cyc:hover{border-color:var(--accent); color:var(--ink);}', [
  '.item .cyc:hover{border-color:var(--accent); color:var(--ink);}',
  '/* A thumb\'s size on a touch screen: 20 px, and a miss by 10 or more',
  '   opened the editor instead. 30 px is what .fx and .x get above. */',
  '@media (hover:none){ .item .cyc{min-height:30px; font-size:11px;} }',
], 'the touch rule');
swap('/* Asking Claude what a trait is. The call goes through /api/identify so the', [
  '/* Asking Claude where an added item sits. The call goes through /api/identify so the',
], 'the ask comment');
{
  const i = at('/* Newest answer per pair. Order-independent, so it does not matter which', 'the merge comment');
  if (L[i + 1] !== '   side is called "mine" - which is what makes it safe to run on a pull and') throw new Error('merge comment moved');
  if (L[i + 2] !== '   on a push with the same result. */') throw new Error('merge comment end moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    '/* Newest answer per pair. SUPERSEDES "Order-independent, so it does not',
    '   matter which side is called mine": it is, except on a tie - the same',
    '   source and the same millisecond - where the one later in the list wins.',
    '   Every caller passes the incoming answers second, so an answer just',
    '   given here beats one from the same millisecond, and browsers converge on',
    '   the server\'s copy because shareRules sends DECISIONS whole. The tie is',
    '   kept as it is; only this sentence was wrong. */',
  ]);
}
{
  const i = at("function canvasDataUrl(){ return art.toDataURL('image/png'); }", 'canvasDataUrl');
  kit.replace(L, { start: i, end: i }, []);
}

const grew = kit.save(doc, ({ code }) => {
  if (code.split('canvasDataUrl').length - 1) throw new Error('canvasDataUrl is still referenced');
});

fs.renameSync(TMP, FILE);
console.log('patch568 written, ' + grew + ' bytes');
