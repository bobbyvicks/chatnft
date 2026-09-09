/* PIXELORAMA'S GRADIENT TOOL.

   Ported from src/Tools/DesignTools/Gradient.gd and the shader it renders
   with, src/Shaders/Effects/Gradient.gdshaderinc, at Pixelorama a1ba792
   (project.godot: config/features 4.7). The GDScript sets up uniforms and
   the shader does the pixels; here both are one loop over the canvas. What
   Pixelorama draws on a texture_blit this draws on a preview layer while
   the pointer is down and commits through snapshot() on release.

   THE NUMBERS ARE PIXELORAMA'S, AND SEVERAL ARE SURPRISING. A port that
   quietly straightens them out draws a different picture, so each is kept
   and the reason is written where it is used in the page:

   - The ramp is CENTRED ON THE PRESS, as long as the drag, with the FIRST
     colour on the drag-end side. Gradient.gd takes the angle from
     pos.angle_to_point(click), which in Godot 4 is (click - pos).angle()
     (vector2.cpp, read), negates it, and never sets the shader's `position`
     - so its default 0 puts u = 0.5 at the press and u = 0 at the drag end.
   - The ramp has 64 steps: the shader samples a GradientTexture2D with
     filter_nearest, and its width is Godot's default of 64 (the class
     header; the checkout beside this carries only the .cpp, so that one
     number is from the docs). Texel x holds the gradient at x/63 - the
     .cpp's _get_gradient_offset_at - stored through get_r8(), which ROUNDS:
     GradientTexture2D::_update writes uint8_t(c.get_r8()), and color.h has
     get_r8 as round(r*255). Both read, not remembered.
   - The dither matrices are the four PNGs in assets/dither-matrices, whose
     bytes are the classic Bayer 2, 4, 8 and 16 scaled to 0..255. The shader
     tiles them floor(W/N) times across the canvas - ivec2 / int, integer
     division, both axes by the matrix WIDTH - so on a canvas that is not a
     multiple of N the pattern drifts. Faithfully.
   - The radial shape is an ellipse whose semi-axes are HALF the drag in
     each axis, and an axis of zero becomes 0.01 of the canvas.
   - The default tolerance is 1, not the 0.003 in the source: load_config
     writes 0.003*255 = 0.765 into a Range whose step is 1, the Range snaps
     it to 1 and emits value_changed, and the handler sets _tolerance to
     1/255. So a Pixelorama user sees "Tolerance: 1" and a byte apart counts
     as similar.

   Two colours only: the paint colour and the palette's right-click target,
   or black when none is set - the brief's mapping of Pixelorama's "left to
   right" gradient preset. Pixelorama's multi-stop gradient editor is not
   here, and the arithmetic below is written for exactly two stops at
   offsets 0 and 1, which is what the shader loop reduces to for them.

   Run with PB_INDEX pointing at a copy first; the live file is being served
   to a test run more often than not.
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
/* Where the Bayer PNGs live when a Pixelorama checkout is beside this; the
   literal below is checked against them when they are, and against the
   Bayer recursion always. */
const DITHER_DIR = process.env.PIXELORAMA_DITHER_DIR
  || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/95a77113-87c3-41c1-931b-17ee19874e10/scratchpad/Pixelorama/assets/dither-matrices';

let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';
if (text.indexOf('data-tool="gradient"') >= 0) throw new Error('already applied: the gradient tool is in this file');

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* The four matrices, byte for byte from bayer2/4/8/16.png. Decoded from the
   PNGs by a script rather than typed, and re-checked below against the
   recursion that generates a Bayer matrix, so a slip in either shows. */
const BAYER = [
  [[0,128],[192,64]],
  [[0,128,32,160],[192,64,224,96],[48,176,16,144],[240,112,208,80]],
  [[0,128,32,160,8,136,40,168],[192,64,224,96,200,72,232,104],[48,176,16,144,56,184,24,152],[240,112,208,80,248,120,216,88],[12,140,44,172,4,132,36,164],[204,76,236,108,196,68,228,100],[60,188,28,156,52,180,20,148],[252,124,220,92,244,116,212,84]],
  [[0,128,32,160,8,136,40,168,2,130,34,162,10,138,42,170],[192,64,224,96,200,72,232,104,194,66,226,98,202,74,234,106],[48,176,16,144,56,184,24,152,50,178,18,146,58,186,26,154],[240,112,208,80,248,120,216,88,242,114,210,82,250,122,218,90],[12,140,44,172,4,132,36,164,14,142,46,174,6,134,38,166],[204,76,236,108,196,68,228,100,206,78,238,110,198,70,230,102],[60,188,28,156,52,180,20,148,62,190,30,158,54,182,22,150],[252,124,220,92,244,116,212,84,254,126,222,94,246,118,214,86],[3,131,35,163,11,139,43,171,1,129,33,161,9,137,41,169],[195,67,227,99,203,75,235,107,193,65,225,97,201,73,233,105],[51,179,19,147,59,187,27,155,49,177,17,145,57,185,25,153],[243,115,211,83,251,123,219,91,241,113,209,81,249,121,217,89],[15,143,47,175,7,135,39,167,13,141,45,173,5,133,37,165],[207,79,239,111,199,71,231,103,205,77,237,109,197,69,229,101],[63,191,31,159,55,183,23,151,61,189,29,157,53,181,21,149],[255,127,223,95,247,119,215,87,253,125,221,93,245,117,213,85]],
];
const BAYER_LITERAL = 'const GD_BAYER=[' + NL
  + BAYER.map(m => '  [' + m.map(r => '[' + r.join(',') + ']').join(',') + '],').join(NL) + NL
  + '];';

