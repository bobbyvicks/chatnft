/* PIXELORAMA IMAGE EFFECTS, PART B: gradient map, drop shadow, pixelize,
   offset, and the INSIDE half of outline.

   Five more registered effects, ported from Pixelorama's
   src/Shaders/Effects/{GradientMap,DropShadow,Pixelize,OffsetPixels,
   OutlineInline}.gdshaderinc and the dialogs in src/UI/Dialogs/ImageEffects
   that drive them. Each becomes a pure run(src,W,H,values) behind the Adjust
   panel patch359 built, so nothing here draws a control, previews on ctx or
   takes its own undo step - the panel does all three.

   The port is the shader done per pixel. Pixelorama's blit shader samples
   source_texture0 with filter_nearest at pixel centres - UV=(x+0.5)/W - so
   every texture() call is worked out to the integer texel it lands on, and
   every place the GPU's float32 arithmetic could land on the other side of a
   boundary is named in a comment beside the line, with the count where it
   could be measured. The selection is not handled in any run(): each shader
   ends in mix(original, output, selection.a), and the panel does that blend
   at the destination pixel for every effect, which is the same thing for
   four of the five. The fifth, offset, is not the same (Pixelorama moves the
   selected pixels and clears where they were; the panel keeps the moved
   image only inside the selection) and that is recorded in REPORT.md rather
   than papered over.

   The gradient map's table is built the way Godot builds a GradientTexture2D:
   float32 arithmetic, then a TRUNCATING store to bytes. Both matter - a port
   in float64 that rounded would put a third of the columns one level off -
   so the table is built with Math.fround at every step and Math.trunc at the
   end, and the self-test below holds a column where float32 and float64
   disagree.

   Outline: this editor already has an OUTSIDE outline panel (O) with its own
   block-snapping algorithm, so only the shader's inside mode is registered,
   as "Inline". The outside mode is not ported and the panel is not touched.

   The gradient map's two colour wells are a 2-stop gradient. Pixelorama's
   GradientEdit allows any number of stops, and so does the port: an N-stop
   list rides in as an extra value on the same preview/apply path, through
   PB.gradientMap(), because the panel has no control type that can draw one.
   That is one of two changes to shared code here: fxApply and fxPreview take
   an optional extra-values object. The other: registerEffect makes the effect
   it just registered the selected one. Until now the panel's select fell to
   the FIRST option whenever nothing had been chosen, which was fine while the
   registry was empty and is wrong the moment it is not - extensions.spec.js
   registers a probe effect and expects to find its controls drawn, and with
   five effects ahead of it the panel drew Gradient map's instead. Any patch
   that registers an effect trips this, so the change is written to be safe
   to land beside one that made the same change first.
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

/* ---- 0. refuse to land twice ------------------------------------------- */
if (text.indexOf('function pxbU8(v){') >= 0) throw new Error('effects-b is already in this file');

/* ---- 1. the five effects ------------------------------------------------
   After the Adjust panel's own wiring and before railPanel, because
   registerEffect reads `const EFFECTS` - a function declaration is hoisted,
   a const is not, and a call placed above it throws at load. */
/* Anchored on the END of the Adjust panel's IIFE alone. The first draft
   also named the railPanel line after it, and effects-a's block landing
   between the two broke the match. */
