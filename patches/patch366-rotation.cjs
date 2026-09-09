/* PIXELORAMA'S ROTATION AND SCALE3X, BROUGHT ACROSS.

   Source: Pixelorama src/Autoload/DrawingAlgos.gd - similar_colors, scale_3x,
   nn_rotate, rotxel, transform_image_with_algorithm, and resize_image's
   SCALE3X branch - plus the two places that decide what those functions are
   handed: RotateImage.gd (_calculate_pivot, commit_action) and ScaleImage.gd.

   What was here: rotateFree samples nearest - each new pixel takes the one
   source pixel under its centre. That is KEPT, untouched, as "Nearest": the
   loop is byte for byte the old one and a check at the bottom refuses to
   write if it is not. "Rotxel" is Pixelorama's rotsprite-style turn: the
   same one-pixel sampling done in a 3x space, and then Scale3x's nine edge
   rules decide which neighbour fills the sub-cell that landed, so a diagonal
   edge comes out as a clean step rather than a jagged one. Scale3x itself is
   offered beside the 3x the grow presets already have.

   THE CANVAS IS NOT WHAT PIXELORAMA ROTATES. It turns an image in place and
   clips the corners; this editor grows the canvas to the turned bounding box
   so nothing is lost. So the artwork is padded to that box first - centred by
   the floor rule recanvas already uses - and rotxel runs on the padded image
   about its centre: Pixelorama's function, on a bigger input. The pivot is
   the one RotateImage.gd computes: half the size, and half a pixel less on
   an even side, because nn_rotate samples pixel x AT x rather than at x+0.5,
   so the middle of a 4-wide image is 1.5. The angle goes in NEGATED, which is
   what the dialog does - commit_action hands its algorithms the rotation of
   the INVERSE transform - so a positive number here turns clockwise, the same
   way the drag handle and the CSS preview already do.

   Every constant is Pixelorama's and each carries the reason it is what it
   is, in the comment beside it. The one deliberate departure - where a 3x
   block is written - is stated at scale3x with the reason.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

/* PB_INDEX lets this run against a copy - the live file is being served to a
   test run more often than not, and a patch that lands mid-run contaminates
   every test after it. */
