/* PALETTE FILES IN AND OUT - Pixelorama's Palettes.gd, for the Colours panel.

   Pixelorama keeps a library of palettes beside the sprite: it reads GIMP
   .gpl, JASC .pal and any image into one, writes one back out in those
   formats, and its swatch grid paints with a left click. This editor has a
   fixed collection palette (PALETTE_HEX, which is a rule and stays one) and
   the trait's own colours (#pal, recomputed from the canvas). What was
   missing was the file: a palette somebody made elsewhere, or a trait's
   colours handed to somebody else.

   So the Colours panel grows a second swatch grid - the IMPORTED palette, a
   working set - with Import, Export and Drop. What is ported, function for
   function, from src/Autoload/Palettes.gd and src/Palette/Palette.gd:

     _import_gpl                        -> pioParseGpl
     _import_pal_palette                -> pioParsePal
     _import_image_palette              -> pioFromPixels (row-major)
     _create_new_palette_from_current_sprite
       + _fill_new_palette_with_colors  -> pioFromTrait (column-major, a>0,
                                           alpha folded, 8x8 growing by rows -
                                           the create dialog's defaults)
     fill_imported_palette_with_colors  -> pioFill (the width/height rule)
     import_palette_from_path           -> pioImportFile (dispatch by extension)
     export_gpl                         -> pioExportGpl (EMPTY_SLOT_TAG kept)
     export_pal_palette                 -> pioExportPal
     Palette.convert_to_image           -> pioStrip (the PNG strip, cropped)
     Palette.add_color(colour, index)   -> the empty-slot click in pioRender
     Palette.remove_color(index)        -> Ctrl+click in pioRender
     PalettePanel._on_PaletteGrid_swatch_pressed:
       left = assign colour, empty slot = add the current colour there,
       Ctrl+click = remove             -> pioRender's handlers

   .hex IS NOT PIXELORAMA'S. It has no .hex reader. The nearest thing is
   import_lospec_palette, which takes the same rrggbb strings out of Lospec's
   JSON with Color(color_hex); pioParseHex reads Lospec's .hex download - one
   rrggbb per line - by the same rule, and is marked as an addition.

   Nothing here writes a pixel. The imported palette is something to paint
   WITH, so the only writer it reaches is setColor, and the eraser of a
   working set is Drop. PALETTE_HEX and paletteList are asserted byte-identical
   before the file is written, because "an imported palette is a working set,
   not the collection's palette" is the one rule this must not bend.
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* PB_INDEX lets this run against a copy - the live file is being served to a
   test run more often than not, and a patch that lands mid-run contaminates
   every test after it. patchkit and page-integrity are taken from the tools/
   beside whichever file is being patched, so the copy and the live tree each
   check themselves with their own tools and neither path is typed twice. */
const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const TOOLS = path.join(path.dirname(FILE), 'tools');
if (!fs.existsSync(path.join(TOOLS, 'patchkit.cjs'))) throw new Error('no tools/patchkit.cjs beside ' + FILE);
const kit = require(path.join(TOOLS, 'patchkit.cjs'));

let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';
if (text.indexOf(NL) < 0) throw new Error('index.html is expected to be CRLF and is not');
if (text.indexOf('let PIO=null;') >= 0 || text.indexOf('id="piopal"') >= 0) throw new Error('already applied to ' + FILE);

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the look of the second grid ------------------------------------- */
swap('.sw[data-to="1"]{box-shadow:0 0 0 2px var(--good) inset, 0 0 0 1px #0008;}', block([
  '.sw[data-to="1"]{box-shadow:0 0 0 2px var(--good) inset, 0 0 0 1px #0008;}',
  '/* The imported palette keeps the column count its file declares - Columns:',
  '   in a .gpl - at a fixed swatch size, and scrolls sideways past what fits.',
  '   That is how Pixelorama shows a 32-wide palette in a panel narrower than',
  '   32 swatches; squeezing the columns to fit would turn a 64-column ramp',
  '   into 7px slivers nobody can hit. Eight or fewer stretch like #pal does.',
  '   .swatches\' display and gap are repeated here rather than taken from the',
  '   class, because recolour.spec.js counts .swatches and pins one - #pal\'s',
  '   colours drawn once - and this grid is a different set, not a second',
  '   drawing of that one. The column count is written inline per palette, so',
  '   the class\'s 8 (and the phone rule\'s 10) would be overridden anyway. */',
  '#piopal{display:grid; gap:4px; overflow-x:auto; margin-top:6px; padding-bottom:2px;}',
  '/* An empty slot is a place, not a colour: a dashed outline and nothing in',
  '   it. Clicking one puts the current colour there, as Pixelorama does. */',
  '.sw.pioempty{background:transparent; border:1px dashed #ffffff40; cursor:pointer;}',
  '.sw.pioempty:hover{border-color:var(--muted);}',
]));

