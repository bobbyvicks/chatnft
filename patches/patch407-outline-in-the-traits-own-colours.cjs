/* THE OUTLINE TOOK ONE COLOUR OUT OF A COLOUR PICKER.

   "can we change the ouline function so its 'make all outer pixels _ colour'
   and have them be able to chose a colour or even up to 12 colours and have
   the colour pallete be the colours to chose from"

   Three things, and the third is the one that decides the shape of the other
   two. The colours come from the trait's own palette, so this stops being a
   colour picker and becomes a choice among the colours already in the piece.

   HOW TWELVE COLOURS BECOME AN OUTLINE, said plainly because it is a reading
   of the ask and not a fact about it. Thickness is rings: at 3 the outline is
   three cells of border around the silhouette. So the chosen colours map onto
   those rings, innermost first - the first colour touches the art, the next
   sits outside it, and so on. One colour is exactly what the tool did before.
   Twelve is a twelve-ring border, which is why the thickness cap moves from 6
   to 12: twelve colours with a cap of six would leave half of them unusable
   and "up to 12" would not mean anything.

   Fewer colours than rings is the ordinary case, so the last colour fills the
   rest rather than the outline stopping short - and the panel says which
   rings get what before the button is pressed, so a two-colour outline three
   cells thick is not a surprise.

   WHAT DOES NOT CHANGE. The ring is still computed the same way, still never
   drawn over the artwork, and the collection's black border is still applied
   on save whatever is chosen here - the warning about that now reads the
   OUTERMOST chosen colour, because that is the one the border rule replaces,
   and it used to read the single colour when there was only one. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- what the panel says it does ---------------------------------- */
{
  const at = kit.only(L, l => l === '    <h2 id="oltitle">Outline</h2>', 'the panel title');
  if (L[at + 1].indexOf('<p class="sub">Draws a border around the artwork.') < 0)
    throw new Error('the panel blurb is not where this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '    <h2 id="oltitle">Outline</h2>',
    '    <p class="sub">Makes all the outer pixels a colour you choose. Pick up',
    '      to twelve from the trait\'s own colours and they run from the inside',
    '      out, one to each ring. The collection\'s own black border is applied',
    '      on save and export whatever you set here.</p>',
  ]);
}

/* ---- twelve rings, because twelve colours ------------------------- */
{
  const at = kit.only(L, l => l.indexOf('          <input id="olthick" type="range" min="0" max="6"') === 0,
    'the thickness slider');
  kit.replace(L, { start: at, end: at }, [
    '          <input id="olthick" type="range" min="0" max="12" step="1" value="1" aria-label="Outline thickness">',
  ]);
}

/* ---- and the order is on the swatch, not only in the line --------- */
{
  const at = kit.only(L, l => l === '.sw{aspect-ratio:1; min-height:22px; border-radius:4px; border:1px solid #ffffff1a; padding:0;}',
    'the swatch rule');
  kit.replace(L, { start: at, end: at }, [
    '.sw{aspect-ratio:1; min-height:22px; border-radius:4px; border:1px solid #ffffff1a; padding:0;}',
    '/* WHICH RING THIS COLOUR IS. The line under the grid spells the order out,',
    '   and that is the sentence; this is the same fact on the swatch itself, so',
    '   picking a fourth colour does not mean counting along a line to find out',
    '   where it went. Only in the outline grid: a number on a painting swatch',
    '   would mean nothing.',
    '   Both a light and a dark shadow, because the number sits on whatever',
    '   colour was chosen and one of the two always separates it. */',
    '/* ITS OWN CLASS, NOT .sw, AND THAT IS NOT COSMETIC. setColor sweeps every',
    '   .sw on the page and writes aria-pressed on it to show the painting',
    '   colour - which is the same attribute this grid uses to mark a colour as',
    '   chosen for the outline. Sharing the class means painting silently',
    '   rewrites the outline selection. And .swatches means "a view of the',
    '   trait palette", which this is not: it is a chooser, and it is empty',
    '   until the panel opens. */',
    '.olsw{display:grid; grid-template-columns:repeat(8,1fr); gap:4px;}',
    '.olchip{aspect-ratio:1; min-height:22px; border-radius:4px; padding:0;',
    '  border:1px solid #ffffff1a; position:relative; cursor:pointer;}',
    '.olchip[data-n]::after{content:attr(data-n); position:absolute; inset:0;',
    '  display:grid; place-items:center; font-size:10px; font-weight:700;',
    '  color:#fff; text-shadow:0 0 2px #000,0 0 3px #000,0 1px 0 #0009;}',
    '.olchip[aria-pressed="true"]{outline:2px solid var(--accent); outline-offset:1px;}',
  ]);
}