/* ---- 1. the rail button, before the eyedropper ------------------------- */
swap('    <!-- rail:tools -->', block([
  '    <!-- The paint colour lands on the drag-end side and the right-click',
  '         target behind the press: that is which way round Pixelorama',
  '         draws it, and the title says so rather than leaving it to be',
  '         discovered. -->',
  '    <button class="tool" data-tool="gradient" aria-pressed="false" title="Gradient: press where the ramp is centred and drag to give it a length and a direction. The paint colour lands on the drag-end side, the right-click target - or black - behind the press. Shift snaps the angle, Alt moves the press (J)"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 4v16" opacity=".3"/><path d="M12 4v16" opacity=".55"/><path d="M16 4v16" opacity=".8"/></svg><span class="k">N</span></button>',
  '    <!-- rail:tools -->',
]));

/* ---- 2. the key ---------------------------------------------------------
   Pixelorama binds G, which Fill already has here. N is the first letter of
   "gradient" that nothing else answers to: G, R, A, D, I, E and T are all
   taken. Escape cancels a drag in progress, which is Pixelorama's
   cancel_tool; it goes ABOVE the panel rows because the table takes the
   first match, and a press mid-drag must not be spent closing a panel. */
swap('  /* shortcuts:more */', block([
  "  {show:'J', desc:'Gradient', keys:['j'], run:()=>selectTool('gradient')},",
  "  {show:'Esc', desc:'Cancel the gradient being dragged', prevent:true,",
  "    match:e=>e.key==='Escape'&&!!gdDrag, run:()=>gdCancel()},",
  '  /* shortcuts:more */',
]));

/* ---- 3. its options, in the strip, shown only while it is the tool -----
   Pixelorama's five, in its order: shape, dithering pattern, repeat, fill
   area, tolerance. One .olrow per control, because the strip is a 274px
   column from 1280px up (the .opts rule under that media query) and five
   controls on one unwrappable row would run out of it. */
swap('    <div id="fillrows" hidden>', block([
  '    <!-- The gradient tool\'s options, shown only while the tool is chosen,',
  '         the way Fill spread is for the fill. -->',
  '    <div id="gdrows" hidden>',
  '      <div class="olrow"><label for="gdshape">Shape</label>',
  '        <select id="gdshape" title="Linear runs along the drag. Radial spreads from the press and reaches the far colour at half the drag in each direction."><option value="0">Linear</option><option value="1">Radial</option></select></div>',
  '      <div class="olrow"><label for="gddither">Dither</label>',
  '        <select id="gddither" title="An ordered dither between the two colours instead of a smooth ramp, using Pixelorama\'s Bayer matrices"><option value="0">None</option><option value="1">Bayer 2\u00d72</option><option value="2">Bayer 4\u00d74</option><option value="3">Bayer 8\u00d78</option><option value="4">Bayer 16\u00d716</option></select></div>',
  '      <div class="olrow"><label for="gdrepeat">Repeat</label>',
  '        <select id="gdrepeat" title="Past the ends of the ramp: hold the end colour, start the ramp again, run it back, or leave those pixels alone"><option value="0">None</option><option value="1">Repeat</option><option value="2">Mirror</option><option value="3">Truncate</option></select></div>',
  '      <div class="olrow"><label for="gdarea">Fill</label>',
  '        <select id="gdarea" title="Which pixels the ramp covers: the connected area of the colour you press on, every pixel of that colour, or the whole selection"><option value="0">Similar area</option><option value="1">Similar colours</option><option value="2">Whole selection</option></select></div>',
  '      <div class="olrow" id="gdtolrow"><label for="gdtol">Tolerance</label>',
  '        <input id="gdtol" type="number" min="0" max="255" value="1" style="width:60px" title="How far any channel may differ from the pressed colour and still count as similar, 0 to 255. Pixelorama shows 1: its source default of 0.003 lands on a slider with a step of 1, which rounds it up."></div>',
  '    </div>',
  '    <div id="fillrows" hidden>',
]));
swap('.opts #brushrows,.opts #fillrows{display:flex; align-items:center;}', block([
  '.opts #brushrows,.opts #fillrows{display:flex; align-items:center;}',
  '/* Wraps: in the 274px column the five rows stack, in a wide strip they',
  '   flow. The auto margin that pushes a lone select to the end of its row',
  '   would spread each pair apart, so it is zeroed here. */',
  '.opts #gdrows{display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px;}',
  '#gdrows select,#gdrows input[type=number]{margin-left:0;}',
]));

/* ---- 4. its own layer over the artwork ---------------------------------- */
swap('<canvas id="fxpv"></canvas>', '<canvas id="fxpv"></canvas><canvas id="gdpv"></canvas>');
swap('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;', block([
  '/* The gradient preview: the same layer the effect preview uses, after it',
  '   in the markup so it paints above it if both are ever up, and under',
  '   pending text like everything else. */',
  '#gdpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
]));