/* ---- 2. the controls, inside the Colours panel -------------------------- */
swap('      <div class="swatches" id="pal"></div>', block([
  '      <div class="swatches" id="pal"></div>',
  '      <!-- A palette FILE, as a second working set. Pixelorama reads .gpl,',
  '           JASC .pal and any image into its palette panel and writes them',
  '           back; this is that, beside the trait\'s own colours. It never',
  '           touches the collection\'s fixed palette: an imported palette is',
  '           something to paint with, not the rules. -->',
  '      <div class="olrow" style="margin-top:8px">',
  '        <label for="pioimport">Palette file</label>',
  '        <button class="btn ghost" id="pioimport" style="width:auto;padding:5px 10px;font-size:12px;margin-left:auto"',
  '          title="Load a .gpl, .pal or .hex palette file, or every colour in an image, as a second set of swatches">Import</button>',
  '        <button class="btn ghost" id="piodrop" hidden style="width:auto;padding:5px 10px;font-size:12px"',
  '          title="Take the imported palette out of this panel. The artwork and the project palette are untouched.">Drop</button>',
  '      </div>',
  '      <p class="note" id="pionote" hidden></p>',
  '      <!-- Not classed .swatches: recolour.spec.js counts that class and',
  '           pins exactly one, the property being that #pal\'s colours are never',
  '           drawn twice. This is a different set, so it takes the same layout',
  '           under its own id (see #piopal in the stylesheet). -->',
  '      <div id="piopal" hidden role="group" aria-label="Imported palette"></div>',
  '      <div class="olrow" style="margin-top:6px">',
  '        <label for="piosrc">Export</label>',
  '        <select id="piosrc" title="Which colours to write out" aria-label="Which colours to write out">',
  '          <option value="imported" disabled>Imported palette</option>',
  '          <option value="trait" selected>This trait\'s colours</option>',
  '          <option value="project">Project palette</option>',
  '        </select>',
  '        <select id="piofmt" style="margin-left:0" title="File format: GIMP .gpl, JASC .pal, one hex per line, or a PNG strip one pixel per colour" aria-label="File format">',
  '          <option value="gpl">.gpl</option>',
  '          <option value="pal">.pal</option>',
  '          <option value="hex">.hex</option>',
  '          <option value="png">.png strip</option>',
  '        </select>',
  '        <button class="btn ghost" id="pioexport" style="width:auto;padding:5px 10px;font-size:12px"',
  '          title="Download those colours as a palette file">Export</button>',
  '      </div>',
  '      <input type="file" id="piofile" accept=".gpl,.pal,.hex,image/*" hidden>',
]));

/* ---- 3. the port ---------------------------------------------------------
   Before the panel registry marker, which every panel patch inserts AFTER,
   so this composes with them in any order. Everything it calls - setColor,
   hex, hx2, toast, toData, overMax, rcSummary, paletteList - is a function
   declaration or a const defined thousands of lines above. */