/* ---- the colours come from the palette ---------------------------- */
{
  const at = kit.only(L, l => l === '        <div class="olrow"><label for="olcol">Colour</label>',
    'the colour row');
  if (L[at + 3].indexOf('id="olcurrent"') < 0)
    throw new Error('the colour row is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 3 }, [
    '        <!-- THE TRAIT\'S OWN COLOURS, in the order they are picked. The old',
    '             colour input is gone: the ask was to choose from the palette,',
    '             and two ways to say what the colour is would be two answers. -->',
    '        <div class="olrow" style="align-items:flex-start">',
    '          <label for="olpal" style="padding-top:4px">Colour</label>',
    '          <div style="margin-left:auto; width:min(240px,60%)">',
    '            <div class="olsw" id="olpal" role="group"',
    '              aria-label="Colours to outline with"></div>',
    '            <p class="note mono" id="olpicked" style="margin:6px 0 0"></p>',
    '          </div></div>',
    '        <div class="olrow">',
    '          <button class="mini" id="olcurrent" title="Add the colour you are painting with, in case it is not in the trait yet">add brush colour</button>',
    '          <button class="mini" id="olclear" title="Start the list again">clear</button></div>',
  ]);
}

/* ---- the list, and what it means ---------------------------------- */
{
  const at = kit.only(L, l => l === 'function outlinePlan(){', 'the plan');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE COLOURS CHOSEN FOR THE OUTLINE, innermost ring first.',
    '',
    '   Order is the order they were clicked, because that is the only order a',
    '   person can see themselves making. Twelve is the cap and it is the same',
    '   twelve the thickness allows, so every colour picked can land somewhere.',
    '',
    '   Empty means black: that is what the tool did with an untouched colour',
    '   input, and it is the collection\'s border colour, so an outline nobody',
    '   configured comes out the way it always did. */',
    'const OL_MAX_COLOURS=12;',
    'let olPick=[];',
    'function olColours(){ return olPick.length?olPick.slice():["#000000"]; }',
    '/* Which colour ring k takes, counting from 1 at the art. Fewer colours',
    '   than rings is ordinary, so the last one fills the rest rather than the',
    '   outline stopping short of the thickness that was asked for. */',
    'function olColourFor(k,list){',
    '  const c=list||olColours();',
    '  return c[Math.min(k,c.length)-1];',
    '}',
    '/* The palette, as something to choose from. These are not palette swatches',
    '   - a click here means "outline with this", not "paint with this" - so',
    '   they are built here rather than through buildPalette, and they are fed',
    '   from what the palette SHOWS so the two cannot list different colours. */',
    'function olBuildPal(){',
    '  const wrap=$("olpal"); if(!wrap) return;',
    '  const hexes=[...document.querySelectorAll("#pal .sw")].map(s=>s.dataset.hex);',
    '  wrap.innerHTML="";',
    '  for(const h of hexes){',
    '    const b=document.createElement("button");',
    '    b.className="olchip"; b.dataset.hex=h; b.style.background=h;',
    '    b.title=h; b.setAttribute("aria-label","Outline with "+h);',
    '    const at=olPick.indexOf(h);',
    '    b.setAttribute("aria-pressed",String(at>=0));',
    '    if(at>=0) b.dataset.n=String(at+1);',
    '    b.onclick=()=>{ olToggle(h); };',
    '    wrap.appendChild(b);',
    '  }',
    '  olSaid();',
    '}',
    'function olToggle(h){',
    '  const at=olPick.indexOf(h);',
    '  if(at>=0) olPick.splice(at,1);',
    '  else if(olPick.length<OL_MAX_COLOURS) olPick.push(h);',
    '  else { toast("Twelve is the most an outline can use"); return; }',
    '  olBuildPal(); outlinePreview();',
    '}',
    '/* WHICH RING GETS WHAT, before the button is pressed. Two colours over',
    '   three rings is not a surprise if it is written down. */',
    'function olSaid(){',
    '  const el=$("olpicked"); if(!el) return;',
    '  const t=+($("olthick")&&$("olthick").value||0);',
    '  if(!olPick.length){ el.textContent=t?"black":""; return; }',
    '  if(!t){ el.textContent=olPick.length+" chosen \\u00b7 thickness is off"; return; }',
    '  const per=[];',
    '  for(let k=1;k<=t;k++) per.push(olColourFor(k,olPick));',
    '  const runs=[];',
    '  for(const c of per){',
    '    if(runs.length&&runs[runs.length-1].c===c) runs[runs.length-1].n++;',
    '    else runs.push({c:c,n:1});',
    '  }',
    '  el.textContent=runs.map(r=>r.c+(r.n>1?" \\u00d7"+r.n:"")).join(" \\u2192 ")',
    '    +(olPick.length>t?" \\u00b7 "+(olPick.length-t)+" past the thickness, unused":"");',
    '}',
  ]);
}