swap(block([
  '  const a=$("fxapply"); if(a) a.onclick=fxApply;',
  '})();',
]), block([
  '  const a=$("fxapply"); if(a) a.onclick=fxApply;',
  '})();',
  '',
  '/* ---- Pixelorama image effects, part B ------------------------------------',
  '',
  '   Ported from Pixelorama: src/Shaders/Effects/GradientMap, DropShadow,',
  '   Pixelize, OffsetPixels and OutlineInline .gdshaderinc, with the defaults',
  '   from the dialogs in src/UI/Dialogs/ImageEffects that drive them. Each',
  '   run() is the shader\'s apply_effect() done per pixel. The blit shader',
  '   samples source_texture0 with filter_nearest at pixel centres,',
  '   uv=(x+0.5)/W, so every texture() read below is worked out to the integer',
  '   texel it lands on, and where the GPU\'s float32 could land differently',
  '   the comment beside it says so. The selection is not handled here: each',
  '   shader ends in mix(original, output, selection.a), and the Adjust panel',
  '   does that blend at the destination pixel for every effect. */',
  '/* unorm8 out of a float, as the blit target stores a shader result:',
  '   nearest, clamped. Not a Uint8ClampedArray store, which rounds halves to',
  '   even. */',
  'function pxbU8(v){ return Math.max(0,Math.min(255,Math.round(v))); }',
  '/* One float32 operation. Godot builds the gradient texture on the CPU in',
  '   floats, then stores each channel as uint8_t(CLAMP(c*255.0,0,255)) - a',
  '   TRUNCATION - so a column one level off is the difference between',
  '   Pixelorama\'s picture and nearly it. Rounding every step to float32 is',
  '   exact for + - * / (a double holds more than twice the bits), so the',
  '   table below is the one Godot builds, byte for byte. */',
  'const pxbF=Math.fround;',
  '',
  '/* Stops as Godot\'s Gradient holds them: float32 offsets and colours,',
  '   sorted by offset. Takes {at:0..1, color:"#rrggbb", alpha:0..255}; alpha',
  '   defaults to opaque, which is what a Gradient point starts as. Two stops',
  '   at least: a one-stop gradient is a fill, not a map. */',
  'function pxbGmStops(list){',
  '  if(!Array.isArray(list)||list.length<2) throw new Error("a gradient needs at least two stops");',
  '  const out=list.map((s,i)=>{',
  '    const at=+s.at, hex=String(s.color||"").toLowerCase(), a8=s.alpha===undefined?255:+s.alpha;',
  '    if(!(at>=0&&at<=1)) throw new Error("stop "+i+": at must be 0..1");',
  '    if(!/^#[0-9a-f]{6}$/.test(hex)) throw new Error("stop "+i+": color must be #rrggbb");',
  '    if(!(a8>=0&&a8<=255)) throw new Error("stop "+i+": alpha must be 0..255");',
  '    const c=hx2(hex); return {at:pxbF(at), hex:hex, a8:a8, rgba:[pxbF(c[0]/255),pxbF(c[1]/255),pxbF(c[2]/255),pxbF(a8/255)]};',
  '  });',
  '  out.sort((a,b)=>a.at-b.at);',
  '  return out;',
  '}',
  '/* Gradient.get_color_at_offset(): binary search for the segment, then',
  '   linear, constant or cubic between its two points, every operation in',
  '   float32 and in the order the C++ does it. In sRGB, the dialog\'s default',
  '   colour space; Linear-sRGB and Oklab are not ported. Cubic is Godot\'s',
  '   Math::cubic_interpolate with the neighbours clamped to the ends, as',
  '   get_color_at_offset does. */',
  'function pxbGmSample(stops,t,interp){',
  '  const n=stops.length, F=pxbF; let lo=0, hi=n-1, mid=0;',
  '  while(lo<=hi){ mid=(lo+hi)>>1; const o=stops[mid].at; if(o>t) hi=mid-1; else if(o<t) lo=mid+1; else return stops[mid].rgba; }',
  '  if(stops[mid].at>t) mid--;',
  '  const first=mid, second=mid+1;',
  '  if(second>=n) return stops[n-1].rgba;',
  '  if(first<0) return stops[0].rgba;',
  '  const A=stops[first].rgba, B=stops[second].rgba, w=F(F(t-stops[first].at)/F(stops[second].at-stops[first].at));',
  '  if(interp==="constant") return A;',
  '  if(interp==="cubic"){',
  '    const P=stops[first-1<0?first:first-1].rgba, Q=stops[second+1>=n?second:second+1].rgba, w2=F(w*w), w3=F(w2*w);',
  '    return A.map((a,k)=>{ const b=B[k], p=P[k], q=Q[k];',
  '      /* 0.5*((a*2) + (-p+b)w + (2p-5a+4b-q)w^2 + (-p+3a-3b+q)w^3) */',
  '      return F(0.5*F(F(F(F(a*2)+F(F(-p+b)*w))+F(F(F(F(F(2*p)-F(5*a))+F(4*b))-q)*w2))+F(F(F(F(-p+F(3*a))-F(3*b))+q)*w3))); });',
  '  }',
  '  return A.map((a,k)=>F(a+F(F(B[k]-a)*w)));',
  '}',
  '/* The 64 columns of the GradientTexture2D Pixelorama samples - 64 wide,',
  '   Godot\'s default, and GradientEdit never sets another - column i holding',
  '   get_color_at_offset(i/63), truncated to a byte as the texture store',
  '   does. */',
  'function pxbGmLut(stops,interp){',
  '  const lut=new Uint8Array(256);',
  '  for(let i=0;i<64;i++){ const c=pxbGmSample(stops,pxbF(i/63),interp); for(let k=0;k<4;k++) lut[i*4+k]=Math.trunc(Math.max(0,Math.min(255,c[k]*255))); }',
  '  return lut;',
  '}',
  '',
  'registerEffect({',
  '  id:"gradmap", name:"Gradient map",',
  '  /* Godot\'s default Gradient: black at 0, white at 1, linear. */',
  '  params:[',
  '    {id:"c0",label:"Dark end",type:"color",value:"#000000"},',
  '    {id:"a0",label:"Dark alpha",type:"range",min:0,max:255,step:1,value:255},',
  '    {id:"c1",label:"Light end",type:"color",value:"#ffffff"},',
  '    {id:"a1",label:"Light alpha",type:"range",min:0,max:255,step:1,value:255},',
  '    {id:"interp",label:"Blend",type:"select",value:"linear",',
  '      options:[{value:"linear",label:"Linear"},{value:"constant",label:"Constant"},{value:"cubic",label:"Cubic"}]},',
  '  ],',
  '  /* GradientMap.gdshaderinc: value = 0.2126 r + 0.7152 g + 0.0722 b on the',
  '     sampled colour (not linearised), read from the 64-wide map with',
  '     filter_nearest and repeat_disable, so the column is floor(value*64)',
  '     clamped to 63. Done in integers - (2126r+7152g+722b)*64 over 2550000 -',
  '     which is the shader\'s arithmetic exactly; the GPU\'s float32 puts 5 of',
  '     the 16,777,216 colours - the ones whose luma sits exactly on a column',
  '     edge, such as (160,119,116) at 0.5 - one column down (counted in the',
  '     effects-b REPORT). The alpha is original.a times the column\'s alpha,',
  '     stored nearest. The two wells are a 2-stop gradient; PB.gradientMap',
  '     passes an N-stop list in values.stops, which wins when present. */',
  '  run(src,W,H,v){',
  '    const stops=pxbGmStops(v.stops||[{at:0,color:v.c0,alpha:v.a0},{at:1,color:v.c1,alpha:v.a1}]);',
  '    const lut=pxbGmLut(stops,v.interp||"linear"), out=new Uint8ClampedArray(src.length);',
  '    for(let p=0;p<src.length;p+=4){',
  '      const i=Math.min(63,Math.floor((2126*src[p]+7152*src[p+1]+722*src[p+2])*64/2550000))*4;',
  '      out[p]=lut[i]; out[p+1]=lut[i+1]; out[p+2]=lut[i+2];',
  '      out[p+3]=pxbU8(src[p+3]*lut[i+3]/255);',
  '    }',
  '    return out;',
  '  },',
  '  note:v=>"Brightness, in 64 steps, mapped onto the colours from dark to light. Stops: "+(v.stops?v.stops.length:2)+".",',
  '});',
  '',
  'registerEffect({',
  '  id:"dropshadow", name:"Drop shadow",',
  '  /* 5,5 and #151515 at alpha 160 are DropShadowDialog.tscn\'s defaults:',
  '     Color(0.0823529, 0.0823529, 0.0823529, 0.627451) is 21/255 and 160/255.',
  '     The dialog\'s slider runs -64..64 but allows more; whole pixels, as its',
  '     step is 1. */',
  '  params:[',
  '    {id:"ox",label:"Across",type:"number",min:-4096,max:4096,step:1,value:5},',
  '    {id:"oy",label:"Down",type:"number",min:-4096,max:4096,step:1,value:5},',
  '    {id:"color",label:"Colour",type:"color",value:"#151515"},',
  '    {id:"alpha",label:"Alpha",type:"range",min:0,max:255,step:1,value:160},',
  '  ],',
  '  /* DropShadow.gdshaderinc. The shadow at a pixel is the art\'s alpha at',
  '     (x-ox, y-oy), times the shadow alpha, erased under the art itself,',
  '     and then blended: rgb=mix(original, shadow, sh), a=mix(original.a, 1,',
  '     sh). Over a transparent pixel, whose rgb is 0, that makes the shadow',
  '     rgb*sh, darker than the colour picked - the shader\'s behaviour, kept.',
  '     The shader\'s border term (floor of the doubled, centred sample uv) is',
  '     1 exactly when 0<=x-ox<W and 0<=y-oy<H for an integer offset, the',
  '     same test as the texel being on the texture, so an off-texture sample',
  '     is 0 and never the smeared edge texel; the half-pixel of margin makes',
  '     float32 and integers agree. The canvas does not grow. */',
  '  run(src,W,H,v){',
  '    const ox=Math.round(+v.ox||0), oy=Math.round(+v.oy||0), c=hx2(v.color||"#151515"), ca=(+v.alpha||0)/255;',
  '    const out=new Uint8ClampedArray(src.length);',
  '    for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
  '      const p=(y*W+x)*4, a8=src[p+3], sx=x-ox, sy=y-oy;',
  '      let sh=(sx>=0&&sy>=0&&sx<W&&sy<H)?src[(sy*W+sx)*4+3]/255:0;',
  '      sh*=ca; sh*=(1-a8/255);',
  '      out[p]=pxbU8(src[p]*(1-sh)+c[0]*sh); out[p+1]=pxbU8(src[p+1]*(1-sh)+c[1]*sh); out[p+2]=pxbU8(src[p+2]*(1-sh)+c[2]*sh);',
  '      out[p+3]=pxbU8(a8+sh*(255-a8));',
  '    }',
  '    return out;',
  '  },',
  '  note:v=>"A copy of the art\'s shape "+v.ox+" across and "+v.oy+" down, under it. The canvas does not grow.",',
  '});',
  '',
  'registerEffect({',
  '  id:"pixelize", name:"Pixelize",',
  '  /* Pixelorama defaults to 1x1, which is the one size whose result the',
  '     GLSL round() below leaves to the GPU at every pixel (see run); it is',
  '     not a no-op there either. 2 is the smallest size that is defined',
  '     everywhere. Max 255 as the dialog. */',
  '  params:[',
  '    {id:"px",label:"Block across",type:"number",min:1,max:255,step:1,value:2},',
  '    {id:"py",label:"Block down",type:"number",min:1,max:255,step:1,value:2},',
  '  ],',
  '  /* Pixelize.gdshaderinc (godotshaders.com pixelate-2): the sample is',
  '     round(uv*W/ps)*ps/W with uv=(x+0.5)/W, so the texel is',
  '     ps*round((2x+1)/(2ps)), clamped to the texture as clamp-to-edge',
  '     sampling does. Blocks are therefore centred on multiples of ps, not',
  '     aligned to them: 0,1 -> 0; 2..5 -> 4; 6..9 -> 8. An exact half occurs',
  '     only for odd ps, at x = ps*k + (ps-1)/2, and GLSL round() leaves its',
  '     direction to the implementation; here it is half-up, in integer',
  '     arithmetic so no float product can land a hair off the half. The',
  '     texel itself is exact here where the GPU\'s k/(W/ps)*W is not: in',
  '     float32 that chain lands one texel short for 9% of (W,ps,k) over',
  '     widths to 1280 (counted in the effects-b REPORT); what the hardware',
  '     then does with a coordinate a few ulps under an integer is its own. */',
  '  run(src,W,H,v){',
  '    const px=Math.max(1,Math.round(+v.px||1)), py=Math.max(1,Math.round(+v.py||1));',
  '    const gx=new Int32Array(W), gy=new Int32Array(H);',
  '    for(let x=0;x<W;x++) gx[x]=Math.min(W-1,px*Math.floor((2*x+1+px)/(2*px)));',
  '    for(let y=0;y<H;y++) gy[y]=Math.min(H-1,py*Math.floor((2*y+1+py)/(2*py)));',
  '    const out=new Uint8ClampedArray(src.length);',
  '    for(let y=0;y<H;y++){ const row=gy[y]*W; for(let x=0;x<W;x++){ const p=(y*W+x)*4, q=(row+gx[x])*4;',
  '      out[p]=src[q]; out[p+1]=src[q+1]; out[p+2]=src[q+2]; out[p+3]=src[q+3]; } }',
  '    return out;',
  '  },',
  '  note:v=>"Blocks of "+v.px+" by "+v.py+", each the colour of the pixel at its centre.",',
  '});',
  '',
  'registerEffect({',
  '  id:"offset", name:"Offset",',
  '  /* OffsetScaleImage.tscn: offset 0, scale 100% (1..5000), wrap off. Wrap',
  '     is on here because this is the tile-art tool and wrapping is what it',
  '     is for; one tick turns it off. Offsets are whole pixels, as the ivec2',
  '     uniform is; the dialog bounds them by the canvas size, which a static',
  '     control cannot, so the bound here is the largest canvas. */',
  '  params:[',
  '    {id:"ox",label:"Across",type:"number",min:-4096,max:4096,step:1,value:0},',
  '    {id:"oy",label:"Down",type:"number",min:-4096,max:4096,step:1,value:0},',
  '    {id:"scale",label:"Scale %",type:"number",min:1,max:5000,step:1,value:100},',
  '    {id:"wrap",label:"Wrap around",type:"check",value:true},',
  '  ],',
  '  /* OffsetPixels.gdshaderinc: uv=(x+0.5-ox)/W, then zoomed about the',
  '     centre by 1/scale, fract() when wrapping, and the alpha is zeroed where',
  '     the zoomed uv leaves [0,1] (inclusive, as the two step()s are) - the',
  '     rgb still comes from the clamped edge texel, as it does there. For',
  '     scale 1 the texel is (x-ox) mod W exactly, the half-pixel of margin',
  '     making float64 and float32 agree; at other scales a sample can land',
  '     on a texel boundary (every pixel does at 50%) and there the GPU\'s',
  '     float32 may pick the other side on a width that is not a power of',
  '     two. */',
  '  run(src,W,H,v){',
  '    const ox=Math.round(+v.ox||0), oy=Math.round(+v.oy||0), s=Math.max(0.01,(+v.scale||100)/100), wrap=!!v.wrap;',
  '    const out=new Uint8ClampedArray(src.length);',
  '    for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
  '      let zx=((x+0.5-ox)/W-0.5)/s+0.5, zy=((y+0.5-oy)/H-0.5)/s+0.5;',
  '      if(wrap){ zx-=Math.floor(zx); zy-=Math.floor(zy); }',
  '      const inb=zx>=0&&zx<=1&&zy>=0&&zy<=1;',
  '      const sx=Math.min(W-1,Math.max(0,Math.floor(zx*W))), sy=Math.min(H-1,Math.max(0,Math.floor(zy*H)));',
  '      const p=(y*W+x)*4, q=(sy*W+sx)*4;',
  '      out[p]=src[q]; out[p+1]=src[q+1]; out[p+2]=src[q+2]; out[p+3]=inb?src[q+3]:0;',
  '    }',
  '    return out;',
  '  },',
  '  note:v=>"Shifted "+v.ox+" across and "+v.oy+" down at "+v.scale+"%. "+(v.wrap?"What leaves one edge comes back in at the other.":"What leaves an edge is lost."),',
  '});',
  '',
  'registerEffect({',
  '  id:"inline", name:"Inline (inside edge)",',
  '  /* OutlineDialog.tscn: thickness 1 (step 1, no ceiling), black, Diamond.',
  '     Only the INSIDE mode of OutlineInline.gdshaderinc is here; the Outline',
  '     panel (O) already draws the outside with its own block-snapping',
  '     algorithm. */',
  '  params:[',
  '    {id:"width",label:"Thickness",type:"number",min:1,max:64,step:1,value:1},',
  '    {id:"color",label:"Colour",type:"color",value:"#000000"},',
  '    {id:"alpha",label:"Alpha",type:"range",min:0,max:255,step:1,value:255},',
  '    {id:"brush",label:"Brush",type:"select",value:"diamond",',
  '      options:[{value:"diamond",label:"Diamond"},{value:"circle",label:"Circle"},{value:"square",label:"Square"}]},',
  '  ],',
  '  /* has_contrary_neighbour with inside=true: a pixel with alpha>0 whose',
  '     brush-shaped neighbourhood holds a transparent pixel (alpha exactly 0:',
  '     is_zero_approx is a<0.0001 and 1/255 is above it) or a point off the',
  '     canvas - with uv at pixel centres, off the canvas is exactly x+i<0 or',
  '     x+i>=W. Row reach at column offset i: diamond w-|i|, circle',
  '     floor(sqrt((w+0.5)^2-i^2)) - never within 1/(8w) of an integer, so',
  '     the floor is safe in float32 too - square w. Then rgb=mix(rgb, colour,',
  '     ca) and a+=(1-a)*ca, or a=0 when the colour is fully transparent,',
  '     which erases the edge: the shader\'s own rule, kept. */',
  '  run(src,W,H,v){',
  '    const w=Math.max(1,Math.round(+v.width||1)), c=hx2(v.color||"#000000"), ca=(+v.alpha||0)/255, brush=v.brush||"diamond";',
  '    const reach=new Int32Array(2*w+1);',
  '    for(let i=-w;i<=w;i++) reach[i+w]= brush==="circle" ? Math.floor(Math.sqrt((w+0.5)*(w+0.5)-i*i)) : brush==="square" ? w : w-Math.abs(i);',
  '    const out=new Uint8ClampedArray(src);',
  '    for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
  '      const p=(y*W+x)*4, a8=src[p+3]; if(a8===0) continue;',
  '      let hit=false;',
  '      for(let i=-w;i<=w&&!hit;i++){ const nx=x+i, r=reach[i+w];',
  '        for(let j=-r;j<=r;j++){ const ny=y+j; if(nx<0||ny<0||nx>=W||ny>=H||src[(ny*W+nx)*4+3]===0){ hit=true; break; } } }',
  '      if(!hit) continue;',
  '      out[p]=pxbU8(src[p]*(1-ca)+c[0]*ca); out[p+1]=pxbU8(src[p+1]*(1-ca)+c[1]*ca); out[p+2]=pxbU8(src[p+2]*(1-ca)+c[2]*ca);',
  '      out[p+3]= ca<0.0001 ? 0 : pxbU8(a8+(255-a8)*ca);',
  '    }',
  '    return out;',
  '  },',
  '  note:v=>"The "+v.width+"px inside edge of the art, "+v.brush+" brush. The Outline panel (O) draws the outside.",',
  '});',
]));

