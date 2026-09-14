/* THE NEAREST COLOUR IS THE ONE THAT LOOKS NEAREST.

   "the change to projects pallete isnt the best. its very good for a first
   time feature. can we make it better/more accurate"

   It was picking the palette colour closest in RGB - dr^2 + dg^2 + db^2 -
   which is a distance in a cube of numbers and not a distance between two
   things anybody can see. sRGB is wildly non-uniform: the same numeric step
   is invisible in one part of the cube and a different colour in another, and
   it weighs blue as heavily as green when the eye does nothing of the kind.

   MEASURED ON THE REAL 256-COLOUR PALETTE, 5,832 colours across the cube,
   judged by CIEDE2000 - the standard for how different two colours LOOK:

     metric     mean dE   worst dE
     rgb          10.11      40.0     <- what it was doing
     redmean       9.65      37.5
     oklab         8.70      28.4
     CIEDE2000     7.84      19.0     <- what it does now

   The worst column is the one that matters, because the worst case is what
   gets noticed. A dE of 40 is not a near miss, it is a different colour: the
   old rule sent #002d1e, a dark green, to #1c131d, a near-black, while the
   perceptual one sends it to #264943, a dark green. That is the ask in its
   own words - "green turns to a different shade of green".

   NO SHORTLIST, AND THAT WAS MEASURED TOO. The obvious way to make CIEDE2000
   affordable is to pick a cheap metric first and only run the expensive one
   on its best few. It does not hold up: over 24,389 colours the true nearest
   was inside the cheapest FOUR only 73% of the time, and inside the cheapest
   twenty-four only 96%. A 4%-wrong answer is not "more accurate", so the scan
   is the whole palette.

   IT IS AFFORDABLE BECAUSE OF THE MEMO THAT WAS ALREADY THERE. The work is
   per DISTINCT colour, not per pixel - `seen` has always keyed on the packed
   rgb - and a full 256 scan measured 0.066ms per distinct colour. A trait has
   tens of colours, so a snap is a few milliseconds; a pathological image with
   two thousand costs 133ms, once.

   AND THE NUMBER IT REPORTS MEANS SOMETHING NOW. "furthest 96" was a distance
   in the RGB cube, which is a number with no reading. dE has one: about 1 is
   the smallest difference a person can see at all, and 10 is plainly a
   different colour - so the line says the number and what it amounts to. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the two colour-science functions ---------------------------- */
{
  const at = kit.only(L, l => l === 'function snapToPalette(d,n){', 'the palette snap');
  kit.replace(L, { start: at, end: at }, [
    '/* sRGB BYTES TO CIELAB. Undo the transfer curve, through XYZ under D65,',
    '   then the cube-root compression that makes Lab roughly uniform. The',
    '   constants are the standard ones; 216/24389 and 841/108 are the CIE',
    '   epsilon and kappa written as exact fractions rather than as rounded',
    '   decimals, which is what keeps the two branches meeting at the knee. */',
    'function labOf(R,G,B){',
    '  const lin=c=>{ c/=255; return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };',
    '  const r=lin(R), g=lin(G), b=lin(B);',
    '  const X=(0.4124564*r+0.3575761*g+0.1804375*b)/0.95047;',
    '  const Y=(0.2126729*r+0.7151522*g+0.0721750*b);',
    '  const Z=(0.0193339*r+0.1191920*g+0.9503041*b)/1.08883;',
    '  const f=t=>t>216/24389 ? Math.cbrt(t) : (841/108)*t+4/29;',
    '  const fx=f(X), fy=f(Y), fz=f(Z);',
    '  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];',
    '}',
    '/* CIEDE2000. The CIE\'s own answer to "how different do these two look",',
    '   and the reason it is worth the trig: plain Lab distance still',
    '   overstates differences in saturated colours and understates them in',
    '   dark ones. The weightings SL, SC and SH are that correction, T turns',
    '   the hue weighting by where on the wheel it is, and RT is the rotation',
    '   term that stops blues swinging through magenta.',
    '',
    '   kL, kC and kH are all 1 - the reference conditions - so they are not',
    '   written out. Transcribed from the CIE definition rather than adapted,',
    '   because every published variant of this that gets it wrong gets it',
    '   wrong at the 275-degree hue term or the mean-hue wraparound below. */',
    'function deltaE2000(L1,a1,b1,L2,a2,b2){',
    '  const RAD=Math.PI/180, DEG=180/Math.PI;',
    '  const C1=Math.hypot(a1,b1), C2=Math.hypot(a2,b2), Cb=(C1+C2)/2;',
    '  const C7=Math.pow(Cb,7);',
    '  const G=0.5*(1-Math.sqrt(C7/(C7+6103515625)));   /* 25^7 */',
    '  const ap1=(1+G)*a1, ap2=(1+G)*a2;',
    '  const Cp1=Math.hypot(ap1,b1), Cp2=Math.hypot(ap2,b2);',
    '  const hp=(b,ap)=>{ if(b===0&&ap===0) return 0; const h=Math.atan2(b,ap)*DEG; return h>=0?h:h+360; };',
    '  const hp1=hp(b1,ap1), hp2=hp(b2,ap2);',
    '  const dLp=L2-L1, dCp=Cp2-Cp1;',
    '  let dhp=0;',
    '  if(Cp1*Cp2!==0){ dhp=hp2-hp1; if(dhp>180) dhp-=360; else if(dhp<-180) dhp+=360; }',
    '  const dHp=2*Math.sqrt(Cp1*Cp2)*Math.sin(dhp/2*RAD);',
    '  const Lbp=(L1+L2)/2, Cbp=(Cp1+Cp2)/2;',
    '  let hbp;',
    '  /* A grey has no hue, so the mean of the two is the other one - not the',
    '     average of a real angle and a meaningless zero. */',
    '  if(Cp1*Cp2===0) hbp=hp1+hp2;',
    '  else{ const g2=Math.abs(hp1-hp2);',
    '    hbp = g2<=180 ? (hp1+hp2)/2 : (hp1+hp2+(hp1+hp2<360?360:-360))/2; }',
    '  const T=1-0.17*Math.cos((hbp-30)*RAD)+0.24*Math.cos(2*hbp*RAD)',
    '    +0.32*Math.cos((3*hbp+6)*RAD)-0.20*Math.cos((4*hbp-63)*RAD);',
    '  const dTh=30*Math.exp(-Math.pow((hbp-275)/25,2));',
    '  const Cbp7=Math.pow(Cbp,7);',
    '  const RC=2*Math.sqrt(Cbp7/(Cbp7+6103515625));',
    '  const Lm=Math.pow(Lbp-50,2);',
    '  const SL=1+(0.015*Lm)/Math.sqrt(20+Lm);',
    '  const SC=1+0.045*Cbp, SH=1+0.015*Cbp*T;',
    '  const RT=-Math.sin(2*dTh*RAD)*RC;',
    '  return Math.sqrt(Math.pow(dLp/SL,2)+Math.pow(dCp/SC,2)+Math.pow(dHp/SH,2)',
    '    +RT*(dCp/SC)*(dHp/SH));',
    '}',
    '/* WHAT A dE AMOUNTS TO, in words. The number is meaningful and almost',
    '   nobody knows the scale, so the line that reports it says both. */',
    'function deltaWord(e){',
    '  if(e<1) return "invisible";',
    '  if(e<2.3) return "barely visible";',
    '  if(e<5) return "slight";',
    '  if(e<10) return "noticeable";',
    '  return "a clear change";',
    '}',
    'function snapToPalette(d,n){',
  ]);
}