const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the algorithms, before the turn code that uses them ------------- */
swap('/* A quarter turn. cw true is clockwise.', block([
  '/* ---- Pixelorama\'s rotation and Scale3x ------------------------------------',
  '',
  '   Ported from src/Autoload/DrawingAlgos.gd. PURE: bytes in, new bytes out,',
  '   nothing here touches ctx. The Godot originals write into the image while',
  '   reading from a copy of it; returning a fresh array is the same thing said',
  '   the other way round. */',
  '/* Godot\'s roundi rounds half AWAY from zero; Math.round takes -0.5 to -0.',
  '   The difference is one bounds check in rotxel, where a 3x-space coordinate',
  '   of -0.5 must fall outside the image and not land on column 0. */',
  'function pxRoundi(v){ return v<0 ? -Math.round(-v) : Math.round(v); }',
  '/* is_equal_approx: CMP_EPSILON 0.00001, scaled by the size of the number.',
  '   The guards nn_rotate and rotxel use to spot a whole turn, a half and a',
  '   quarter, which they then do exactly instead of sampling. */',
  'function pxEqApprox(a,b){ if(a===b) return true; return Math.abs(a-b)<Math.max(1e-5,1e-5*Math.abs(a)); }',
  '/* similar_colors. Pixelorama compares floats 0..1: its default 0.392157 is',
  '   100/255, and scale_3x passes 0.196078 for 50/255 - but 50/255 is',
  '   0.19607843, a hair ABOVE 0.196078, so a difference of exactly 50 is NOT',
  '   similar there while 49 is, and 100 IS similar under the default. Bytes',
  '   are compared against tol*255 so both edges land where Godot\'s do. */',
  'const PX_TOL=0.392157, PX_TOL_S3X=0.196078;',
  'function pxSimilar(d,i,j,tol){',
  '  const t=(tol===undefined?PX_TOL:tol)*255;',
  '  return Math.abs(d[i]-d[j])<=t && Math.abs(d[i+1]-d[j+1])<=t',
  '      && Math.abs(d[i+2]-d[j+2])<=t && Math.abs(d[i+3]-d[j+3])<=t;',
  '}',
  '/* RotateImage.gd\'s _calculate_pivot for the non-shader algorithms: half the',
  '   size, less half a pixel on an EVEN side. nn_rotate samples pixel x at x,',
  '   not at x+0.5, so the middle of a 4-wide image is 1.5; an odd side is left',
  '   at W/2 exactly as Pixelorama leaves it, half a pixel past its middle. */',
  'function pxPivot(W,H){ return {x:W/2-(W%2===0?0.5:0), y:H/2-(H%2===0?0.5:0)}; }',
  '/* Image.rotate_180, which nn_rotate and rotxel take at exactly PI - about',
  '   the image\'s own centre, whatever the pivot says. */',
  'function pxRotate180(src,W,H){',
  '  const out=new Uint8ClampedArray(W*H*4);',
  '  for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
  '    const s=((H-1-y)*W+(W-1-x))*4, o=(y*W+x)*4;',
  '    out[o]=src[s]; out[o+1]=src[s+1]; out[o+2]=src[s+2]; out[o+3]=src[s+3];',
  '  }',
  '  return out;',
  '}',
  '/* scale_3x. Each pixel becomes a 3x3 block; the eight outer cells take a',
  '   neighbour\'s colour where the edge rules say an edge continues through',
  '   them, and the pixel\'s own colour otherwise. Edges are read clamped, so a',
  '   border pixel\'s missing neighbour is itself. The rules and the tolerance',
  '   are Pixelorama\'s, letter for letter.',
  '',
  '   ONE DEPARTURE, stated: Pixelorama writes pixel x\'s block to columns',
  '   3x-1..3x+1 (rows likewise), which leaves the last column and row of the',
  '   result blank and writes column 0 twice. rotxel in the same file indexes',
  '   the block from its top-left as col+3*row - that is 3x..3x+2 - and that is',
  '   what is used here, so the block sits where the pixel is and a 3x upscale',
  '   is a whole picture. */',
  'function scale3x(src,W,H,tol){',
  '  if(tol===undefined) tol=PX_TOL_S3X;',
  '  const nw=W*3, out=new Uint8ClampedArray(nw*H*3*4), wm=W-1, hm=H-1;',
  '  const at=(x,y)=>(y*W+x)*4, sim=(i,j)=>pxSimilar(src,i,j,tol);',
  '  const put=(x,y,i)=>{ const o=(y*nw+x)*4; out[o]=src[i]; out[o+1]=src[i+1]; out[o+2]=src[i+2]; out[o+3]=src[i+3]; };',
  '  for(let x=0;x<W;x++) for(let y=0;y<H;y++){',
  '    const xs=3*x, ys=3*y, xl=Math.max(x-1,0), xr=Math.min(x+1,wm), yu=Math.max(y-1,0), yd=Math.min(y+1,hm);',
  '    const a=at(xl,yu), b=at(x,yu), c=at(xr,yu), d=at(xl,y), e=at(x,y), f=at(xr,y), g=at(xl,yd), h=at(x,yd), i=at(xr,yd);',
  '    const db=sim(d,b), dh=sim(d,h), bf=sim(f,b), ec=sim(e,c), ea=sim(e,a), fh=sim(f,h), eg=sim(e,g), ei=sim(e,i);',
  '    put(xs,  ys,   (db&&!dh&&!bf)?d:e);',
  '    put(xs+1,ys,   ((db&&!dh&&!bf&&!ec)||(bf&&!db&&!fh&&!ea))?b:e);',
  '    put(xs+2,ys,   (bf&&!db&&!fh)?f:e);',
  '    put(xs,  ys+1, ((dh&&!fh&&!db&&!ea)||(db&&!dh&&!bf&&!eg))?d:e);',
  '    put(xs+1,ys+1, e);',
  '    put(xs+2,ys+1, ((bf&&!db&&!fh&&!ei)||(fh&&!bf&&!dh&&!ec))?f:e);',
  '    put(xs,  ys+2, (dh&&!fh&&!db)?d:e);',
  '    put(xs+1,ys+2, ((fh&&!bf&&!dh&&!eg)||(dh&&!fh&&!db&&!ei))?h:e);',
  '    put(xs+2,ys+2, (fh&&!bf&&!dh)?f:e);',
  '  }',
  '  return out;',
  '}',
  '/* nn_rotate. Each new pixel takes the source pixel its position turns back',
  '   onto - the pixel\'s integer corner, truncated - and is transparent where',
  '   that lands outside. The bounds test is on the FLOAT, as in Godot, so a',
  '   sample at -0.3 is outside even though truncating it would give 0. */',
  'function nnRotate(src,W,H,angle,pivot){',
  '  if(Math.abs(angle)<1e-5||pxEqApprox(angle,2*Math.PI)) return new Uint8ClampedArray(src);',
  '  if(pxEqApprox(angle,Math.PI)) return pxRotate180(src,W,H);',
  '  const s=Math.sin(angle), c=Math.cos(angle), out=new Uint8ClampedArray(W*H*4);',
  '  for(let x=0;x<W;x++) for(let y=0;y<H;y++){',
  '    const ox=(x-pivot.x)*c-(y-pivot.y)*s+pivot.x, oy=(x-pivot.x)*s+(y-pivot.y)*c+pivot.y;',
  '    if(!(ox>=0&&ox<W&&oy>=0&&oy<H)) continue;',
  '    const i=((oy|0)*W+(ox|0))*4, o=(y*W+x)*4;',
  '    out[o]=src[i]; out[o+1]=src[i+1]; out[o+2]=src[i+2]; out[o+3]=src[i+3];',
  '  }',
  '  return out;',
  '}',
  '/* rotxel. For each new pixel, the nine sub-cells around its position in a',
  '   3x space are turned back one at a time - top-left first, as Pixelorama',
  '   orders them - until one lands inside the source; that sub-cell\'s index',
  '   picks one of Scale3x\'s nine rules, applied to the 3x3 neighbourhood of',
  '   the source pixel it landed in. A border source pixel is copied plain.',
  '   Every number is Pixelorama\'s: the +1 that centres on a block\'s middle',
  '   cell, the extra +1 on BOTH axes when the WIDTH is odd (the height is not',
  '   consulted, as in the original), and the default tolerance rather than',
  '   scale_3x\'s tighter one. A pixel no sub-cell can reach is transparent. */',
  'function rotxel(src,W,H,angle,pivot){',
  '  if(Math.abs(angle)<1e-5||pxEqApprox(angle,2*Math.PI)) return new Uint8ClampedArray(src);',
  '  if(pxEqApprox(angle,Math.PI/2)||pxEqApprox(angle,3*Math.PI/2)) return nnRotate(src,W,H,angle,pivot);',
  '  if(pxEqApprox(angle,Math.PI)) return pxRotate180(src,W,H);',
  '  const out=new Uint8ClampedArray(W*H*4), W3=W*3, H3=H*3, odd=W%2!==0;',
  '  const at=(x,y)=>(y*W+x)*4, sim=(i,j)=>pxSimilar(src,i,j);',
  '  for(let x=0;x<W;x++) for(let y=0;y<H;y++){',
  '    const dx=3*(x-pivot.x), dy=3*(y-pivot.y);',
  '    let ox=0, oy=0, found=false;',
  '    for(let k=0;k<9;k++){',
  '      const modk=-1+k%3, divk=-1+((k/3)|0);',
  '      const dir=Math.atan2(dy+divk,dx+modk)+angle;',
  '      const mag=Math.sqrt(Math.pow(dx+modk,2)+Math.pow(dy+divk,2));',
  '      ox=pxRoundi(pivot.x*3+1+mag*Math.cos(dir));',
  '      oy=pxRoundi(pivot.y*3+1+mag*Math.sin(dir));',
  '      if(odd){ ox+=1; oy+=1; }',
  '      if(ox>=0&&ox<W3&&oy>=0&&oy<H3){ found=true; break; }',
  '    }',
  '    if(!found) continue;',
  '    const index=(ox%3)+3*(oy%3);',
  '    ox=pxRoundi((ox-1)/3); oy=pxRoundi((oy-1)/3);',
  '    let p;',
  '    if(ox===0||ox===W-1||oy===0||oy===H-1) p=at(ox,oy);',
  '    else {',
  '      const a=at(ox-1,oy-1), b=at(ox,oy-1), c=at(ox+1,oy-1), d=at(ox-1,oy), e=at(ox,oy), f=at(ox+1,oy), g=at(ox-1,oy+1), h=at(ox,oy+1), i=at(ox+1,oy+1);',
  '      const db=sim(d,b), dh=sim(d,h), bf=sim(b,f), ec=sim(e,c), ea=sim(e,a), fh=sim(f,h), eg=sim(e,g), ei=sim(e,i);',
  '      switch(index){',
  '        case 0: p=(db&&!dh&&!bf)?d:e; break;',
  '        case 1: p=((db&&!dh&&!bf&&!ec)||(bf&&!db&&!fh&&!ea))?b:e; break;',
  '        case 2: p=(bf&&!db&&!fh)?f:e; break;',
  '        case 3: p=((dh&&!fh&&!db&&!ea)||(db&&!dh&&!bf&&!eg))?d:e; break;',
  '        case 4: p=e; break;',
  '        case 5: p=((bf&&!db&&!fh&&!ei)||(fh&&!bf&&!dh&&!ec))?f:e; break;',
  '        case 6: p=(dh&&!fh&&!db)?d:e; break;',
  '        case 7: p=((fh&&!bf&&!dh&&!eg)||(dh&&!fh&&!db&&!ei))?h:e; break;',
  '        default: p=(fh&&!bf&&!dh)?f:e;',
  '      }',
  '    }',
  '    const o=(y*W+x)*4;',
  '    out[o]=src[p]; out[o+1]=src[p+1]; out[o+2]=src[p+2]; out[o+3]=src[p+3];',
  '  }',
  '  return out;',
  '}',
  '/* transform_image_with_algorithm, for the two algorithms that are plain',
  '   code. The shader ones - Rotxel with Smear, cleanEdge, OmniScale, the',
  '   shader nearest - need a GPU pass this page does not have, and URD is the',
  '   three pieces above composed and was not asked for. The pivot defaults to',
  '   the dialog\'s rule, because the dialog is the only caller that reaches',
  '   these two in Pixelorama and it always passes its own. */',
  'function pxTurn(src,W,H,angle,alg,pivot){',
  '  pivot=pivot||pxPivot(W,H);',
  '  if(alg==="rotxel") return rotxel(src,W,H,angle,pivot);',
  '  if(alg==="nn") return nnRotate(src,W,H,angle,pivot);',
  '  throw new Error("no turn called "+alg);',
  '}',
  '/* Nearest to any size, both directions: Godot\'s Image.resize with',
  '   INTERPOLATE_NEAREST, source x = floor(x*W/nw), which is what resize_image',
  '   finishes a Scale3x with. scaleArt\'s grow is this same formula; its shrink',
  '   is a different animal and is deliberately not used after a 3x pass. */',
  'function pxNearest(src,W,H,nw,nh){',
  '  const out=new Uint8ClampedArray(nw*nh*4);',
  '  for(let y=0;y<nh;y++){ const sy=Math.min(H-1,Math.floor(y*H/nh));',
  '    for(let x=0;x<nw;x++){ const s=(sy*W+Math.min(W-1,Math.floor(x*W/nw)))*4, o=(y*nw+x)*4;',
  '      out[o]=src[s]; out[o+1]=src[s+1]; out[o+2]=src[s+2]; out[o+3]=src[s+3]; } }',
  '  return out;',
  '}',
  '/* What an Art-mode grow with the Scale3x chip will do, or null when the',
  '   chip is off, the resize is not a grow, or nothing changes. resize_image',
  '   counts its passes as ceil(target/(3*size)) - which is NINE passes for',
  '   160 to 4096 and a three-billion-pixel image on the way; the number it',
  '   needs is "as many times three as it takes to reach the target", which is',
  '   what the loop counts. fits refuses a step this page cannot allocate. */',
  'const S3X_CELLS=48e6;',
  'function scale3xPlan(W,H,nw,nh){',
  '  if(typeof chipVal!=="function"||chipVal("rsalg")!=="scale3x") return null;',
  '  if(nw<W||nh<H||(nw===W&&nh===H)) return null;',
  '  let times=0, w=W, h=H;',
  '  while(w<nw||h<nh){ times++; w*=3; h*=3; }',
  '  return {times, w, h, fits:w*h<=S3X_CELLS};',
  '}',
  '/* resize_image\'s SCALE3X branch: scale by three as often as the plan says,',
  '   then nearest to the exact size. At exactly 3x that is one pass and no',
  '   resample, which is the case the preset offers. */',
  'function scale3xTo(src,W,H,nw,nh,plan){',
  '  let d=src, w=W, h=H;',
  '  for(let j=0;j<plan.times;j++){ d=scale3x(d,w,h); w*=3; h*=3; }',
  '  return (w===nw&&h===nh) ? d : pxNearest(d,w,h,nw,nh);',
  '}',
  '/* Which sampling a free turn uses - the chip in the Transform panel. */',
  'function rotAlg(){ return (typeof chipVal==="function"&&chipVal("rotalg")==="rotxel") ? "rotxel" : "nearest"; }',
  '/* Rotxel on this editor\'s terms. The canvas grows to the turned bounding',
  '   box so nothing is clipped, so the artwork is centred on a transparent',
  '   canvas of that size first - recanvas\'s own floor rule, so a turn and the',
  '   resize beside it agree about where the middle is - and Pixelorama\'s',
  '   rotxel runs on that, about the pivot its dialog would give it. The angle',
  '   is negated because the dialog hands its algorithms the INVERSE',
  '   transform\'s rotation: a positive number turns clockwise here, the way the',
  '   drag handle and the CSS preview already do. */',
  'function rotxelTurn(src,W,H,nw,nh,deg){',
  '  return rotxel(recanvas(src,W,H,nw,nh),nw,nh,-deg*Math.PI/180,pxPivot(nw,nh));',
  '}',
  '',
  '/* A quarter turn. cw true is clockwise.',
]));