/* ---- 2. an N-stop list rides in as extra values -------------------------
   The panel reads its values from the controls it drew, and it has no
   control that draws a gradient. fxApply and fxPreview take an optional
   object merged over those values. A MouseEvent is not one - fxApply is the
   Apply button's onclick - so anything that is an Event is ignored. */
swap('function fxApply(){', 'function fxApply(extra){');
swap(block([
  '  const fx=fxCurrent(); if(!fx||!ctx){ toast("Nothing to apply"); return; }',
  '  const W=art.width, H=art.height, vals=fxValues();',
]), block([
  '  const fx=fxCurrent(); if(!fx||!ctx){ toast("Nothing to apply"); return; }',
  '  const W=art.width, H=art.height, vals=fxValues();',
  '  if(extra&&typeof extra==="object"&&!(extra instanceof Event)) Object.assign(vals,extra);',
]));
swap('function fxPreview(){', 'function fxPreview(extra){');
swap(block([
  '  fxTimer=setTimeout(()=>{',
  '    const W=art.width, H=art.height, vals=fxValues();',
]), block([
  '  fxTimer=setTimeout(()=>{',
  '    const W=art.width, H=art.height, vals=fxValues();',
  '    if(extra&&typeof extra==="object"&&!(extra instanceof Event)) Object.assign(vals,extra);',
]));