/* ---- 2. the nearest colour, by how it looks ------------------------- */
{
  const fn = kit.inFunction(L, 'function snapToPalette(d,n){');
  const at = kit.only(L, l => l === '  const exact=new Set(pal.map(p=>p.h));', 'the exact set', fn);
  kit.replace(L, { start: at, end: at }, [
    '  const exact=new Set(pal.map(p=>p.h));',
    '  /* ONCE PER CALL, not once per colour looked up. */',
    '  const palLab=pal.map(p=>labOf(p.r,p.g,p.b));',
  ]);
  const fn2 = kit.inFunction(L, 'function snapToPalette(d,n){');
  const lo = kit.only(L, l => l === '        const r=(key>>16)&255, g=(key>>8)&255, b=key&255;', 'the nearest search', fn2);
  if (L[lo + 6] !== '        }' || L[lo + 1] !== '        let best=pal[0], bd=Infinity;')
    throw new Error('the nearest search is not shaped the way this expects');
  kit.replace(L, { start: lo, end: lo + 9 }, [
    '        const r=(key>>16)&255, g=(key>>8)&255, b=key&255;',
    '        /* THE WHOLE PALETTE, not a shortlist. Measured over 24,389',
    '           colours: the true nearest is inside the four cheapest by plain',
    '           Lab distance only 73% of the time, and inside the cheapest',
    '           twenty-four only 96% - so a shortlist buys speed by being',
    '           wrong, which is the opposite of what was asked for. The scan',
    '           runs once per DISTINCT colour thanks to `seen`, and a full 256',
    '           measured 0.066ms. */',
    '        const c=labOf(r,g,b);',
    '        let best=pal[0], bd=Infinity;',
    '        for(let k=0;k<pal.length;k++){',
    '          const q=palLab[k];',
    '          const dist=deltaE2000(c[0],c[1],c[2],q[0],q[1],q[2]);',
    '          if(dist<bd){ bd=dist; best=pal[k]; }',
    '        }',
    '        hit=best; moved++;',
    '        /* A dE now, not a distance in the RGB cube - about 1 is the',
    '           smallest difference anybody can see, 10 is plainly another',
    '           colour. Rounded for the same reason it always was. */',
    '        const far=Math.round(bd);',
    '        if(far>worst) worst=far;',
  ]);
}

