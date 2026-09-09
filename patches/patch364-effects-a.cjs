/* PIXELORAMA'S COLOUR EFFECTS, FIVE OF THEM, AS REGISTERED EFFECTS.

   Hue/Saturation/Value, Brightness/Contrast, Invert, Desaturate and
   Posterize, ported from Pixelorama (src/Shaders/Effects/HSV,
   BrightnessContrast, Invert, Desaturate, Posterize .gdshaderinc, with the
   slider ranges from the .tscn files and the /255 and /100 divisions from
   the dialogs that feed them). The maths is the shaders', line for line -
   the dialogs do nothing but carry slider values to a uniform - and the
   port keeps the shaders' quirks rather than tidying them: HSV re-quantises
   every pixel onto a 360/100/100 integer grid even at a shift of zero,
   wrapping is modulo 100 for saturation and value and modulo 255 bytes for
   a colour shift, and the brightness and contrast offsets are scaled by the
   pixel's alpha because that is where the fourth matrix column puts them.

   Nothing here but registerEffect calls and pure functions. The Adjust
   panel from patch359 draws the controls, previews on its own layer,
   confines the result to a selection, refuses a no-op and applies through
   snapshot() - the shaders' own mix(original, col, selection.a) is exactly
   that confinement, so it is not repeated here.

   WHERE A BYTE CAN DIFFER FROM PIXELORAMA BY ONE. The GPU stores the
   shader's float into RGBA8 by rounding to the nearest byte, and the GL
   spec leaves a value landing exactly halfway to the implementation. This
   port resolves such a tie half-to-even, which is Uint8ClampedArray's own
   rule. The shaders' round() calls - HSV's grid and Posterize's levels -
   have the same implementation-defined tie in GLSL and are Math.round
   (half up) here. And the GPU computes in float32 where this runs in
   float64, which can move a value that is within ~1e-6 of a tie to the
   other side of it. Each effect's comment below names the settings and
   pixels where a tie actually occurs; the vectors this patch checks itself
   against are chosen off every such tie, by a margin of 0.05 byte or more.

   The block is checked before it is written: it is executed in node with a
   stub registerEffect and every effect is run against bytes derived from the
   shader formulas by hand. A port that rounds the wrong way, mixes up a
   matrix column or wraps on 256 instead of 255 is refused here, not found
   in the browser. */
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

/* PB_INDEX lets this run against a copy first and the served file later. */
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

/* ---- the effects ---------------------------------------------------------
   Written as one raw string so the escapes reach index.html as written. It
   uses registerEffect and hx2 and nothing else on the page, which is what
   lets the check below execute it outside the browser. */
