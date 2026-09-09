/* THE SHADING BRUSH, FROM PIXELORAMA.

   Tools/DesignTools/Shading.gd: a brush that lightens or darkens what is
   already under it instead of laying a colour down. Two of its three modes
   come across. SIMPLE is Godot's Color.lightened / darkened by an amount:
   every channel moves toward white or black by that share of the distance
   left. HUE SHIFTING turns the hue toward yellow when lightening and toward
   blue when darkening - never past either - and moves saturation and value
   by their own amounts, saturation never lightened below 10 and value never
   darkened below 10. COLOR REPLACE, the third, walks a palette ramp from the
   palette's selected swatch to the N swatches right of it. This editor's
   swatch row is read off the art and sorted by use; there is no arranged
   ramp and no selected swatch, so that mode is left out rather than run on
   a list whose order means nothing.

   ONCE PER STROKE. Shading.gd's draw_start calls update_mask(false), which
   allocates a whole-canvas mask every stroke, and BaseDraw's
   _set_pixel_no_cache then shades a pixel only while its mask entry is
   below the stroke's alpha, raising it as it goes. This editor's alpha is
   one, so that is: each pixel once, however often the brush crosses it. The
   port keeps a Uint8Array per stroke and nothing else remembers anything.

   THE NUMBERS ARE GODOT'S. Color is four float32s and GDScript's float is a
   double, so process() runs in double between the calls and rounds to
   float32 at every Color boundary - the port does the same with
   Math.fround, op for op, in the order color.cpp does them. A pixel is read
   as byte/255 and written back as trunc(clamp(v*255+0.5)), which is
   Image._set_color_at_ofs in the Godot this Pixelorama builds on (its
   project.godot says 4.7; Godot master carries _quantize_unorm_fast).
   4.4 to 4.6 truncated instead, so on those a value that lands on a half
   comes out one lower. Measured, not remembered: the earlier draft of the
   reference assumed truncation and was wrong for 4.7.

   ALSO CARRIED: Ctrl (Pixelorama's change_tool_mode) flips Lighten and
   Darken while it is held, read off each pointer event; Shift at the press
   (draw_create_line) makes the stroke a straight line to the release,
   previewed on its own layer until then, with Ctrl (draw_snap_angle)
   snapping it to 15 degrees the way the non-pixel-perfect branch of
   _line_angle_constraint does. Transparent pixels are left alone, as
   process() leaves them.

   NOT CARRIED, and why: colour replace (above); the mouse stabiliser, pen
   pressure and velocity dynamics, mirroring, tile mode, the 3D layer path
   and the pixel-perfect angle snap, none of which this editor has anywhere;
   and a stroke that changed nothing does NOT take an undo step here,
   because this editor's fill, move and adjust all follow that rule and a
   step that undoes nothing is the defect they exist to avoid - Pixelorama
   commits one regardless.

   WHERE THE OPTIONS LIVE: a pop-out opened by an Options button in the
   strip, in a row that appears when the tool is chosen, beside the brush
   size it keeps. Not the rail button's second press: that button is wired
   by the data-tool loop and the panel loop would have to fight it for its
   onclick, and a second press is an affordance nobody can see. A visible
   button with a title is one anyone can find.

   The key is U, Pixelorama's own for this tool, and free here.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

/* PB_INDEX lets this run against a copy, as every patch since 359 does. */
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

/* Refused up front rather than discovered after: the key must be free and
   the tool name unclaimed, or the patch would silently shadow something. */
{
  const code0 = kit.code(kit.scriptOf(text));
  if (code0.indexOf("keys:['x']") >= 0) throw new Error('the X key is already bound');
  if (text.indexOf('data-tool="shade"') >= 0 || code0.indexOf('registerTool("shade"') >= 0) throw new Error('a shade tool already exists');
}

/* ---- 1. the rail button, before the eyedropper ------------------------- */
swap('    <!-- rail:tools -->', block([
  '    <button class="tool" data-tool="shade" aria-pressed="false" title="Shading: lighten or darken what is already under the brush instead of painting a colour. Hold Ctrl to do the other one, Shift at the press for a straight line (X)"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></svg><span class="k">U</span></button>',
  '    <!-- rail:tools -->',
]));

/* ---- 2. a row in the strip, shown while the tool is chosen ------------- */
swap(block([
  '        <input id="filltol" type="number" min="0" max="120" value="8" style="width:72px"></div>',
  '      </div>',
]), block([
  '        <input id="filltol" type="number" min="0" max="120" value="8" style="width:72px"></div>',
  '      </div>',
  '    <!-- The shading brush: what it is set to, and the button to its',
  '         options. Shown by the tool itself when it is chosen. -->',
  '    <div id="shrows" hidden>',
  '      <div class="olrow"><label title="What the shading brush does to what it passes over">Shading</label>',
  '        <span class="mono" id="shsum" title="Direction, mode and amounts. Hold Ctrl while painting to do the other one."></span>',
  '        <button class="btn ghost" id="shbtn" aria-expanded="false"',
  '          style="width:auto;padding:6px 12px;font-size:12px;margin-left:auto"',
  '          title="Open the shading options: lighten or darken, simple or hue shifting, and how much">Options</button></div>',
  '      </div>',
]));

