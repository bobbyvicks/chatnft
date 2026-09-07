/* Make a smaller trait FIT the canvas, without wrecking a pixel and without
   shrinking anything.

   Asked for: "id rather the site just make things default to 1048x1048 even if
   its bigger just make it fit, dont shrink the sizes", after "the skins are
   bigger on the randomizer than everything else".

   THE FIXED SIZE CANNOT BE 1024, and measuring said so. All 31 skin files were
   decoded: 30 are 1280x1280 built on uniform 8px blocks, which is 160 CELLS,
   and one (Loot Skin) is 1024 on 8px blocks, which is 128 cells. The newer
   traits are 128 cells. So the two are not the same art at different pixel
   sizes - they are different CELL COUNTS. Forcing 1024 makes 160 cells share
   1024 pixels, 6.4 each, so cells come out alternately 6 and 7 wide. That is
   shrinking, and it is the one thing pixel art cannot survive.

   1280 IS THE SIZE WHERE BOTH LAND WHOLE, because 160 and 128 both divide it:

     skin  1280  160 cells x 8px   1:1, untouched
     trait 1024  128 cells x 8px   x1.25 -> 128 cells x 10px, every cell equal

   Which is already the canvas - it is the max over the traits being drawn. The
   app simply refused the 1.25.

   WHY IT REFUSED, and why that reasoning is kept. tests/pixels.spec.js records
   the measurement that put the whole-number rule in:

     48px source striped every 2px, into a 160 box
       stretched to 160    stripe widths 3 and 4    uneven
       3x and centred      stripe widths 3          uniform

   A first attempt at this simply allowed any fractional scale. Three of those
   tests failed, which is how the recorded decision was found rather than
   flattened. It was reverted.

   THE RULE THAT SATISFIES BOTH is to ask what the fraction does to the SOURCE
   BLOCK. Reduce the fit to p/q; a scale by p/q keeps every block whole exactly
   when the block size divides by q. The striped source has a 1px block and a
   fit of 10/3, so nothing divides by 3 and it falls back to whole numbers,
   unchanged. The 1024 trait has an 8px block and a fit of 5/4, and 8 divides
   by 4, so it is allowed. Checked against every case in that spec before a
   line of this was written, and all six agree.

   COST. The block size is measured once per bitmap and cached, and only ever
   asked for when a fit is fractional - so a collection where everything is one
   size never computes it at all, because the fit is exactly 1.

   NOTHING SHRINKS. A trait larger than the canvas keeps the old guard and is
   drawn at native size rather than scaled down, which is what "dont shrink the
   sizes" asks for.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('pixelBlock') >= 0) throw new Error('already patched');

{
  const r = kit.run(doc.lines,
    l => l === 'function paintTrait(g,bm,ox,oy,W,H){',
    l => l === '}',
    'paintTrait',
    kit.inFunction(doc.lines, 'function paintTrait(g,bm,ox,oy,W,H){'));
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('const k=Math.max(1,Math.min(Math.floor(W/w),Math.floor(H/h)));') < 0)
    throw new Error('paintTrait is not the whole-number version this extends');

  kit.replace(doc.lines, r, [
    '/* The biggest block of identical pixels this bitmap is drawn on - 8 for art',
    '   on an 8px grid, 1 for anything with single-pixel detail.',
    '',
    '   Measured once per bitmap and remembered against it, and only ever asked',
    '   for when a fit comes out fractional. A collection where every trait is one',
    '   size has a fit of exactly 1 and never reaches this at all.',
    '',
    '   A WeakMap so a bitmap that is closed and dropped takes its answer with',
    '   it. */',
    'const blockCache=new WeakMap();',
    'function pixelBlock(bm){',
    '  const had=blockCache.get(bm);',
    '  if(had!==undefined) return had;',
    '  let n=1;',
    '  try{',
    '    const w=bm.width, h=bm.height;',
    '    const c=document.createElement("canvas");',
    '    c.width=w; c.height=h;',
    '    const g=c.getContext("2d",{willReadFrequently:true});',
    '    g.imageSmoothingEnabled=false;',
    '    g.drawImage(bm,0,0);',
    '    const d=g.getImageData(0,0,w,h).data;',
    '    const flat=(s)=>{',
    '      if(w%s||h%s) return false;',
    '      for(let by=0;by<h;by+=s) for(let bx=0;bx<w;bx+=s){',
    '        const i0=(by*w+bx)*4;',
    '        const r0=d[i0],g0=d[i0+1],b0=d[i0+2],a0=d[i0+3];',
    '        for(let y=by;y<by+s;y++) for(let x=bx;x<bx+s;x++){',
    '          const i=(y*w+x)*4;',
    '          if(d[i]!==r0||d[i+1]!==g0||d[i+2]!==b0||d[i+3]!==a0) return false;',
    '        }',
    '      }',
    '      return true;',
    '    };',
    '    /* Biggest first, and the first hit wins - a bitmap flat at 8 is flat at',
    '       4 and 2 as well, and the largest is the one that permits the most. */',
    '    for(const s of [64,32,16,10,8,5,4,2]) if(flat(s)){ n=s; break; }',
    '  }catch(_){ n=1; }',
    '  blockCache.set(bm,n);',
    '  return n;',
    '}',
    'function gcdOf(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ const t=a%b; a=b; b=t; } return a||1; }',
    'function paintTrait(g,bm,ox,oy,W,H){',
    '  const w=bm.width||W, h=bm.height||H;',
    '  /* Never below 1: a trait larger than the box would scale to 0 and vanish.',
    '     W and H are the max over the traits being painted, so this is a guard',
    '     against a caller passing a smaller box, not a case that happens here. */',
    '  const k=Math.max(1,Math.min(Math.floor(W/w),Math.floor(H/h)));',
    '  /* A FRACTIONAL FIT, BUT ONLY WHERE IT KEEPS EVERY BLOCK WHOLE.',
    '',
    '     The whole-number rule above went in for a measured reason, recorded in',
    '     tests/pixels.spec.js: a 48px source striped every 2px, stretched into a',
    '     160 box, comes out with stripes 3 and 4 pixels wide. Uneven pixel widths',
    '     are the one thing pixel art cannot survive.',
    '',
    '     What it could not see is the size of the blocks the art is drawn on.',
    '     Reduce the fit to p/q and a scale by p/q keeps every block whole exactly',
    '     when q divides the block. The striped source is 1px blocks against a fit',
    '     of 10/3, so nothing divides by 3 and it falls back here, unchanged. The',
    '     real case is a 1024 trait on the 1280 canvas a skin sets: 8px blocks',
    '     against 5/4, and 8 divides by 4, so every 8px cell becomes exactly 10',
    '     and nothing is split.',
    '',
    '     Measured on the collection this came from: 30 skins are 1280 on 8px',
    '     blocks (160 cells) and the newer traits are 1024 on 8px blocks (128',
    '     cells). 1280 is the smallest canvas where both land whole, which is why',
    '     the answer is to let the smaller one grow rather than to force a size',
    '     that makes 160 cells share 1024 pixels at 6.4 each.',
    '',
    '     Only when the fit is bigger than the whole number already found, so this',
    '     can only ever make a trait larger, never smaller. */',
    '  const fit=Math.min(W/w,H/h);',
    '  let use=k;',
    '  if(fit>k){',
    '    const num=Math.min(W,H), den=Math.min(w,h);',
    '    const q=den/gcdOf(num,den);',
    '    if(q>1 && pixelBlock(bm)%q===0) use=fit;',
    '  }',
    '  const dw=Math.round(w*use), dh=Math.round(h*use);',
    '  g.drawImage(bm,ox+Math.round((W-dw)/2),oy+Math.round((H-dh)/2),dw,dh);',
    '}',
  ]);
  console.log('ok  a trait grows to fit when every block stays whole');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  const pt = kit.inFunction(codeLines, 'function paintTrait(g,bm,ox,oy,W,H){');
  const p = codeLines.slice(pt.start, pt.end + 1).join('\n');
  /* The whole-number scale is still computed and is still the floor. */
  if (p.indexOf('const k=Math.max(1,Math.min(Math.floor(W/w),Math.floor(H/h)));') < 0)
    throw new Error('the whole-number rule was removed rather than extended');
  /* It can only ever grow: a trait bigger than the box is untouched. */
  if (p.indexOf('if(fit>k){') < 0)
    throw new Error('a fractional fit could shrink a trait, which was ruled out');
  /* The permission is the block, not the fraction. */
  if (p.indexOf('pixelBlock(bm)%q===0') < 0)
    throw new Error('a fractional scale is allowed without checking the block');
  /* Still centred. */
  if (p.indexOf('ox+Math.round((W-dw)/2)') < 0)
    throw new Error('the trait is no longer centred');

  const pb = kit.inFunction(codeLines, 'function pixelBlock(bm){');
  const b = codeLines.slice(pb.start, pb.end + 1).join('\n');
  if (b.indexOf('blockCache.get(bm)') < 0 || b.indexOf('blockCache.set(bm,n)') < 0)
    throw new Error('the block size is measured on every paint');
  /* A bitmap it cannot read must fall back to 1, which forbids every fraction. */
  if (b.indexOf('}catch(_){ n=1; }') < 0)
    throw new Error('a bitmap that cannot be read would permit a fractional scale');
  if (b.indexOf('const blockCache=new WeakMap();') >= 0)
    throw new Error('the cache is declared inside the function it caches for');
  if (code.indexOf('const blockCache=new WeakMap();') < 0)
    throw new Error('there is no cache');
});