const EFFECTS_SRC = String.raw`/* ---- Pixelorama's colour effects ------------------------------------------

   Five of Pixelorama's image effects with the maths taken from
   src/Shaders/Effects/*.gdshaderinc - the dialogs only carry slider values
   to the shader, so the shader is what is ported. Each run() works the way
   the shader does: bytes become byte/255 floats, the arithmetic is the
   shader's, and the result goes back to bytes the way the GPU's RGBA8 store
   does - nearest byte, clamped. The one place the two can differ is a value
   landing exactly between two bytes: the GL spec leaves that tie to the
   implementation and this rounds it half-to-even, which is
   Uint8ClampedArray's own rule. Each effect says below where such a tie
   actually happens. Selection is not handled here - the panel confines the
   result - because the shaders' mix(original, col, selection.a) is exactly
   that confinement. Every run is pure: copy in, new pixels out, never ctx. */
(function(){
  /* is_equal_approx in the shaders: |a-b| <= 1e-4. On byte/255 inputs,
     which sit at least 1/255 = 0.0039 apart, that is exact equality; it is
     kept as written so the port reads against the shader. */
  const eq=(a,b)=>Math.abs(a-b)<=1e-4;
  /* GLSL mod(): x - y*floor(x/y), never negative. JS % is not that. */
  const gmod=(x,y)=>x-y*Math.floor(x/y);
  const bytes=n=>new Uint8ClampedArray(n);
  const sgn=n=>(n>0?"+":"")+n;

  /* ---- HSV.gdshaderinc. rgb2hsv and hsv2rgb are Godot's Color::get_h/
     get_s/get_v and Color::set_hsv, as the shader copies them. */
  function rgb2hsv(r,g,b){
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; let h;
    if(eq(d,0)) h=0;
    else{
      if(eq(r,mx)) h=(g-b)/d;            // between yellow and magenta
      else if(eq(g,mx)) h=2+(b-r)/d;     // between cyan and yellow
      else h=4+(r-g)/d;                  // between magenta and cyan
      h/=6; if(h<0) h+=1;
    }
    return [h, eq(mx,0)?0:d/mx, mx];
  }
  function hsv2rgb(h,s,v){
    if(eq(s,0)) return [v,v,v];          // achromatic
    /* The shader's own fmod, x - y*trunc(x/y): h*6 is in [0,6], so this
       only bites at exactly 6, which becomes 0 - red again, as it should. */
    h*=6; h=h-6*Math.trunc(h/6);
    const i=Math.floor(h), f=h-i, p=v*(1-s), q=v*(1-s*f), t=v*(1-s*(1-f));
    switch(i){ case 0: return [v,t,p]; case 1: return [q,v,p]; case 2: return [p,v,t];
               case 3: return [p,q,v]; case 4: return [t,p,v]; default: return [v,p,q]; }
  }
  /* The shader works on an integer grid - hue in whole degrees, saturation
     and value in whole percent - and shifts by whole steps. Wrapping is the
     shader's: only when the sum leaves [0,top], and by GLSL mod, so 350+20
     is 10 and -10 is 350. It wraps on 360 for hue but on 100 for the other
     two, so 90% saturation +20 is 10% - which is what Pixelorama does.
     WHERE A BYTE CAN DIFFER BY ONE: two roundings. The grid's round() is a
     tie on ordinary bytes - (200,99,99) has saturation 101/200 = 50.5, and
     (255,136,135) has hue 60/120 = 0.5 degrees - where GLSL's tie rule is
     the driver's and this rounds up; value 100k/255 = 20k/51 never ties.
     Then the store: grey 128 is value 50%, and 0.5*255 = 127.5 comes back
     as 128 under either tie rule, but v=10% s=0 gives 25.5, which is 26
     here and either 25 or 26 on the GPU. Float32 cannot reach a non-tie:
     every grid fraction has a denominator of at most 255, so the nearest
     miss is 1/510 = 0.002 of a step, far above float32's ~1e-5. */
  function grid(c,by,top,wrap){
    if(wrap&&(c+by>top||c+by<0)) return Math.trunc(gmod(c+by,top));
    return Math.max(0,Math.min(top,c+by));
  }
  registerEffect({id:"hsv", name:"Hue/Saturation/Value", params:[
      {id:"hue",label:"Hue",min:-180,max:180,step:1,value:0},
      {id:"saturation",label:"Saturation",min:-100,max:100,step:1,value:0},
      {id:"value",label:"Value",min:-100,max:100,step:1,value:0},
      {id:"wrap",label:"Wrap overflowing values",type:"check",value:false}],
    run(src,W,H,v){
      /* int uniforms in the shader: a fraction from an agent is truncated. */
      const hue=Math.trunc(v.hue)||0, sat=Math.trunc(v.saturation)||0, val=Math.trunc(v.value)||0, wrap=!!v.wrap;
      const out=bytes(src.length);
      for(let p=0;p<src.length;p+=4){
        const r=src[p]/255, g=src[p+1]/255, b=src[p+2]/255, hsv=rgb2hsv(r,g,b);
        /* round() onto the grid. Even a shift of zero re-quantises the pixel
           onto it - Pixelorama does exactly this, and the panel refuses the
           apply when that happens to move nothing. */
        let h=Math.round(hsv[0]*360), s=Math.round(hsv[1]*100), vv=Math.round(hsv[2]*100);
        if(!eq(r,g)||!eq(g,b)) h=grid(h,hue,360,wrap);   // a grey has no hue to shift
        if(sat!==0) s=grid(s,sat,100,wrap);
        if(val!==0) vv=grid(vv,val,100,wrap);
        const o=hsv2rgb(h/360,s/100,vv/100);
        out[p]=o[0]*255; out[p+1]=o[1]*255; out[p+2]=o[2]*255; out[p+3]=src[p+3];
      }
      return out;
    },
    note:v=>"Hue "+sgn(v.hue)+"\u00b0, saturation "+sgn(v.saturation)+"%, value "+sgn(v.value)+"%, "+
      (v.wrap?"wrapping past the ends":"held at the ends")+". Whole steps on a 360/100/100 grid, as Pixelorama."
  });

  /* ---- BrightnessContrast.gdshaderinc - the CC0 "color manipulator" from
     godotshaders.com. Three 4x4 matrices multiplied into the pixel in the
     order brightness * contrast * saturation * colour, written out here as
     the arithmetic each one does, with one thing carried over that the
     matrices hide: the contrast offset (1-c)/2 and the brightness offset sit
     in the fourth column, so they are multiplied by the pixel's ALPHA. An
     opaque pixel gets the full offset, a half-transparent one half of it and
     a transparent one none - that is the shader, kept as it is.
     WHERE A BYTE CAN DIFFER BY ONE: only at the store, and there whole
     settings are ties for EVERY opaque pixel. Brightness b adds 2.55*b to
     the byte, so b = 10, 30, 50, 70, 90 (and their negatives) add x.5 to
     every byte at once - 26 here for +10 on black, 25 or 26 on the GPU.
     Contrast c maps byte k to c*k + (1-c)*127.5, so c = 200% (2k - 127.5)
     and every other even multiple of 100% is a tie on every byte; 150% is
     1.5k - 63.75, never a tie. Saturation 0 is the luminance sum
     (3086r + 6094g + 820b)/10000, a tie only when that is a multiple of
     5000 - rare, and then float32 decides. The tint is applied as its sRGB
     bytes/255, the shader's literal maths; whether Godot's source_color
     hint converts it to linear first under gl_compatibility is not
     something this port can measure, and at the default white the two
     readings agree. */
  const LUM=[0.3086,0.6094,0.0820];   // Haeberli's luminance weights, sum 1, as the shader has them
  registerEffect({id:"brightness-contrast", name:"Brightness/Contrast", params:[
      {id:"red_shift",label:"Red shift",min:-255,max:255,step:1,value:0},
      {id:"green_shift",label:"Green shift",min:-255,max:255,step:1,value:0},
      {id:"blue_shift",label:"Blue shift",min:-255,max:255,step:1,value:0},
      {id:"brightness",label:"Brightness",min:-100,max:100,step:1,value:0},
      {id:"contrast",label:"Contrast",min:0,max:300,step:1,value:100},
      {id:"saturation",label:"Saturation",min:0,max:300,step:1,value:100},
      {id:"red_value",label:"Red value",min:0,max:100,step:1,value:100},
      {id:"green_value",label:"Green value",min:0,max:100,step:1,value:100},
      {id:"blue_value",label:"Blue value",min:0,max:100,step:1,value:100},
      {id:"tint_color",label:"Tint colour",type:"color",value:"#ffffff"},
      {id:"tint_effect_factor",label:"Tint effect factor",min:0,max:100,step:1,value:0},
      {id:"wrap",label:"Wrap overflowing values",type:"check",value:false}],
    run(src,W,H,v){
      /* The dialog's divisions: shifts /255 into [-1,1], everything else /100. */
      const rs=v.red_shift/255, gs=v.green_shift/255, bs=v.blue_shift/255;
      const br=v.brightness/100, ct=v.contrast/100, sa=v.saturation/100;
      const rv=v.red_value/100, gv=v.green_value/100, bv=v.blue_value/100, tf=v.tint_effect_factor/100;
      const tint=hx2(v.tint_color||"#ffffff").map(x=>x/255), wrap=!!v.wrap;
      /* A shift within 1e-4 of zero is skipped, as the shader's
         is_equal_approx; one whole step is 1/255 = 0.0039, so every non-zero
         slider value counts. Wrapping is GLSL mod on the FLOAT, which makes
         it modulo 255 bytes rather than 256: 255 + 100 lands on 100. */
      const shift=(c,by)=>{ if(Math.abs(by)<=1e-4) return c;
        if(wrap&&(c+by>1||c+by<0)) return gmod(c+by,1);
        return Math.max(0,Math.min(1,c+by)); };
      const t=(1-ct)/2, om=1-sa;
      const out=bytes(src.length);
      for(let p=0;p<src.length;p+=4){
        const a=src[p+3]/255;
        const r=shift(src[p]/255,rs), g=shift(src[p+1]/255,gs), b=shift(src[p+2]/255,bs);
        /* mix(c_shift, c_shift*tint_color, tint_effect_factor). The tint's
           alpha is 1 - a colour input has none - so the alpha the matrices
           see is the pixel's own. */
        const mr=r*(1-tf)+r*tint[0]*tf, mg=g*(1-tf)+g*tint[1]*tf, mb=b*(1-tf)+b*tint[2]*tf;
        /* saturationMatrix: (1-s)*luminance on every channel plus s*value*channel. */
        const l=om*(LUM[0]*mr+LUM[1]*mg+LUM[2]*mb);
        const sr=l+sa*rv*mr, sg=l+sa*gv*mg, sb=l+sa*bv*mb;
        /* contrastMatrix then brightnessMatrix, both offsets scaled by alpha. */
        const off=t*a+br*a;
        out[p]=(ct*sr+off)*255; out[p+1]=(ct*sg+off)*255; out[p+2]=(ct*sb+off)*255;
        out[p+3]=src[p+3];
      }
      return out;
    },
    note:v=>{
      const bits=[];
      for(const c of ["red","green","blue"]) if(v[c+"_shift"]) bits.push(c+" shift "+sgn(v[c+"_shift"]));
      if(v.brightness) bits.push("brightness "+sgn(v.brightness)+"%");
      if(v.contrast!==100) bits.push("contrast "+v.contrast+"%");
      if(v.saturation!==100) bits.push("saturation "+v.saturation+"%");
      if(v.red_value!==100||v.green_value!==100||v.blue_value!==100) bits.push("channel values "+v.red_value+"/"+v.green_value+"/"+v.blue_value+"%");
      if(v.tint_effect_factor>0) bits.push("tint "+v.tint_color+" at "+v.tint_effect_factor+"%");
      if(!bits.length) return "Everything at its default - nothing changes.";
      return bits.join(", ")+(v.wrap?", wrapping past the ends":"")+". Offsets scale with a pixel's alpha, as the shader's matrices do.";
    }
  });

  /* ---- Invert.gdshaderinc: 1 - channel, per toggled channel. In bytes that
     is exactly 255 - k: the float error of 1 - k/255 is far below half a
     byte, so nothing is gained by going through the float.
     WHERE A BYTE CAN DIFFER BY ONE: nowhere. (255-k)/255 stores back to
     255-k on any GPU; there is no tie to resolve. */
  registerEffect({id:"invert", name:"Invert colours", params:[
      {id:"red",label:"Red",type:"check",value:true},
      {id:"green",label:"Green",type:"check",value:true},
      {id:"blue",label:"Blue",type:"check",value:true},
      {id:"alpha",label:"Alpha",type:"check",value:false}],
    run(src,W,H,v){
      const out=bytes(src.length), R=!!v.red, G=!!v.green, B=!!v.blue, A=!!v.alpha;
      for(let p=0;p<src.length;p+=4){
        out[p]=R?255-src[p]:src[p]; out[p+1]=G?255-src[p+1]:src[p+1];
        out[p+2]=B?255-src[p+2]:src[p+2]; out[p+3]=A?255-src[p+3]:src[p+3];
      }
      return out;
    },
    note:v=>{ const on=["red","green","blue","alpha"].filter(k=>v[k]);
      return on.length?"Inverting "+on.join(", ")+".":"No channel chosen - nothing to invert."; }
  });

  /* ---- Desaturate.gdshaderinc. Not a plain average: the pixel goes from
     sRGB to linear light, takes the Y of the linear-RGB-to-XYZ transform
     (the shader's own Rec. 709 weights, which sum to 1), and comes back
     through the sRGB curve - so a mid grey stays the mid grey it looks like
     instead of darkening. Each toggled channel becomes that luminance; an
     untoggled one rides the round trip unchanged. Alpha, if toggled,
     BECOMES the lightness, whatever it was. Pixelorama has no other
     desaturation mode, so none is added.
     WHERE A BYTE CAN DIFFER BY ONE: no byte-exact tie exists - the curve is
     a 2.4 power, so a result lands on x.5 only by accident - but a colour
     whose luminance comes within ~1e-5 byte of x.5 is decided by float32 on
     the GPU and float64 here; that is a handful of the 16.7M colours, not a
     setting. An untoggled channel's round trip ltos(stol(k/255)) is k to
     within 1e-12 here and ~1e-5 in float32, never near a tie. */
  const stol=x=>x<0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);      // sRGB to linear
  const ltos=x=>x>0.0031308?Math.pow(x,1/2.4)*1.055-0.055:x*12.92;   // linear to sRGB
  registerEffect({id:"desaturate", name:"Desaturate", params:[
      {id:"red",label:"Red",type:"check",value:true},
      {id:"green",label:"Green",type:"check",value:true},
      {id:"blue",label:"Blue",type:"check",value:true},
      {id:"alpha",label:"Alpha",type:"check",value:false}],
    run(src,W,H,v){
      const out=bytes(src.length), R=!!v.red, G=!!v.green, B=!!v.blue, A=!!v.alpha;
      for(let p=0;p<src.length;p+=4){
        const lr=stol(src[p]/255), lg=stol(src[p+1]/255), lb=stol(src[p+2]/255);
        const lum=0.21264935*lr+0.71516913*lg+0.07218152*lb;
        out[p]=ltos(R?lum:lr)*255; out[p+1]=ltos(G?lum:lg)*255; out[p+2]=ltos(B?lum:lb)*255;
        out[p+3]=A?ltos(lum)*255:src[p+3];
      }
      return out;
    },
    note:v=>{ const on=["red","green","blue"].filter(k=>v[k]);
      return (on.length?"Linear-light luminance (Rec. 709) into "+on.join(", "):"No colour channel chosen")+
        (v.alpha?", and alpha becomes the lightness.":"."); }
  });

  /* ---- Posterize.gdshaderinc - the "color reduction and dither" shader
     from godotshaders.com. The slider is levels per channel; the shader
     takes colors = levels - 1 so that round(v*colors)/colors lands on
     exactly that many values with 0 and 1 among them. Dither pushes the
     rounding up on one half of a checkerboard and down on the other: the
     shader's floor(mod(uv/pixel_size, 2)) is the pixel's x (and y) parity,
     and the parity of their sum picks the side - odd x+y rounds up. The
     levels slider steps by 1: Pixelorama's has snap_by_default, so whole
     levels are what it lands on too unless a modifier is held, which a
     range input has no way to say.
     WHERE A BYTE CAN DIFFER BY ONE: the level round() never ties at dither
     0 - 2*k*colors/255 can never be odd - but with dither it can: byte 0 at
     2 levels and dither 0.5 is round(0.5), 128 here and 0 or 128 on the
     GPU. The store ties whenever n/colors*255 is x.5: 3 levels puts 1/2 on
     127.5, which is 128 either way, but 7 levels puts 1/6 on 42.5 - 42
     here, 42 or 43 on the GPU. */
  registerEffect({id:"posterize", name:"Posterize", params:[
      {id:"levels",label:"Levels",min:2,max:256,step:1,value:3},
      {id:"dither",label:"Dither intensity",min:0,max:0.5,step:0.01,value:0}],
    run(src,W,H,v){
      const colors=v.levels-1, d=+v.dither||0, out=bytes(src.length);
      if(!(colors>=1)) throw new Error("Posterize needs at least 2 levels");
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const p=(y*W+x)*4, dd=((x+y)&1)?d:-d;
        out[p]=Math.round(src[p]/255*colors+dd)/colors*255;
        out[p+1]=Math.round(src[p+1]/255*colors+dd)/colors*255;
        out[p+2]=Math.round(src[p+2]/255*colors+dd)/colors*255;
        out[p+3]=src[p+3];
      }
      return out;
    },
    note:v=>v.levels+" levels per channel"+(v.dither>0?", dithered by "+v.dither+" on a checkerboard":"")+"."
  });
})();`.replace(/\r?\n/g, NL);