/* ---- 3. the options panel ---------------------------------------------- */
swap('<!-- panels:more -->', block([
  '<!-- The shading brush\'s settings. A pop-out rather than rows in the strip:',
  '     there are up to five of them and the strip is one line. -->',
  '<div class="scrim pop" id="shscrim" hidden>',
  '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="shtitle" style="width:min(440px,94vw)">',
  '    <h2 id="shtitle">Shading</h2>',
  '    <p class="sub">Lightens or darkens what is already under the brush. Every pixel is shaded once per stroke, however many times the brush crosses it. Hold Ctrl while painting to do the other one, Shift at the press for a straight line.</p>',
  '    <div class="olrow"><label title="Which way the brush moves what it touches">Direction</label>',
  '      <div class="chips" id="shdir" role="group" aria-label="Lighten or darken">',
  '        <button data-v="lighten" aria-pressed="true" title="Lighten what is under the brush">Lighten</button>',
  '        <button data-v="darken" aria-pressed="false" title="Darken what is under the brush">Darken</button></div></div>',
  '    <div class="olrow"><label title="How the change is worked out">Mode</label>',
  '      <div class="chips" id="shmode" role="group" aria-label="Shading mode">',
  '        <button data-v="simple" aria-pressed="true" title="Every channel moves toward white or black by the amount">Simple</button>',
  '        <button data-v="hue" aria-pressed="false" title="The hue turns toward yellow when lightening and toward blue when darkening, and saturation and value move by their own amounts">Hue shifting</button></div></div>',
  '    <div id="shsimple">',
  '      <div class="olrow"><label for="shamt" title="How far toward white or black, as a share of the distance left. Below zero goes the other way.">Amount</label>',
  '        <input id="shamt" type="range" min="-100" max="100" step="1" value="10" style="flex:1;min-width:90px" title="Lighten or darken amount, -100 to 100">',
  '        <span class="mono" id="shamtv">10</span></div>',
  '    </div>',
  '    <div id="shhuebox" hidden>',
  '      <div class="olrow"><label for="shhue" title="Degrees round the colour wheel per stroke, stopping at yellow when lightening and at blue when darkening">Hue</label>',
  '        <input id="shhue" type="range" min="-180" max="180" step="1" value="10" style="flex:1;min-width:90px" title="Hue shift in degrees, -180 to 180">',
  '        <span class="mono" id="shhuev">10</span></div>',
  '      <div class="olrow"><label for="shsat" title="Saturation taken away when lightening, never below 10, and added when darkening">Saturation</label>',
  '        <input id="shsat" type="range" min="-100" max="100" step="1" value="10" style="flex:1;min-width:90px" title="Saturation amount, -100 to 100">',
  '        <span class="mono" id="shsatv">10</span></div>',
  '      <div class="olrow"><label for="shval" title="Value added when lightening, and taken away when darkening, never below 10">Value</label>',
  '        <input id="shval" type="range" min="-100" max="100" step="1" value="10" style="flex:1;min-width:90px" title="Value amount, -100 to 100">',
  '        <span class="mono" id="shvalv">10</span></div>',
  '    </div>',
  '    <p class="note" id="shnote">Pixelorama\'s third mode, colour replace, walks a palette ramp you arranged; this editor\'s swatches are read off the art, so it is not here.</p>',
  '    <div class="savebar" style="margin-top:14px">',
  '      <button class="btn ghost" id="shclose" title="Close the shading options">Close</button>',
  '    </div>',
  '  </div>',
  '</div>',
  '',
  '<!-- panels:more -->',
]));

/* ---- 4. its own layer for the line preview ----------------------------- */
swap('<canvas id="txpv"></canvas>',
  '<canvas id="sdpv"></canvas><canvas id="txpv"></canvas>');
swap(block([
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
]), block([
  '/* The shading line preview sits with the effect preview: over the art,',
  '   under pending text. */',
  '#sdpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;',
  '  image-rendering:pixelated;}',
  '#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;',
]));

/* ---- 5. the key ---------------------------------------------------------- */
swap('  /* shortcuts:more */', block([
  "  {show:'X', desc:'Shading', keys:['x'], run:()=>selectTool('shade')},",
  '  /* shortcuts:more */',
]));

/* ---- 6. the snap follows the brush rows ------------------------------- */
swap('  if(tool!=="pencil"&&tool!=="eraser") return c;', block([
  '  /* A registered tool that asked for the brush gets the snap too: the Snap',
  '     button is in the rows it keeps, and a control that does nothing for',
  '     the tool showing it is a lie. */',
  '  if(tool!=="pencil"&&tool!=="eraser"&&!(TOOL_HOOKS[tool]&&TOOL_HOOKS[tool].brush)) return c;',
]));