/* ---- 2. rotateFree chooses, and the Nearest loop is the old one ---------- */
swap('  if(Math.abs(d-90)<0.05){ rotateQuarter(true); return; }',
  '  if(Math.abs(d-90)<0.05){ rotateQuarter(true); return true; }');
swap('  if(Math.abs(d-270)<0.05){ rotateQuarter(false); return; }',
  '  if(Math.abs(d-270)<0.05){ rotateQuarter(false); return true; }');
swap('  if(Math.abs(d-180)<0.05){ rotateQuarter(true); rotateQuarter(true); return; }',
  '  if(Math.abs(d-180)<0.05){ rotateQuarter(true); rotateQuarter(true); return true; }');
swap(block([
  '  const src=ctx.getImageData(0,0,W,H).data;',
  '  const out=new Uint8ClampedArray(nw*nh*4);',
  '  const ocx=W/2, ocy=H/2, ncx=nw/2, ncy=nh/2;',
]), block([
  '  const src=ctx.getImageData(0,0,W,H).data;',
  '  /* THE CHOICE. Rotxel is Pixelorama\'s and lives above; Nearest is the loop',
  '     below, exactly as it always was, so nobody\'s turns change under them. */',
  '  const alg=rotAlg();',
  '  let out;',
  '  if(alg==="rotxel") out=rotxelTurn(src,W,H,nw,nh,d);',
  '  else {',
  '  out=new Uint8ClampedArray(nw*nh*4);',
  '  const ocx=W/2, ocy=H/2, ncx=nw/2, ncy=nh/2;',
]));
swap(block([
  '    out[b]=src[a]; out[b+1]=src[a+1]; out[b+2]=src[a+2]; out[b+3]=src[a+3];',
  '  }',
  '  snapshot();',
  '  restoreImage(new ImageData(out,nw,nh));',
  '  refreshStats(); fitZoom(); resizeBoxes();',
]), block([
  '    out[b]=src[a]; out[b+1]=src[a+1]; out[b+2]=src[a+2]; out[b+3]=src[a+3];',
  '  }',
  '  }',
  '  snapshot();',
  '  restoreImage(new ImageData(out,nw,nh));',
  '  refreshStats(); fitZoom(); resizeBoxes();',
]));
swap(block([
  '  toast("Turned "+d.toFixed(1)+String.fromCharCode(176)+" - now "+nw+" by "+nh);',
  '}',
]), block([
  '  toast("Turned "+d.toFixed(1)+String.fromCharCode(176)+" - now "+nw+" by "+nh+(alg==="rotxel"?" with Rotxel":""));',
  '  return true;',
  '}',
]));