/* After the registry's own wiring and before railPanel: `const EFFECTS` is a
   const, so a registration placed at the panels:register marker would run
   before it exists. railPanel's signature is the line every later effect
   patch can also insert before, which keeps them composable in any order. */
swap('function railPanel(id,on){', block([EFFECTS_SRC, '', 'function railPanel(id,on){']));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* Each effect once, after the registry that receives it, before railPanel. */
const IDS = ['hsv', 'brightness-contrast', 'invert', 'desaturate', 'posterize'];
for (const id of IDS)
  if (code.split('registerEffect({id:"' + id + '"').length !== 2) throw new Error('effect not registered exactly once: ' + id);
const reg = code.indexOf('function registerEffect(fx){');
const first = code.indexOf('registerEffect({id:"hsv"');
const rail = code.indexOf('function railPanel(id,on){');
if (reg < 0 || first < 0 || rail < 0) throw new Error('an anchor is missing');
if (!(code.indexOf('const EFFECTS=[];') < reg && reg < first && first < rail))
  throw new Error('the effects are not between the registry and railPanel');
/* Registration runs at load and reaches fxPreview, which reads ctx; run()
   reads hx2. Both are lets/consts, so they must be declared ABOVE the block
   or the page dies at load in the temporal dead zone. */
for (const decl of ["let N=0, art=$('art'), ctx=null", 'const hx2=h=>', 'const $=id=>document.getElementById(id);']) {
  const at = code.indexOf(decl);
  if (at < 0) throw new Error('declaration not found: ' + decl);
  if (at > first) throw new Error('declared after the effects block, which runs at load: ' + decl);
}