/* ---- 2b. a newly registered effect is the one shown ----------------------
   A two-state swap: the OLD text exactly once and the new absent, or the NEW
   text exactly once and the old absent. Anything else throws. Every effects
   patch needs this same change and whichever lands second must not fail on
   an anchor the first one already rewrote; a DIFFERENT rewrite of the same
   line still throws, as it should. */
function swapOrPresent(from, to) {
  const nf = text.split(from).length - 1, nt = text.split(to).length - 1;
  if (nf === 1 && nt === 0) { text = text.split(from).join(to); return; }
  if (nf === 0 && nt === 1) return;
  throw new Error('expected exactly one of old/new for: ' + from.slice(0, 60) + ' (old ' + nf + ', new ' + nt + ')');
}
swapOrPresent('  EFFECTS.push(fx); fxRebuild();', '  EFFECTS.push(fx); fxRebuild(fx.id);');
swapOrPresent('function fxRebuild(){', 'function fxRebuild(pick){');
swapOrPresent('  if(EFFECTS.some(e=>e.id===had)) s.value=had;', block([
  '  /* The one just registered, else the one that was chosen, else the first:',
  '     a person who adds an effect is shown it, and one who opens the panel',
  '     finds it where they left it. */',
  '  const want=pick||had; if(EFFECTS.some(e=>e.id===want)) s.value=want;',
]));

