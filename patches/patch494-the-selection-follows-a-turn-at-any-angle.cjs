/* THE SELECTION FOLLOWS A TURN AT ANY ANGLE.

   MEASURED. A 20x20 selection of 400 cells on a 40x60 trait, with Keep size
   on, turned 37 degrees:

     before   0,0 to 19,19
     after    0,0 to 19,19   - and the artwork is somewhere else entirely

   The mask is sized by the canvas and indexed by width, so it only gets reset
   when the canvas size changes - restoreImage does that, and its comment calls
   itself the one place every size change passes through. A free-angle turn with
   Keep size on comes back on the canvas it started on, so nothing fires and the
   selection stays exactly where it was drawn while everything under it moved.
   Delete inside it, or a fill, then hits artwork nobody chose.

   This has always been true. The half turn had the same gap for an hour this
   afternoon and was fixed by carrying the mask through the same permutation the
   pixels took; this is that, for the angles that sample instead of permute.

   ONE SAMPLING, TWO SUBJECTS. The mask is not transformed by a second copy of
   the rotation arithmetic - it is run through the SAME function the pixels go
   through, as an image whose alpha is the mask. Two copies of that loop would
   agree today and drift the first time somebody changes one, and "the selection
   is where the pixels are" is the entire property being defended. The loop that
   was inline in rotateFree becomes turnRGBA, called twice, so there is nothing
   to keep in step.

   THAT COVERS ROTXEL TOO, without knowing anything about it. Rotxel is a
   different map - it upscales, rotates and runs Scale3x edge rules - and any
   mask transform written against the nearest arithmetic would be silently wrong
   under it. Sending the mask through turnRGBA means whichever algorithm the
   pixels used is the one the selection used.

   AND THROUGH recanvas, when Keep size is on. The pixels are re-centred onto
   the original canvas by recanvas; the mask goes through the same call, so it
   lands where they did rather than where a second centring rule would put it.
   A selection turned entirely off the canvas comes back empty, and selSet
   already normalises an empty mask to no selection at all.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* selSet refuses a mask that is not the size of the canvas, which is what
   makes "after restoreImage" the only correct moment to hand it over. */
kit.only(L, l => l === "  if(m&&m.length!==art.width*art.height) throw new Error('a mask must be the size of the canvas');",
  'the selSet size guard');

/* ---- 1. the sampling becomes a function ------------------------- */

const INLINE = [
  '  let out;',
  '  if(alg==="rotxel") out=rotxelTurn(src,W,H,nw,nh,d);',
  '  else {',
  '  out=new Uint8ClampedArray(nw*nh*4);',
  '  const ocx=W/2, ocy=H/2, ncx=nw/2, ncy=nh/2;',
  '  for(let y=0;y<nh;y++) for(let x=0;x<nw;x++){',
  '    const dx=x+0.5-ncx, dy=y+0.5-ncy;',
  '    const sx=Math.floor(ocx+dx*c+dy*s), sy=Math.floor(ocy-dx*s+dy*c);',
  '    if(sx<0||sy<0||sx>=W||sy>=H) continue;',
  '    const a=(sy*W+sx)*4, b=(y*nw+x)*4;',
  '    out[b]=src[a]; out[b+1]=src[a+1]; out[b+2]=src[a+2]; out[b+3]=src[a+3];',
  '  }',
  '  }',
];
{
  /* SCOPED: "let out;" is three lines in this file. */
  const rf = kit.inFunction(L, 'function rotateFree(deg){');
  const start = kit.only(L, l => l === INLINE[0], 'the sampling block', rf);
  for (let i = 0; i < INLINE.length; i++)
    if (L[start + i] !== INLINE[i])
      throw new Error('the sampling block is not what this expects, at line '
        + (start + i + 1) + ':\n  want: ' + INLINE[i] + '\n  got:  ' + L[start + i]);
  kit.replace(L, { start: start, end: start + INLINE.length - 1 }, [
    '  let out=turnRGBA(src,W,H,nw,nh,d,alg);',
  ]);
}