/* ---- 7. the tool ---------------------------------------------------------- */
swap('/* panels:register */', block([
  '/* panels:register */',
  'RAIL_PANELS.push("sh");',
  '',
  '/* ---- the shading brush ----------------------------------------------------',
  '',
  '   Pixelorama\'s Shading.gd, the pixel-brush path. A brush that lightens or',
  '   darkens what is already under it instead of laying a colour down, with',
  '   two of its three modes: SIMPLE moves every channel toward white or black',
  '   by an amount; HUE SHIFTING turns the hue toward yellow when lightening',
  '   and toward blue when darkening, with its own hue, saturation and value',
  '   amounts. COLOR REPLACE walks a user-arranged palette ramp from the',
  '   palette\'s selected swatch; this editor\'s swatch row is read off the art',
  '   and sorted by use, so there is no ramp to walk and that mode is left out',
  '   rather than run on the wrong list.',
  '',
  '   THE NUMBERS ARE GODOT\'S. Color is four float32s and GDScript\'s float is a',
  '   double, so process() runs in double between the calls and rounds to',
  '   float32 at every Color boundary - SH_F below is that boundary, not',
  '   decoration. A pixel is read as byte/255 and written back as',
  '   trunc(clamp(v*255+0.5)), which is Image._set_color_at_ofs in the Godot',
  '   this Pixelorama (features "4.7") builds on; 4.6 and earlier truncated,',
  '   so there a value that lands on a half comes out one lower. */',
  'const SH_F=Math.fround;',
  '/* Godot Color.get_h, get_s, get_v and set_hsv, float32 op for op. */',
  'function shGetH(r,g,b){',
  '  const mn=Math.min(r,g,b), mx=Math.max(r,g,b), d=SH_F(mx-mn);',
  '  if(d===0) return 0;',
  '  let h;',
  '  if(r===mx) h=SH_F(SH_F(g-b)/d);',
  '  else if(g===mx) h=SH_F(2+SH_F(SH_F(b-r)/d));',
  '  else h=SH_F(4+SH_F(SH_F(r-g)/d));',
  '  h=SH_F(h/6); if(h<0) h=SH_F(h+1);',
  '  return h;',
  '}',
  'function shGetS(r,g,b){ const mn=Math.min(r,g,b), mx=Math.max(r,g,b); return mx!==0?SH_F(SH_F(mx-mn)/mx):0; }',
  'function shGetV(r,g,b){ return Math.max(r,g,b); }',
  'function shSetHSV(h,s,v){',
  '  h=SH_F(h); s=SH_F(s); v=SH_F(v);',
  '  if(s===0) return [v,v,v];',
  '  h=SH_F(h*6); h=SH_F(h%6);',
  '  const i=Math.floor(h), f=SH_F(h-i);',
  '  const p=SH_F(v*SH_F(1-s)), q=SH_F(v*SH_F(1-SH_F(s*f))), t=SH_F(v*SH_F(1-SH_F(s*SH_F(1-f))));',
  '  switch(i){ case 0: return [v,t,p]; case 1: return [q,v,p]; case 2: return [p,v,t];',
  '    case 3: return [p,q,v]; case 4: return [t,p,v]; default: return [v,p,q]; }',
  '}',
  '/* Shading.gd\'s limits, GDScript doubles. 60/360 is yellow, the hue a',
  '   lightened colour may reach and not pass; 240/360 is blue, the same for',
  '   darkening. Saturation is never lightened below 10/100 and value is',
  '   never darkened below 10/100, so a colour does not wash out to grey or',
  '   sink to black. */',
  'const SH_HL=60/360, SH_HD=240/360, SH_SL=10/100, SH_VD=10/100;',
  '/* fposmod, then hue_limit_lighten and hue_limit_darken: a shift that would',
  '   carry the hue past yellow (or blue) is cut to land exactly on it. The',
  '   +1 and -1 are the wrap of the wheel, for colours on its far side. */',
  'function shPosMod(x,y){ let v=x%y; if((v<0&&y>0)||(v>0&&y<0)) v+=y; return v+0; }',
  'function shLimitLighten(h,hs){',
  '  if(hs>0){ if(h<SH_HD){ if(h+hs>=SH_HL) hs=SH_HL-h; } else if(h+hs>=SH_HL+1) hs=SH_HL-h; }',
  '  else if(hs<0&&h+hs<=SH_HL) hs=SH_HL-h;',
  '  return hs;',
  '}',
  'function shLimitDarken(h,hs){',
  '  if(hs>0){ if(h<SH_HD){ if(h-hs<=SH_HD-1) hs=h-SH_HD; } else if(h-hs<=SH_HD) hs=h-SH_HD; }',
  '  else if(hs<0&&h-hs>=SH_HD) hs=h-SH_HD;',
  '  return hs;',
  '}',
  '/* Image._set_color_at_ofs: float32 v*255+0.5, clamped, then the cast. */',
  'function shByte(v){ return Math.trunc(Math.min(255,Math.max(0,SH_F(SH_F(v*255)+0.5)))); }',
  '/* LightenDarkenOp.process on one pixel\'s bytes. o is the stroke\'s settings',
  '   {mode, lighten, amount, hue, sat, val}. Returns the new [r,g,b], or null',
  '   for a transparent pixel, which process() hands back untouched. */',
  'function shProcess(R,G,B,A,o){',
  '  if(A===0) return null;',
  '  let r=SH_F(R/255), g=SH_F(G/255), b=SH_F(B/255);',
  '  if(o.mode!=="hue"){',
  '    /* Color.lightened / darkened with strength = amount/100. A negative',
  '       amount is allowed, and does the other thing, as the slider allows. */',
  '    const a=SH_F(o.amount/100);',
  '    if(o.lighten){ r=SH_F(r+SH_F(SH_F(1-r)*a)); g=SH_F(g+SH_F(SH_F(1-g)*a)); b=SH_F(b+SH_F(SH_F(1-b)*a)); }',
  '    else { const k=SH_F(1-a); r=SH_F(r*k); g=SH_F(g*k); b=SH_F(b*k); }',
  '    return [shByte(r),shByte(g),shByte(b)];',
  '  }',
  '  let hs=o.hue/360; const ss=o.sat/100, vs=o.val/100;',
  '  /* Between yellow and blue the wheel runs the other way: lightening a',
  '     green must head for yellow, which is DOWN the wheel from it. */',
  '  const h0=shGetH(r,g,b);',
  '  if(h0>SH_HL&&h0<SH_HD) hs=-hs;',
  '  /* Each dst.h = / dst.s = / dst.v = in the GDScript is set_hsv with the',
  '     other two re-read from the pixel as it now is, so the three steps go',
  '     through RGB in between - kept, because that is where the bytes come',
  '     from. */',
  '  if(o.lighten){',
  '    hs=shLimitLighten(h0,hs);',
  '    [r,g,b]=shSetHSV(shPosMod(h0+hs,1),shGetS(r,g,b),shGetV(r,g,b));',
  '    const s=shGetS(r,g,b);',
  '    if(s>SH_SL) [r,g,b]=shSetHSV(shGetH(r,g,b),Math.max(s-Math.min(ss,s),SH_SL),shGetV(r,g,b));',
  '    [r,g,b]=shSetHSV(shGetH(r,g,b),shGetS(r,g,b),shGetV(r,g,b)+vs);',
  '  } else {',
  '    hs=shLimitDarken(h0,hs);',
  '    [r,g,b]=shSetHSV(shPosMod(h0-hs,1),shGetS(r,g,b),shGetV(r,g,b));',
  '    [r,g,b]=shSetHSV(shGetH(r,g,b),shGetS(r,g,b)+ss,shGetV(r,g,b));',
  '    const v=shGetV(r,g,b);',
  '    if(v>SH_VD) [r,g,b]=shSetHSV(shGetH(r,g,b),shGetS(r,g,b),Math.max(v-Math.min(vs,v),SH_VD));',
  '  }',
  '  return [shByte(r),shByte(g),shByte(b)];',
  '}',
  '',
  '/* The stroke. shDone is Pixelorama\'s _mask: draw_start calls',
  '   update_mask(false), which allocates a whole-canvas array every stroke,',
  '   and _set_pixel_no_cache shades a pixel only while its entry is below the',
  '   stroke\'s alpha and then raises it - so at this editor\'s alpha of one, a',
  '   brush that crosses a pixel twice in one drag shades it once. */',
  'let shDone=null, shLast=null, shLine=null, shChanged=0, shLastN=0, shRedoWas=null, shDropped=null, shCtrl=false;',
  'function shOpts(){',
  '  return {mode:chipVal("shmode"), lighten:chipVal("shdir")!=="darken",',
  '    amount:+$("shamt").value||0, hue:+$("shhue").value||0, sat:+$("shsat").value||0, val:+$("shval").value||0};',
  '}',
  '/* Pixelorama\'s change_tool_mode is Ctrl: while it is down the Lighten /',
  '   Darken choice reads the other way, and each pixel is shaded with the',
  '   choice as it stands when its pointer event arrives - so it is read from',
  '   the event, not from a flag a missed keyup could leave behind. */',
  'function shFor(e){ const o=shOpts(); if(e&&e.ctrlKey) o.lighten=!o.lighten; return o; }',
  '/* Geometry2D.bresenham_line, which draw_fill_gap joins the last position to',
  '   the new one with. Deltas are doubled so the half-step error term is an',
  '   integer. */',
  'function shLineCells(a,b){',
  '  const pts=[], dx=Math.abs(b.x-a.x)*2, dy=Math.abs(b.y-a.y)*2, sx=Math.sign(b.x-a.x), sy=Math.sign(b.y-a.y);',
  '  let x=a.x, y=a.y;',
  '  if(dx>dy){ let err=dx/2; for(;x!==b.x;x+=sx){ pts.push({x,y}); err-=dy; if(err<0){ y+=sy; err+=dx; } } }',
  '  else { let err=dy/2; for(;y!==b.y;y+=sy){ pts.push({x,y}); err-=dx; if(err<0){ x+=sx; err+=dy; } } }',
  '  pts.push({x,y}); return pts;',
  '}',
  '/* Shade the brush footprint at every centre in pts, once per pixel per',
  '   stroke, inside the selection. The footprint is the square dab() paints,',
  '   centred the way dab() centres it, so the cursor shows what will be',
  '   shaded. One read and one write of the rectangle the footprints cover:',
  '   dab() measured a per-pixel getImageData at 860ns a pixel. With `into` a',
  '   canvas the result goes there instead of the art - the line preview. */',
  'function shCells(pts,o,mask,into){',
  '  if(!pts.length) return 0;',
  '  const off=Math.floor((brush-1)/2), W=art.width, H=art.height;',
  '  let x1=1e9, y1=1e9, x2=-1, y2=-1;',
  '  for(const p of pts){ x1=Math.min(x1,p.x-off); y1=Math.min(y1,p.y-off); x2=Math.max(x2,p.x-off+brush-1); y2=Math.max(y2,p.y-off+brush-1); }',
  '  x1=Math.max(0,x1); y1=Math.max(0,y1); x2=Math.min(W-1,x2); y2=Math.min(H-1,y2);',
  '  if(x2<x1||y2<y1) return 0;',
  '  const w=x2-x1+1, h=y2-y1+1, img=ctx.getImageData(x1,y1,w,h), d=img.data;',
  '  const g=into?into.getContext("2d"):null, out=g?g.createImageData(w,h):null, od=out?out.data:null;',
  '  let n=0;',
  '  for(const p of pts){',
  '    const ax=Math.max(x1,p.x-off), ay=Math.max(y1,p.y-off), bx=Math.min(x2,p.x-off+brush-1), by=Math.min(y2,p.y-off+brush-1);',
  '    for(let y=ay;y<=by;y++) for(let x=ax;x<=bx;x++){',
  '      const i=y*W+x;',
  '      if(mask[i]||!selAllows(x,y)) continue;',
  '      mask[i]=1;',
  '      const k=((y-y1)*w+(x-x1))*4, c=shProcess(d[k],d[k+1],d[k+2],d[k+3],o);',
  '      if(!c||(c[0]===d[k]&&c[1]===d[k+1]&&c[2]===d[k+2])) continue;',
  '      n++;',
  '      if(od){ od[k]=c[0]; od[k+1]=c[1]; od[k+2]=c[2]; od[k+3]=d[k+3]; }',
  '      else { d[k]=c[0]; d[k+1]=c[1]; d[k+2]=c[2]; }',
  '    }',
  '  }',
  '  if(g){ g.putImageData(out,x1,y1); return n; }',
  '  if(n) ctx.putImageData(img,x1,y1);',
  '  return n;',
  '}',
  '/* _line_angle_constraint, the branch without pixel-perfect: with Ctrl',
  '   (draw_snap_angle) the line snaps to 15 degrees. Godot rounds halves',
  '   away from zero, which Math.round does not do below zero. */',
  'function shAngle(e,s,p){',
  '  let ang=Math.atan2(p.y-s.y,p.x-s.x)*180/Math.PI, x=p.x, y=p.y;',
  '  if(e&&e.ctrlKey){ ang=Math.floor(ang/15+0.5)*15; const r=ang*Math.PI/180, dist=Math.hypot(p.x-s.x,p.y-s.y); x=s.x+Math.cos(r)*dist; y=s.y+Math.sin(r)*dist; }',
  '  ang=-ang; if(ang<0) ang+=360;',
  '  const rnd=v=>v<0?-Math.floor(-v+0.5):Math.floor(v+0.5);',
  '  return {x:rnd(x), y:rnd(y), text:(Math.floor(ang/0.01+0.5)*0.01).toFixed(2).replace(/\\.?0+$/,"")+"\\u00b0"};',
  '}',
  '/* The line is shown as it will land - its shaded pixels on their own layer',
  '   over the art - and lands on release through the same shCells. */',
  'function shLinePreview(e){',
  '  const pv=$("sdpv"); if(!pv||!shLine||!ctx) return;',
  '  const W=art.width, H=art.height;',
  '  if(pv.width!==W||pv.height!==H){ pv.width=W; pv.height=H; } else pv.getContext("2d").clearRect(0,0,W,H);',
  '  shCells(shLineCells({x:shLine.x0,y:shLine.y0},{x:shLine.x1,y:shLine.y1}),shFor(e),new Uint8Array(W*H),pv);',
  '  pv.style.width=(W*zoom)+"px"; pv.style.height=(H*zoom)+"px"; pv.style.display="block";',
  '}',
  'function shPreviewHide(){ const pv=$("sdpv"); if(pv) pv.style.display="none"; }',
  'registerTool("shade",{ brush:true,',
  '  down(e,c){',
  '    if(!ctx) return;',
  '    shDone=new Uint8Array(art.width*art.height); shChanged=0; shLast=c; shLine=null;',
  '    /* Held aside before the snapshot, as the fill does: a stroke over',
  '       nothing but transparency changes nothing and must not cost a step. */',
  '    shRedoWas=redoStack.slice(); shDropped=snapshot();',
  '    /* draw_create_line is Shift: a straight line from the press to the',
  '       release, previewed until then. */',
  '    if(e&&e.shiftKey){ shLine={x0:c.x,y0:c.y,x1:c.x,y1:c.y}; shLinePreview(e); return; }',
  '    shChanged+=shCells([c],shFor(e),shDone,null);',
  '  },',
  '  move(e,c){',
  '    if(!shDone) return;',
  '    /* Off the art the stroke keeps its path, as Pixelorama\'s does: each',
  '       pixel is clipped, not the line. */',
  '    const p=c||rawCell(e);',
  '    if(shLine){ const d=shAngle(e,{x:shLine.x0,y:shLine.y0},p); shLine.x1=d.x; shLine.y1=d.y; $("pos").textContent=d.text; shLinePreview(e); return; }',
  '    if(shLast&&shLast.x===p.x&&shLast.y===p.y) return;',
  '    /* draw_fill_gap: the line from the last position, less the last',
  '       position itself, which was shaded when it was reached. */',
  '    shChanged+=shCells(shLineCells(shLast,p).slice(1),shFor(e),shDone,null); shLast=p;',
  '  },',
  '  up(e){',
  '    if(!shDone) return;',
  '    if(shLine){ shPreviewHide(); shChanged+=shCells(shLineCells({x:shLine.x0,y:shLine.y0},{x:shLine.x1,y:shLine.y1}),shFor(e),shDone,null); shLine=null; }',
  '    shDone=null; shLast=null; shLastN=shChanged;',
  '    if(!shChanged){ dropSnapshot(shRedoWas,shDropped); toast("Nothing to shade there"); }',
  '    else { refreshStats(); repalette(); }',
  '    shRedoWas=null; shDropped=null;',
  '  },',
  '  select(){ const r=$("shrows"); if(r) r.hidden=false; shSummary(); },',
  '  deselect(){ const r=$("shrows"); if(r) r.hidden=true; shPreviewHide(); }',
  '});',
  '/* The panel\'s controls ARE the settings - PB.shade sets the same ones, so',
  '   an agent and a person can never disagree about what the brush does. */',
  'function shControls(){',
  '  const hue=chipVal("shmode")==="hue";',
  '  const a=$("shsimple"), b=$("shhuebox"); if(a) a.hidden=hue; if(b) b.hidden=!hue;',
  '  for(const id of ["shamt","shhue","shsat","shval"]){ const el=$(id), v=$(id+"v"); if(el&&v) v.textContent=el.value; }',
  '  shSummary();',
  '}',
  'function shSummary(){',
  '  const el=$("shsum"); if(!el) return;',
  '  const o=shOpts(), lit=o.lighten!==shCtrl;',
  '  el.textContent=(lit?"Lighten":"Darken")+(shCtrl?" while Ctrl is down":"")+" \\u00b7 "+',
  '    (o.mode==="hue"?"hue "+o.hue+"\\u00b0, saturation "+o.sat+", value "+o.val:"amount "+o.amount);',
  '}',
  '(function(){',
  '  if(!$("shdir")) return;',
  '  for(const id of ["shdir","shmode"]){ $(id).onclick=e=>{ const b=e.target.closest("button[data-v]"); if(b){ setChip(id,b.dataset.v); shControls(); } }; }',
  '  for(const id of ["shamt","shhue","shsat","shval"]){ const el=$(id); el.oninput=el.onchange=shControls; }',
  '  /* Only the readout follows the key; the strokes read their events. */',
  '  addEventListener("keydown",e=>{ if(e.key==="Control"&&!shCtrl){ shCtrl=true; if(tool==="shade") shSummary(); } });',
  '  addEventListener("keyup",e=>{ if(e.key==="Control"&&shCtrl){ shCtrl=false; if(tool==="shade") shSummary(); } });',
  '  addEventListener("blur",()=>{ if(shCtrl){ shCtrl=false; if(tool==="shade") shSummary(); } });',
  '  shControls();',
  '})();',
]));