/* PURE. The block never reaches the artwork, the DOM or the undo stack. */
const blockCode = code.slice(code.lastIndexOf('(function(){', first), rail);
for (const bad of ['ctx.', 'snapshot(', 'getImageData', 'putImageData', 'document.', 'toast(', 'railPanel(', '$('])
  if (blockCode.indexOf(bad) >= 0) throw new Error('the effects block is not pure: it mentions ' + bad);

/* EXECUTED, AGAINST BYTES DERIVED FROM THE SHADER FORMULAS BY HAND. The
   block is run with a stub registerEffect; every vector below was worked
   from the .gdshaderinc arithmetic (the derivation is beside each one), not
   read off a run. A port that rounds the wrong way, mixes up a matrix column
   or wraps on 256 instead of 255 fails here. */
const got = [];
const hx2 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// eslint-disable-next-line no-new-func
new Function('registerEffect', 'hx2', EFFECTS_SRC)(fx => got.push(fx), hx2);
if (got.map(e => e.id).join() !== IDS.join()) throw new Error('registered ' + got.map(e => e.id).join() + ', expected ' + IDS.join());
for (const fx of got) {
  if (!fx.name) throw new Error(fx.id + ' has no name');
  if (typeof fx.note !== 'function') throw new Error(fx.id + ' has no note');
  for (const p of fx.params) {
    if (!p.id || !p.label) throw new Error(fx.id + ': a param has no id or label');
    if (p.value === undefined) throw new Error(fx.id + '.' + p.id + ' has no default');
    if (p.type !== 'check' && p.type !== 'color' && !(p.min < p.max)) throw new Error(fx.id + '.' + p.id + ' has no range');
  }
}
const byId = Object.fromEntries(got.map(e => [e.id, e]));
const defaults = fx => Object.fromEntries(fx.params.map(p => [p.id, p.value]));
/* run one W*1 strip of pixels and return rows of [r,g,b,a] */
function runOn(id, pixels, values, W) {
  const fx = byId[id], w = W || pixels.length, h = pixels.length / w;
  const src = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((px, i) => { src[i * 4] = px[0]; src[i * 4 + 1] = px[1]; src[i * 4 + 2] = px[2]; src[i * 4 + 3] = px.length > 3 ? px[3] : 255; });
  const keep = Array.from(src);
  const out = fx.run(src, w, h, Object.assign(defaults(fx), values || {}));
  if (!(out instanceof Uint8ClampedArray) || out.length !== src.length) throw new Error(id + ' returned the wrong shape');
  if (Array.from(src).join() !== keep.join()) throw new Error(id + ' mutated its input');
  return pixels.map((_, i) => [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]]);
}
function expectPx(label, gotRows, wantRows) {
  for (let i = 0; i < wantRows.length; i++) {
    const w = wantRows[i].length > 3 ? wantRows[i] : wantRows[i].concat(255);
    if (gotRows[i].join() !== w.join()) throw new Error(label + ': pixel ' + i + ' is [' + gotRows[i] + '], derived [' + w + ']');
  }
}
const RED = [255, 0, 0], MID = [100, 150, 200], GREY = [100, 100, 100], BLK = [0, 0, 0, 255], CLR = [0, 0, 0, 0], DUSK = [40, 40, 48];