/* Above rotateFree, beside the turns it serves. */
{
  const at = kit.only(L, l => l === 'function rotateFree(deg){', 'rotateFree');
  kit.replace(L, { start: at, end: at }, [
    '/* ONE SAMPLING, FOR THE PIXELS AND FOR THE SELECTION.',
    '',
    '   This loop was inline in rotateFree, where it had only one subject. The',
    '   mask has to land in exactly the places the pixels did or a selection',
    '   stops meaning the thing it was drawn around - so it is called twice',
    '   rather than copied, and there is nothing to keep in step.',
    '',
    '   The nearest arithmetic is untouched, to the character: each destination',
    '   pixel takes the one source pixel under it, so no colour is averaged into',
    '   existence. Rotxel stays the other branch, which is also why the mask goes',
    '   through here - it is a different map, and any mask transform written',
    '   against the arithmetic below would be silently wrong under it. */',
    'function turnRGBA(src,W,H,nw,nh,d,alg){',
    '  if(alg==="rotxel") return rotxelTurn(src,W,H,nw,nh,d);',
    '  const rad=d*Math.PI/180, c=Math.cos(rad), s=Math.sin(rad);',
    '  const out=new Uint8ClampedArray(nw*nh*4);',
    '  const ocx=W/2, ocy=H/2, ncx=nw/2, ncy=nh/2;',
    '  for(let y=0;y<nh;y++) for(let x=0;x<nw;x++){',
    '    const dx=x+0.5-ncx, dy=y+0.5-ncy;',
    '    const sx=Math.floor(ocx+dx*c+dy*s), sy=Math.floor(ocy-dx*s+dy*c);',
    '    if(sx<0||sy<0||sx>=W||sy>=H) continue;',
    '    const a=(sy*W+sx)*4, b=(y*nw+x)*4;',
    '    out[b]=src[a]; out[b+1]=src[a+1]; out[b+2]=src[a+2]; out[b+3]=src[a+3];',
    '  }',
    '  return out;',
    '}',
    '/* A MASK AS AN IMAGE, AND BACK. Alpha carries the selection because that is',
    '   what every step of a turn already preserves - the sampling copies it, and',
    '   recanvas centres on it. Nothing reads the colour channels. */',
    'function maskToRGBA(m,W,H){',
    '  const d=new Uint8ClampedArray(W*H*4);',
    '  for(let i=0;i<W*H;i++) if(m[i]) d[i*4+3]=255;',
    '  return d;',
    '}',
    'function rgbaToMask(d,W,H){',
    '  const m=new Uint8Array(W*H);',
    '  for(let i=0;i<W*H;i++) m[i]=d[i*4+3]?1:0;',
    '  return m;',
    '}',
    'function rotateFree(deg){',
  ]);
}

/* ---- 2. the mask takes the same journey ------------------------- */

{
  const rf = kit.inFunction(L, 'function rotateFree(deg){');
  const at = kit.only(L, l => l === '  snapshot();', 'the snapshot in rotateFree', rf);
  kit.replace(L, { start: at, end: at }, [
    '  /* THE SELECTION TAKES THE SAME JOURNEY, worked out before the canvas is',
    '     replaced because selMask is sized by the canvas it was drawn on.',
    '',
    '     Measured before this, 400 cells on a 40x60 turned 37 degrees with Keep',
    '     size on: the mask came back at 0,0 to 19,19, exactly where it started,',
    '     while the artwork under it had moved. The mask is only ever reset when',
    '     the canvas SIZE changes - restoreImage does that - and a turn that keeps',
    '     the canvas never gets there.',
    '',
    '     Through turnRGBA and recanvas, the same two calls the pixels made, so',
    '     the answer cannot drift from where they landed. */',
    '  let selNext=null;',
    '  if(selMask){',
    '    let mo=turnRGBA(maskToRGBA(selMask,W,H),W,H,nw,nh,d,alg);',
    '    if(keep&&(nw!==W||nh!==H)) mo=recanvas(mo,nw,nh,W,H);',
    '    selNext=rgbaToMask(mo,ow,oh);',
    '  }',
    '  snapshot();',
  ]);
}