/* ---- the plan carries which ring each pixel is in ------------------ */
{
  const r = kit.inFunction(L, 'function outlinePlan(){');
  const at = kit.only(L, l => l === '  const grown=dilateB(filled,bw,bh,t);', 'where the ring is grown', r);
  if (L[at + 1] !== '  const ringB=new Uint8Array(bw*bh);')
    throw new Error('the ring is not built where this expects');
  if (L[at + 3].indexOf('const ring=fromBlocks(ringB,bw,bh,B,W,H);') < 0)
    throw new Error('the ring is not converted where this expects');
  kit.replace(L, { start: at, end: at + 3 }, [
    '  const grown=dilateB(filled,bw,bh,t);',
    '  const ringB=new Uint8Array(bw*bh);',
    '  for(let p=0;p<bw*bh;p++) ringB[p]=(grown[p]&&!filled[p])?1:0;',
    '  const ring=fromBlocks(ringB,bw,bh,B,W,H);',
    '  /* WHICH RING, not just whether. Ring 1 touches the art and ring t is the',
    '     outermost, so a list of colours can be laid onto them from the inside',
    '     out. Built by growing one step at a time and taking what each step',
    '     added - the same dilation the ring above uses, so the two cannot',
    '     disagree about where the outline is. */',
    '  const depth=new Uint8Array(W*H);',
    '  { let prev=filled;',
    '    for(let k=1;k<=t;k++){',
    '      const cur=dilateB(filled,bw,bh,k);',
    '      const stepB=new Uint8Array(bw*bh);',
    '      for(let p=0;p<bw*bh;p++) stepB[p]=(cur[p]&&!prev[p])?1:0;',
    '      const step=fromBlocks(stepB,bw,bh,B,W,H);',
    '      for(let p=0;p<W*H;p++) if(step[p]&&!depth[p]) depth[p]=k;',
    '      prev=cur;',
    '    } }',
  ]);
  const r2 = kit.inFunction(L, 'function outlinePlan(){');
  const ret = kit.only(L, l => l === '  return {ring:ring,n:n,holes:holes,hcol:hcol,hn:hn,W:W,H:H,B:B,t:t,src:d};',
    'what the plan returns', r2);
  kit.replace(L, { start: ret, end: ret }, [
    '  return {ring:ring,depth:depth,n:n,holes:holes,hcol:hcol,hn:hn,W:W,H:H,B:B,t:t,src:d};',
  ]);
}

