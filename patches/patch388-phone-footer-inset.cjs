/* THE PHONE BLOCK GIVES THE FOOTER ITS OWN PADDING, AND UNDID THE INSET.

   patch385 paid the safe-area insets on `footer{grid-area:foot; ...}`. At 820px
   and under a later rule restates the whole padding shorthand - `footer{gap:11px;
   padding:7px 14px; flex-wrap:wrap;}` - which wins, so on the one class of
   device that HAS a home indicator the footer went back to clearing nothing.

   Caught by the test rather than by reading, which is the point of testing a
   media query at the width it applies to: the base rule was correct and the
   page was not.

   The same trap the file already records twice about this block - "THE PAIR HAS
   TO MATCH THE SAME ELEMENTS" over the density restore. A shorthand that
   restates a property loses everything the longhand behind it was carrying. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '  footer{gap:11px; padding:7px 14px; flex-wrap:wrap;} .hint{display:none;}',
    'the phone footer');
  kit.replace(L, { start: at, end: at }, [
    '  /* THE SHORTHAND HERE OUTRANKS THE INSET ON THE BASE RULE, so it has to',
    '     carry it too - this is the only breakpoint where a home indicator',
    '     exists, which made it the one place the inset had to survive and the',
    '     one place it did not. */',
    '  footer{gap:11px; flex-wrap:wrap;',
    '    padding:7px calc(14px + var(--sar)) calc(7px + var(--sab)) calc(14px + var(--sal));}',
    '  .hint{display:none;}',
  ]);
}

const bytes = kit.save(doc, ({ lines }) => {
  const i = lines.findIndex(l => l.indexOf('  footer{gap:11px; flex-wrap:wrap;') === 0);
  if (i < 0) throw new Error('the phone footer rule is gone');
  if (lines[i + 1].indexOf('var(--sab)') < 0)
    throw new Error('the phone footer still clears nothing at the bottom');
  /* And nothing else in that block restates a padding over an inset. Stated as
     a sweep rather than about the one that was found, because the next one
     would be just as silent. */
  const open = lines.findIndex(l => l === '@media (max-width:820px){');
  let depth = 0, close = -1;
  for (let k = open; k < lines.length; k++) {
    for (const ch of lines[k]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { close = k; break; }
  }
  const inside = lines.slice(open, close + 1);
  const edgy = ['footer{', 'header{', '.acct{', '.toast{', '.shelfdestinations{', '.scrim{'];
  for (let k = 0; k < inside.length; k++) {
    const l = inside[k];
    if (!edgy.some(s => l.trim().indexOf(s) === 0)) continue;
    const rule = inside.slice(k, k + 3).join('\n');
    const end = rule.indexOf('}');
    const head = rule.slice(0, end < 0 ? rule.length : end);
    if (/padding:/.test(head) && !/var\(--sa/.test(head))
      throw new Error('a phone rule restates padding over an inset: ' + l.trim().slice(0, 60));
  }
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
