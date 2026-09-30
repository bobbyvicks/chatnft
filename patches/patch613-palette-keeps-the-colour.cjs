/* patch613: A COLOURFUL COLOUR IS NOT SENT TO GREY BY "Colours to palette".

   The owner, looking at the size-8 results: "even when using 8 its not
   good". Part of it is colour. The palette step sends each colour group to
   the palette colour nearest by CIEDE2000, and when nothing in the palette
   is near, that nearest can be a grey: navy #001165 (LCh 12/58/302) went to
   #2c3a44 (LCh 24/9/250) at 14.15, while the blue #323353 (LCh 23/21/294)
   was 14.17. The cause is CIEDE2000's rotation term RT, a small-difference
   correction for blues: at 14 dE it cancels 511 of 711 squared units for
   navy -> grey. Royal blue, indigo and violet went grey the same way
   (Gazers Lunar Eyes, the Bad Time and Six Eyes rims, center.png).

   THE RULE (candidate P3, scratchpad/fix8/palette):
     - within SNAP_NEAR_DE (5) of the nearest, nothing changes;
     - past it, the palette colours within bd + SNAP_TIE_BAND*(bd-5) of the
       colour are near-ties, and the one nearest by CIEDE2000 WITHOUT RT is
       the alternative;
     - the alternative replaces the nearest only in the fault itself: the
       colour is colourful (C* >= SNAP_GREY_MIN_C, 40), the nearest is
       near-grey (C* < SNAP_GREY_RATIO, 1/4, of the colour's), the
       alternative keeps more colour, and Oklab also says it is nearer.
   Measured over every population at size 8 and 16: every change is from a
   grey to a blue or purple; mouths and chains unchanged; eyes 5 files at 8;
   the sheets were read (Future City and Ruins Selfie, which a looser rule
   spoiled, are unchanged).

   ONE PLACE. nearestPaletteColour (the agent panel's named colour) and
   snapToPalette (the button) must name the same colour - the comment on
   nearestPaletteColour records what happened when they did not. So the
   pick is one function, palettePick, and both call it. The worker gets
   its text, as it gets snapToPalette's.

   deltaE2000 gains an optional 7th argument, noRT. Every existing call
   passes six, so every existing answer is unchanged.

   PB_REPO / PB_INDEX as in patch596 onwards. */
'use strict';
const s0 = require('./stage0-common.cjs');
const NL = s0.NL;

const doc = s0.start([
  ['function snapToPalette(d,n){', 'snapToPalette is not in this page'],
  ['function nearestPaletteColour(r,g,b,pal,palLab){', 'nearestPaletteColour is not in this page'],
]);
if (require('fs').readFileSync(s0.FILE, 'utf8').indexOf('function palettePick(') >= 0) throw new Error('patch613 is already applied');

/* 1. deltaE2000(..., noRT) */
doc.swap('function deltaE2000(L1,a1,b1,L2,a2,b2){',
  'function deltaE2000(L1,a1,b1,L2,a2,b2,noRT){');
doc.swap('  const RT=-Math.sin(2*dTh*RAD)*RC;',
  ['  /* noRT: the same distance without the rotation term, for palettePick\'s',
   '     second look (patch613). Six arguments, as every other caller passes,',
   '     is the CIE formula unchanged. */',
   '  const RT=noRT ? 0 : -Math.sin(2*dTh*RAD)*RC;']);