/* RUN every case in tests/pixels.spec.js plus the one this exists for. */
{
  const gcdOf = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
  const scale = (w, W, block) => {
    const k = Math.max(1, Math.floor(W / w));
    const fit = W / w;
    if (fit > k) {
      const q = w / gcdOf(W, w);
      if (q > 1 && block % q === 0) return fit;
    }
    return k;
  };
  const cases = [
    ['striped 48 into 160, 1px detail', 48, 160, 1, 3],
    ['striped 48 into 96, already whole', 48, 96, 1, 2],
    ['160 into 160, native', 160, 160, 1, 1],
    ['200 into 160, bigger than the box', 200, 160, 1, 1],
    ['1024 trait into the 1280 a skin sets', 1024, 1280, 8, 1.25],
    ['1280 skin into 1280', 1280, 1280, 8, 1],
    ['1024 into 1024, uniform project', 1024, 1024, 8, 1],
    ['1254 into 1280, uneven source', 1254, 1280, 1, 1],
  ];
  let bad = 0;
  for (const [name, w, W, block, want] of cases) {
    const got = scale(w, W, block);
    if (got !== want) { bad++; console.log('BAD ' + name + ': ' + got + ' wanted ' + want); }
  }
  if (bad) throw new Error(bad + ' of ' + cases.length + ' cases wrong');
  /* And the property that makes it safe: it never shrinks. */
  for (const [, w, W, block] of cases)
    if (scale(w, W, block) * w < Math.min(w, W))
      throw new Error('a trait was shrunk below its native size');
  /* 1024 as a fixed canvas would have made the skin uneven - the reason it is
     not the answer. */
  if (1024 / 160 === Math.floor(1024 / 160))
    throw new Error('1024 divides by 160 after all, so the premise is wrong');
  console.log('    all ' + cases.length + ' cases agree, including the four in pixels.spec.js');
  console.log('    1024 trait on a 1280 canvas: 8px cells become exactly 10, nothing split');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