/* HSV. Red is h0 s100 v100; +120 is grid 120 -> hsv2rgb i=2 f=0 -> (p,v,t)=(0,1,0).
   Grey 100 has no hue to shift, but v=100/255 -> 39.2 -> 39 -> 0.39*255=99.45 -> 99: the grid quirk.
   (100,150,200): h=4+(-50/100)=3.5/6 -> 210, s=50, v=78.4 -> 78; +120 -> 330 -> i=5 f=.5 ->
   (v,p,q)=(.78,.39,.585) -> (198.9,99.45,149.2) -> (199,99,149). */
expectPx('hsv hue+120', runOn('hsv', [RED, GREY, MID], { hue: 120 }), [[0, 255, 0], [99, 99, 99], [199, 99, 149]]);
/* -120 on red: 0-120 < 0, no wrap -> clamp 0 -> red. Wrap -> mod(-120,360)=240 -> i=4 -> (t,p,v)=(0,0,1). */
expectPx('hsv hue-120 clamped', runOn('hsv', [RED], { hue: -120 }), [RED]);
expectPx('hsv hue-120 wrapped', runOn('hsv', [RED], { hue: -120, wrap: true }), [[0, 0, 255]]);
/* sat -60 -> s=40 -> p=0.6 -> 153; val -60 -> v=.4 -> 102; sat +20 wraps 120 -> 20 -> p=.8 -> 204. */
expectPx('hsv sat-60', runOn('hsv', [RED], { saturation: -60 }), [[255, 153, 153]]);
expectPx('hsv val-60', runOn('hsv', [RED], { value: -60 }), [[102, 0, 0]]);
expectPx('hsv sat+20 wrapped', runOn('hsv', [RED], { saturation: 20, wrap: true }), [[255, 204, 204]]);
/* The named ties, so the rule this port chose is pinned where it matters:
   grey 128 is v 50% -> 127.5 -> 128 (even, and up); (200,99,99) has
   s = 101/200 = 50.5 exactly, rounded UP to 51 by Math.round, and v 78:
   p = .78*(1-.51) = .3822 -> 97.46 -> 97, where a half-even round would
   give 50 -> .39 -> 99.45 -> 99. A first draft of this line said 98 from
   a slip in the arithmetic; the number below was then computed, not read
   off the port. */