swap('/* panels:register */', block([
  '/* ---- palette files: Pixelorama\'s Palettes.gd -----------------------------',
  '',
  '   A palette here is {name, comment, width, height, colours}: colours is a',
  '   dense array of width*height slots holding a "#rrggbb" or null, which is',
  '   Pixelorama\'s sparse colors dictionary keyed by grid index, made dense.',
  '   ONE working palette at a time, replaced by the next import and removed by',
  '   Drop; Pixelorama keeps a library with a selector, and this panel has room',
  '   for one grid. */',
  'let PIO=null;',
  '/* Pixelorama\'s own marker for a slot with nothing in it, kept verbatim so',
  '   its .gpl files round-trip into this and ours into it. */',
  'const PIO_EMPTY_SLOT="PixeloramaEmptySlot";',
  '/* MAX_IMPORT_PAL_WIDTH: 1<<14 = 16384 columns, past which a Columns: line',
  '   is treated as nonsense rather than allocated. Palette.DEFAULT_WIDTH is 8. */',
  'const PIO_MAX_WIDTH=1<<14, PIO_DEFAULT_WIDTH=8;',
  '/* Global.SUPPORTED_IMAGE_TYPES, verbatim. hdr, tga and exr are in it and no',
  '   browser decodes them: they reach the image path and its onerror says',
  '   "not a valid palette file", which is what Pixelorama says when',
  '   image.load fails. */',
  'const PIO_IMAGE_EXT=/^(png|bmp|hdr|jpg|jpeg|svg|tga|webp|exr)$/;',
  '',
  '/* A channel the way Godot reads one: String.to_float() takes the leading',
  '   number and gives 0 for none, /255 makes a Color, and .r8 is',
  '   clamp(round(r*255),0,255) - so "300" is 255, "-5" is 0, "12.7" is 13. */',
  'function pioByte(s){ const v=parseFloat(s); return Math.round(Math.max(0,Math.min(255,isNaN(v)?0:v))); }',
  '/* What Godot\'s Color(String) accepts: rgb, rgba, rrggbb, rrggbbaa, with or',
  '   without the #. Alpha is dropped - a swatch here is an opaque paint colour. */',
  'function pioHtml(s){',
  '  s=String(s||"").trim().replace(/^#/,"");',
  '  if(/^[0-9a-f]{3,4}$/i.test(s)) s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2];',
  '  if(!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return null;',
  '  return "#"+s.slice(0,6).toLowerCase();',
  '}',
  '/* fill_imported_palette_with_colors. Dimensions come from taking the',
  '   colours as one row wrapped at width: no width means 8, a width past',
  '   16384 is clamped, and a palette that fits on ONE row is exactly as wide',
  '   as it is long - so a five-colour .hex is a 5x1, not a 5-of-8. A colour',
  '   whose index is an empty slot is not added and the index still moves on,',
  '   which is how the gap stays where the file put it. */',
  'function pioFill(name, colours, comment, width, empties){',
  '  width=width|0; if(width<=0) width=PIO_DEFAULT_WIDTH;',
  '  width=Math.max(1,Math.min(PIO_MAX_WIDTH,width));',
  '  let height=Math.ceil(colours.length/width);',
  '  if(height===1) width=colours.length;',
  '  const skip=new Set(empties||[]), slots=new Array(width*height).fill(null);',
  '  colours.forEach((h,i)=>{ if(!skip.has(i)) slots[i]=h; });',
  '  name=String(name==null?"":name).trim();',
  '  return {name:name||"Custom Palette", comment:String(comment||""), width, height, colours:slots};',
  '}',
  '/* _import_gpl, after app/core/gimppalette-load.c: line 0 must say GIMP',
  '   Palette; # lines are comment, and #Palette Name: is the old way of naming',
  '   one; Name: and Columns: are the new; anything else past line 0 that is at',
  '   least 9 characters is "r g b name" with tabs as spaces. Nine is the',
  '   shortest line GIMP itself writes - "%3d %3d %3d" is 11 - and it is what',
  '   drops a blank line without a regex. The comment keeps every # line, which',
  '   is what Pixelorama\'s does, so a palette that has been through it carries',
  '   its old header in its description. Lines are split on \\r?\\n where',
  '   Pixelorama splits on \\n alone: on a Windows-written file its empty-slot',
  '   tag compare sees "PixeloramaEmptySlot\\r" and quietly keeps the slot. */',
  'function pioParseGpl(name, text){',
  '  const lines=String(text).split(/\\r?\\n/), colours=[], empties=[];',
  '  let n=0, comments="", columns=0;',
  '  for(let line of lines){',
  '    if(n===0 && line.indexOf("GIMP Palette")<0) return null;',
  '    if(line.startsWith("#")){',
  '      comments+=line.slice(1)+"\\n";',
  '      if(line.startsWith("#Palette Name: ")) name=line.replace("#Palette Name: ","").trim();',
  '    } else if(line.startsWith("Name: ")) name=line.replace("Name: ","").trim();',
  '    else if(line.startsWith("Columns: ")){',
  '      const c=line.slice("Columns: ".length).trim();',
  '      if(!/^[+-]?\\d+$/.test(c)) continue;   /* is_valid_int - and "continue" skips the count too, as there */',
  '      columns=parseInt(c,10);',
  '    } else if(n>0 && line.length>=9){',
  '      /* split(" ", false, 4): empties dropped, so the fourth token is the',
  '         fourth word whatever the run of tabs and spaces before it. */',
  '      const f=line.replace(/\\t/g," ").split(" ").filter(Boolean);',
  '      colours.push(hex(pioByte(f[0]),pioByte(f[1]),pioByte(f[2])));',
  '      if(f.length>=4 && f[3]===PIO_EMPTY_SLOT) empties.push(colours.length-1);',
  '    }',
  '    n++;',
  '  }',
  '  return n>0 ? pioFill(name, colours, comments, columns, empties) : null;',
  '}',
  '/* _import_pal_palette. JASC-PAL, 0100, a count, then "r g b" lines: the',
  '   count is believed up to where the file runs out, blank lines inside the',
  '   count are skipped, lines past it are ignored. Split on single spaces as',
  '   there - the format is single-spaced by definition, and a missing field',
  '   reads as 0 the way "".to_float() does. */',
  'function pioParsePal(name, text){',
  '  const lines=String(text).split(/\\r?\\n/);',
  '  if(lines.length<2 || lines[0].indexOf("JASC-PAL")<0 || lines[1].indexOf("0100")<0) return null;',
  '  const num=parseInt(lines[2]||"",10)||0, colours=[];',
  '  for(let i=3;i<num+3;i++){',
  '    if(i>=lines.length) break;',
  '    if(!lines[i].trim()) continue;',
  '    const f=lines[i].split(" ");',
  '    colours.push(hex(pioByte(f[0]),pioByte(f[1]),pioByte(f[2])));',
  '  }',
  '  return pioFill(name, colours);',
  '}',
  '/* ADDED, not ported - Pixelorama reads no .hex. Lospec\'s .hex download is',
  '   one rrggbb per line, the same strings import_lospec_palette takes out of',
  '   Lospec\'s JSON with Color(color_hex), so a line is read the way Color()',
  '   would read it and anything else is skipped. */',
  'function pioParseHex(name, text){',
  '  const colours=[];',
  '  for(const raw of String(text).split(/\\r?\\n/)){ const h=pioHtml(raw); if(h) colours.push(h); }',
  '  return colours.length ? pioFill(name, colours) : null;',
  '}',
  '/* Every pixel once, in the order first met, exact RGB. Row-major is',
  '   _import_image_palette; column-major is _create_new_palette_from_current',
  '   _sprite, which walks x outside y - two functions, two orders, both kept,',
  '   because the order IS the palette. Transparent pixels are not colours:',
  '   the sprite path drops a==0 itself, and a paint colour here is opaque so',
  '   the image path drops them too, and both fold partial alpha onto its RGB',
  '   (add_alpha_colors off - the only setting an editor that paints opaque',
  '   pixels can honour; Pixelorama\'s image path keeps alpha and even',
  '   transparent as colours, which no swatch here could show or paint). */',
  'function pioFromPixels(name, d, W, H, columnMajor){',
  '  const seen=new Set(), colours=[];',
  '  const take=(x,y)=>{ const i=(y*W+x)*4; if(d[i+3]===0) return;',
  '    const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; if(seen.has(k)) return;',
  '    seen.add(k); colours.push(hex(d[i],d[i+1],d[i+2])); };',
  '  if(columnMajor){ for(let x=0;x<W;x++) for(let y=0;y<H;y++) take(x,y); }',
  '  else { for(let y=0;y<H;y++) for(let x=0;x<W;x++) take(x,y); }',
  '  return colours;',
  '}',
  '/* The open trait as a palette: the create dialog\'s defaults are an 8x8',
  '   grid, and add_color grows it a row at a time once 64 are in - so the',
  '   height is 8 or however many rows the colours need, whichever is more. */',
  'function pioFromTrait(){',
  '  if(!ctx) return null;',
  '  const W=art.width, H=art.height;',
  '  const colours=pioFromPixels("", ctx.getImageData(0,0,W,H).data, W, H, true);',
  '  const p=pioFill(String(fileName||"trait").replace(/\\.png$/i,""), colours, "", PIO_DEFAULT_WIDTH);',
  '  if(p.height<8){ p.width=PIO_DEFAULT_WIDTH; p.height=8; p.colours=new Array(64).fill(null); colours.forEach((h,i)=>{ p.colours[i]=h; }); }',
  '  return p;',
  '}',
  '/* The editor\'s own side bound, not Pixelorama\'s: every image this page',
  '   opens goes through overMax, and a palette source is an image it opens. */',
  'function pioFromImageFile(file, name){',
  '  return new Promise(res=>{',
  '    const url=URL.createObjectURL(file), im=new Image();',
  '    im.onload=()=>{ URL.revokeObjectURL(url);',
  '      const big=overMax(im.naturalWidth,im.naturalHeight);',
  '      if(big){ toast(big); res(null); return; }',
  '      const W=im.naturalWidth, H=im.naturalHeight;',
  '      res(pioFill(name, pioFromPixels(name, toData(im,W,H).data, W, H, false))); };',
  '    im.onerror=()=>{ URL.revokeObjectURL(url); res(null); };',
  '    im.src=url;',
  '  });',
  '}',
  '/* import_palette_from_path: by extension, images by Pixelorama\'s type list',
  '   or by the MIME the file input already vouched for. The name is the',
  '   file\'s without its extension, which a .gpl may then override. A second',
  '   import REPLACES the working set; Pixelorama ignores a file whose name it',
  '   already holds, which reads as a button that does nothing. */',
  'async function pioImportFile(file){',
  '  const ext=(String(file.name).match(/\\.([^.]+)$/)||["",""])[1].toLowerCase();',
  '  const name=String(file.name).replace(/\\.[^.]+$/,"");',
  '  let p=null;',
  '  if(/^image\\//.test(file.type)||PIO_IMAGE_EXT.test(ext)) p=await pioFromImageFile(file, name);',
  '  else if(ext==="gpl") p=pioParseGpl(name, await file.text());',
  '  else if(ext==="pal") p=pioParsePal(name, await file.text());',
  '  else if(ext==="hex") p=pioParseHex(name, await file.text());',
  '  return pioAdopt(p, file.name);',
  '}',
  '/* Pixelorama would keep an empty palette; here it is refused, because an',
  '   empty second grid with a Drop button under it is a puzzle, not a palette. */',
  'function pioAdopt(p, from){',
  '  if(!p){ toast("Can\'t load "+from+" - not a valid palette file"); return null; }',
  '  const n=p.colours.filter(Boolean).length;',
  '  if(!n){ toast("No colours in "+from); return null; }',
  '  PIO=p; pioRender();',
  '  /* A fresh import is the thing most likely wanted back out. */',
  '  { const src=$("piosrc"); if(src) src.value="imported"; }',
  '  toast("Imported "+p.name+" - "+n+" colour"+(n===1?"":"s"));',
  '  return p;',
  '}',
  'function pioDrop(){',
  '  const had=!!PIO; PIO=null; pioRender();',
  '  if(had) toast("Imported palette dropped");',
  '}',
  '/* The grid. LEFT paints with the colour through the same setColor a #pal',
  '   click goes through, and aria-pressed follows the paint colour through',
  '   setColor\'s sweep of every .sw; RIGHT makes it what the marked colours',
  '   become, which is the panel\'s meaning of right-click and the natural use',
  '   of an imported palette - recolouring a trait into it. An empty slot',
  '   takes the current colour on a click and Ctrl+click takes a colour out,',
  '   the two edits Pixelorama\'s grid allows without opening a dialog. A left',
  '   click here does NOT mark the colour for replacing as #pal\'s does: the',
  '   mark means "this colour, in the trait", and a working-set colour need',
  '   not be in the trait at all. */',
  'function pioRender(){',
  '  const grid=$("piopal"), note=$("pionote"), drop=$("piodrop"), src=$("piosrc");',
  '  if(!grid) return;',
  '  const on=!!PIO;',
  '  grid.hidden=!on; note.hidden=!on; drop.hidden=!on;',
  '  const opt=src.querySelector(\'option[value="imported"]\');',
  '  /* The option is offered while there is something to export; the choice',
  '     itself is only moved when the palette goes, never on a redraw. */',
  '  if(opt){ opt.disabled=!on; if(!on&&src.value==="imported") src.value="trait"; }',
  '  grid.replaceChildren();',
  '  if(!on){ note.textContent=""; return; }',
  '  grid.style.gridTemplateColumns="repeat("+PIO.width+",minmax(22px,1fr))";',
  '  const n=PIO.colours.filter(Boolean).length;',
  '  note.textContent=PIO.name+" \\u00b7 "+n+" colour"+(n===1?"":"s")+" \\u00b7 "+PIO.width+"\\u00d7"+PIO.height',
  '    +" \\u00b7 left-click paints with it, right-click makes it the colour marked ones become";',
  '  PIO.colours.forEach((h,i)=>{',
  '    const b=document.createElement("button"); b.className="sw"; b.type="button";',
  '    if(h){',
  '      b.dataset.hex=h; b.style.background=h;',
  '      b.title=h+" \\u00b7 slot "+(i+1)+" \\u00b7 Ctrl+click takes it out";',
  '      b.setAttribute("aria-pressed",String(h===color)); b.setAttribute("aria-label","Colour "+h);',
  '      if(rcTo===h) b.dataset.to="1";',
  '      b.onclick=e=>{ if(e.ctrlKey||e.metaKey){ PIO.colours[i]=null; pioRender(); return; } setColor(h); };',
  '      b.oncontextmenu=e=>{ e.preventDefault(); rcTo=(rcTo===h)?null:h; rcSummary(); return false; };',
  '    } else {',
  '      b.classList.add("pioempty");',
  '      b.title="Empty slot "+(i+1)+" \\u00b7 click to put the colour you are painting with here";',
  '      b.setAttribute("aria-label","Empty slot "+(i+1));',
  '      b.onclick=()=>{ PIO.colours[i]=color; pioRender(); };',
  '    }',
  '    grid.appendChild(b);',
  '  });',
  '}',
  '/* export_gpl. #Colors: is the SLOT count, and every slot is written -',
  '   black tagged PixeloramaEmptySlot where there is nothing - so the grid',
  '   comes back the same shape. Columns: only under 255, the bound Pixelorama',
  '   carried across from GIMP\'s loader, which refuses a wider file. */',
  'function pioExportGpl(p){',
  '  const out=["GIMP Palette","#Palette Name: "+p.name,',
  '    "#Description: "+p.comment.replace(/\\n/g," ").replace(/\\r/g,""),',
  '    "#Colors: "+p.colours.length];',
  '  if(p.width<255) out.push("Columns: "+p.width);',
  '  for(const h of p.colours){',
  '    const c=h?hx2(h):[0,0,0];',
  '    out.push(c[0]+"\\t"+c[1]+"\\t"+c[2]+"\\t"+(h?h.slice(1):PIO_EMPTY_SLOT));',
  '  }',
  '  return out.join("\\n")+"\\n";',
  '}',
  '/* export_pal_palette: the colours only, in slot order, no empties - the',
  '   format has no way to say "nothing here". LF line ends, as store_line',
  '   writes them. */',
  'function pioExportPal(p){',
  '  const cs=p.colours.filter(Boolean);',
  '  return ["JASC-PAL","0100",String(cs.length)].concat(cs.map(h=>hx2(h).join(" "))).join("\\n")+"\\n";',
  '}',
  '/* Lospec\'s shape back out: rrggbb per line, no #, lowercase. */',
  'function pioExportHex(p){ return p.colours.filter(Boolean).map(h=>h.slice(1)).join("\\n")+"\\n"; }',
  '/* convert_to_image(crop=true): one row, a pixel a slot, cropped to the',
  '   used rect - so leading and trailing empties go and inner ones stay',
  '   transparent. Null when there is nothing to crop to. */',
  'function pioStrip(p){',
  '  let x0=-1, x1=-1;',
  '  p.colours.forEach((h,i)=>{ if(!h) return; if(x0<0) x0=i; x1=i; });',
  '  if(x0<0) return null;',
  '  const c=document.createElement("canvas"); c.width=x1-x0+1; c.height=1;',
  '  const g=c.getContext("2d"), im=g.createImageData(c.width,1);',
  '  for(let i=x0;i<=x1;i++){ const h=p.colours[i]; if(!h) continue;',
  '    const rgb=hx2(h), q=(i-x0)*4; im.data[q]=rgb[0]; im.data[q+1]=rgb[1]; im.data[q+2]=rgb[2]; im.data[q+3]=255; }',
  '  g.putImageData(im,0,0); return c;',
  '}',
  '/* Which palette "the current palette" is. Pixelorama has one; this panel',
  '   shows three, so it asks. The project palette is the collection\'s fixed',
  '   256, read through paletteList and never written back to. */',
  'function pioSource(which){',
  '  if(which==="imported") return PIO;',
  '  if(which==="project") return pioFill(PALETTE_SOURCE.name, paletteList(), PALETTE_SOURCE.edition||"", PIO_DEFAULT_WIDTH);',
  '  return pioFromTrait();',
  '}',
  'function pioText(fmt, p){ return fmt==="gpl"?pioExportGpl(p) : fmt==="pal"?pioExportPal(p) : fmt==="hex"?pioExportHex(p) : null; }',
  '/* The palette\'s own name, as the export dialog offers it, with only what a',
  '   file system refuses taken out. */',
  'function pioFileName(p){ return (p.name.replace(/[\\\\/:*?"<>|\\x00-\\x1f]+/g,"").trim()||"palette"); }',
  'function pioDownload(blob, filename){',
  '  const u=URL.createObjectURL(blob), a=document.createElement("a");',
  '  a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove();',
  '  setTimeout(()=>URL.revokeObjectURL(u),1000);',
  '}',
  'function pioExport(fmt, which){',
  '  const p=pioSource(which);',
  '  if(!p){ toast(which==="imported"?"Nothing imported yet":"Open a trait first"); return null; }',
  '  const base=pioFileName(p);',
  '  if(fmt==="png"){',
  '    const c=pioStrip(p); if(!c){ toast("No colours to write"); return null; }',
  '    c.toBlob(b=>pioDownload(b, base+".png"),"image/png");',
  '    return {name:base+".png"};',
  '  }',
  '  const t=pioText(fmt,p); if(t===null){ toast("No such format: "+fmt); return null; }',
  '  pioDownload(new Blob([t],{type:"text/plain"}), base+"."+fmt);',
  '  return {name:base+"."+fmt, text:t};',
  '}',
  '(function(){',
  '  const f=$("piofile"); if(!f) return;',
  '  $("pioimport").onclick=()=>f.click();',
  '  /* Cleared after the read, so choosing the same file again fires again. */',
  '  f.onchange=e=>{ const file=e.target.files&&e.target.files[0]; f.value=""; if(file) pioImportFile(file); };',
  '  $("piodrop").onclick=pioDrop;',
  '  $("pioexport").onclick=()=>pioExport($("piofmt").value,$("piosrc").value);',
  '})();',
  '',
  '/* panels:register */',
]));