/* 2. palettePick and its constants, just before nearestPaletteColour's comment */
doc.swap('/* THE NEAREST PALETTE COLOUR, in one place.',
  ['/* A COLOURFUL COLOUR IS NOT SENT TO GREY (patch613).',
   '',
   '   The nearest palette colour by CIEDE2000, except in one measured fault.',
   '   When nothing in the palette is near, the nearest can be a grey: navy',
   '   #001165 (LCh 12/58/302) went to #2c3a44 (LCh 24/9/250) at 14.15 while',
   '   the blue #323353 was 14.17. That is the rotation term RT, a small-',
   '   difference correction for blues: at 14 dE it cancels 511 of 711 squared',
   '   units for navy -> grey. Royal blue, indigo and violet went grey the same',
   '   way.',
   '',
   '   So past SNAP_NEAR_DE, the palette colours within bd+SNAP_TIE_BAND*(bd-',
   '   SNAP_NEAR_DE) are near-ties, and the one nearest WITHOUT RT is the',
   '   alternative. It replaces the nearest only when the colour is colourful',
   '   (C* >= SNAP_GREY_MIN_C), the nearest is near-grey (C* under',
   '   SNAP_GREY_RATIO of the colour\'s), the alternative keeps more colour, and',
   '   Oklab - a space built so a blue stays blue as it fades - also calls it',
   '   nearer. Without the Oklab check vivid blue #0134e8 went to purple; with',
   '   a looser gate Future City\'s steel sky split in two and Ruins Selfie\'s',
   '   white went sky blue. Measured over every trait at size 8 and 16: every',
   '   change is a grey becoming a blue or purple (scratchpad/fix8/palette).',
   '',
   '   Within SNAP_NEAR_DE nothing here runs, so a near match lands where it',
   '   always did. Returns the palette entry and its CIEDE2000 distance. */',
   'const SNAP_NEAR_DE=5;',
   'const SNAP_TIE_BAND=0.5;',
   'const SNAP_GREY_MIN_C=40;',
   'const SNAP_GREY_RATIO=0.25;',
   '/* CIELAB (D65) TO OKLAB, through XYZ; Ottosson\'s published matrices. */',
   'function labToOklab(L,a,b){',
   '  const fy=(L+16)/116, fx=fy+a/500, fz=fy-b/200;',
   '  const inv=t=>t>6/29 ? t*t*t : 3*(6/29)*(6/29)*(t-4/29);',
   '  const X=inv(fx)*0.95047, Y=inv(fy), Z=inv(fz)*1.08883;',
   '  const l=Math.cbrt(0.8189330101*X+0.3618667424*Y-0.1288597137*Z);',
   '  const m=Math.cbrt(0.0329845436*X+0.9293118715*Y+0.0361456387*Z);',
   '  const s=Math.cbrt(0.0482003018*X+0.2643662691*Y+0.6338517070*Z);',
   '  return [0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s,',
   '    0.0259040371*l+0.7827717662*m-0.8086757660*s];',
   '}',
   'function palettePick(m,pal,palLab){',
   '  let best=pal[0], bd=Infinity;',
   '  for(let k=0;k<pal.length;k++){',
   '    const q=palLab[k];',
   '    const dist=deltaE2000(m[0],m[1],m[2],q[0],q[1],q[2]);',
   '    if(dist<bd){ bd=dist; best=pal[k]; }',
   '  }',
   '  if(bd>SNAP_NEAR_DE){',
   '    const lim=bd+SNAP_TIE_BAND*(bd-SNAP_NEAR_DE);',
   '    let alt=null, aw=Infinity;',
   '    for(let k=0;k<pal.length;k++){',
   '      const q=palLab[k];',
   '      if(deltaE2000(m[0],m[1],m[2],q[0],q[1],q[2])>lim) continue;',
   '      const w=deltaE2000(m[0],m[1],m[2],q[0],q[1],q[2],true);',
   '      if(w<aw){ aw=w; alt=pal[k]; }',
   '    }',
   '    if(alt && alt!==best){',
   '      const a2=labOf(alt.r,alt.g,alt.b), b2=labOf(best.r,best.g,best.b);',
   '      const Cs=Math.hypot(m[1],m[2]), Ct=Math.hypot(b2[1],b2[2]), Ca=Math.hypot(a2[1],a2[2]);',
   '      if(Cs>=SNAP_GREY_MIN_C && Ct<Cs*SNAP_GREY_RATIO && Ca>Ct){',
   '        const A=labToOklab(m[0],m[1],m[2]), P=labToOklab(a2[0],a2[1],a2[2]), Q=labToOklab(b2[0],b2[1],b2[2]);',
   '        if(Math.hypot(A[0]-P[0],A[1]-P[1],A[2]-P[2])<Math.hypot(A[0]-Q[0],A[1]-Q[1],A[2]-Q[2])){',
   '          best=alt; bd=deltaE2000(m[0],m[1],m[2],a2[0],a2[1],a2[2]);',
   '        }',
   '      }',
   '    }',
   '  }',
   '  return {best:best, dE:bd};',
   '}',
   '/* THE NEAREST PALETTE COLOUR, in one place.']);