/* ---- 8. the agent surface --------------------------------------------- */
swap('PB.tools=function(){ return Object.keys(TOOL_HOOKS); };', block([
  'PB.tools=function(){ return Object.keys(TOOL_HOOKS); };',
  '/* Shading for something with no pointer. It sets the panel\'s own controls',
  '   and pushes the points through the same hooks a drag reaches, so an agent',
  '   gets what a person gets: once per pixel, one undo step, none when',
  '   nothing changed. points is [[x,y],...]; line:true makes it the straight',
  '   line from the first to the last, flip:true is the Ctrl of a held key. */',
  'PB.shading=function(){ return shOpts(); };',
  'PB.shade=function(o){',
  '  o=o||{};',
  '  if(!ctx) return {ok:false, why:"no canvas"};',
  '  const T=TOOL_HOOKS.shade; if(!T) return {ok:false, why:"no shading tool"};',
  '  if(o.dir) setChip("shdir",o.dir);',
  '  if(o.mode) setChip("shmode",o.mode);',
  '  for(const [k,id] of [["amount","shamt"],["hue","shhue"],["sat","shsat"],["val","shval"]]) if(typeof o[k]==="number") $(id).value=o[k];',
  '  shControls();',
  '  if(typeof o.size==="number") setBrush(o.size);',
  '  selectTool("shade");',
  '  const pts=(o.points||[]).map(p=>({x:Math.round(+p[0]),y:Math.round(+p[1])})).filter(p=>!isNaN(p.x)&&!isNaN(p.y));',
  '  if(!pts.length) return {ok:false, why:"no points"};',
  '  const ev={ctrlKey:!!o.flip, shiftKey:!!o.line}, was=undoStack.length;',
  '  T.down(ev,pts[0]); for(let i=1;i<pts.length;i++) T.move(ev,pts[i]); T.up(ev);',
  '  return {ok:true, changed:shLastN, undo:undoStack.length>was, settings:shOpts(), size:brush};',
  '};',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const markup = text.slice(0, text.indexOf('<script'));

/* THE MARKERS SURVIVE, ONCE EACH, so the next patch finds them. */
for (const m of ['<!-- rail:tools -->', '<!-- rail:more -->', '<!-- panels:more -->'])
  if (markup.split(m).length !== 2) throw new Error('marker not exactly once in markup: ' + m);
for (const m of ['/* panels:register */', '/* shortcuts:more */'])
  if (script.split(m).length !== 2) throw new Error('marker not exactly once in script: ' + m);

/* THE BUTTON IS WHERE A TOOL GOES: directly before the marker, which stays
   directly before the eyedropper, so Outline stays after Pick. */
{
  const me = markup.indexOf('<span class="k">U</span></button>'), a = markup.indexOf('<!-- rail:tools -->'), b = markup.indexOf('data-tool="pick"');
  /* Before the marker, not WITHIN 60 BYTES of it: other tools land there too. */
  if (!(me < a)) throw new Error('the shading button is not before rail:tools');
  if (!(a < b && b - a < 120)) throw new Error('rail:tools is no longer directly before the eyedropper');
  if (markup.split('data-tool="shade"').length !== 2) throw new Error('data-tool="shade" is not in the markup exactly once');
}

/* EVERY CONTROL EXISTS ONCE. shOpts reads $("shamt").value; an absent one
   would throw on the first stroke, an absent readout would fail silently. */
const IDS = ['shrows', 'shsum', 'shbtn', 'shscrim', 'shtitle', 'shdir', 'shmode', 'shsimple', 'shamt', 'shamtv',
  'shhuebox', 'shhue', 'shhuev', 'shsat', 'shsatv', 'shval', 'shvalv', 'shnote', 'shclose', 'sdpv'];
for (const id of IDS)
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
{
  const at = markup.indexOf('<div class="scrim pop" id="shscrim"'), end = markup.indexOf('<!-- panels:more -->');
  if (at < 0 || end < at) throw new Error('could not bound the shading card');
  const card = markup.slice(at, end);
  for (const id of IDS)
    if (['shrows', 'shsum', 'shbtn', 'sdpv'].indexOf(id) < 0 && card.indexOf('id="' + id + '"') < 0)
      throw new Error(id + ' did not make it into the card');
  /* AND EVERY ONE OF THEM HAS A TITLE, in the card and in the strip row. */
  const rows = markup.slice(markup.indexOf('<div id="shrows"'), markup.indexOf('<footer>'));
  for (const piece of [card, rows]) {
    for (const tag of piece.match(/<(button|input|select)\b[^>]*>/g) || [])
      if (tag.indexOf(' title="') < 0) throw new Error('a control without a title: ' + tag.slice(0, 80));
  }
  if (card.indexOf('id="shclose"') < 0) throw new Error('the card has no Close button');
}

/* THE PANEL IS REGISTERED where the loop that wires openers will see it:
   after the marker, before the loop. */
{
  const push = code.indexOf('RAIL_PANELS.push("sh");'), loop = code.indexOf('for(const id of RAIL_PANELS){');
  if (push < 0) throw new Error('the panel is not pushed onto RAIL_PANELS');
  if (!(push < loop)) throw new Error('the panel is pushed after the wiring loop has run');
  if (script.indexOf('/* panels:register */\r\nRAIL_PANELS.push("sh");') < 0) throw new Error('the push is not on the line after the marker');
}

/* THE TOOL IS REGISTERED, keeps the brush, and the key reaches it. */
if (code.indexOf('registerTool("shade",{ brush:true,') < 0) throw new Error('registerTool("shade") with brush:true is missing');
if (code.split("keys:['x']").length !== 2) throw new Error('the X key is not bound exactly once');
if (code.indexOf("run:()=>selectTool('shade')") < 0) throw new Error('U does not select the tool');
if (code.indexOf('if(tool!=="pencil"&&tool!=="eraser"&&!(TOOL_HOOKS[tool]&&TOOL_HOOKS[tool].brush)) return c;') < 0)
  throw new Error('snapCell does not follow the brush rows');

/* THE MATHS ARE THERE, with Godot's float boundary and Shading.gd's limits. */
if (code.indexOf('const SH_F=Math.fround;') < 0) throw new Error('the float32 boundary is missing');
if (code.indexOf('const SH_HL=60/360, SH_HD=240/360, SH_SL=10/100, SH_VD=10/100;') < 0) throw new Error('the hue/sat/value limits are not Shading.gd\'s');
if (code.indexOf('function shByte(v){ return Math.trunc(Math.min(255,Math.max(0,SH_F(SH_F(v*255)+0.5)))); }') < 0)
  throw new Error('the byte write is not _quantize_unorm_fast');
if (code.indexOf('if(A===0) return null;') < 0) throw new Error('transparent pixels are not left alone');
if (code.indexOf('if(h0>SH_HL&&h0<SH_HD) hs=-hs;') < 0) throw new Error('hue_range is missing');

/* NOTHING CHANGES PIXELS WITHOUT SNAPSHOT FIRST, and a stroke that changed
   nothing gives the step back. */
{
  const down = code.slice(code.indexOf('  down(e,c){'), code.indexOf('  move(e,c){'));
  if (down.indexOf('shDropped=snapshot();') < 0) throw new Error('the press takes no snapshot');
  if (down.indexOf('shDropped=snapshot();') > down.indexOf('shCells(')) throw new Error('the press shades before it snapshots');
  if (down.indexOf('shDone=new Uint8Array(art.width*art.height)') < 0) throw new Error('no once-per-stroke mask');
  const up = code.slice(code.indexOf('  up(e){'), code.indexOf('  select(){'));
  if (up.indexOf('if(!shChanged){ dropSnapshot(shRedoWas,shDropped);') < 0) throw new Error('a no-op stroke keeps its undo step');
}
/* AND THE PREVIEW NEVER TOUCHES THE ART: it hands shCells a canvas, and
   shCells returns to that canvas before the line that writes to ctx. */
{
  const pv = code.slice(code.indexOf('function shLinePreview(e){'), code.indexOf('function shPreviewHide(){'));
  if (pv.indexOf('ctx.') >= 0) throw new Error('the line preview writes to the artwork');
  if (pv.indexOf(',new Uint8Array(W*H),pv);') < 0) throw new Error('the preview does not draw to its own layer with its own mask');
  const cells = code.slice(code.indexOf('function shCells('), code.indexOf('function shAngle('));
  const a = cells.indexOf('if(g){ g.putImageData(out,x1,y1); return n; }'), b = cells.indexOf('if(n) ctx.putImageData(img,x1,y1);');
  if (!(a >= 0 && b > a)) throw new Error('shCells can reach the artwork with a preview canvas in hand');
  if (cells.indexOf('if(mask[i]||!selAllows(x,y)) continue;') < 0) throw new Error('shCells does not honour the mask and the selection');
}
/* THE PREVIEW LAYER is between the art and pending text. */
if (text.indexOf('#sdpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:5;') < 0) throw new Error('the preview layer has no rule');
if (text.indexOf('#txpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:6;') < 0) throw new Error('text is no longer above the preview');
if (markup.split('<canvas id="sdpv"></canvas>').length !== 2) throw new Error('the preview canvas is not in the frame once');

/* THE AGENT SURFACE DRIVES THE HOOKS, not a private path. */
{
  const pb = code.slice(code.indexOf('PB.shade=function(o){'), code.indexOf('PB.effects=function(){'));
  if (!pb) throw new Error('PB.shade is missing');
  for (const need of ['selectTool("shade");', 'T.down(ev,pts[0]);', 'T.up(ev);', 'shControls();'])
    if (pb.indexOf(need) < 0) throw new Error('PB.shade does not go through the tool: ' + need);
  if (code.indexOf('PB.shading=function(){ return shOpts(); };') < 0) throw new Error('PB.shading is missing');
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
