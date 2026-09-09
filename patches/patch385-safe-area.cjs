/* THE PAGE ASKED TO GO UNDER THE NOTCH AND THEN NEVER PAID FOR IT.

   The viewport meta says viewport-fit=cover, which tells the browser to extend
   the layout viewport under the notch, the rounded corners and the home
   indicator - and hands the page four env(safe-area-inset-*) values to keep its
   own content clear of them. A grep for env( and for safe-area across all
   30,000 lines returns nothing, so the page took the space and paid none of it.

   IT IS QUIET IN PORTRAIT WITH SAFARI'S CHROME UP, which is why it has not been
   noticed: the browser's own bars absorb most of it. It stops being quiet when
   the toolbar collapses on scroll, when the site is added to the home screen -
   which is exactly what somebody working on their phone every day ends up doing
   - and in landscape, where a notched iPhone reports 44 pixels of left and
   right inset unconditionally. Then the close button, the account button, the
   zoom controls in the footer and the move bar at the bottom of the shelf are
   under the hardware.

   PAID, NOT GIVEN BACK. Deleting viewport-fit=cover would also fix it and would
   throw away the edge-to-edge layout the meta was added for. Every edge-hugging
   rule adds the inset it needs instead.

   THROUGH FOUR VARIABLES, for two reasons. Eleven rules need these and reading
   env() in each is eleven places to get a fallback wrong. And env() cannot be
   set from a test - a variable can, so tests/mobile.spec.js can give the page a
   34-pixel bottom inset and check the footer actually moves, which is the only
   way to know this works without a notched phone in the room. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the four numbers, once ------------------------------------- */
{
  const at = kit.only(L, l => l === ':root{', 'the root block');
  kit.replace(L, { start: at, end: at }, [
    ':root{',
    '  /* WHAT THE HARDWARE IS COVERING. The viewport meta opts into drawing',
    '     under the notch, the corners and the home indicator, so the page owes',
    '     itself these four numbers - and owed them from the day that meta was',
    '     written, because nothing in the file read one until now.',
    '',
    '     Named rather than read at each site: eleven rules want them, and a',
    '     variable can be set by a test where env() cannot, which is how the',
    '     phone tests check this without a notched phone. */',
    '  --sat: env(safe-area-inset-top, 0px);',
    '  --sar: env(safe-area-inset-right, 0px);',
    '  --sab: env(safe-area-inset-bottom, 0px);',
    '  --sal: env(safe-area-inset-left, 0px);',
  ]);
}

/* ---- and the rules that sit against an edge --------------------- */
const swaps = [
  ['.acct{position:fixed; top:14px; right:16px; z-index:15; width:40px; height:40px;',
    '.acct{position:fixed; top:calc(14px + var(--sat)); right:calc(16px + var(--sar));'
    + ' z-index:15; width:40px; height:40px;'],
  ['.acctpanel{position:fixed; top:62px; right:16px; z-index:15; width:min(430px,92vw);}',
    '.acctpanel{position:fixed; top:calc(62px + var(--sat)); right:calc(16px + var(--sar));'
    + ' z-index:15; width:min(430px,92vw);}'],
  ['.shelfdestinations{position:fixed; left:50%; bottom:20px; z-index:40; transform:translateX(-50%);',
    '.shelfdestinations{position:fixed; left:50%; bottom:calc(20px + var(--sab)); z-index:40;'
    + ' transform:translateX(-50%);'],
  ['  padding:20px; z-index:20; backdrop-filter:blur(3px);}',
    '  padding:calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab))'
    + ' calc(20px + var(--sal)); z-index:20; backdrop-filter:blur(3px);}'],
  ['  padding:5px 16px; border-bottom:1px solid var(--line); background:var(--panel);}',
    '  padding:calc(5px + var(--sat)) calc(16px + var(--sar)) 5px calc(16px + var(--sal));'
    + ' border-bottom:1px solid var(--line); background:var(--panel);}'],
  ['footer{grid-area:foot; display:flex; align-items:center; gap:15px; padding:4px 16px;',
    'footer{grid-area:foot; display:flex; align-items:center; gap:15px;'
    + ' padding:4px calc(16px + var(--sar)) calc(4px + var(--sab)) calc(16px + var(--sal));'],
  ['.toast{position:fixed; left:50%; bottom:64px; transform:translateX(-50%) translateY(8px);',
    '.toast{position:fixed; left:50%; bottom:calc(64px + var(--sab));'
    + ' transform:translateX(-50%) translateY(8px);'],
  ['  header{position:relative; padding-right:52px;}',
    '  /* The close button sits in this padding, and in landscape the inset sits'
    + ' under it. */',
    '  header{position:relative; padding-right:calc(52px + var(--sar));}'],
  ['    padding:8px 10px; border-right:none; border-bottom:1px solid var(--line);}',
    '    padding:8px calc(10px + var(--sar)) 8px calc(10px + var(--sal));'
    + ' border-right:none; border-bottom:1px solid var(--line);}'],
];
for (const [from, ...to] of swaps) {
  const at = kit.only(L, l => l === from, 'the rule "' + from.trim().slice(0, 44) + '"');
  kit.replace(L, { start: at, end: at }, to);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, lines }) => {
  for (const v of ['--sat', '--sar', '--sab', '--sal']) {
    if (text.indexOf(v + ': env(safe-area-inset-') < 0)
      throw new Error(v + ' is not defined from an inset');
    if (text.indexOf(', 0px)') < 0) throw new Error('an inset has no fallback');
  }
  /* Every edge-hugging rule pays. Named individually rather than counted, so
     a rule that quietly stops using one is caught by name. */
  const owed = [
    ['.acct', 'var(--sat)'], ['.acct', 'var(--sar)'],
    ['.acctpanel', 'var(--sat)'], ['.acctpanel', 'var(--sar)'],
    ['.shelfdestinations', 'var(--sab)'],
    ['.toast', 'var(--sab)'],
    ['footer{grid-area:foot', 'var(--sab)'],
    ['header{grid-area:head', 'var(--sat)'],
    ['.scrim{position:fixed', 'var(--sab)'],
  ];
  for (const [sel, v] of owed) {
    const i = lines.findIndex(l => l.indexOf(sel) === 0 || l.trim().indexOf(sel) === 0);
    if (i < 0) throw new Error(sel + ' is gone');
    const rule = lines.slice(i, i + 4).join('\n');
    const end = rule.indexOf('}');
    if (rule.slice(0, end < 0 ? rule.length : end).indexOf(v) < 0)
      throw new Error(sel + ' does not pay ' + v);
  }
  /* And the two the phone block overrides, or the inset is undone at the size
     it matters most. */
  const mob = lines.findIndex(l => l === '  header{position:relative; padding-right:calc(52px + var(--sar));}');
  if (mob < 0) throw new Error('the phone header override drops the right inset');
  const rail = lines.findIndex(l => l.indexOf('    padding:8px calc(10px + var(--sar))') === 0);
  if (rail < 0) throw new Error('the phone tool rail drops its insets');

  /* Nothing reads env() outside :root, or the reason for the variables is
     gone and the tests below it cannot work. */
  const root = lines.findIndex(l => l === ':root{');
  let depth = 0, close = -1;
  for (let i = root; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { close = i; break; }
  }
  const outside = lines.slice(0, root).concat(lines.slice(close + 1)).join('\n');
  if (/env\(safe-area/.test(outside))
    throw new Error('an inset is read outside :root, where a test cannot reach it');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