/* ---- 5. the tool ------------------------------------------------------- */
swap('/* panels:register */', block([
  '/* panels:register */',
  '',
  '/* ---- the gradient tool ------------------------------------------------------',
  '',
  '   Pixelorama\'s Gradient.gd and the Gradient.gdshaderinc it renders with,',
  '   as one loop over the pixels. Press where the ramp is centred and drag to',
  '   give it a length and a direction; the colours are the one being painted',
  '   with and the palette\'s right-click target, or black when none is set.',
  '   Linear or radial, four repeat modes, four Bayer matrices for an ordered',
  '   dither, and the bucket tool\'s three fill areas. Drawn on its own layer',
  '   while the pointer is down, landed through snapshot() on release.',
  '',
  '   THE ARITHMETIC IS PIXELORAMA\'S, ODDITIES INCLUDED; each is explained at',
  '   the line that carries it. The one departure is in gdCosd below. */',
  '',
  '/* Pixelorama\'s assets/dither-matrices/bayer{2,4,8,16}.png, red channel,',
  '   row by row. The classic Bayer index matrices scaled to a byte - times 64,',
  '   16, 4 and 1 - which is why the threshold a texel gives is its byte/255. */',
  BAYER_LITERAL,
  'let gdDrag=null, gdRaf=0;',
  'function gdOpts(){',
  '  const v=id=>{ const el=$(id); return el?(+el.value||0):0; };',
  '  return {shape:v("gdshape"), dither:v("gddither"), repeat:v("gdrepeat"), area:v("gdarea"),',
  '    tol:Math.max(0,Math.min(255,Math.round(v("gdtol"))))};',
  '}',
  '/* Stop 0 is the paint colour, stop 1 the right-click target or black - the',
  '   "left to right" preset of Pixelorama\'s gradient editor, with black where',
  '   its right-mouse colour would be. */',
  'function gdColours(){ return [hx2(color).concat(255), hx2(rcTo||"#000000").concat(255)]; }',
  '/* THE 64 TEXELS Pixelorama samples. The tool feeds the shader a',
  '   GradientTexture2D, 64 wide by Godot\'s default and read with',
  '   filter_nearest, so the ramp has 64 steps whatever the canvas size; texel',
  '   x holds the gradient at x/63 and Godot stores it through get_r8(), which',
  '   ROUNDS. Exact integer arithmetic: the value is a rational over 63, and',
  '   (c0*63+(c1-c0)*x)/63 = k+1/2 would need an even number to equal an odd',
  '   one, so there is never a tie for Math.round to get wrong. */',
  'function gdTexels(c0,c1){',
  '  const t=[]; for(let x=0;x<64;x++) t.push([0,1,2,3].map(k=>Math.round((c0[k]*63+(c1[k]-c0[k])*x)/63)));',
  '  return t;',
  '}',
  '/* similar_colors, in bytes: every channel within the tolerance, alpha',
  '   included. Pixelorama compares floats against slider/255, and a byte',
  '   difference of k passes exactly when k <= slider - at k == slider its',
  '   float noise decides, and this decides the way the slider reads. */',
  'function gdSimilar(d,i,s,tol){',
  '  return Math.abs(d[i]-s[0])<=tol&&Math.abs(d[i+1]-s[1])<=tol&&Math.abs(d[i+2]-s[2])<=tol&&Math.abs(d[i+3]-s[3])<=tol;',
  '}',
  '/* FloodFillObject as the gradient tool uses it: four-connected, every',
  '   pixel compared to the SEED, walked over the whole image - it is built',
  '   with selection_matters false - and cut to the selection afterwards by',
  '   _set_bit, which gdBegin does. A stack rather than Allegro\'s segment',
  '   list; the set of pixels is the same. */',
  'function gdFlood(d,W,H,sx,sy,seed,tol){',
  '  const m=new Uint8Array(W*H), st=[sy*W+sx];',
  '  while(st.length){',
  '    const p=st.pop(); if(m[p]||!gdSimilar(d,p*4,seed,tol)) continue;',
  '    m[p]=1; const x=p%W;',
  '    if(x>0) st.push(p-1); if(x<W-1) st.push(p+1); if(p>=W) st.push(p-W); if(p<W*(H-1)) st.push(p+W);',
  '  }',
  '  return m;',
  '}',
  '/* mirror_fract, literally. int() truncates and % keeps the sign of the',
  '   left side in both languages, which is what makes the two branches meet',
  '   into one triangle wave on either side of zero. */',
  'function gdMirror(u){',
  '  const s=Math.trunc((Math.sign(u)-1)/2);',
  '  return (Math.trunc(u)%2===s) ? u-Math.floor(u) : (1-u)-Math.floor(1-u);',
  '}',
  '/* cos and sin of DEGREES, exact on the four axes - THE ONE DEPARTURE from',
  '   the shader\'s arithmetic. Math.sin(Math.PI) is 1.2e-16 and the GPU\'s',
  '   sin(radians(180.0)) is whatever it returns for a float32 pi; an',
  '   axis-aligned drag - the common one - can put every pixel of the ramp',
  '   exactly on a texel boundary, u*64 an integer, where that noise decides',
  '   which of two colours a whole column gets. Snapping the right angles',
  '   gives the answer the arithmetic means; the shader\'s answer there is',
  '   whichever way the driver rounds. */',
  'function gdCosd(a){ const m=((a%360)+360)%360; return m===90||m===270?0:m===0?1:m===180?-1:Math.cos(a*Math.PI/180); }',
  'function gdSind(a){ const m=((a%360)+360)%360; return m===0||m===180?0:m===90?1:m===270?-1:Math.sin(a*Math.PI/180); }',
  '/* apply_gradient and the shader\'s apply_effect, per pixel. PURE: reads',
  '   src, returns new pixels, touches nothing else - the preview and the',
  '   commit both call it, which is what makes the preview honest. */',
  'function gdRender(src,W,H,g){',
  '  const out=new Uint8ClampedArray(src);',
  '  /* angle = rad_to_deg(-pos.angle_to_point(click)), and in Godot 4',
  '     a.angle_to_point(b) is (b - a).angle(): the negated angle from the',
  '     pointer BACK to the press. With the shader\'s position left at 0 that',
  '     puts u = 0.5 under the press and u = 0 at the drag end - the ramp is',
  '     centred on the press, as long as the drag, first colour ahead. */',
  '  let angle=-Math.atan2(g.cy-g.py,g.cx-g.px)*180/Math.PI;',
  '  let rx=g.px-g.cx, ry=g.py-g.cy;',
  '  /* shape_perfect, Shift: the angle to the nearest 22.5 degrees - Godot\'s',
  '     snappedf is floor(x/step+0.5)*step, which is Math.round - and a square',
  '     radius from the longer side. The size below stays the true distance:',
  '     Gradient.gd measures it after this block, from the unsnapped points. */',
  '  if(g.perfect){ angle=Math.round(angle/22.5)*22.5; const s=Math.max(Math.abs(rx),Math.abs(ry)); rx=s; ry=s; }',
  '  rx/=W; ry/=H;',
  '  /* size is the drag length over the WIDTH alone, and the shader swaps a',
  '     zero for 0.01 - a press with no drag, or a flat ellipse, would',
  '     otherwise divide by zero. So a click without a drag is a hard split',
  '     through the press, and a horizontal radial drag is a razor ellipse. */',
  '  const size=(Math.hypot(g.px-g.cx,g.py-g.cy)/W)||0.01, rrx=rx||0.01, rry=ry||0.01;',
  '  const pvx=g.cx/W, pvy=g.cy/H, ac=gdCosd(angle), as=gdSind(angle), an=Math.abs(ac)+Math.abs(as);',
  '  /* dither(): the matrix is sampled at uv * (image_size / N) with repeat',
  '     on - and image_size / N is ivec2 / int, INTEGER division, both axes',
  '     by the matrix width. A multiple of N gives one cell per pixel; any',
  '     other size stretches floor(W/N) copies over W pixels and the pattern',
  '     drifts, as it does in Pixelorama. */',
  '  const M=g.dither?GD_BAYER[g.dither-1]:null, N=M?M.length:0, kx=N?Math.trunc(W/N):0, ky=N?Math.trunc(H/N):0;',
  '  const c0=g.c0, c1=g.c1, tex=g.tex, mask=g.mask, seed=g.seed, tol=g.tol;',
  '  for(let y=0;y<H;y++){',
  '    const uy=(y+0.5)/H;',
  '    for(let x=0;x<W;x++){',
  '      const p=y*W+x, i=p*4;',
  '      /* mix(original, output, selection.a), then the colour mask: either',
  '         way the pixel is the original, so it is skipped. */',
  '      if(mask&&mask[p]!==1) continue;',
  '      if(g.colorMask&&!gdSimilar(src,i,seed,tol)) continue;',
  '      const ux=(x+0.5)/W;',
  '      let u;',
  '      /* modify_uv. Linear: rotate the offset from the pivot, divide by',
  '         |cos|+|sin| so the unit square is covered at any angle - which',
  '         makes a diagonal ramp longer than its drag - then by size, then',
  '         shift by 0.5 for position 0. Radial: the offset from the centre',
  '         in -1..1 over the radius, so u is 1 at HALF the drag per axis. */',
  '      if(g.shape===0) u=((ux-pvx)*ac-(uy-pvy)*as)/an/size+0.5;',
  '      else { const ox=(ux*2-1)-(pvx*2-1), oy=(uy*2-1)-(pvy*2-1); u=Math.sqrt((ox/rrx)*(ox/rrx)+(oy/rry)*(oy/rry)); }',
  '      if(g.repeat===1) u=u-Math.floor(u); else if(g.repeat===2) u=gdMirror(u);',
  '      let c;',
  '      if(N){',
  '        /* The shader\'s loop over the stops, for two of them at 0 and 1:',
  '           below the first it is the first colour, at or past the last the',
  '           last, and between them the threshold decides. */',
  '        if(u<0) c=c0; else if(u>=1) c=c1;',
  '        else { const col=((Math.floor(ux*kx*N)%N)+N)%N, row=((Math.floor(uy*ky*N)%N)+N)%N; c=u<M[row][col]/255?c0:c1; }',
  '      }',
  '      /* filter_nearest with repeat_disable: the texel is floor(u*64),',
  '         clamped to the edge. */',
  '      else c=tex[Math.max(0,Math.min(63,Math.floor(u*64)))];',
  '      let a=c[3];',
  '      /* Truncate: alpha 0 outside 0..1, so the original shows through. */',
  '      if(g.repeat===3&&!(u>=0&&u<=1)) a=0;',
  '      if(a===0) continue;',
  '      /* mix(original, output, output.a). Both stops are opaque today, so',
  '         this is the whole pixel; the blend is kept for a stop that is not. */',
  '      if(a===255){ out[i]=c[0]; out[i+1]=c[1]; out[i+2]=c[2]; out[i+3]=255; }',
  '      else { const t=a/255; for(let k=0;k<4;k++) out[i+k]=Math.round(src[i+k]+(c[k]-src[i+k])*t); }',
  '    }',
  '  }',
  '  return out;',
  '}',
  '/* The preview is the whole composite on its own layer: where the ramp did',
  '   not reach, the pixels are the art\'s own, so nothing shows through wrong. */',
  'function gdShow(out,W,H){',
  '  const pv=$("gdpv"); if(!pv) return;',
  '  pv.width=W; pv.height=H;',
  '  const g=pv.getContext("2d"), im=g.createImageData(W,H); im.data.set(out); g.putImageData(im,0,0);',
  '  pv.style.width=(W*zoom)+"px"; pv.style.height=(H*zoom)+"px"; pv.style.display="block";',
  '}',
  'function gdHide(){ const pv=$("gdpv"); if(pv) pv.style.display="none"; }',
  '/* One render per frame, not per pointer event: a 1280 canvas is 1.6',
  '   million pixels through the loop above, and a mouse reports far more',
  '   often than the screen can show. */',
  'function gdQueue(){ if(gdRaf) return; gdRaf=requestAnimationFrame(()=>{ gdRaf=0; gdFlush(); }); }',
  'function gdFlush(){',
  '  if(gdRaf){ cancelAnimationFrame(gdRaf); gdRaf=0; }',
  '  const d=gdDrag; if(!d) return;',
  '  gdShow(gdRender(d.src,d.W,d.H,d),d.W,d.H);',
  '}',
  '/* draw_start. e carries the modifier keys; a synthetic {shiftKey,altKey}',
  '   does as well, which is how PB.gradient presses. */',
  'function gdBegin(x,y,e){',
  '  gdCancel();',
  '  if(!ctx) return false;',
  '  /* can_pixel_get_drawn: a press outside the selection starts nothing. */',
  '  if(selMask&&!selAllows(x,y)){ toast("Press inside the selection"); return false; }',
  '  const W=art.width, H=art.height, o=gdOpts(), src=ctx.getImageData(0,0,W,H).data;',
  '  const i=(y*W+x)*4, seed=[src[i],src[i+1],src[i+2],src[i+3]];',
  '  const cs=gdColours(), c0=cs[0], c1=cs[1];',
  '  /* The fill area. Whole selection: the selection, or everything. Similar',
  '     colours: the same, with the colour mask deciding per pixel. Similar',
  '     area: the flood from the press, cut to the selection - and the colour',
  '     mask as well, which is redundant there and is what Pixelorama does. */',
  '  let mask=selMask;',
  '  if(o.area===0){ mask=gdFlood(src,W,H,x,y,seed,o.tol); if(selMask) for(let p=0;p<W*H;p++) if(selMask[p]!==1) mask[p]=0; }',
  '  gdDrag={cx:x,cy:y,px:x,py:y,ox:x,oy:y,W,H,src,seed,mask,c0,c1,tex:gdTexels(c0,c1),',
  '    shape:o.shape,repeat:o.repeat,dither:o.dither,tol:o.tol,colorMask:o.area!==2,perfect:!!(e&&e.shiftKey)};',
  '  /* draw_start applies at once, so a press with no drag already shows the',
  '     two colours split through the press. */',
  '  gdQueue();',
  '  return true;',
  '}',
  '/* draw_move. shape_displace, Alt in Pixelorama: the press moves with the',
  '   pointer, so a ramp can be repositioned without starting over. */',
  'function gdMove(x,y,e){',
  '  const d=gdDrag; if(!d) return;',
  '  if(e&&e.altKey){ d.cx+=x-d.ox; d.cy+=y-d.oy; }',
  '  d.px=x; d.py=y; d.ox=x; d.oy=y; d.perfect=!!(e&&e.shiftKey);',
  '  gdQueue();',
  '}',
  '/* draw_end: applied once more at the release, then committed. */',
  'function gdCommit(x,y,e){',
  '  const d=gdDrag; if(!d) return null;',
  '  gdDrag=null; if(gdRaf){ cancelAnimationFrame(gdRaf); gdRaf=0; }',
  '  d.px=x; d.py=y; d.perfect=!!(e&&e.shiftKey);',
  '  const out=gdRender(d.src,d.W,d.H,d);',
  '  gdHide();',
  '  let n=0; for(let i=0;i<out.length;i+=4) if(out[i]!==d.src[i]||out[i+1]!==d.src[i+1]||out[i+2]!==d.src[i+2]||out[i+3]!==d.src[i+3]) n++;',
  '  /* Nothing changed is not an edit and must not cost an undo step - the',
  '     rule the fill and the Adjust panel keep. Pixelorama commits regardless. */',
  '  if(!n){ toast("That gradient changes nothing"); return {changed:0}; }',
  '  snapshot();',
  '  const img=ctx.createImageData(d.W,d.H); img.data.set(out); ctx.putImageData(img,0,0);',
  '  refreshStats(); repalette();',
  '  toast("Gradient over "+n.toLocaleString()+" pixels");',
  '  return {changed:n};',
  '}',
  '/* cancel_tool: the layer goes away and nothing was ever in the art. */',
  'function gdCancel(){ gdDrag=null; if(gdRaf){ cancelAnimationFrame(gdRaf); gdRaf=0; } gdHide(); }',
  'registerTool("gradient",{',
  '  down(e,c){ gdBegin(c.x,c.y,e); },',
  '  /* rawCell, not the clipped cell: the drag end may leave the canvas, as',
  '     Pixelorama\'s Vector2i pos does, and the ramp follows it out. */',
  '  move(e){ if(!gdDrag) return; const rc=rawCell(e); gdMove(rc.x,rc.y,e); },',
  '  up(e){ if(!gdDrag) return; const rc=rawCell(e); gdCommit(rc.x,rc.y,e); },',
  '  select(){ const r=$("gdrows"); if(r) r.hidden=false; },',
  '  deselect(){ gdCancel(); const r=$("gdrows"); if(r) r.hidden=true; },',
  '});',
  '(function(){',
  '  const a=$("gdarea"); if(!a) return;',
  '  /* _select_fill_area_optionbutton: the tolerance means nothing to Whole',
  '     selection, so its row goes with it. */',
  '  const tol=()=>{ $("gdtolrow").hidden=(+a.value===2); };',
  '  a.onchange=tol; tol();',
  '})();',
]));