expectPx('hsv tie on grey 128', runOn('hsv', [[128, 128, 128]], { hue: 120 }), [[128, 128, 128]]);
expectPx('hsv grid tie rounds up', runOn('hsv', [[200, 99, 99]], { hue: 0, saturation: 0, value: 0 }), [[199, 97, 97]]);

/* Brightness/Contrast. +20 = +0.2*alpha: 100/255+.2 -> 151; black opaque -> 51; transparent -> 0.
   Contrast 150: 1.5k/255-0.25 -> 1.5k-63.75 -> 86.25,161.25,236.25. Saturation 0 -> luminance
   .3086*100+.6094*150+.082*200 = 138.67 -> 139. Red shift +100 on 255: 355/255 mod 1 = 100/255 -> 100;
   clamped -> 255. Tint red at 100%: c*tint = (100,0,0). */
expectPx('bc brightness+20', runOn('brightness-contrast', [MID, BLK, CLR], { brightness: 20 }), [[151, 201, 251], [51, 51, 51], CLR]);
expectPx('bc contrast150', runOn('brightness-contrast', [MID], { contrast: 150 }), [[86, 161, 236]]);
expectPx('bc saturation0', runOn('brightness-contrast', [MID], { saturation: 0 }), [[139, 139, 139]]);
expectPx('bc red shift wrapped', runOn('brightness-contrast', [RED, MID], { red_shift: 100, wrap: true }), [[100, 0, 0], [200, 150, 200]]);
expectPx('bc red shift clamped', runOn('brightness-contrast', [RED], { red_shift: 100 }), [RED]);
expectPx('bc tint', runOn('brightness-contrast', [MID], { tint_color: '#ff0000', tint_effect_factor: 100 }), [[100, 0, 0]]);
expectPx('bc identity', runOn('brightness-contrast', [MID, RED, DUSK], {}), [MID, RED, DUSK]);
/* Half-alpha: the offsets halve. Brightness +20 on (100,150,200,128): 0.2*128/255 = .1004 -> +25.6 -> 125.6, 175.6, 225.6. */
expectPx('bc offset scales with alpha', runOn('brightness-contrast', [[100, 150, 200, 128]], { brightness: 20 }), [[126, 176, 226, 128]]);
/* The named tie: brightness +10 is +25.5 on every opaque byte; black -> 25.5 -> 26 (even). */
expectPx('bc brightness+10 tie', runOn('brightness-contrast', [BLK], { brightness: 10 }), [[26, 26, 26]]);