/* ---- 3. the agent surface ------------------------------------------------ */
swap('PB.text=function(o){', block([
  '/* An N-stop gradient map, which the panel\'s two colour wells cannot',
  '   express. o={stops:[{at:0..1, color:"#rrggbb", alpha:0..255},...],',
  '   interp:"linear"|"constant"|"cubic", apply:bool}. The first and last',
  '   stops go into the wells so the panel shows what was done, and the full',
  '   list rides in as an extra value on the same preview/apply path a',
  '   person\'s Apply takes. */',
  'PB.gradientMap=function(o){',
  '  o=o||{};',
  '  let stops; try{ stops=pxbGmStops(o.stops); }catch(err){ return {ok:false, why:String(err.message||err)}; }',
  '  const interp=["linear","constant","cubic"].indexOf(o.interp)>=0?o.interp:"linear";',
  '  const first=stops[0], last=stops[stops.length-1];',
  '  const r=PB.adjust("gradmap",{c0:first.hex,a0:first.a8,c1:last.hex,a1:last.a8,interp:interp},false);',
  '  if(!r.ok) return r;',
  '  const extra={stops:o.stops};',
  '  if(o.apply) fxApply(extra); else fxPreview(extra);',
  '  return {ok:true, stops:stops.map(s=>({at:s.at,color:s.hex,alpha:s.a8})), interp:interp, applied:!!o.apply};',
  '};',
  'PB.text=function(o){',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* THE EFFECTS LAND AFTER THE REGISTRY EXISTS. registerEffect is hoisted;
   `const EFFECTS` is not, and a call above it is a load-time throw that
   takes the whole page with it. */
{
  const reg = code.indexOf('const EFFECTS=[];'), mine = code.indexOf('function pxbU8(v){'), rail = code.indexOf('function railPanel(id,on){');
  if (reg < 0 || mine < 0 || rail < 0) throw new Error('could not place the block');
  if (!(reg < mine && mine < rail)) throw new Error('the effects are not between the registry and railPanel');
}
/* EACH ID ONCE, and no id another patch might be using. */
const IDS = ['gradmap', 'dropshadow', 'pixelize', 'offset', 'inline'];
/* THIS BLOCK'S OWN EXTENT, not "up to railPanel". Another effects patch lands
   between this block and railPanel, and a slice that ran to railPanel counted
   its controls too - 29 where 19 were expected. The block ends with its last
   registration, so the end is the close of the "inline" call. */
const pxbStart = code.indexOf('function pxbU8(v){');
const pxbEnd = (() => { const i = code.indexOf('id:"inline"'); const j = code.indexOf(String.fromCharCode(13,10)+'});', i); if (i < 0 || j < 0) throw new Error('could not bound this block'); return j + 5; })();
for (const id of IDS)
  if (code.split('id:"' + id + '"').length !== 2) throw new Error('effect id not registered exactly once: ' + id);
/* Every control is labelled - the panel puts the label on the row, and an
   unlabelled number is a number nobody can name. */
{
  const mine = code.slice(pxbStart, pxbEnd);
  const params = mine.match(/\{id:"[a-z0-9]+",label:"[^"]+",type:"[a-z]+"/g) || [];
  /* 5 gradient map + 4 drop shadow + 2 pixelize + 4 offset + 4 inline. */
  if (params.length !== 19) throw new Error('expected 19 labelled params, found ' + params.length);
}

/* RUN IS PURE. The block owns nothing on the canvas: no ctx, no
   putImageData, no snapshot, no mask. The panel does all of that. */
{
  const mine = code.slice(pxbStart, pxbEnd);
  for (const bad of ['ctx.', 'putImageData', 'snapshot(', 'selMask', 'getImageData', 'document.', '$('])
    if (mine.indexOf(bad) >= 0) throw new Error('an effect touches the page: ' + bad);
  /* And the table is built in float32 with a truncating store - the two
     facts about Godot's texture build the port stands on. */
  const sample = mine.slice(mine.indexOf('function pxbGmSample('), mine.indexOf('function pxbGmLut('));
  if ((sample.match(/F\(/g) || []).length < 20) throw new Error('the gradient sample is not done in float32');
  const lut = mine.slice(mine.indexOf('function pxbGmLut('), mine.indexOf('registerEffect({'));
  if (lut.indexOf('Math.trunc(') < 0 || lut.indexOf('pxbF(i/63)') < 0) throw new Error('the table is not stored the way Godot stores it');
}

/* APPLY STILL GOES THROUGH SNAPSHOT, AFTER THE NO-OP REFUSAL - patch359's
   own check, re-run, because this patch edits fxApply. */
{
  const ap = code.slice(code.indexOf('function fxApply(extra){'), code.indexOf('(function(){\r\n  const s=$("fxsel")'));
  if (ap.indexOf('snapshot();') < 0) throw new Error('fxApply does not take an undo step');
  if (ap.indexOf('snapshot();') < ap.indexOf('if(same){')) throw new Error('fxApply snapshots before refusing a no-op');
  if (ap.indexOf('if(extra&&typeof extra==="object"&&!(extra instanceof Event)) Object.assign(vals,extra);') < 0)
    throw new Error('fxApply does not merge extra values');
}
{
  const pv = code.slice(code.indexOf('function fxPreview(extra){'), code.indexOf('function fxApply(extra){'));
  if (pv.indexOf('if(extra&&typeof extra==="object"&&!(extra instanceof Event)) Object.assign(vals,extra);') < 0)
    throw new Error('fxPreview does not merge extra values');
  if (pv.indexOf('ctx.putImageData') >= 0) throw new Error('the preview writes to the artwork');
}
if (code.indexOf('function fxApply(){') >= 0 || code.indexOf('function fxPreview(){') >= 0)
  throw new Error('an old signature survives');

/* REGISTERING SELECTS. The line that pushes also picks, and the picker
   honours it before the remembered choice. */
if (code.indexOf('  EFFECTS.push(fx); fxRebuild(fx.id);') < 0) throw new Error('registerEffect does not select what it registered');
if (code.indexOf('const want=pick||had; if(EFFECTS.some(e=>e.id===want)) s.value=want;') < 0) throw new Error('fxRebuild does not honour the pick');
if (code.indexOf('function fxRebuild(){') >= 0) throw new Error('the old fxRebuild signature survives');

/* THE AGENT SURFACE DRIVES THE PANEL, then the shared apply. */
{
  const pb = code.slice(code.indexOf('PB.gradientMap=function(o){'), code.indexOf('PB.text=function(o){'));
  if (!pb) throw new Error('PB.gradientMap is missing');
  if (pb.indexOf('PB.adjust("gradmap"') < 0) throw new Error('PB.gradientMap does not go through PB.adjust');
  if (pb.indexOf('if(o.apply) fxApply(extra); else fxPreview(extra);') < 0) throw new Error('PB.gradientMap does not use the shared apply');
}

/* THE PORT IS RUN HERE, ON NUMBERS DERIVED FROM THE SHADERS, before it is
   written anywhere. The block is sliced out of the result and evaluated with
   the two things it needs from the page - registerEffect and hx2 - stubbed. */
{
  const mine = script.slice(script.indexOf('function pxbU8(v){'), script.indexOf('function railPanel(id,on){'));
  const reg = [];
  const hx2 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // eslint-disable-next-line no-new-func
  new Function('registerEffect', 'hx2', mine)(fx => reg.push(fx), hx2);
  const fx = id => { const e = reg.find(e => e.id === id); if (!e) throw new Error('not registered in the block: ' + id); return e; };
  const eq = (got, want, what) => {
    const g = Array.from(got), w = Array.from(want);
    if (g.length !== w.length || g.some((v, i) => v !== w[i])) throw new Error(what + ': got [' + g + '] want [' + w + ']');
  };
  const vals = id => { const o = {}; for (const p of fx(id).params) o[p.id] = p.value; return o; };

  /* Gradient map, black to white: white is luma 1 -> column 63 -> 255; red
     is 0.2126*64 = 13.6 -> column 13 -> trunc(255*float32(13/63)) =
     trunc(52.62) = 52, not the 53 a rounding store would give; alpha rides
     through. */
  eq(fx('gradmap').run(new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 200]), 2, 1, vals('gradmap')),
    [255, 255, 255, 255, 52, 52, 52, 200], 'gradient map 2-stop');
  /* Three stops, constant: grey 128 is column 32, t=32/63 > 0.5, the
     segment's first colour is green. Linear: w=(32/63-0.5)/0.5=0.015873 ->
     g=trunc(255*0.984127)=trunc(250.95)=250, b=trunc(255*0.015873)=4.
     Cubic, green->blue with red before and blue (clamped) after:
     g=0.5*(2-5w^2+3w^3)=0.999376 -> 254; b=0.5*(w+3w^2-2w^3)=0.008310 -> 2;
     r=0.5*(-w+2w^2-w^3)<0 -> 0. */
  const three = [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#00ff00' }, { at: 1, color: '#0000ff' }];
  eq(fx('gradmap').run(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1, Object.assign(vals('gradmap'), { stops: three, interp: 'constant' })),
    [0, 255, 0, 255], 'gradient map constant');
  eq(fx('gradmap').run(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1, Object.assign(vals('gradmap'), { stops: three, interp: 'linear' })),
    [0, 250, 4, 255], 'gradient map 3-stop linear');
  eq(fx('gradmap').run(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1, Object.assign(vals('gradmap'), { stops: three, interp: 'cubic' })),
    [0, 254, 2, 255], 'gradient map 3-stop cubic');
  /* THE COLUMN WHERE FLOAT32 AND FLOAT64 DISAGREE. Grey 84 is column 21,
     t=1/3; black to #450000 is 69/255 * 1/3 * 255 = 23 exactly. Godot's
     float32 lands at 23.0000016 and truncates to 23; float64 lands at
     22.999999999999996 and truncates to 22. */
  eq(fx('gradmap').run(new Uint8ClampedArray([84, 84, 84, 255]), 1, 1, Object.assign(vals('gradmap'), { c1: '#450000' })),
    [23, 0, 0, 255], 'gradient map float32 column');

  /* Drop shadow, one red pixel at (2,2) in 8x8, offset 1,2: the shadow lands
     at (3,4) as rgb round(21*160/255)=13, alpha 160; the pixel itself keeps
     its colour; the rest stays clear. */
  {
    const W = 8, H = 8, src = new Uint8ClampedArray(W * H * 4);
    src.set([255, 0, 0, 255], (2 * W + 2) * 4);
    const out = fx('dropshadow').run(src, W, H, Object.assign(vals('dropshadow'), { ox: 1, oy: 2 }));
    eq(out.slice((4 * W + 3) * 4, (4 * W + 3) * 4 + 4), [13, 13, 13, 160], 'drop shadow pixel');
    eq(out.slice((2 * W + 2) * 4, (2 * W + 2) * 4 + 4), [255, 0, 0, 255], 'drop shadow leaves the art');
    let n = 0; for (let i = 3; i < out.length; i += 4) if (out[i]) n++;
    if (n !== 2) throw new Error('drop shadow: ' + n + ' pixels set, want 2');
  }
  /* Pixelize, 16 columns coloured by x: block 4 sends column 2 to texel 4
     and column 14 to texel 16, clamped to 15; block 3 sends column 1, an
     exact half, up to texel 3. */
  {
    const W = 16, src = new Uint8ClampedArray(W * 4);
    for (let x = 0; x < W; x++) src.set([x * 16, 0, 0, 255], x * 4);
    const o4 = fx('pixelize').run(src, W, 1, { px: 4, py: 4 });
    if (o4[2 * 4] !== 64 || o4[14 * 4] !== 240) throw new Error('pixelize 4: ' + o4[8] + ',' + o4[56]);
    const o3 = fx('pixelize').run(src, W, 1, { px: 3, py: 3 });
    if (o3[1 * 4] !== 48) throw new Error('pixelize 3 half-up: ' + o3[4]);
  }
  /* Offset 3 with wrap on a 16-wide row: column 0 shows texel 13. Off, the
     first three columns are clear. */
  {
    const W = 16, src = new Uint8ClampedArray(W * 4);
    for (let x = 0; x < W; x++) src.set([x * 16, 0, 0, 255], x * 4);
    const on = fx('offset').run(src, W, 1, { ox: 3, oy: 0, scale: 100, wrap: true });
    if (on[0] !== 13 * 16 || on[3] !== 255) throw new Error('offset wrap: ' + on[0] + ',' + on[3]);
    const off = fx('offset').run(src, W, 1, { ox: 3, oy: 0, scale: 100, wrap: false });
    if (off[3] !== 0 || off[2 * 4 + 3] !== 0 || off[3 * 4 + 3] !== 255 || off[3 * 4] !== 0) throw new Error('offset no wrap');
  }
  /* Inline, a 3x3 red block in 5x5, diamond 1: the eight outer pixels have a
     4-neighbour that is clear and go black; the centre does not. */
  {
    const W = 5, H = 5, src = new Uint8ClampedArray(W * H * 4);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) src.set([255, 0, 0, 255], (y * W + x) * 4);
    const out = fx('inline').run(src, W, H, vals('inline'));
    let black = 0, red = 0;
    for (let i = 0; i < out.length; i += 4) { if (out[i + 3] === 0) continue; if (out[i] === 0) black++; else red++; }
    if (black !== 8 || red !== 1) throw new Error('inline: ' + black + ' black, ' + red + ' red');
    /* Alpha 128 on red: rgb round(255*127/255)=127, alpha stays 255. */
    const half = fx('inline').run(src, W, H, Object.assign(vals('inline'), { alpha: 128 }));
    eq(half.slice((1 * W + 1) * 4, (1 * W + 1) * 4 + 4), [127, 0, 0, 255], 'inline half alpha');
  }
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