{
  const rf = kit.inFunction(L, 'function rotateFree(deg){');
  const at = kit.only(L, l => l === '  restoreImage(new ImageData(out,ow,oh));',
    'the restore in rotateFree', rf);
  kit.replace(L, { start: at, end: at }, [
    '  restoreImage(new ImageData(out,ow,oh));',
    '  /* AFTER the canvas is settled: selSet refuses a mask that is not the size',
    '     of the canvas, and with Grow on the canvas only becomes ow by oh here.',
    '     A selection turned entirely off the canvas arrives empty, and selSet',
    '     normalises that to no selection rather than an empty one. */',
    '  if(selNext) selSet(selNext);',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('function turnRGBA(src,W,H,nw,nh,d,alg){');
  need('  let out=turnRGBA(src,W,H,nw,nh,d,alg);');
  need('    let mo=turnRGBA(maskToRGBA(selMask,W,H),W,H,nw,nh,d,alg);');
  need('  if(selNext) selSet(selNext);');

  const bodyOf = (sig) => {
    const a = codeLines.findIndex(l => l === sig);
    if (a < 0) throw new Error('no ' + sig);
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  };

  /* ONE COPY OF THE ARITHMETIC. The whole argument is that the pixels and the
     mask cannot diverge, which is only true while there is one loop. */
  const loops = codeLines.filter(l => l === '    const sx=Math.floor(ocx+dx*c+dy*s), sy=Math.floor(ocy-dx*s+dy*c);');
  if (loops.length !== 1)
    throw new Error('the sampling arithmetic appears ' + loops.length + ' times, expected 1');

  /* BOTH SUBJECTS GO THROUGH IT, and rotateFree itself no longer samples. */
  const rf = bodyOf('function rotateFree(deg){');
  const calls = rf.filter(l => /turnRGBA\(/.test(l));
  if (calls.length !== 2)
    throw new Error('rotateFree calls turnRGBA ' + calls.length + ' times, expected 2');
  if (rf.some(l => /Math\.floor\(ocx/.test(l)))
    throw new Error('rotateFree still samples inline');

  /* THE ORDER: the mask is read before snapshot (the canvas is about to be
     replaced) and handed over after restoreImage (selSet measures the live
     canvas). Either way round is silently wrong. */
  const read = rf.findIndex(l => /turnRGBA\(maskToRGBA/.test(l));
  const snap = rf.findIndex(l => l === '  snapshot();');
  const rest = rf.findIndex(l => /restoreImage\(new ImageData\(out,ow,oh\)\)/.test(l));
  const set = rf.findIndex(l => /if\(selNext\) selSet\(selNext\)/.test(l));
  if (!(read >= 0 && read < snap && snap < rest && rest < set))
    throw new Error('the mask is not read before the snapshot and set after the restore');

  /* recanvas on the mask only in the case the pixels get it. */
  const rc = rf.filter(l => /recanvas\(/.test(l));
  if (rc.length !== 2)
    throw new Error('recanvas is called ' + rc.length + ' times in rotateFree, expected 2');

  /* The two converters really do round-trip, run rather than read. */
  // eslint-disable-next-line no-new-func
  const f = new Function(code.slice(code.indexOf('function maskToRGBA(m,W,H){'),
    code.indexOf('function rotateFree(deg){'))
    + ' return {maskToRGBA:maskToRGBA, rgbaToMask:rgbaToMask};')();
  const m = new Uint8Array([0, 1, 1, 0, 0, 1]);
  const back = f.rgbaToMask(f.maskToRGBA(m, 3, 2), 3, 2);
  if (Array.from(back).join() !== Array.from(m).join())
    throw new Error('the mask does not survive the round trip: ' + Array.from(back).join());
});

fs.renameSync(TMP, FILE);
console.log('patch494 written, ' + grew + ' bytes');
