/* Replace the two keyed base files with the corrected ones and rewrite the
   README, after an independent audit found real faults in both.

   The two keyed files ARE overwritten. That is deliberate and is the one place
   overwriting is right: they are mine, they are minutes old, and they are
   wrong - their fill collides exactly with a colour the collection already uses.
   Leaving a defective file sitting under a README that says "send THIS to
   whoever draws traits" would be worse than replacing it. The plain base files
   are untouched; so is v1.
*/
const fs=require('fs');
const path=require('path');
const {decode}=require('./png.cjs');

const SRC=path.join(__dirname,'bases-fixed');
const DEST='E:/X content/pixel art_/traits/base/approved';
const N=160;
const REPLACE=[
  ['base-model-key-160.png',  'base-model-key-v2-160.png'],
  ['base-model-key-1280.png', 'base-model-key-v2-1280.png'],
];
const WANT=new Set(['255,255,255','60,255,180','0,255,0']);

for(const [from] of REPLACE){
  const p=path.join(SRC,from);
  if(!fs.existsSync(p)) throw new Error('missing rebuilt file: '+from);
  const im=decode(p);
  const seen=new Set();
  let partial=0;
  for(let q=0;q<im.width*im.height;q++){
    const i=q*4; if(im.data[i+3]!==255) partial++;
    seen.add(im.data[i]+','+im.data[i+1]+','+im.data[i+2]);
  }
  if(partial) throw new Error(from+' has '+partial+' pixels that are not fully opaque');
  const bad=[...seen].filter(c=>!WANT.has(c));
  if(bad.length) throw new Error(from+' holds unexpected colours: '+bad.join(' '));
}
console.log('both rebuilt key files hold only white, #3CFFB4 and #00FF00, fully opaque');

for(const [from,to] of REPLACE){
  fs.copyFileSync(path.join(SRC,from), path.join(DEST,to));
  const im=decode(path.join(DEST,to));
  const seen=new Set();
  for(let q=0;q<im.width*im.height;q++) seen.add(im.data[q*4]+','+im.data[q*4+1]+','+im.data[q*4+2]);
  const cell=im.width/N;
  if(!Number.isInteger(cell)) throw new Error(to+': cell size is not whole');
  if([...seen].some(c=>!WANT.has(c))) throw new Error(to+': wrong colours after the copy');
  if(seen.has('0,255,255')) throw new Error(to+': cyan survived the replacement');
  console.log('  replaced '+to+'  '+im.width+'x'+im.height+'  cell '+cell+'  '+seen.size+' colours, no cyan');
}

const README=`# Base model v2

Built from normalized/masters/light.png, which is the artwork at its native
resolution: 160x160, 17 colours in the drawing, no semi-transparent pixels.

| file | use |
|---|---|
| \`base-model-v2-160.png\` | the artwork itself, one pixel per cell |
| \`base-model-v2-960.png\` | 6x |
| \`base-model-v2-1280.png\` | 8x |
| \`base-model-v2-1280-white.png\` | 8x on white - load THIS as the reference |
| \`base-model-key-v2-160.png\` | keyed, one pixel per cell |
| \`base-model-key-v2-1280.png\` | keyed 8x - send THIS to whoever draws traits |

Nothing is resampled. The three plain files are whole-number nearest-neighbour
scales of the 160 master itself. The -white file is a whole-number scale of the
master composited over opaque white, and the two keyed files are whole-number
scales of the keyed 160 - so those three legitimately contain colours the master
does not (white, and the two key colours). Diffing them straight against the 160
will show differences; that is by design, not a fault.

## Sizes

The grid is 160 cells. Only whole multiples are safe:

  960 (6x)   1120 (7x)   1280 (8x)   1440 (9x)   1600 (10x)   1920 (12x)

1024 is NOT one of them - 1024/160 is 6.4 - and TRAIT-STORAGE.md currently
specifies 1024x1024 for new traits. Traits approved at that size do not land on
the grid. normalized/export already uses 1280.

## The key colours

White background, body #3CFFB4, outline #00FF00.

The body is NOT cyan. #00FFFF was the first choice and it was wrong: measured
against the 61 real approved trait files, cyan is distance 0.0 - an exact match -
from a colour the collection already uses, in backgrounds/jupiter-terminal.png,
backgrounds/solana-outage-screen.png and, worst, eyes/pit-vipers.png. Eyes are
drawn ON the character, so a cyan lens would sit over cyan skin and be invisible
to the differencer. #3CFFB4 is 30.1 from the nearest colour the collection uses
on 20 or more pixels. The green outline was measured too and kept: 42.0 away,
colliding with nothing.

Green and magenta, the obvious chroma-key pair, is worse than both: being
complementary, their anti-aliased blend passes through mid grey, which traits use
constantly.

"Outline" here means the app's rule - anything with luminance 110 or less becomes
green. That is most of the character's edge but not all of it, and it also covers
interior line art. Do not read it as "green traces the silhouette".

## What was wrong with v1

traits/base/wip/base-model-v1.png is the same picture at 1254x1254, and 1254 is
not a whole multiple of 160 (it gives 7.8375 pixels per cell). Measured:

- 13,882 distinct colours where the artwork has 17. This one IS caused by the
  fractional scale - resampling the master to 1254 reproduces the explosion.
- colour changes landing between cells: 387,606 of 388,334 row transitions.
- 576,473 semi-transparent pixels, only 1,085 fully opaque. This is NOT explained
  by the fractional scale: resampling the master to 1254 leaves 554,635 pixels
  fully opaque, not 1,085. Something else in v1's history flattened the alpha to
  253-254 across the whole figure, and that cause is still unknown.

base-model-greenscreen-v1.png shows one colour (#66FF66) over a transparent
background, so it carries no outline and cannot show the app where the
character's own edges are. It stores two RGB values; the second is the black
under its transparent pixels.

## What this does NOT fix

Extraction accuracy is not measurably better. Tested against the old base on
hard-edged, anti-aliased and rescaled submissions, recall differs by under 0.3
points. The value here is that the base is now correct, reproducible and free of
sub-pixel noise - not that traits come out cleaner today.

v1 is deliberately left in place. It is the record of what the collection shipped
with, and a base is what every extraction is measured against.
`;
fs.writeFileSync(path.join(DEST,'README.md'),README);
console.log('\nREADME rewritten with the three corrections the audit found');