/* ---- 3. the panel: a typed angle, the sampling choice, the grow choice --- */
swap('      <div class="olrow" style="margin-top:8px"><label for="rsw">Size</label>', block([
  '      <div class="olrow" style="margin-top:8px"><label for="rotdeg">Turn by</label>',
  '        <input id="rotdeg" type="number" min="-360" max="360" step="0.1" value="0" style="width:64px"',
  '          title="Degrees, clockwise. Shown on the art while you type; Turn commits it. The round handle above the box on the canvas is the same turn, by dragging.">',
  '        <div class="chips" id="rotalg" role="group" aria-label="How a turn samples the pixels">',
  '          <button type="button" data-v="nearest" aria-pressed="true"',
  '            title="Each new pixel takes the one source pixel under it. The way turns have always worked here, and still the default.">Nearest</button>',
  '          <button type="button" data-v="rotxel" aria-pressed="false"',
  '            title="Pixelorama\'s Rotxel. The same one-pixel sampling done at three times the resolution, then Scale3x\'s edge rules pick which neighbour fills each step, so a diagonal comes out as a clean stair. No colour is invented: every pixel is one the art already had.">Rotxel</button>',
  '        </div>',
  '        <button class="btn ghost" id="rotgo" style="width:auto;padding:4px 9px;font-size:12px"',
  '          title="Turn the art by the angle. A quarter turn is exact; anything else grows the canvas to fit and samples the way the choice beside it says. One undo step.">Turn</button></div>',
  '      <div class="olrow" style="margin-top:8px"><label for="rsw">Size</label>',
]));
swap(block([
  '      <div class="olrow"><label for="rspreset">Jump to</label>',
  '        <select id="rspreset" style="flex:1"></select></div>',
]), block([
  '      <div class="olrow"><label for="rspreset">Jump to</label>',
  '        <select id="rspreset" style="flex:1"></select></div>',
  '      <div class="olrow"><label for="rsalg">Growing</label>',
  '        <div class="chips" id="rsalg" role="group" aria-label="How the art is enlarged">',
  '          <button type="button" data-v="blocks" aria-pressed="true"',
  '            title="Every pixel becomes a block of its own colour. Exact at a whole multiple.">Blocks</button>',
  '          <button type="button" data-v="scale3x" aria-pressed="false"',
  '            title="Pixelorama\'s Scale3x. Every pixel becomes a 3x3 block whose corners take a neighbour\'s colour where an edge runs through them, so a diagonal comes out as a line rather than a staircase. Made for exactly 3x, which the Jump to list offers; past that it scales by three as often as it takes and then picks the nearest pixel down to the size asked for. Art mode, growing only.">Scale3x</button>',
  '        </div></div>',
]));
swap('for(const id of ["rsmode","tstatus","txalign"]){', 'for(const id of ["rsmode","tstatus","txalign","rotalg","rsalg"]){');
swap('  if(g) g.onclick=e=>{ const b=e.target.closest("button[data-v]"); if(b){ setChip(id,b.dataset.v); if(id==="rsmode") resizeBoxes(); if(id==="txalign") textBuild(); } };',
  '  if(g) g.onclick=e=>{ const b=e.target.closest("button[data-v]"); if(b){ setChip(id,b.dataset.v); if(id==="rsmode") resizeBoxes(); if(id==="txalign") textBuild(); if(id==="rsalg") resizePreview(); } };');