/* Invert: 255-k per toggled channel; alpha only leaves colour alone. */
expectPx('invert', runOn('invert', [DUSK, RED], {}), [[215, 215, 207], [0, 255, 255]]);
expectPx('invert alpha only', runOn('invert', [[10, 20, 30, 255], CLR], { red: false, green: false, blue: false, alpha: true }), [[10, 20, 30, 0], [0, 0, 0, 255]]);

/* Desaturate: lin(255,0,0)=(1,0,0) -> Y=.21264935 -> ^(1/2.4)*1.055-.055 = .49848 -> 127.1 -> 127.
   Green .71516913 -> 220; blue .07218152 -> 76; grey 128 round-trips (weights sum 1) -> 128;
   (100,150,200) -> Y=.28691 -> 146. Green only on red: (lin.r=1 -> 255, Y -> 127, 0). Alpha -> 127. */
expectPx('desaturate', runOn('desaturate', [RED, [0, 255, 0], [0, 0, 255], [128, 128, 128], MID], {}),
  [[127, 127, 127], [220, 220, 220], [76, 76, 76], [128, 128, 128], [146, 146, 146]]);
expectPx('desaturate green only', runOn('desaturate', [RED], { red: false, blue: false }), [[255, 127, 0]]);
expectPx('desaturate alpha', runOn('desaturate', [RED], { alpha: true }), [[127, 127, 127, 127]]);