/* ---- and both places that paint it use the ring's colour ---------- */
{
  const r = kit.inFunction(L, 'function applyOutline(){');
  const at = kit.only(L, l => l === '  const img=ctx.getImageData(0,0,plan.W,plan.H), d=img.data, rgb=hx2($("olcol").value);',
    'where apply reads the colour', r);
  if (L[at + 2].indexOf('if(plan.ring[p]){ d[p*4]=rgb[0]') < 0)
    throw new Error('apply does not paint the ring where this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '  const img=ctx.getImageData(0,0,plan.W,plan.H), d=img.data;',
    '  /* One rgb per ring, worked out once rather than per pixel. */',
    '  const list=olColours();',
    '  const byRing=[]; for(let k=1;k<=plan.t;k++) byRing[k]=hx2(olColourFor(k,list));',
    '  for(let p=0;p<plan.W*plan.H;p++){',
    '    if(plan.ring[p]){ const rgb=byRing[plan.depth[p]]||byRing[1]||[0,0,0];',
    '      d[p*4]=rgb[0];d[p*4+1]=rgb[1];d[p*4+2]=rgb[2];d[p*4+3]=255; }',
  ]);
  const r2 = kit.inFunction(L, 'function applyOutline(){');
  const say = kit.only(L, l => l.indexOf('  toast("Outlined "+plan.n.toLocaleString()+" cells"') === 0,
    'what apply says', r2);
  kit.replace(L, { start: say, end: say }, [
    '  toast("Outlined "+plan.n.toLocaleString()+" cells in "+list.length',
    '    +" colour"+(list.length===1?"":"s")+(plan.hn?", patched "+plan.hn:""));',
  ]);
}
{
  const r = kit.inFunction(L, 'function outlinePreview(){');
  const at = kit.only(L, l => l === '      const im=g.createImageData(plan.W,plan.H), o=im.data, rgb=hx2($("olcol").value);',
    'where the preview reads the colour', r);
  if (L[at + 2].indexOf('if(plan.ring[p]){ o[p*4]=rgb[0]') < 0)
    throw new Error('the preview does not paint the ring where this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '      const im=g.createImageData(plan.W,plan.H), o=im.data;',
    '      const list=olColours();',
    '      const byRing=[]; for(let k=1;k<=plan.t;k++) byRing[k]=hx2(olColourFor(k,list));',
    '      for(let p=0;p<plan.W*plan.H;p++){',
    '        if(plan.ring[p]){ const rgb=byRing[plan.depth[p]]||byRing[1]||[0,0,0];',
    '          o[p*4]=rgb[0];o[p*4+1]=rgb[1];o[p*4+2]=rgb[2];o[p*4+3]=255; }',
  ]);
  /* The black-border warning is about the OUTERMOST ring, which is the last
     colour now rather than the only one. */
  const r2 = kit.inFunction(L, 'function outlinePreview(){');
  const col = kit.only(L, l => l === '    const col=($("olcol").value||"#000000").toLowerCase();',
    'the warning colour', r2);
  kit.replace(L, { start: col, end: col }, [
    '    /* THE OUTERMOST RING is the one the collection\'s border rule replaces,',
    '       so that is the colour this is about - it used to be the only one. */',
    '    const list=olColours();',
    '    const col=String(olColourFor(t||1,list)||"#000000").toLowerCase();',
    '    olSaid();',
  ]);
}

/* ---- the panel is filled when it opens, and follows the palette ---- */
{
  const at = kit.only(L, l => l === 'function outlinePanel(on){', 'the panel');
  kit.replace(L, { start: at, end: at }, [
    'function outlinePanel(on){',
    '  /* Filled on open: the palette changes with the trait, and a grid built',
    '     once at load would offer the colours of whatever was open first. */',
    '  if(on) olBuildPal();',
  ]);
  const brush = kit.only(L, l => l.indexOf('$(\'olcurrent\')') === 0 || l.indexOf('$("olcurrent")') === 0,
    'the brush button wiring');
  kit.replace(L, { start: brush, end: brush }, [
    '/* ADDS the brush colour rather than replacing everything, because the list',
    '   is the point now. It is the one way to outline in a colour the trait',
    '   does not contain yet. */',
    '$("olcurrent").onclick=()=>{ olToggle(color); };',
    '$("olclear").onclick=()=>{ olPick=[]; olBuildPal(); outlinePreview(); };',
  ]);
}