/* ---- 4. the target mark reaches both grids ------------------------------ */
/* rcSummary re-applies the marks on every route that changes them. It swept
   #pal only; the imported grid carries data-to as well, so a right-click on
   either grid has to clear the mark on the other. Only the TARGET mark: the
   replace mark (data-rc) means "this colour in the trait", and the imported
   grid's click does not toggle it, so a mark it cannot take off is not drawn
   on it. */
swap(block([
  '    if(rcTo&&s.dataset.hex===rcTo) s.dataset.to="1"; else delete s.dataset.to;',
  '  });',
  '  const n=rcPick.size;',
]), block([
  '    if(rcTo&&s.dataset.hex===rcTo) s.dataset.to="1"; else delete s.dataset.to;',
  '  });',
  '  document.querySelectorAll("#piopal .sw").forEach(s=>{',
  '    if(rcTo&&s.dataset.hex===rcTo) s.dataset.to="1"; else delete s.dataset.to;',
  '  });',
  '  const n=rcPick.size;',
]));

/* ---- 5. the agent surface ---------------------------------------------- */
swap('PB.palette=function(){ return {source:PALETTE_SOURCE, hexes:paletteList()}; };', block([
  'PB.palette=function(){ return {source:PALETTE_SOURCE, hexes:paletteList()}; };',
  '/* Palette files for something with no file picker. The same parsers the',
  '   Import button runs, and it opens the panel the result lands in, so what',
  '   an agent imported is what a person would see. One of: {text, format,',
  '   name} for gpl/pal/hex; {hexes:[...], name, width}; {pixels, width,',
  '   height, name} for an image\'s bytes; or {fromTrait:true}. */',
  'function pioData(p){ return {name:p.name, comment:p.comment, width:p.width, height:p.height,',
  '  slots:p.colours.slice(), hexes:p.colours.filter(Boolean)}; }',
  'PB.importPalette=function(o){',
  '  o=o||{}; let p=null, from="";',
  '  if(typeof o.text==="string"){',
  '    const fmt=String(o.format||"").toLowerCase(), name=o.name||"palette";',
  '    if(!/^(gpl|pal|hex)$/.test(fmt)) return {ok:false, why:"say which format the text is: gpl, pal or hex"};',
  '    from=name+"."+fmt;',
  '    p= fmt==="gpl"?pioParseGpl(name,o.text) : fmt==="pal"?pioParsePal(name,o.text) : pioParseHex(name,o.text);',
  '  } else if(Array.isArray(o.hexes)){',
  '    const hs=[]; for(const h of o.hexes){ const v=pioHtml(h); if(!v) return {ok:false, why:"not a colour: "+h}; hs.push(v); }',
  '    from=o.name||"palette"; p=pioFill(from, hs, o.comment||"", o.width|0);',
  '  } else if(o.fromTrait){ from="the open trait"; p=pioFromTrait(); if(!p) return {ok:false, why:"no trait is open"}; }',
  '  else if(o.pixels&&o.width>0&&o.height>0){',
  '    from=o.name||"image"; p=pioFill(from, pioFromPixels(from, o.pixels, o.width|0, o.height|0, false));',
  '  } else return {ok:false, why:"give {text,format}, {hexes}, {pixels,width,height} or {fromTrait:true}"};',
  '  const got=pioAdopt(p, from);',
  '  if(!got) return {ok:false, why: p?"no colours in "+from:"not a valid "+from};',
  '  railPanel("cl",true);',
  '  return Object.assign({ok:true}, pioData(got));',
  '};',
  'PB.workingPalette=function(){ return PIO?pioData(PIO):null; };',
  'PB.dropPalette=function(){ const had=!!PIO; pioDrop(); return {ok:true, dropped:had}; };',
  '/* The text the Export button would download, without the download - an',
  '   agent has nowhere to receive one. png comes back as a data URL. */',
  'PB.exportPalette=function(fmt, which){',
  '  fmt=String(fmt||"gpl").toLowerCase(); which=which||(PIO?"imported":"trait");',
  '  const p=pioSource(which);',
  '  if(!p) return {ok:false, why:which==="imported"?"nothing imported":"no trait is open"};',
  '  const name=pioFileName(p)+"."+fmt;',
  '  if(fmt==="png"){ const c=pioStrip(p); return c?{ok:true, name, dataUrl:c.toDataURL("image/png"), width:c.width}:{ok:false, why:"no colours"}; }',
  '  const t=pioText(fmt,p);',
  '  return t===null ? {ok:false, why:"no such format: "+fmt} : {ok:true, name, text:t};',
  '};',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const codeOnly = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const markup = text.slice(0, text.indexOf('<script'));

/* THE MARKERS SURVIVE, once each, so the next patch finds them. */
for (const m of ['<!-- rail:tools -->', '<!-- rail:more -->', '<!-- panels:more -->'])
  if (markup.split(m).length !== 2) throw new Error('marker not exactly once in markup: ' + m);
for (const m of ['/* panels:register */', '/* shortcuts:more */'])
  if (script.split(m).length !== 2) throw new Error('marker not exactly once in script: ' + m);

/* EVERY CONTROL EXISTS ONCE, INSIDE THE COLOURS CARD, WITH A TITLE. A control
   that never made it in is a silent no-op: pioRender reads $("piopal") and
   returns on null, so the grid would simply never appear. */
const IDS = ['pioimport', 'piodrop', 'pionote', 'piopal', 'piosrc', 'piofmt', 'pioexport', 'piofile'];
for (const id of IDS)
  if (markup.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the markup exactly once');
{
  const at = markup.indexOf('<div class="scrim pop" id="clscrim"');
  const end = markup.indexOf('id="clclose"', at);
  if (at < 0 || end < 0) throw new Error('could not bound the Colours card');
  const card = markup.slice(at, end);
  for (const id of IDS)
    if (card.indexOf('id="' + id + '"') < 0) throw new Error(id + ' did not land inside the Colours card');
  for (const id of ['pioimport', 'piodrop', 'piosrc', 'piofmt', 'pioexport']) {
    const k = card.indexOf('id="' + id + '"');
    const open = card.lastIndexOf('<', k), close = card.indexOf('>', k);
    if (card.slice(open, close).indexOf('title="') < 0) throw new Error(id + ' has no title');
  }
  if (card.indexOf('id="pal"') > card.indexOf('id="piopal"')) throw new Error('the imported grid is not the SECOND grid');
  if (markup.indexOf('id="clclose"', at) < 0) throw new Error('the Colours panel lost its Close button');
  /* recolour.spec.js "there is one swatch grid, not two" counts .swatches
     and expects one. The imported grid lays out under its own id. */
  if (markup.split('class="swatches"').length !== before.slice(0, before.indexOf('<script')).split('class="swatches"').length)
    throw new Error('the imported grid is classed .swatches, which recolour.spec.js counts');
  if (text.indexOf('#piopal{display:grid; gap:4px;') < 0) throw new Error('the imported grid has no grid layout of its own');
}

/* THE PORT IS THERE, AND THE ONE STRING THAT MAKES FILES ROUND-TRIP. */
for (const fn of ['pioParseGpl', 'pioParsePal', 'pioParseHex', 'pioFill', 'pioFromPixels', 'pioFromTrait',
  'pioExportGpl', 'pioExportPal', 'pioExportHex', 'pioStrip', 'pioRender', 'pioAdopt', 'pioDrop', 'pioImportFile', 'pioExport'])
  if (codeOnly.split('function ' + fn + '(').length !== 2) throw new Error(fn + ' is not declared exactly once');
if (codeOnly.indexOf('const PIO_EMPTY_SLOT="PixeloramaEmptySlot";') < 0) throw new Error('the empty-slot tag is not Pixelorama\'s');
if (codeOnly.indexOf('const PIO_MAX_WIDTH=1<<14, PIO_DEFAULT_WIDTH=8;') < 0) throw new Error('the width constants moved');
if (codeOnly.indexOf('const PIO_IMAGE_EXT=/^(png|bmp|hdr|jpg|jpeg|svg|tga|webp|exr)$/;') < 0) throw new Error('the image type list is not Global.SUPPORTED_IMAGE_TYPES');
{
  const gpl = codeOnly.slice(codeOnly.indexOf('function pioParseGpl('), codeOnly.indexOf('function pioParsePal('));
  if (gpl.indexOf('line.length>=9') < 0) throw new Error('the GPL reader lost its 9-character rule');
  if (gpl.indexOf('f[3]===PIO_EMPTY_SLOT') < 0) throw new Error('the GPL reader does not honour empty slots');
  const ex = codeOnly.slice(codeOnly.indexOf('function pioExportGpl('), codeOnly.indexOf('function pioExportPal('));
  if (ex.indexOf('if(p.width<255) out.push("Columns: "+p.width);') < 0) throw new Error('the GPL writer lost the Columns bound');
  if (ex.indexOf(':PIO_EMPTY_SLOT') < 0) throw new Error('the GPL writer does not tag empty slots');
  const fill = codeOnly.slice(codeOnly.indexOf('function pioFill('), codeOnly.indexOf('function pioParseGpl('));
  if (fill.indexOf('if(height===1) width=colours.length;') < 0) throw new Error('the one-row width rule is gone');
  const px = codeOnly.slice(codeOnly.indexOf('function pioFromPixels('), codeOnly.indexOf('function pioFromTrait('));
  if (px.indexOf('for(let x=0;x<W;x++) for(let y=0;y<H;y++)') < 0 || px.indexOf('for(let y=0;y<H;y++) for(let x=0;x<W;x++)') < 0)
    throw new Error('the two scan orders are not both there');
}

/* NOTHING HERE WRITES A PIXEL. The whole block reads ctx once, in
   pioFromTrait, and never puts anything back; a putImageData or a snapshot
   in it would mean an import had become an edit. */
{
  /* Bounded by its own last line, not by the marker after it: the Adjust
     panel's apply sits between the marker and railPanel and does write. */
  const a = codeOnly.indexOf('let PIO=null;'), z = codeOnly.indexOf('$("pioexport").onclick=');
  if (a < 0 || z < a) throw new Error('could not bound the palette block');
  const mine = codeOnly.slice(a, z);
  if (mine.indexOf('function pioExport(') < 0) throw new Error('the palette block is not where it was expected');
  const ctxUses = mine.match(/\bctx\.[a-zA-Z]+/g) || [];
  if (ctxUses.some(u => u !== 'ctx.getImageData')) throw new Error('the palette block touches the artwork: ' + ctxUses.join(','));
  if (mine.indexOf('snapshot(') >= 0) throw new Error('the palette block takes an undo step for something that is not an edit');
  if (mine.indexOf('setColor(h)') < 0) throw new Error('a left click on an imported swatch does not paint with it');
  if (mine.indexOf('rcPick') >= 0) throw new Error('the imported grid reaches the replace marks, which belong to the trait\'s colours');
}

/* THE COLLECTION PALETTE IS UNTOUCHED, byte for byte, and still read only. */
{
  const decl = s => s.slice(s.indexOf('const PALETTE_HEX='), s.indexOf('function paletteList(){'));
  const list = s => { const a = s.indexOf('function paletteList(){'); return s.slice(a, s.indexOf('}', a) + 1); };
  if (decl(before).length < 1000) throw new Error('could not find PALETTE_HEX');
  if (decl(text) !== decl(before)) throw new Error('PALETTE_HEX changed');
  if (list(text) !== list(before)) throw new Error('paletteList changed');
  /* Counted in CODE on both sides, so a new reader or writer of the constant
     shows up and a mention in a comment does not. */
  if (kit.code(kit.scriptOf(before)).split('PALETTE_HEX').length !== codeOnly.split('PALETTE_HEX').length)
    throw new Error('something new reads or writes PALETTE_HEX directly');
  if (codeOnly.indexOf('PB.palette=function(){ return {source:PALETTE_SOURCE, hexes:paletteList()}; };') < 0)
    throw new Error('PB.palette changed');
}

/* THE TARGET MARK SWEEPS BOTH GRIDS, and the agent surface exists. */
if (codeOnly.indexOf('document.querySelectorAll("#piopal .sw").forEach(s=>{') < 0) throw new Error('rcSummary does not reach the imported grid');
{
  const rs = codeOnly.slice(codeOnly.indexOf('function rcSummary(){'), codeOnly.indexOf('function repalette(){'));
  if (rs.split('s.dataset.to="1"').length !== 3) throw new Error('rcSummary does not set the target mark on exactly two grids');
  if (rs.split('s.dataset.rc="1"').length !== 2) throw new Error('rcSummary sets the replace mark on more than the trait\'s grid');
}
for (const f of ['PB.importPalette=function(o){', 'PB.workingPalette=function(){', 'PB.dropPalette=function(){', 'PB.exportPalette=function(fmt, which){'])
  if (codeOnly.split(f).length !== 2) throw new Error(f + ' is not declared exactly once');
if (codeOnly.indexOf('PB.importPalette') > codeOnly.indexOf('try{ window.PB=PB; }')) throw new Error('PB.importPalette is added after PB is exported');

/* NO NEW STATIC FINDINGS. tools/page-integrity.cjs knows about ids looked up
   that are in no markup and calls to names declared nowhere - the two shapes
   a half-landed patch takes. It has findings on the file as it stands, so the
   bar is "none that were not there before", compared without line numbers. */
{
  const tool = path.join(TOOLS, 'page-integrity.cjs');
  if (!fs.existsSync(tool)) throw new Error('page-integrity not found beside PB_INDEX at ' + tool + ' - refusing to write unchecked');
  const tmpA = FILE + '.pio-before.tmp', tmpB = FILE + '.pio-after.tmp';
  fs.writeFileSync(tmpA, before); fs.writeFileSync(tmpB, text);
  const run = f => spawnSync(process.execPath, [tool, f], { encoding: 'utf8' });
  const a = run(tmpA), b = run(tmpB);
  fs.unlinkSync(tmpA); fs.unlinkSync(tmpB);
  if (a.status === 2 || b.status === 2) throw new Error('page-integrity could not run: ' + (a.stderr || b.stderr));
  const findings = r => (r.stdout + r.stderr).split(/\r?\n/).filter(l => /^\s+line \d+:/.test(l)).map(l => l.replace(/^\s+line \d+:\s*/, ''));
  const had = new Set(findings(a));
  const fresh = findings(b).filter(l => !had.has(l));
  if (fresh.length) throw new Error('page-integrity has new findings:\n  ' + fresh.join('\n  '));
  console.log('page-integrity: ' + findings(a).length + ' pre-existing finding(s), 0 new');
}

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ')');
