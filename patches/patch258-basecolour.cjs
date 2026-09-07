/* RECOGNISING A REMEMBERED COLOUR IS NOT THE SAME QUESTION AS SIZING ITS
   CLOUD, AND ONE NUMBER WAS DOING BOTH.

   After patch257 eleven of the sixteen cropped renders cleaned to under 1.2%
   and five did not: 33.3%, 47.1%, 52.3%, 53.4% and 99.4% of the base left
   behind. The failures are not random and the residue is not noise - 33% of a
   base that is 63% pink and 31% green is the green, entire. Only one of the
   two colours was being found.

   BASE_BALL is 12 and it was being used to ask "is my remembered colour in
   this picture?". Measured across the sixteen renders the green runs #03D105,
   #05C80B, #03D108, #06D601, #05D804, #06DA04, #05D908, #08D206, #08E401 -
   a spread of about 30, because whatever produces these re-encodes the colour
   every time. The green remembered from one render is 20.9 from the green in
   the next and 29.9 from the one after, so at radius 12 it was simply not
   there. Sleepy Neutral Eyes v2 lost its pink the same way: #E3037C against a
   remembered #EF0275 is 13.9 apart, and 13.9 > 12 by enough to leave 99.4% of
   the base sitting in the picture.

   The two questions want different numbers. WHERE THE CLOUD ENDS is 12,
   measured, and it still sizes the ball. WHETHER THIS IS THE SAME COLOUR is a
   nearest-match question over the whole spread the renders show, and 45 clears
   the worst observed pair by half as much again.

   This widens what the button will act on, so the button's printed share
   matters more, not less. It does not widen the automatic clear, which since
   patch256 fires only for a whole render and does not consult the memory. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const planAt = kit.inFunction(L, 'function basePlan(){');
const findAt = kit.only(L,
  l => l === '        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2>BASE_BALL*BASE_BALL) continue;',
  'the remembered-colour search', planAt);
const ball = kit.only(L, l => l === 'const BASE_BALL=12;    /* the cloud around one base colour, measured */', 'BASE_BALL');
if (L.some(l => l.indexOf('BASE_FIND') >= 0)) throw new Error('BASE_FIND already exists');

/* Bottom upward. */
kit.replace(L, { start: findAt, end: findAt }, [
  '        /* BASE_FIND, not BASE_BALL. This asks whether the remembered colour',
  '           is here at all; the ball that gets removed is grown from whatever',
  '           this finds. At 12 the green went unrecognised in five of sixteen',
  '           renders and their green survived untouched. */',
  '        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2>BASE_FIND*BASE_FIND) continue;',
]);

kit.replace(L, { start: ball, end: ball }, [
  'const BASE_BALL=12;    /* the cloud around one base colour, measured */',
  '/* How far a REMEMBERED colour may sit from the one in front of it and still',
  '   be the same colour. Wider than the cloud on purpose, and measured: across',
  '   the sixteen renders the green runs #03D105 to #08E401, so two renders\'',
  '   greens are 29.9 apart, and a pink remembered from one is 13.9 from the',
  '   pink in another. Nothing here is a shade of the collection\'s own artwork',
  '   at this distance - the nearest is 6.8, and that is INSIDE the ball, which',
  '   is what the printed share on the button is for. */',
  'const BASE_FIND=45;',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const BASE_FIND=45;') !== 1) throw new Error('BASE_FIND did not land');
  if (code.indexOf('BASE_FIND*BASE_FIND') < 0) throw new Error('nothing reads BASE_FIND');
  /* The search widened; the cloud did NOT. Both must still be true. */
  if (has('        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2>BASE_BALL*BASE_BALL) continue;') !== 0)
    throw new Error('the old narrow search is still there');
  if (code.indexOf('if((c.r-seed.r)**2+(c.g-seed.g)**2+(c.b-seed.b)**2<=BASE_BALL*BASE_BALL) n+=c.n;') < 0)
    throw new Error('the cloud count no longer uses BASE_BALL');
});

console.log('index.html grew by ' + grew + ' bytes');