/* ---- 4. the preset, and what choosing it does --------------------------- */
swap('  if([...sel.options].some(o=>o.value===keep)) sel.value=keep;', block([
  '  /* PIXELORAMA\'S SCALE3X, beside the 3x the ladder already offers. Its',
  '     value is a word, not a size: choosing it fills both boxes with three',
  '     times the canvas AND sets the Growing chip, because a preset that set',
  '     the size and left the method for you to remember would be two',
  '     controls disguised as one. Only where three times fits the ceiling. */',
  '  if(typeof ctx!=="undefined"&&ctx&&art&&art.width*3<=MAX_SIDE&&art.height*3<=MAX_SIDE){',
  '    const o=document.createElement("option");',
  '    o.value="s3x"; o.textContent=(art.width*3)+" \\u00d7 "+(art.height*3)+" (3\\u00d7 Scale3x)";',
  '    sel.appendChild(o);',
  '  }',
  '  if([...sel.options].some(o=>o.value===keep)) sel.value=keep;',
]));
swap(block([
  "$('rspreset').addEventListener('change',()=>{",
  "  const v=$('rspreset').value; if(!v) return;",
  "  $('rsw').value=v;",
]), block([
  "$('rspreset').addEventListener('change',()=>{",
  "  const v=$('rspreset').value; if(!v) return;",
  '  /* The Scale3x preset: Art mode, both boxes whatever keep-shape says -',
  '     three times the canvas is three times both sides - and the Growing',
  '     chip with them. The input events run the mirrors and the note. */',
  '  if(v==="s3x"){',
  '    setChip("rsmode","art"); setChip("rsalg","scale3x");',
  "    $('rsw').value=art.width*3; $('rsh').value=art.height*3;",
  "    $('rsw').dispatchEvent(new Event('input',{bubbles:true}));",
  "    $('rsh').value=art.height*3;",
  "    $('rsh').dispatchEvent(new Event('input',{bubbles:true}));",
  '    return;',
  '  }',
  "  $('rsw').value=v;",
]));

/* ---- 5. the resize picks the scaler in the one place that picks ---------- */
swap('  return {data:scaleArt(src,W,H,nw,nh), w:nw, h:nh, lost:0};', block([
  '  /* Scale3x when the chip asks for it and the plan fits; Blocks otherwise.',
  '     Here and not in the callers, so the button and the drag handles cannot',
  '     disagree about what the chip means. */',
  '  const plan=scale3xPlan(W,H,nw,nh);',
  '  if(plan&&plan.fits) return {data:scale3xTo(src,W,H,nw,nh,plan), w:nw, h:nh, lost:0, alg:"scale3x"};',
  '  return {data:scaleArt(src,W,H,nw,nh), w:nw, h:nh, lost:0, alg:"blocks"};',
]));
swap('      : "Resized to "+nw+" by "+nh);', '      : "Resized to "+nw+" by "+nh+(r.alg==="scale3x"?" with Scale3x":""));');
swap('  return { cut: r.lost===null ? croppedAway(src,r.data) : r.lost };',
  '  return { cut: r.lost===null ? croppedAway(src,r.data) : r.lost, alg: r.alg };');