/* ---- 6. reachable without a mouse ---------------------------------------- */
swap('PB.text=function(o){', block([
  '/* A gradient for something without a pointer. It sets the controls a person',
  '   sets and runs the same press, drag and release the pointer runs, so what',
  '   an agent applies is what a person would have seen on the layer. from must',
  '   be on the canvas; to may be off it, as a drag may. Options take',
  '   Pixelorama\'s names or their index: shape linear|radial, dither',
  '   none|2|4|8|16, repeat none|repeat|mirror|truncate, area',
  '   area|colours|selection, tolerance 0..255, perfect for Shift. colour sets',
  '   the paint colour and target the right-click target (null for black). */',
  'PB.gradient=function(o){',
  '  o=o||{};',
  '  if(!ctx) return {ok:false, why:"no canvas open"};',
  '  const from=o.from, to=o.to||o.from;',
  '  if(!from||from.length!==2||!to||to.length!==2) return {ok:false, why:"from and to are [x,y]"};',
  '  const x0=Math.round(from[0]), y0=Math.round(from[1]), x1=Math.round(to[0]), y1=Math.round(to[1]);',
  '  if(!(x0>=0&&y0>=0&&x0<art.width&&y0<art.height)) return {ok:false, why:"from is off the canvas"};',
  '  const NAMES={shape:["linear","radial"], repeat:["none","repeat","mirror","truncate"], area:["area","colours","selection"],',
  '    dither:["none","2","4","8","16"]};',
  '  const pick=(id,key,v)=>{',
  '    if(v===undefined||v===null) return;',
  '    const n=NAMES[key], s=String(v).toLowerCase().replace(/^bayer/,"").replace("colors","colours");',
  '    /* dither is named by matrix size, so a number there is a size, not an index. */',
  '    const k=key==="dither" ? (s==="0"?0:n.indexOf(s)) : (typeof v==="number"?v:n.indexOf(s));',
  '    if(!(k>=0&&k<n.length)) throw new Error(key+" must be one of "+n.join(", "));',
  '    const el=$(id); el.value=String(k); el.dispatchEvent(new Event("change",{bubbles:true}));',
  '  };',
  '  selectTool("gradient");',
  '  try{ pick("gdshape","shape",o.shape); pick("gddither","dither",o.dither); pick("gdrepeat","repeat",o.repeat); pick("gdarea","area",o.area); }',
  '  catch(err){ return {ok:false, why:String(err.message||err)}; }',
  '  if(o.tolerance!==undefined) $("gdtol").value=String(o.tolerance);',
  '  if(o.colour) setColor(o.colour);',
  '  if(o.target!==undefined){ rcTo=o.target||null; rcSummary(); }',
  '  const mods={shiftKey:!!o.perfect, altKey:false};',
  '  if(!gdBegin(x0,y0,mods)) return {ok:false, why:"the press is outside the selection"};',
  '  gdMove(x1,y1,mods);',
  '  const r={ok:true, from:[x0,y0], to:[x1,y1], options:gdOpts(), colours:gdColours().map(c=>hex(c[0],c[1],c[2])), applied:!!o.apply};',
  '  /* Previewed but not committed unless asked - the same choice a person has',
  '     while the pointer is still down. */',
  '  if(o.apply){ const c=gdCommit(x1,y1,mods); r.changed=c?c.changed:0; }',
  '  else gdFlush();',
  '  return r;',
  '};',
  'PB.text=function(o){',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const markup = text.slice(0, text.indexOf('<script'));

/* THE MARKERS SURVIVE, once each, where the next patch will look. */
for (const m of ['<!-- rail:tools -->', '<!-- rail:more -->', '<!-- panels:more -->'])
  if (markup.split(m).length !== 2) throw new Error('marker not exactly once in markup: ' + m);
for (const m of ['/* panels:register */', '/* shortcuts:more */'])
  if (script.split(m).length !== 2) throw new Error('marker not exactly once in script: ' + m);

/* THE BUTTON SITS BETWEEN TRANSFORM AND THE EYEDROPPER, so resizetool.spec
   (transform right after fill, pick after transform) and colourtools.spec
   (outline right after pick) both still hold. */
{
  const t = markup.indexOf('data-tool="transform"'), g = markup.indexOf('data-tool="gradient"');
  const m = markup.indexOf('<!-- rail:tools -->'), p = markup.indexOf('data-tool="pick"');
  if (markup.split('data-tool="gradient"').length !== 2) throw new Error('the gradient button is not in the rail exactly once');
  if (!(t < g && g < m && m < p)) throw new Error('the gradient button is not between Transform and the eyedropper');
}

/* EVERY CONTROL EXISTS ONCE, IN THE ROW, WITH A TITLE. gdOpts reads them by
   id and an absent one reads as 0, which is a plausible default rather than
   an error - so absence has to be caught here. */
const IDS = ['gdrows', 'gdshape', 'gddither', 'gdrepeat', 'gdarea', 'gdtol', 'gdtolrow', 'gdpv'];
for (const id of IDS)
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
{
  const s = markup.indexOf('<div id="gdrows"'), e = markup.indexOf('<div id="fillrows"');
  if (!(s >= 0 && e > s)) throw new Error('could not bound the gradient row');
  const row = markup.slice(s, e);
  const opts = { gdshape: 2, gddither: 5, gdrepeat: 4, gdarea: 3 };
  for (const id of ['gdshape', 'gddither', 'gdrepeat', 'gdarea', 'gdtol']) {
    const at = row.indexOf('id="' + id + '"');
    if (at < 0) throw new Error(id + ' did not make it into the row');
    const tag = row.slice(row.lastIndexOf('<', at), row.indexOf('>', at));
    if (tag.indexOf('title="') < 0) throw new Error(id + ' has no title');
    if (opts[id]) {
      const sel = row.slice(at, row.indexOf('</select>', at));
      const n = sel.split('<option ').length - 1;
      /* Pixelorama's enums: Shape 2, Dithering None + four matrices, Repeat 4,
         FillArea 3. A missing option is a mode a person cannot reach. */
      if (n !== opts[id]) throw new Error(id + ' offers ' + n + ' options, Pixelorama has ' + opts[id]);
    }
  }
  /* Five rows, one per control, so the 274px column can stack them. */
  if (row.split('<div class="olrow"').length - 1 !== 5) throw new Error('the gradient options are not five rows');
  if (row.indexOf('id="gdtol" type="number" min="0" max="255" value="1"') < 0) throw new Error('the tolerance does not default to 1');
}
if (text.indexOf('.opts #gdrows{display:flex; flex-wrap:wrap; align-items:center;') < 0) throw new Error('the row has no wrapping layout rule');

/* THE LAYER IS OVER THE ART, under pending text, and never eats a click. */
if (text.indexOf('#gdpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;') < 0)
  throw new Error('the preview layer has no rule');
{
  const f = markup.indexOf('<canvas id="fxpv"></canvas>'), g = markup.indexOf('<canvas id="gdpv"></canvas>'), t = markup.indexOf('<canvas id="txpv"></canvas>');
  if (!(f >= 0 && f < g && g < t)) throw new Error('the preview canvas is not between the effect layer and the text layer');
}

/* THE KEY IS OURS ALONE. A second row binding n would take the key silently
   - the table stops at the first match. */
{
  const rows = code.split("keys:['j']").length - 1;
  if (rows !== 1) throw new Error('n is bound ' + rows + ' times');
  if (code.indexOf("{show:'J', desc:'Gradient', keys:['j'], run:()=>selectTool('gradient')},") < 0) throw new Error('the N row is not ours');
  if (code.indexOf("match:e=>e.key==='Escape'&&!!gdDrag, run:()=>gdCancel()") < 0) throw new Error('Escape does not cancel a drag');
  /* And above the panel rows, or a drag under an open panel is never cancelled. */
  if (code.indexOf("match:e=>e.key==='Escape'&&!!gdDrag") > code.indexOf("match:e=>e.key==='Escape'&&RAIL_PANELS.some"))
    throw new Error('the cancel row is below the panel rows');
}

/* THE TOOL IS REGISTERED, AND THE RENDER IS PURE. gdRender is what the
   preview and the commit both call; a ctx or a $ inside it would make one
   of them an edit or a DOM read. */
if (code.indexOf('registerTool("gradient",{') < 0) throw new Error('the tool is not registered');
{
  const r = code.slice(code.indexOf('function gdRender('), code.indexOf('function gdShow('));
  if (!r || /\bctx\b/.test(r) || r.indexOf('$(') >= 0 || r.indexOf('putImageData') >= 0 || r.indexOf('snapshot') >= 0)
    throw new Error('gdRender is not pure');
  const t = code.slice(code.indexOf('function gdTexels('), code.indexOf('function gdSimilar('));
  if (!t || /\bctx\b/.test(t) || t.indexOf('$(') >= 0) throw new Error('gdTexels is not pure');
  const s = code.slice(code.indexOf('function gdShow('), code.indexOf('function gdHide('));
  if (!s || /\bctx\b/.test(s) || s.indexOf('$("gdpv")') < 0) throw new Error('the preview does not draw on its own layer alone');
}
/* THE COMMIT SNAPSHOTS after refusing a no-op and before touching ctx. */
{
  const c = code.slice(code.indexOf('function gdCommit('), code.indexOf('function gdCancel('));
  const z = c.indexOf('if(!n){'), s = c.indexOf('snapshot();'), p = c.indexOf('ctx.putImageData');
  if (!(z >= 0 && s > z && p > s)) throw new Error('gdCommit does not snapshot between the no-op refusal and the write');
}
/* NOTHING ELSE WRITES THE ARTWORK. One putImageData on ctx in the whole
   block, in gdCommit. */
{
  const b = code.slice(code.indexOf('const GD_BAYER=['), code.indexOf('registerTool("gradient",{'));
  if (b.split('ctx.putImageData').length - 1 !== 1) throw new Error('the block writes ctx somewhere other than gdCommit');
}

/* THE MATRICES ARE BAYER'S. Two origins: the literal came from the PNGs, and
   this is the recursion B(2n) = [[4B, 4B+2],[4B+3, 4B+1]] scaled to a byte.
   Agreement between them is what makes a typo in either visible. */
{
  const m = code.match(/const GD_BAYER=(\[[\s\S]*?\]);\r?\n/);
  if (!m) throw new Error('GD_BAYER is not in the code');
  const inPage = JSON.parse(m[1].replace(/,\s*\]/g, ']'));
  const bayer = n => {
    let B = [[0]], s = 1;
    while (s < n) {
      const nb = [];
      for (let y = 0; y < 2 * s; y++) { nb.push([]); for (let x = 0; x < 2 * s; x++) nb[y].push(B[y % s][x % s] * 4 + (y < s ? (x < s ? 0 : 2) : (x < s ? 3 : 1))); }
      B = nb; s *= 2;
    }
    return B.map(r => r.map(v => v * 256 / (n * n)));
  };
  const sizes = [2, 4, 8, 16];
  if (inPage.length !== 4) throw new Error('four matrices expected');
  sizes.forEach((n, k) => {
    if (JSON.stringify(inPage[k]) !== JSON.stringify(bayer(n))) throw new Error('the ' + n + 'x' + n + ' matrix is not Bayer');
  });
  /* And the PNGs themselves, when the checkout is here to read. A minimal
     decoder: these are 8-bit, non-interlaced, one IDAT each. */
  if (fs.existsSync(DITHER_DIR)) {
    const png = f => {
      const b = fs.readFileSync(f); let p = 8; const idat = []; let h;
      while (p < b.length) {
        const len = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
        if (t === 'IHDR') h = { w: d.readUInt32BE(0), h: d.readUInt32BE(4), bd: d[8], ct: d[9], il: d[12] };
        if (t === 'IDAT') idat.push(d);
        p += 12 + len;
      }
      if (h.bd !== 8 || h.il !== 0) throw new Error(f + ': not the PNG shape this decoder reads');
      const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[h.ct], stride = h.w * ch, raw = zlib.inflateSync(Buffer.concat(idat));
      const out = Buffer.alloc(h.h * stride); let prev = Buffer.alloc(stride), q = 0;
      for (let y = 0; y < h.h; y++) {
        const ft = raw[q++], line = Buffer.from(raw.subarray(q, q + stride)); q += stride;
        for (let i = 0; i < stride; i++) {
          const a = i >= ch ? line[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
          if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += Math.floor((a + up) / 2);
          else if (ft === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); }
          line[i] = v & 255;
        }
        line.copy(out, y * stride); prev = line;
      }
      const rows = []; for (let y = 0; y < h.h; y++) { const r = []; for (let x = 0; x < h.w; x++) r.push(out[y * stride + x * ch]); rows.push(r); }
      return rows;
    };
    sizes.forEach((n, k) => {
      const f = path.join(DITHER_DIR, 'bayer' + n + '.png');
      if (!fs.existsSync(f)) throw new Error('no ' + f);
      if (JSON.stringify(png(f)) !== JSON.stringify(inPage[k])) throw new Error('the ' + n + 'x' + n + ' literal is not the PNG');
    });
    console.log('the four matrices match Pixelorama\'s PNGs and the Bayer recursion');
  } else console.log('no Pixelorama checkout at ' + DITHER_DIR + ' - the matrices were checked against the Bayer recursion only');
}

/* THE TEXEL TABLE IS GODOT'S. Black to white: texel x is round(255*x/63),
   so 21 -> 85 and 42 -> 170 exactly, 1 -> 4 (4.05), 32 -> 130 (129.5),
   and a truncating port would give 84, 169, 4, 129. Run rather than read. */
{
  const t = code.slice(code.indexOf('function gdTexels('), code.indexOf('function gdSimilar('));
  // eslint-disable-next-line no-new-func
  const gdTexels = new Function(t + '; return gdTexels;')();
  const bw = gdTexels([0, 0, 0, 255], [255, 255, 255, 255]);
  const want = { 0: 0, 1: 4, 21: 85, 31: 125, 32: 130, 42: 170, 62: 251, 63: 255 };
  for (const k in want) if (bw[+k][0] !== want[k] || bw[+k][3] !== 255) throw new Error('texel ' + k + ' is ' + bw[+k][0] + ', Godot stores ' + want[k]);
  const wb = gdTexels([255, 255, 255, 255], [0, 0, 0, 255]);
  for (let x = 0; x < 64; x++) if (wb[x][0] !== bw[63 - x][0]) throw new Error('white to black is not black to white reversed at ' + x);
}

/* THE MIRROR IS A TRIANGLE WAVE on both sides of zero - the shader's two
   branches, run rather than read. */
{
  const m = code.slice(code.indexOf('function gdMirror('), code.indexOf('function gdCosd('));
  // eslint-disable-next-line no-new-func
  const gdMirror = new Function(m + '; return gdMirror;')();
  const want = [[0.25, 0.25], [1.25, 0.75], [2.25, 0.25], [-0.25, 0.25], [-1.25, 0.75], [-2.25, 0.25], [0, 0], [1, 0]];
  for (const [u, v] of want) if (Math.abs(gdMirror(u) - v) > 1e-12) throw new Error('mirror(' + u + ') is ' + gdMirror(u) + ', the shader gives ' + v);
}

/* THE AGENT SURFACE DRIVES THE SAME PATH. */
{
  const pb = code.slice(code.indexOf('PB.gradient=function(o){'), code.indexOf('PB.text=function(o){'));
  if (!pb) throw new Error('PB.gradient is missing');
  for (const s of ['selectTool("gradient");', 'gdBegin(x0,y0,mods)', 'gdMove(x1,y1,mods);', 'gdCommit(x1,y1,mods)'])
    if (pb.indexOf(s) < 0) throw new Error('PB.gradient does not go through ' + s);
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