/* 3. nearestPaletteColour through palettePick */
doc.swap(['  const c=labOf(r,g,b);',
  '  let best=pal[0], bd=Infinity;',
  '  for(let k=0;k<pal.length;k++){',
  '    const q=palLab[k];',
  '    const dist=deltaE2000(c[0],c[1],c[2],q[0],q[1],q[2]);',
  '    if(dist<bd){ bd=dist; best=pal[k]; }',
  '  }',
  '  return {hex:best.h, r:best.r, g:best.g, b:best.b, dE:bd};'],
 ['  /* palettePick, the one rule the button uses too (patch613). */',
  '  const pick=palettePick(labOf(r,g,b),pal,palLab), best=pick.best;',
  '  return {hex:best.h, r:best.r, g:best.g, b:best.b, dE:pick.dE};']);

/* 4. snapToPalette's per-group pick through palettePick */
doc.swap(['    const m=[g.sumL/g.px, g.suma/g.px, g.sumb/g.px];',
  '    let best=pal[0], bd=Infinity;',
  '    for(let k=0;k<pal.length;k++){',
  '      const q=palLab[k];',
  '      const dist=deltaE2000(m[0],m[1],m[2],q[0],q[1],q[2]);',
  '      if(dist<bd){ bd=dist; best=pal[k]; }',
  '    }',
  '    g.target=best;'],
 ['    const m=[g.sumL/g.px, g.suma/g.px, g.sumb/g.px];',
  '    /* The nearest, unless it sends a colourful group to grey (patch613). */',
  '    const best=palettePick(m,pal,palLab).best;',
  '    g.target=best;']);

/* 5. the worker's copy of the palette step carries the new pieces */
doc.swap('    "const SNAP_GROUP_DE="+SNAP_GROUP_DE+";",',
  ['    "const SNAP_GROUP_DE="+SNAP_GROUP_DE+";",',
   '    /* palettePick and what it reads (patch613): without them the worker\'s',
   '       snapToPalette would throw on its first colour group. */',
   '    "const SNAP_NEAR_DE="+SNAP_NEAR_DE+", SNAP_TIE_BAND="+SNAP_TIE_BAND+", SNAP_GREY_MIN_C="+SNAP_GREY_MIN_C+", SNAP_GREY_RATIO="+SNAP_GREY_RATIO+";",',
   '    labToOklab.toString(), palettePick.toString(),']);

doc.finish(({ code, must }) => {
  must('function palettePick(m,pal,palLab){', 'palettePick');
  must('const best=palettePick(m,pal,palLab).best;', 'snapToPalette uses palettePick');
  must('const pick=palettePick(labOf(r,g,b),pal,palLab)', 'nearestPaletteColour uses palettePick');
  must('labToOklab.toString(), palettePick.toString(),', 'the worker carries palettePick');
  must('const RT=noRT ? 0 :', 'deltaE2000 noRT');
  /* no second copy of the nearest-colour loop in either function */
  const snap = code.slice(code.indexOf('function snapToPalette(d,n){'));
  const snapBody = snap.slice(0, snap.indexOf('\nfunction '));
  if (/let best=pal\[0\], bd=Infinity;/.test(snapBody)) throw new Error('snapToPalette still has its own nearest loop');
});
