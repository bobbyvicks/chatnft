/* A MESSAGE STAYS UP LONG ENOUGH TO READ IT.

   Every toast this page has ever shown has been on screen for 1.7 seconds,
   whatever it says. That is fine for "Saved" and it is not fine for the
   sentences the page actually produces:

     Saved cap here only - this account is not allowed to write to the
     group. Ask whoever set it up to add you. - saved at 1280x1280, which
     is not on the collection 8 cell grid - 34 edge pixels set to black by
     the collection border rule

   54 words in 1.7 seconds is 1,900 words a minute. Ordinary reading of plain
   prose is around 200 to 250, so what somebody actually gets is the first
   five or six words - which for a message built as "what happened, then why"
   is the half they already knew.

   Patch 482 made those messages say more, so this is its other half.

   THE SHORT ONES DO NOT MOVE. The floor is the 1.7 seconds that was there,
   so everything at three words or fewer - Saved, Order saved, Signed out,
   Deleted - is on screen for exactly as long as it was. Above that it climbs:
   a five-word message gets 2100 instead of 1700, which is 400ms and is the
   same rule applied honestly rather than a special case to keep a rounder
   claim true. THREE, NOT FIVE - the first version of this said five and the
   check in this script is what caught it, because 700 + 280*4 is 1820.

   AND THE CEILING IS AN ADMISSION. Nine seconds does not cover the 54-word
   example above, and no toast duration should: a bar that hangs about for
   fifteen seconds is its own problem. The longest messages here want a place
   that stays until it is dismissed, and that is a different change. This
   makes the ones that can be read, readable, and does not pretend about the
   rest.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const OLD = "function toast(m){ const el=$('toast'); el.textContent=m; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1700); }";

const at = kit.only(L, l => l === OLD, 'the toast');

kit.replace(L, { start: at, end: at }, [
  '/* HOW LONG A MESSAGE IS ON SCREEN, from how much of it there is.',
  '',
  '   1.7 seconds regardless was the rule, and it is 1,900 words a minute for',
  '   the longest thing this page says. 280ms a word is about 215 a minute,',
  '   which is ordinary reading of plain prose, and 700ms in front of it is',
  '   the moment between something appearing and being looked at.',
  '',
  '   THE FLOOR IS WHAT WAS THERE. Three words or fewer - Saved, Order saved,',
  '   Signed out - come out at 1700 exactly. Above that it climbs: five words',
  '   is 2100, which is 400ms more for a message with 400ms more in it.',
  '',
  '   THE CEILING IS NOT ENOUGH FOR THE LONGEST ONES AND IS NOT MEANT TO BE.',
  '   A save inside a group can carry the reason it did not share, the',
  '   off-grid size and the border-rule count in one sentence - 54 words,',
  '   which wants 16 seconds, which is not a toast. Those want something that',
  '   stays until it is dismissed. Nine seconds is where a bar that vanishes',
  '   on its own stops being reasonable; the rest is a different change and is',
  '   written down here rather than being rounded away. */',
  'const TOAST_MIN_MS=1700, TOAST_MAX_MS=9000, TOAST_WORD_MS=280, TOAST_NOTICE_MS=700;',
  'function toastMs(m){',
  '  const words=String(m==null?"":m).trim().split(/\\s+/).filter(Boolean).length;',
  '  return Math.min(TOAST_MAX_MS,',
  '    Math.max(TOAST_MIN_MS, TOAST_NOTICE_MS + TOAST_WORD_MS*words));',
  '}',
  '/* The timer is cleared on the way in. Two messages in quick succession',
  '   used to share one timer: the first one to be scheduled took the second',
  '   one down with it, so a long message arriving after a short one was on',
  '   screen for whatever was left of 1.7 seconds. That was invisible while',
  '   every message lasted the same time and is not now. */',
  'let toastTimer=null;',
  "function toast(m){ const el=$('toast'); el.textContent=m; el.classList.add('show');",
  '  if(toastTimer) clearTimeout(toastTimer);',
  "  toastTimer=setTimeout(()=>{ toastTimer=null; el.classList.remove('show'); },toastMs(m)); }",
]);

const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (code.indexOf(s) >= 0) throw new Error('still there: ' + s); };
  need('function toastMs(m){');
  need('const TOAST_MIN_MS=1700, TOAST_MAX_MS=9000, TOAST_WORD_MS=280, TOAST_NOTICE_MS=700;');
  need('if(toastTimer) clearTimeout(toastTimer);');
  gone(",1700); }");
  /* The floor really is the old number, checked by running it rather than by
     reading it - the whole claim is that nothing short changes. */
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'const TOAST_MIN_MS=1700, TOAST_MAX_MS=9000, TOAST_WORD_MS=280, TOAST_NOTICE_MS=700;'
    + code.slice(code.indexOf('function toastMs(m){'),
      code.indexOf('let toastTimer=null;'))
    + ' return toastMs;')();
  /* THE FLOOR REACHES THREE WORDS, not five - checked by running it, which
     is how the first version of this comment was caught claiming five. The
     boundary is pinned as a case of its own so the next reader does not have
     to work it out: 700 + 280*4 is 1820, which is over 1700. */
  const cases = [['Saved', 1700], ['Order saved', 1700], ['Signed out', 1700],
    ['', 1700], [null, 1700], ['Order saved for the group', 2100],
    ['That trait is already at the edge', 2660]];
  for (const [m, want] of cases)
    if (f(m) !== want) throw new Error('toastMs(' + JSON.stringify(m) + ') = ' + f(m) + ', want ' + want);
  if (f('a b c d e f') !== 700 + 280 * 6)
    throw new Error('six words: ' + f('a b c d e f'));
  if (f(new Array(60).fill('word').join(' ')) !== 9000)
    throw new Error('the ceiling does not hold: ' + f(new Array(60).fill('word').join(' ')));
});

fs.renameSync(TMP, FILE);
console.log('patch483 written, ' + grew + ' bytes');