/* ---- and nothing may still reach for the input that is gone -------- */
{
  /* Both of these threw at load once the input went, which is why every
     colourtools test went red at once rather than the outline ones. */
  const reset = kit.only(L, l => l === '  $("olcol").value="#000000";',
    'where a new trait resets the colour');
  kit.replace(L, { start: reset, end: reset }, [
    '  /* The list, not a colour box. A trait opens with nothing chosen, which',
    '     means black - the same outline an untouched panel always gave. */',
    '  olPick=[]; olBuildPal();',
  ]);
  const live = kit.only(L, l => l === "$('olcol').oninput=outlinePreview;",
    'the colour input listener');
  kit.replace(L, { start: live, end: live }, []);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  if (text.indexOf('id="olpal"') < 0) throw new Error('there is nowhere to choose colours');
  if (/id="olcol"/.test(text))
    throw new Error('the old single colour input is still there, so there are two answers');
  /* AND NOTHING MAY STILL READ IT. Checking only the markup let two live
     references through - $("olcol").value on reset and an oninput binding -
     and both threw at load, which reddened every test in the file rather
     than the outline ones. */
  const readers = (code.match(/$((?:"|')olcol(?:"|'))/g) || []).length;
  if (readers) throw new Error(readers + ' places still reach for the colour input');
  if (!/id="olthick" type="range" min="0" max="12"/.test(text))
    throw new Error('twelve colours cannot all be used at a cap of six');

  /* THE CAP IS THE CAP, and it is the same number in both places. */
  if (!/const OL_MAX_COLOURS=12;/.test(code)) throw new Error('the cap is not named');
  const tog = kit.inFunction(codeLines, 'function olToggle(h){');
  if (!/olPick\.length<OL_MAX_COLOURS/.test(codeLines.slice(tog.start, tog.end + 1).join('\n')))
    throw new Error('the cap is not enforced');

  /* FEWER COLOURS THAN RINGS is the ordinary case and must not stop short. */
  const cf = kit.inFunction(codeLines, 'function olColourFor(k,list){');
  if (!/c\[Math\.min\(k,c\.length\)-1\]/.test(codeLines.slice(cf.start, cf.end + 1).join('\n')))
    throw new Error('the last colour does not fill the remaining rings');
  /* AND AN EMPTY LIST IS BLACK, which is what the tool did before. */
  /* Matched on the whole file: olColours is one line, and inFunction wants a
     body that spans lines - it found zero and read as a missing function. */
  if (!/function olColours\(\)\{ return olPick\.length\?olPick\.slice\(\):\["#000000"\]; \}/.test(code))
    throw new Error('an outline nobody configured stopped being black');

  /* THE RING INDEX COMES FROM THE SAME DILATION AS THE RING, or the colours
     are laid onto a different shape than the one being drawn. */
  const plan = kit.inFunction(codeLines, 'function outlinePlan(){');
  const pb = codeLines.slice(plan.start, plan.end + 1).join('\n');
  if (!/const depth=new Uint8Array\(W\*H\);/.test(pb))
    throw new Error('the plan does not say which ring a pixel is in');
  if (!/const cur=dilateB\(filled,bw,bh,k\);/.test(pb))
    throw new Error('the ring index is not built from the same dilation as the ring');
  if (!/return \{ring:ring,depth:depth,/.test(pb))
    throw new Error('the plan does not carry the ring index out');

  /* BOTH PAINTERS USE IT. A preview that showed one colour and an apply that
     wrote another would be the worst possible version of this. */
  for (const fn of ['function applyOutline(){', 'function outlinePreview(){']) {
    const f = kit.inFunction(codeLines, fn);
    const b = codeLines.slice(f.start, f.end + 1).join('\n');
    if (!/byRing\[plan\.depth\[p\]\]/.test(b))
      throw new Error(fn + ' does not colour by ring');
    if (/hx2\(\$\("olcol"\)\.value\)/.test(b))
      throw new Error(fn + ' still reads the colour input that is gone');
  }
  /* The two must build the ring colours the same way, from the same helper. */
  const apply = codeLines.slice(kit.inFunction(codeLines, 'function applyOutline(){').start,
    kit.inFunction(codeLines, 'function applyOutline(){').end + 1).join('\n');
  const prev = codeLines.slice(kit.inFunction(codeLines, 'function outlinePreview(){').start,
    kit.inFunction(codeLines, 'function outlinePreview(){').end + 1).join('\n');
  const line = /const byRing=\[\]; for\(let k=1;k<=plan\.t;k\+\+\) byRing\[k\]=hx2\(olColourFor\(k,list\)\);/;
  if (!line.test(apply) || !line.test(prev))
    throw new Error('the preview and the apply build their ring colours differently');

  /* The grid is fed by what the palette shows, not by a second list. */
  /* THE CHOOSER MUST NOT SHARE A CLASS WITH THE PALETTE. setColor writes
     aria-pressed on every .sw, which is what marks a chosen outline colour -
     sharing it means painting rewrites the selection. */
  if (/class="swatches" id="olpal"/.test(text))
    throw new Error('the outline chooser is a palette view, so painting will rewrite it');
  const bp = kit.inFunction(codeLines, 'function olBuildPal(){');
  const bpb = codeLines.slice(bp.start, bp.end + 1).join('\n');
  /* SCOPED TO THE CHOOSER. buildPalette makes real .sw swatches and must keep
     doing so - an unscoped match for className="sw" found that instead and
     refused a correct edit. */
  if (!/b\.className="olchip";/.test(bpb))
    throw new Error('the outline chips are not on a class of their own');
  if (/className="sw"/.test(bpb))
    throw new Error('the outline chips are .sw, which setColor sweeps');
  if (!/querySelectorAll\("#pal \.sw"\)/.test(bpb))
    throw new Error('the choices are not the palette the trait actually has');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