/* Posterize 3 levels (colors 2): 100*2/255=.78->1->.5->127.5->128 (a tie, and half-even and
   half-up agree on it); 150 -> 1.18 -> 1 -> 128; 200 -> 1.57 -> 2 -> 255; 40/48 -> .31/.38 -> 0.
   2 levels: 100/255=.39->0, 150/255=.59->1. Dither .3 at 2 levels on grey 100: odd x+y rounds
   .39+.3 -> 1 -> 255, even .39-.3 -> 0. */
expectPx('posterize 3', runOn('posterize', [MID, DUSK, RED], { levels: 3 }), [[128, 128, 255], [0, 0, 0], RED]);
expectPx('posterize 2', runOn('posterize', [MID], { levels: 2 }), [[0, 255, 255]]);
{
  const rows = runOn('posterize', [GREY, GREY, GREY, GREY, GREY, GREY], { levels: 2, dither: 0.3 }, 3); // 3 wide, 2 tall
  const want = []; for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) want.push(((x + y) & 1) ? [255, 255, 255] : [0, 0, 0]);
  expectPx('posterize dither checkerboard', rows, want);
}
/* The named ties: 7 levels puts byte 43 (43*6/255 = 1.01 -> 1 -> 1/6 -> 42.5) on 42 (even);
   byte 0 at 2 levels, dither .5, odd cell: round(0.5) -> 1 by Math.round -> 255. */
expectPx('posterize store tie', runOn('posterize', [[43, 43, 43]], { levels: 7 }), [[42, 42, 42]]);
expectPx('posterize round tie', runOn('posterize', [BLK, BLK], { levels: 2, dither: 0.5 }), [[0, 0, 0], [255, 255, 255]]);

/* EXHAUSTIVE where the algebra promises an identity. Brightness/contrast at
   its defaults is the identity matrix, and desaturate on a grey is the sRGB
   curve and its inverse with weights summing to 1 - so all 256 greys must
   come back byte-exact from both, or the no-op refusal in the panel would
   see a phantom edit and a plain grey would drift on every apply. */
{
  const greys = []; for (let k = 0; k < 256; k++) greys.push([k, k, k]);
  expectPx('bc identity on every grey', runOn('brightness-contrast', greys, {}), greys);
  expectPx('desaturate fixes every grey', runOn('desaturate', greys, {}), greys);
  const inv = runOn('invert', greys, {});
  expectPx('invert on every grey', inv, greys.map(g => [255 - g[0], 255 - g[1], 255 - g[2]]));
}

/* The panel is untouched: this patch adds registrations, not UI. */
for (const id of ['fxbtn', 'fxscrim', 'fxsel', 'fxparams', 'fxnote', 'fxapply', 'fxclose', 'fxpv']) {
  const markup = text.slice(0, text.indexOf('<script'));
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is no longer in the markup exactly once');
}
if (text.split('<!-- panels:more -->').length !== 2 || script.split('/* panels:register */').length !== 2)
  throw new Error('a marker was disturbed');
/* And the file is still CRLF throughout - a block written with bare LF would
   be the one run of lines no later patch's multi-line anchor could find. */
if (/[^\r]\n/.test(text)) throw new Error('a bare LF got into index.html');

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + '), ' + got.length + ' effects registered and checked against derived bytes');