swap('        : "Resized to "+art.width+" by "+art.height+cropLine(done.cut)); }',
  '        : "Resized to "+art.width+" by "+art.height+(done.alg==="scale3x"?" with Scale3x":"")+cropLine(done.cut)); }');
/* The note under the button says which scaler, before the press. */
swap('  if(Number.isInteger(k)) return "  \\u00b7  \\u00d7"+k+" exactly: every pixel becomes "+k+"\\u00d7"+k;', block([
  '  /* Said before the press, like the snap. A chip three rows up that changed',
  '     what the button does without the note mentioning it would be the resize',
  '     complaint all over again. */',
  '  const plan=scale3xPlan(art.width,art.height,t.nw,t.nh);',
  '  const s3 = !plan ? "" : plan.fits',
  '    ? "  \\u00b7  Scale3x, "+plan.times+" pass"+(plan.times===1?"":"es")+((plan.w===t.nw&&plan.h===t.nh)?"":", then nearest to size")',
  '    : "  \\u00b7  too far for Scale3x in one go, so Blocks";',
  '  if(Number.isInteger(k)) return "  \\u00b7  \\u00d7"+k+" exactly: every pixel becomes "+k+"\\u00d7"+k+s3;',
]));
{
  /* growNote's other return has to carry the same note. It is the last line
     of the function, found by its shape rather than quoted in full. */
  const lines = text.split(NL);
  const r = kit.inFunction(lines, 'function growNote(t){');
  /* The whole line, indentation included. An earlier draft tested
     indexOf(...)===0 against a line that starts with four spaces and was
     refused with "found 0" - the right refusal, for a wrong anchor. */
  const at = kit.only(lines, l => l === '    +(near.length?"  \\u00b7  whole multiples near it: "+near.join(", "):"");', 'the uneven-grow sentence', r);
  lines[at] = '    +(near.length?"  \\u00b7  whole multiples near it: "+near.join(", "):"")+s3;';
  text = lines.join(NL);
}

/* ---- 6. wiring: the typed angle, the Turn button, the panel closing ------ */
swap("$('rotr').onclick=()=>rotateQuarter(true);", block([
  "$('rotr').onclick=()=>rotateQuarter(true);",
  '/* A typed angle previews with the same CSS turn the drag uses - nothing',
  '   is sampled until Turn - and commits through rotateFree, so the button,',
  '   the drag handle and PB.rotate cannot disagree about what a turn is. The',
  '   field goes back to 0 afterwards: the pixels now hold the turn, and a',
  '   preview of thirty more on top of them would be a second turn nobody',
  '   asked for. */',
  "$('rotdeg').addEventListener('input',()=>{ if(ctx) frameTurn(+$('rotdeg').value||0); });",
  "$('rotgo').onclick=()=>{",
  "  const v=+$('rotdeg').value||0;",
  "  frameTurn(0); $('rotdeg').value=0;",
  '  if(!ctx) return;',
  '  if(!rotateFree(v)) toast("A turn of 0 changes nothing");',
  '};',
]));
swap('  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }', block([
  '  if(on&&id==="tf"){ try{ resizeBoxes(); }catch(_){ } }',
  '  /* A panel that closes with an angle typed takes its preview down and',
  '     zeroes the number, or the frame shows a turn the pixels never got. */',
  '  if(!on&&id==="tf"){ try{ frameTurn(0); const r=$("rotdeg"); if(r) r.value=0; }catch(_){ } }',
]));