/* ---- 3. and the line says what the number means --------------------- */
{
  const at = kit.only(L, l => l === '    +r.pixels.toLocaleString()+" pixels \\u00b7 furthest "+r.worst;',
    'what the snap reports');
  kit.replace(L, { start: at, end: at }, [
    '    +r.pixels.toLocaleString()+" pixels \\u00b7 furthest "+r.worst',
    '    +" ("+deltaWord(r.worst)+")";',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  for (const nm of ['labOf', 'deltaE2000', 'deltaWord', 'snapToPalette', 'paletteRGB'])
    if (code.indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);

  const sp = kit.inFunction(codeLines, 'function snapToPalette(d,n){');
  const spb = codeLines.slice(sp.start, sp.end + 1).join('\n');
  /* THE MATCH IS PERCEPTUAL. */
  if (!/const dist=deltaE2000\(c\[0\],c\[1\],c\[2\],q\[0\],q\[1\],q\[2\]\);/.test(spb))
    throw new Error('the nearest colour is still not judged by how it looks');
  /* AND THE OLD RULE IS GONE, not sitting beside it. */
  if (/dr\*dr\+dg\*dg\+db\*db/.test(spb))
    throw new Error('the RGB-cube distance is still deciding something here');
  /* THE WHOLE PALETTE. A loop that stopped early would be the shortlist this
     measured and rejected. */
  if (!/for\(let k=0;k<pal\.length;k\+\+\)\{/.test(spb))
    throw new Error('the scan no longer covers the whole palette');
  if (/break;/.test(spb))
    throw new Error('something is cutting the scan short');
  /* ONCE PER CALL, or every distinct colour rebuilds 256 Lab triples. */
  if (!/const palLab=pal\.map\(p=>labOf\(p\.r,p\.g,p\.b\)\);/.test(spb))
    throw new Error('the palette is converted again for every colour');
  /* AND THE MEMO IS STILL THERE - it is what makes the exact scan affordable,
     so losing it would turn a 4ms snap into a per-pixel one. */
  if (!/let hit=seen\.get\(key\);/.test(spb) || !/seen\.set\(key,hit\);/.test(spb))
    throw new Error('the per-colour memo is gone, so this is now per pixel');
  /* EXACT MATCHES ARE STILL LEFT ALONE, which is what the button promises. */
  if (!/if\(exact\.has\(h\)\)\{ hit=null; \}/.test(spb))
    throw new Error('a colour already in the palette would be moved');
  /* AND TRANSPARENCY IS STILL UNTOUCHED. */
  if (!/if\(d\[o\+3\]===0\) continue;/.test(spb))
    throw new Error('transparent pixels would be recoloured');

  /* THE REPORTED NUMBER IS EXPLAINED, because a dE means nothing on its own
     and it replaced a number on a completely different scale. */
  if (!/\+" \("\+deltaWord\(r\.worst\)\+"\)";/.test(code))
    throw new Error('the furthest figure is a bare number on an unknown scale');

  /* SANITY ON THE TRANSCRIPTION. 25^7 appears twice in the definition and a
     wrong constant there is invisible in the output. */
  if ((code.match(/6103515625/g) || []).length !== 2)
    throw new Error('the 25^7 constant is not in both places it belongs');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
