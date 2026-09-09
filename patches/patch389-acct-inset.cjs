/* AND THE ACCOUNT BUTTON, WHICH A NARROWER BLOCK MOVES BACK TO THE CORNER.

   patch385 paid the insets on `.acct{position:fixed; top:...; right:...}`. A
   rule at 620px and under restates both - `.acct{top:10px; right:10px;
   width:36px; height:36px;}` - so on a phone, which is the only device with a
   notch, the button went back to sitting under it. Exactly the shape of the
   footer defect patch388 fixed, in a different block, found by the same test
   run rather than by looking.

   Worth saying once rather than three times: this file has four media blocks
   that restate position or padding on elements the insets are for, and paying
   an inset on a base rule is not enough for any of them. The check below sweeps
   all four rather than naming this one. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '  .acct{top:10px; right:10px; width:36px; height:36px;}',
    'the phone account button');
  kit.replace(L, { start: at, end: at }, [
    '  /* Restating top and right here drops the insets the base rule pays, and',
    '     this is the width where a notch exists. */',
    '  .acct{top:calc(10px + var(--sat)); right:calc(10px + var(--sar));',
    '    width:36px; height:36px;}',
  ]);
}

/* AND THE PANEL IT OPENS, found by the sweep below rather than by looking -
   which is the whole reason the check enumerates the block instead of naming
   the rule that was reported. */
{
  const at = kit.only(L, l => l === '  .acctpanel{top:52px; right:8px; left:8px; width:auto;}',
    'the phone account panel');
  kit.replace(L, { start: at, end: at }, [
    '  .acctpanel{top:calc(52px + var(--sat)); right:calc(8px + var(--sar));',
    '    left:calc(8px + var(--sal)); width:auto;}',
  ]);
}

const bytes = kit.save(doc, ({ lines }) => {
  /* EVERY media block, every rule that puts something against an edge. Named
     by property rather than by selector, so a rule added later is covered. */
  const EDGE = ['.acct', '.acctpanel', 'footer', 'header', '.toast',
    '.shelfdestinations', '.scrim'];
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('@media') !== 0) continue;
    let depth = 0, close = -1;
    for (let k = i; k < lines.length; k++) {
      for (const ch of lines[k]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (depth === 0) { close = k; break; }
    }
    if (close < 0) continue;
    for (let k = i; k <= close; k++) {
      const t = lines[k].trim();
      if (!EDGE.some(s => t.indexOf(s + '{') === 0)) continue;
      const rule = lines.slice(k, k + 3).join('\n');
      const end = rule.indexOf('}');
      const head = rule.slice(0, end < 0 ? rule.length : end);
      /* Only the properties that decide whether it clears the hardware. */
      if (!/(^|[;{\s])(top|right|bottom|left|padding)\s*:/.test(head)) continue;
      if (!/var\(--sa/.test(head)) bad.push('line ' + (k + 1) + ': ' + t.slice(0, 62));
    }
    i = close;
  }
  if (bad.length)
    throw new Error('a media block puts something against an edge without an inset:\n  '
      + bad.join('\n  '));
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