/* ---- 7. the agent surface ---------------------------------------------- */
swap('PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };', block([
  '/* A turn and a Scale3x for something without a pointer. Both set the chip',
  '   a person would press and then call the function the Turn button and the',
  '   drag handle call, so what an agent gets is what the panel would show. */',
  'const ROT_ALGS=["nearest","rotxel"];',
  'PB.turns=function(){ return ROT_ALGS.slice(); };',
  'PB.rotate=function(deg,alg){',
  '  if(!ctx) return {ok:false, why:"nothing is open"};',
  '  if(alg!==undefined){ if(ROT_ALGS.indexOf(alg)<0) return {ok:false, why:"no turn called "+alg}; setChip("rotalg",alg); }',
  '  const turned=!!rotateFree(+deg||0);',
  '  return {ok:true, deg:+deg||0, alg:rotAlg(), turned, w:art.width, h:art.height};',
  '};',
  'PB.scale3x=function(apply){',
  '  if(!ctx) return {ok:false, why:"nothing is open"};',
  '  railPanel("tf",true);',
  '  const s=$("rspreset");',
  '  if(![...s.options].some(o=>o.value==="s3x")) return {ok:false, why:"three times "+art.width+" by "+art.height+" is past the "+MAX_SIDE+" ceiling"};',
  '  s.value="s3x"; s.dispatchEvent(new Event("change",{bubbles:true}));',
  '  const was=art.width+"x"+art.height;',
  '  if(apply) applyResize();',
  '  return {ok:true, applied:!!apply, was, w:art.width, h:art.height, alg:chipVal("rsalg")};',
  '};',
  'PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const markup = text.slice(0, text.indexOf('<script'));

/* EVERY NEW CONTROL EXISTS ONCE, inside the Transform card, with a title. */
for (const id of ['rotdeg', 'rotalg', 'rotgo', 'rsalg'])
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
{
  const a = markup.indexOf('<div class="scrim pop" id="tfscrim"');
  const b = markup.indexOf('<div class="scrim pop" id="blscrim"');
  if (a < 0 || b < 0 || b < a) throw new Error('could not bound the transform card');
  const card = markup.slice(a, b);
  for (const id of ['rotdeg', 'rotalg', 'rotgo', 'rsalg'])
    if (card.indexOf('id="' + id + '"') < 0) throw new Error(id + ' did not land in the transform card');
  for (const id of ['rotdeg', 'rotgo'])
    if (!new RegExp('id="' + id + '"[^>]*title="').test(card.replace(/\r?\n\s*/g, ' '))) throw new Error(id + ' has no title');
  for (const v of ['nearest', 'rotxel', 'blocks', 'scale3x'])
    if (!new RegExp('data-v="' + v + '"[^>]*title="').test(card.replace(/\r?\n\s*/g, ' '))) throw new Error('chip ' + v + ' has no title');
  if (card.indexOf('id="tfclose"') < 0) throw new Error('the card lost its Close button');
}

/* THE NEAREST LOOP IS THE OLD ONE. Not a claim: the sampling lines are
   quoted here and must still be inside rotateFree, under the else. */
{
  const lines = kit.lines(code);
  const r = kit.inFunction(lines, 'function rotateFree(deg){');
  const body = lines.slice(r.start, r.end + 1);
  for (const must of [
    '    const dx=x+0.5-ncx, dy=y+0.5-ncy;',
    '    const sx=Math.floor(ocx+dx*c+dy*s), sy=Math.floor(ocy-dx*s+dy*c);',
    '    if(sx<0||sy<0||sx>=W||sy>=H) continue;',
    '  const ocx=W/2, ocy=H/2, ncx=nw/2, ncy=nh/2;',
  ]) if (body.indexOf(must) < 0) throw new Error('the nearest loop changed: ' + must.trim());
  const ia = body.findIndex(l => l === '  const alg=rotAlg();');
  const ib = body.findIndex(l => l === '  if(alg==="rotxel") out=rotxelTurn(src,W,H,nw,nh,d);');
  const ic = body.findIndex(l => l === '  snapshot();');
  const id = body.findIndex(l => l === '  restoreImage(new ImageData(out,nw,nh));');
  if (!(ia > 0 && ib === ia + 2 && ic > ib && id === ic + 1)) throw new Error('rotateFree does not choose, then snapshot, then restore');
  if (body.filter(l => l === '  snapshot();').length !== 1) throw new Error('rotateFree must snapshot exactly once');
  if (body[body.length - 2] !== '  return true;') throw new Error('rotateFree does not say it turned');
}

/* THE ALGORITHMS ARE PURE. The block between its banner and rotAlg never
   names ctx, art, the DOM or a snapshot. */
{
  const a = code.indexOf('function pxRoundi(v){');
  const b = code.indexOf('function rotAlg(){');
  if (a < 0 || b < 0 || b < a) throw new Error('could not bound the ported algorithms');
  const pure = code.slice(a, b);
  for (const bad of ['ctx', 'art.', 'document', 'snapshot', 'toast', '$('])
    if (pure.indexOf(bad) >= 0) throw new Error('the ported algorithms reach outside: ' + bad);
  for (const fn of ['function pxSimilar(', 'function pxPivot(', 'function pxRotate180(', 'function scale3x(',
    'function nnRotate(', 'function rotxel(', 'function pxTurn(', 'function pxNearest(', 'function scale3xPlan(', 'function scale3xTo('])
    if (pure.indexOf(fn) < 0) throw new Error('missing: ' + fn);
  if (pure.indexOf('const PX_TOL=0.392157, PX_TOL_S3X=0.196078;') < 0) throw new Error("Pixelorama's tolerances are not the ones written");
  if (pure.indexOf('put(xs+2,ys+2,') < 0 || pure.indexOf('put(xs,  ys,') < 0) throw new Error('scale3x does not write a block at 3x..3x+2');
  if (pure.indexOf('if(odd){ ox+=1; oy+=1; }') < 0) throw new Error("rotxel lost Pixelorama's odd-width shift");
  if (pure.indexOf('const index=(ox%3)+3*(oy%3);') < 0) throw new Error('rotxel lost the sub-cell index');

  /* AND THEY COMPUTE WHAT THE GDSCRIPT SAYS. Two cases worked by hand from
     DrawingAlgos.gd - the rules applied on paper, not the code run twice -
     and the functions are sliced out of the page and run on them here, so
     a port that drifted refuses to write itself. */
  // eslint-disable-next-line no-new-func
  const fns = new Function(pure + '; return {scale3x, rotxel, nnRotate, pxPivot, pxSimilar, PX_TOL, PX_TOL_S3X};')();
  const K = [0, 0, 0, 255], Wt = [255, 255, 255, 255];
  const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4); return d; };
  /* A 2x2 diagonal - black at (0,0) and (1,1). Every sub-cell below was
     derived from the nine rules with the clamped neighbourhoods; see
     REPORT.md for the working. */
  const diag = img(2, 2, (x, y) => (x === y ? K : Wt));
  const want6 = ['KKKWWW', 'KKWKWW', 'KWWKKW', 'WKKWWK', 'WWKWKK', 'WWWKKK'];
  const got6 = fns.scale3x(diag, 2, 2);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    const o = (y * 6 + x) * 4, want = want6[y][x] === 'K' ? K : Wt;
    for (let k = 0; k < 4; k++) if (got6[o + k] !== want[k]) throw new Error('scale3x: cell ' + x + ',' + y + ' is not what the rules give');
  }
  /* Nine mutually dissimilar colours on a 3x3 - every pair differs by at
     least 127 in R or B, past the 100 that similar_colors allows - turned a
     quarter of a right angle clockwise, angle -PI/4 as the dialog would pass
     it, pivot (1.5,1.5) from _calculate_pivot. dest -> source, by hand. */
  const nine = img(3, 3, (x, y) => [[0, 128, 255][x], 0, [0, 128, 255][y], 255]);
  const srcAt = (x, y) => [[0, 128, 255][x], 0, [0, 128, 255][y], 255];
  const T = [0, 0, 0, 0];
  const wantRx = [[srcAt(0, 1), srcAt(0, 1), srcAt(1, 0)], [srcAt(0, 2), srcAt(1, 2), srcAt(1, 1)], [T, srcAt(2, 2), srcAt(2, 2)]];
  const wantNn = [[T, srcAt(0, 0), srcAt(0, 0)], [srcAt(0, 2), srcAt(0, 1), srcAt(1, 0)], [srcAt(0, 2), srcAt(1, 2), srcAt(2, 1)]];
  const piv = fns.pxPivot(3, 3);
  if (piv.x !== 1.5 || piv.y !== 1.5) throw new Error('pxPivot(3,3) is not 1.5,1.5');
  const gotRx = fns.rotxel(nine, 3, 3, -Math.PI / 4, piv), gotNn = fns.nnRotate(nine, 3, 3, -Math.PI / 4, piv);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const o = (y * 3 + x) * 4;
    for (let k = 0; k < 4; k++) {
      if (gotRx[o + k] !== wantRx[y][x][k]) throw new Error('rotxel: dest ' + x + ',' + y + ' is not the hand-derived source');
      if (gotNn[o + k] !== wantNn[y][x][k]) throw new Error('nn_rotate: dest ' + x + ',' + y + ' is not the hand-derived source');
    }
  }
  /* The tolerance edges, from the float arithmetic in the comment. */
  const pair = (a, b) => new Uint8ClampedArray([a, 0, 0, 255, b, 0, 0, 255]);
  if (!fns.pxSimilar(pair(0, 100), 0, 4)) throw new Error('100 apart must be similar under the default');
  if (fns.pxSimilar(pair(0, 101), 0, 4)) throw new Error('101 apart must not be');
  if (fns.pxSimilar(pair(0, 50), 0, 4, fns.PX_TOL_S3X)) throw new Error("50 apart must NOT be similar under scale_3x's 0.196078");
  if (!fns.pxSimilar(pair(0, 49), 0, 4, fns.PX_TOL_S3X)) throw new Error('49 apart must be');
}

/* THE PANEL IS WIRED. */
if (code.indexOf('for(const id of ["rsmode","tstatus","txalign","rotalg","rsalg"]){') < 0) throw new Error('the chips are not in the click loop');
if (code.indexOf("$('rotgo').onclick=()=>{") < 0) throw new Error('Turn is not wired');
if (code.indexOf("if(!rotateFree(v)) toast(") < 0) throw new Error('Turn does not go through rotateFree');
if (code.indexOf('if(!on&&id==="tf"){ try{ frameTurn(0);') < 0) throw new Error('closing the panel does not take the preview down');
if (code.indexOf('o.value="s3x";') < 0) throw new Error('the Scale3x preset is not built');
if (code.indexOf('if(v==="s3x"){') < 0) throw new Error('choosing the Scale3x preset does nothing');
if (code.indexOf('const plan=scale3xPlan(W,H,nw,nh);') < 0) throw new Error('resizeOp does not consult the chip');
{
  const lines = kit.lines(code);
  const r = kit.inFunction(lines, 'function resizeOp(mode,src,W,H,nw,nh){');
  const body = lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('scale3xTo(src,W,H,nw,nh,plan)') < 0 || body.indexOf('scaleArt(src,W,H,nw,nh)') < 0) throw new Error('resizeOp lost a scaler');
  if (body.indexOf('if(plan&&plan.fits)') < 0) throw new Error('resizeOp uses Scale3x without checking the plan fits');
}
/* The snapshot still comes before the scaler in both callers - the scaler
   is chosen after it, inside resizeOp, so this cannot have moved; checked
   anyway, because "cannot have" is how it moves. */
for (const sig of ['function applyResize(){', 'function resizeTo(nw,nh,mode){']) {
  const lines = kit.lines(code);
  const r = kit.inFunction(lines, sig);
  const body = lines.slice(r.start, r.end + 1);
  const s = body.findIndex(l => l === '  snapshot();'), o = body.findIndex(l => l.indexOf('resizeOp(mode,src,W,H,nw,nh)') >= 0);
  if (!(s > 0 && o > s)) throw new Error(sig + ' does not snapshot before resizeOp');
}
/* PB. */
for (const fn of ['PB.rotate=function(deg,alg){', 'PB.scale3x=function(apply){', 'PB.turns=function(){'])
  if (code.indexOf(fn) < 0) throw new Error('missing ' + fn);
if (code.indexOf('const turned=!!rotateFree(+deg||0);') < 0) throw new Error('PB.rotate does not go through rotateFree');
if (code.indexOf('if(apply) applyResize();') < 0) throw new Error('PB.scale3x does not go through applyResize');
/* No new element id collides with an old one. */
{
  const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) throw new Error('duplicate ids in the markup: ' + dup.join(', '));
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
