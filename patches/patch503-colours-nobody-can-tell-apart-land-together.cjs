/* COLOURS NOBODY CAN TELL APART LAND TOGETHER, AND THE RUN SAYS HOW FAR
   THE FURTHEST ONE MOVED.

   Measured on the 311 working traits on 2026-09-18 (the palette review),
   with the Dark Skin numbers checked again here with the page's own
   colour functions.

   1. PER-COLOUR NEAREST TURNED INVISIBLE VARIATION INTO VISIBLE SPECKLE.
      snapToPalette mapped every distinct colour on its own, so two browns
      a generator left 0.62 apart - nobody can see that - landed on palette
      colours 19.45 apart:

        skins/Dark Skin   #66402d (218,304 px) -> #433629   dE 11.44
                          #67402e (140,864 px) -> #762928   dE 11.00
                          dE between the two sources 0.62; between targets 19.45

      A flat brown skin came out as a two-colour speckle. 41 of the 245
      hand-drawn-scale traits have such splits (2,230 pairs); 14 of the 32
      skins have a gap under 1 dE between the first and second nearest
      palette colour of their dominant colour, which is where a split
      lands. Snapping the source first gives the identical speckle; a
      one-to-one assignment makes the mean error worse. The lever is the
      mapping: the distinct colours are grouped before anything is looked
      up - a colour joins a group when it is within 2.3 dE (the "barely
      visible" line) of the group's dominant colour, largest first - and
      the group's pixel-weighted Lab mean chooses ONE palette colour for
      all its members. Measured: Dark Skin 5 -> 3 output colours, split
      cells 3,620 -> 0; over the 245 files 41 -> 27 with splits, mean error
      to the source 8.543 -> 8.547; the 42 traits already on the palette
      untouched. Colours already on the palette stay their own, as before.
      Capped at 8,192 distinct colours: past that (an AI background through
      the editor's button, not a fixed trait, whose output holds at most
      25,600 pixels) each colour is its own group, which is the old rule.

   2. THE FIXER COMPUTED THE WORST MOVE AND NEVER SAID IT. snapToPalette
      returns `worst` and the editor button prints it; the Fix pixels
      single run and the folder note printed counts only. 272 of 311 files
      move a colour by what the editor calls "a clear change" (dE 10 or
      more) and the person was never told. The library's own record of
      "dark shading merged" is exactly what this line would have flagged.
      Both say it now, with the word for it.

      AND THE SINGLE RUN'S SENTENCE WAS NEVER SEEN AT ALL. It appended
      itself to the readout, and the sentence written a few lines later
      replaced the readout - so since 25b3a2a a single run has not
      mentioned the palette once (measured 2026-09-18 by this patch's own
      spec: two colours moved, readout "medium confidence (forced) - 0.0s").
      No test had asserted it. It is part of the final sentence now.

   3. SHADES MERGED SILENTLY. Two source shades 5 to 25 dE apart share one
      palette target on 153 of 245 files (hair/Leopard Buzz Cut: #ecc900
      and #c4a600, 9.7 apart by the page's own CIEDE2000, both to #f9c22b;
      the review quoted 20.35 for this pair, which is that file's furthest
      merged pair, not this one). Counted now: groups that
      share a target with another group 5 dE or more away, and said.

   4. THE WORST WAS ROUNDED BEFORE THE WORD WAS CHOSEN, so 9.5 read as "a
      clear change" and 0.6 as "barely visible". It is kept unrounded and
      rounded only when printed.

   5. THE SWITCH'S TOOLTIP said "a green becomes a different shade of
      green"; 4.2% of the colours the snap moved changed hue by more than
      30 degrees (Circuit Board Skin: 53%, its green to a teal). It says
      what is true now. And the header comment above snapToPalette still
      described the squared-RGB rule replaced by CIEDE2000.

   6. THE PAGE'S OWN AGENT RULES leave skins and backgrounds out of cleanup
      and nothing applied that here: all 32 skins and 45 of 47 backgrounds
      are put on the palette. Which rule wins is the user's decision; until
      it is taken the folder note says how many of the files it recoloured
      come from those layers, so it is a fact rather than a silence.

   Tests: palettegroups.spec.js. projectpalette.spec.js and
   palettematch.spec.js keep every assertion. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the header comment says the rule that runs ------------------- */
{
  const a = kit.only(L, l => l === '/* EVERY COLOUR TO THE NEAREST ONE IN THE PALETTE.', 'the snap header');
  const b = kit.only(L, l => l === '   an empty one is left alone entirely. */', 'the snap header end', { start: a, end: a + 20 });
  kit.replace(L, { start: a, end: b }, [
    '/* EVERY COLOUR TO THE NEAREST ONE IN THE PALETTE, BY CIEDE2000, IN GROUPS.',
    '',
    '   SUPERSEDES the squared-RGB description this carried: the distance is',
    '   CIEDE2000 (nearestPaletteColour, commit 4dd23c9), which is what the',
    '   agent panel reports with, so the button and the panel cannot name',
    '   different colours for one pixel.',
    '',
    '   GROUPED BEFORE ANYTHING IS LOOKED UP. Mapping every distinct colour on',
    '   its own turned invisible variation into visible speckle: on Dark Skin',
    '   two browns 0.62 dE apart landed on palette colours 19.45 apart, and a',
    '   flat skin came out as a two-colour speckle (3,620 cells); 41 of 245',
    '   hand-drawn traits split that way. So the distinct colours are grouped',
    '   first - largest first, a colour joins a group when it is within 2.3 dE',
    '   of the group\'s dominant colour - and the group\'s pixel-weighted Lab',
    '   mean picks one palette colour for all of them. Measured: Dark Skin',
    '   5 -> 3 output colours and 0 split cells, 41 -> 27 split files over the',
    '   set, mean error to the source unchanged (8.543 -> 8.547). Past 8,192',
    '   distinct colours each colour is its own group, which is the old rule.',
    '',
    '   Works on the pixels in place and answers with what it did: how many',
    '   distinct colours moved, how many pixels, the furthest any colour had',
    '   to travel (unrounded, so the word for it is chosen on the true value),',
    '   how many groups there were, and how many shades 5 dE or more apart',
    '   were merged into one palette colour - so an answer that looks wrong',
    '   can be seen to be wrong.',
    '',
    '   A colour ALREADY in the palette is skipped rather than matched to',
    '   itself, so art that is already on-palette comes back untouched. Alpha',
    '   is never read or written: a half-transparent pixel keeps its alpha and',
    '   an empty one is left alone entirely. */',
  ]);
}

/* ---- 2. the snap itself ---------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function snapToPalette(d,n){');
  kit.replace(L, fn, [
    'const SNAP_GROUP_DE=2.3;',
    'const SNAP_GROUP_MAX=8192;',
    'function snapToPalette(d,n){',
    '  const pal=paletteRGB();',
    '  const exact=new Set(pal.map(p=>p.h));',
    '  /* ONCE PER CALL, not once per colour looked up. */',
    '  const palLab=pal.map(p=>labOf(p.r,p.g,p.b));',
    '  /* THE DISTINCT COLOURS, AND HOW MANY PIXELS EACH HAS. */',
    '  const count=new Map();',
    '  for(let i=0;i<n;i++){',
    '    const o=i*4;',
    '    if(d[o+3]===0) continue;',
    '    const key=(d[o]<<16)|(d[o+1]<<8)|d[o+2];',
    '    count.set(key,(count.get(key)||0)+1);',
    '  }',
    '  const hexOf=key=>"#"+((key>>>0)&0xffffff).toString(16).padStart(6,"0");',
    '  const cols=[...count.entries()].map(([key,px])=>({key:key,px:px,r:(key>>16)&255,g:(key>>8)&255,b:key&255}));',
    '  /* Largest first, ties by value, so the grouping is a function of the',
    '     picture and nothing else. */',
    '  cols.sort((a,b)=>b.px-a.px||a.key-b.key);',
    '  const canGroup=cols.length<=SNAP_GROUP_MAX;',
    '  const groups=[];',
    '  const hit=new Map();',
    '  for(const c of cols){',
    '    if(exact.has(hexOf(c.key))){ hit.set(c.key,null); continue; }',
    '    const lab=labOf(c.r,c.g,c.b);',
    '    let grp=null;',
    '    if(canGroup){',
    '      for(const g of groups){',
    '        const q=g.lab;',
    '        /* A cheap box first: 2.3 dE cannot span more than about 4 in L',
    '           or 14 in chroma, so anything outside this box is not a member',
    '           and the trigonometry is skipped. */',
    '        if(Math.abs(q[0]-lab[0])>5||Math.abs(q[1]-lab[1])>16||Math.abs(q[2]-lab[2])>16) continue;',
    '        if(deltaE2000(q[0],q[1],q[2],lab[0],lab[1],lab[2])<=SNAP_GROUP_DE){ grp=g; break; }',
    '      }',
    '    }',
    '    if(!grp){ grp={lab:lab, sumL:0, suma:0, sumb:0, px:0, members:[]}; groups.push(grp); }',
    '    grp.sumL+=lab[0]*c.px; grp.suma+=lab[1]*c.px; grp.sumb+=lab[2]*c.px; grp.px+=c.px;',
    '    grp.members.push({c:c, lab:lab});',
    '  }',
    '  /* ONE PALETTE COLOUR PER GROUP, nearest to its pixel-weighted mean.',
    '     THE WHOLE PALETTE, not a shortlist. Measured over 24,389 colours: the',
    '     true nearest is inside the four cheapest by plain Lab distance only',
    '     73% of the time, and inside the cheapest twenty-four only 96% - so a',
    '     shortlist buys speed by being wrong, which is the opposite of what',
    '     was asked for. A full 256 measured 0.066ms. */',
    '  let moved=0, pixels=0, worst=0;',
    '  const byTarget=new Map();',
    '  for(const g of groups){',
    '    const m=[g.sumL/g.px, g.suma/g.px, g.sumb/g.px];',
    '    let best=pal[0], bd=Infinity;',
    '    for(let k=0;k<pal.length;k++){',
    '      const q=palLab[k];',
    '      const dist=deltaE2000(m[0],m[1],m[2],q[0],q[1],q[2]);',
    '      if(dist<bd){ bd=dist; best=pal[k]; }',
    '    }',
    '    g.target=best;',
    '    const tl=labOf(best.r,best.g,best.b);',
    '    for(const mm of g.members){',
    '      /* A dE, unrounded: about 1 is the smallest difference anybody can',
    '         see, 10 is plainly another colour. It was rounded per colour',
    '         before the maximum was taken, so 9.5 read as "a clear change"',
    '         and 0.6 as "barely visible"; the word is chosen on the true',
    '         value now and the number rounded only where it is printed. */',
    '      const far=deltaE2000(mm.lab[0],mm.lab[1],mm.lab[2],tl[0],tl[1],tl[2]);',
    '      if(far>worst) worst=far;',
    '      hit.set(mm.c.key,best); moved++;',
    '    }',
    '    const arr=byTarget.get(best.h)||[]; arr.push(g); byTarget.set(best.h,arr);',
    '  }',
    '  /* SHADES MERGED: groups that share a palette colour with another group',
    '     whose dominant colour is 5 dE or more away - two drawn shades that',
    '     came out as one. The library recorded this failure as "dark shading',
    '     merged"; now it is a number. */',
    '  let merged=0, mergedWorst=0;',
    '  for(const arr of byTarget.values()){',
    '    if(arr.length<2) continue;',
    '    for(let i=0;i<arr.length;i++){',
    '      let far=0;',
    '      for(let j=0;j<arr.length;j++){',
    '        if(i===j) continue;',
    '        const a=arr[i].lab, b=arr[j].lab;',
    '        const e=deltaE2000(a[0],a[1],a[2],b[0],b[1],b[2]);',
    '        if(e>far) far=e;',
    '      }',
    '      if(far>=5){ merged++; if(far>mergedWorst) mergedWorst=far; }',
    '    }',
    '  }',
    '  for(let i=0;i<n;i++){',
    '    const o=i*4;',
    '    if(d[o+3]===0) continue;',
    '    const t=hit.get((d[o]<<16)|(d[o+1]<<8)|d[o+2]);',
    '    if(!t) continue;',
    '    d[o]=t.r; d[o+1]=t.g; d[o+2]=t.b;',
    '    pixels++;',
    '  }',
    '  return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst};',
    '}',
  ]);
}

/* ---- 3. the editor line prints a rounded number and the merges ------- */
{
  const at = kit.only(L, l => l === '    +r.pixels.toLocaleString()+" pixels \\u00b7 furthest "+r.worst', 'the editor line');
  if (L[at + 1] !== '    +" ("+deltaWord(r.worst)+")";') throw new Error('the editor line does not end the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    +r.pixels.toLocaleString()+" pixels \\u00b7 furthest "+Math.round(r.worst)',
    '    +" ("+deltaWord(r.worst)+")"',
    '    +(r.merged?" \\u00b7 "+r.merged+" shade"+(r.merged===1?"":"s")+" merged into a neighbour":"");',
  ]);
}

/* ---- 4. the fixer says the furthest, the merges, and the layers ------- */
{
  const at = kit.only(L, l => l === 'let fixPalMoved=0, fixPalPixels=0, fixPalFiles=0;', 'the palette tallies');
  kit.replace(L, { start: at, end: at }, [
    'let fixPalMoved=0, fixPalPixels=0, fixPalFiles=0;',
    '/* The furthest any colour moved across the run, the shades merged, and',
    '   how many of the recoloured files come from layers the agent rules',
    '   leave out of cleanup - the rules and this switch disagree, and until',
    '   that is decided the run at least says so. */',
    'let fixPalWorst=0, fixPalMerged=0, fixPalExcluded=0;',
  ]);
  const fn = kit.inFunction(L, 'function fixPalApply(out){');
  kit.replace(L, fn, [
    'function fixPalApply(out,rel){',
    '  if(!out||!out.data||!fixPalWanted()) return null;',
    '  const r=snapToPalette(out.data,out.width*out.height);',
    '  if(r.colours){',
    '    fixPalMoved+=r.colours; fixPalPixels+=r.pixels; fixPalFiles++;',
    '    if(r.worst>fixPalWorst) fixPalWorst=r.worst;',
    '    fixPalMerged+=r.merged||0;',
    '    const layer=rel?readPath(String(rel)).layer:null;',
    '    if(layer&&!ruleCleanupAllowed(layer)) fixPalExcluded++;',
    '  }',
    '  return r;',
    '}',
  ]);
  const r0 = kit.only(L, l => l === '  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0;', 'the palette reset');
  kit.replace(L, { start: r0, end: r0 }, ['  fixPalMoved=0; fixPalPixels=0; fixPalFiles=0; fixPalWorst=0; fixPalMerged=0; fixPalExcluded=0;']);
  const s0 = kit.only(L, l => l === '        const pal=fixPalApply(r);', 'the single apply');
  kit.replace(L, { start: s0, end: s0 }, ['        const pal=fixPalApply(r,FIX.rel);']);
  const b0 = kit.only(L, l => l === '    fixPalApply(out);', 'the batch apply');
  kit.replace(L, { start: b0, end: b0 }, ['    fixPalApply(out,rel);']);
  /* THE SINGLE RUN: said in the final sentence, not appended to the
     readout before it (the final sentence replaced the readout, so the
     append was never seen). The comment, the append and its second line
     go; a palNote is built in their place and joins the final fixSay
     after the dropped-marks note. */
  const w0 = kit.only(L, l => l === '          +" colour"+(pal.colours===1?"":"s")+" moved to the palette");', 'the single palette sentence');
  const c0 = kit.only(L, l => l === '        /* Read back off the line rather than through a helper: there is', 'the read-back comment', { start: w0 - 8, end: w0 });
  if (w0 - c0 !== 4) throw new Error('the read-back comment is ' + (w0 - c0) + ' lines above the sentence, not 4');
  if (L[w0 - 1] !== '        if(pal&&pal.colours) fixSay(($("fixout").textContent||"")+" \\u00b7 "+pal.colours') throw new Error('the single palette append is not where this expects');
  kit.replace(L, { start: c0, end: w0 }, [
    '        /* SAID IN THE FINAL SENTENCE, NOT APPENDED BEFORE IT. This used to',
    '           append itself to the readout, and the sentence written below then',
    '           replaced the readout, so a single run never mentioned the palette',
    '           at all (measured 2026-09-18: two colours moved, readout "medium',
    '           confidence (forced) \\u00b7 0.0s"). */',
    '        const palNote = pal&&pal.colours',
    '          ? " \\u00b7 "+pal.colours+" colour"+(pal.colours===1?"":"s")+" moved to the palette - the furthest by "',
    '            +Math.round(pal.worst)+" ("+deltaWord(pal.worst)+")"',
    '            +(pal.merged?", "+pal.merged+" shade"+(pal.merged===1?"":"s")+" merged into a neighbour":"")',
    '          : "";',
  ]);
  const f0 = kit.only(L, l => l === '          +((big||unsure)&&!gridless.pick ? " \\u2014 if the edges still look soft, the pixel size it used ("', 'the soft-edge advice');
  if (!/^          \+\(dropped \? /.test(L[f0 - 1])) throw new Error('the dropped-marks note is not the line before the advice');
  kit.replace(L, { start: f0, end: f0 }, [
    '          +palNote',
    '          +((big||unsure)&&!gridless.pick ? " \\u2014 if the edges still look soft, the pixel size it used ("',
  ]);
  const p0 = kit.only(L, l => l === '      +fixPalPixels.toLocaleString()+" pixels"', 'the batch palette note');
  kit.replace(L, { start: p0, end: p0 }, [
    '      +fixPalPixels.toLocaleString()+" pixels - the furthest by "+Math.round(fixPalWorst)+" ("+deltaWord(fixPalWorst)+")"',
    '      +(fixPalMerged?", "+fixPalMerged+" shade"+(fixPalMerged===1?"":"s")+" merged into a neighbour":"")',
    '      +(fixPalExcluded?" - including "+fixPalExcluded+" from layers the agent rules leave out of cleanup (skins, backgrounds)":"")',
  ]);
}

/* ---- 5. the tooltips say what is true ------------------------------- */
{
  const m1 = kit.only(L, l => l === '      title="Change every colour in the result to the nearest one in the project palette. A green becomes a different shade of green. Colours already in the palette are left alone and nothing transparent is touched.">', 'the fixer tooltip');
  kit.replace(L, { start: m1, end: m1 }, [
    '      title="Change every colour in the result to the nearest one in the project palette, nearest by CIEDE2000. A colour far from every palette colour can change hue; the run says how far the furthest one moved. Colours already in the palette are left alone and nothing transparent is touched.">',
  ]);
  const m2 = kit.only(L, l => l === '            title="Change every colour in the trait to the nearest one in the project palette. A green becomes a different shade of green. Colours already in the palette are left exactly as they are, and nothing transparent is touched.">Change colours to palette</button>', 'the editor tooltip');
  kit.replace(L, { start: m2, end: m2 }, [
    '            title="Change every colour in the trait to the nearest one in the project palette, nearest by CIEDE2000. A colour far from every palette colour can change hue; the line under the button says how far the furthest one moved. Colours already in the palette are left exactly as they are, and nothing transparent is touched.">Change colours to palette</button>',
  ]);
  const m3 = kit.only(L, l => l === '        +" A green becomes a different shade of green. Colours already in the palette"', 'the mode tooltip');
  kit.replace(L, { start: m3, end: m3 }, [
    '        +" nearest by CIEDE2000; a colour far from every palette colour can change hue, and the"',
    '        +" run says how far the furthest one moved. Colours already in the palette"',
  ]);
}

/* ---- 6. checks ------------------------------------------------------- */
const grew = kit.save(doc, ({ code, lines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  need('const SNAP_GROUP_DE=2.3;');
  need('if(deltaE2000(q[0],q[1],q[2],lab[0],lab[1],lab[2])<=SNAP_GROUP_DE){ grp=g; break; }');
  need('return {colours:moved, pixels:pixels, worst:worst, seen:count.size, groups:groups.length, merged:merged, mergedWorst:mergedWorst};');
  never('const far=Math.round(bd);');
  never('different shade of green');
  need('moved to the palette - the furthest by');
  need('          +palNote');
  never('fixSay(($("fixout").textContent||"")');
  need('fixPalApply(out,rel);');
  need('fixPalApply(r,FIX.rel);');

  /* THE SNAP, EXERCISED, carved from the new text. */
  const carve = (name) => { const a = lines.findIndex(l => l.startsWith('function ' + name + '(')); if (a < 0) throw new Error('cannot carve ' + name); for (let i = a + 1; i < lines.length; i++) if (lines[i] === '}') return lines.slice(a, i + 1).join('\n'); throw new Error('unterminated ' + name); };
  const constOf = (sig) => { const a = lines.findIndex(l => l.startsWith(sig)); if (a < 0) throw new Error('no ' + sig); let i = a; while (!/;\s*$/.test(lines[i])) i++; return lines.slice(a, i + 1).join('\n'); };
  let src = 'let PALETTE_RGB=null;\n';
  for (const c of ['const PALETTE_HEX=', 'const SNAP_GROUP_DE=', 'const SNAP_GROUP_MAX=']) src += constOf(c) + '\n';
  for (const f of ['paletteList', 'paletteRGB', 'labOf', 'deltaE2000', 'deltaWord', 'nearestPaletteColour', 'snapToPalette']) src += carve(f) + '\n';
  src += 'return {snapToPalette, nearestPaletteColour, deltaWord, labOf, deltaE2000};';
  const T = new Function(src)();
  const fill = (pairs) => { const n = pairs.length * 64; const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const c = pairs[i % pairs.length]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; } return { d, n }; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const outColours = (d, n) => { const s = new Set(); for (let i = 0; i < n; i++) s.add((d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]); return s.size; };
  /* the Dark Skin pair: two browns 0.62 apart come out as one colour */
  { const { d, n } = fill([hex('#66402d'), hex('#67402e')]); const r = T.snapToPalette(d, n);
    if (outColours(d, n) !== 1) throw new Error('two browns 0.62 apart should land together, got ' + outColours(d, n) + ' colours');
    if (r.groups !== 1 || r.colours !== 2) throw new Error('expected one group of two, got ' + JSON.stringify(r)); }
  /* the control: two colours far apart stay two */
  { const { d, n } = fill([hex('#66402d'), hex('#2a7de1')]); T.snapToPalette(d, n);
    if (outColours(d, n) !== 2) throw new Error('two far colours should stay two'); }
  /* shades merged: two yellows 20 apart to one target */
  { const a = hex('#ecc900'), b = hex('#c4a600');
    const na = T.nearestPaletteColour(...a), nb = T.nearestPaletteColour(...b);
    if (na.hex !== nb.hex) throw new Error('the yellow pair no longer shares a target: ' + na.hex + ' ' + nb.hex);
    const { d, n } = fill([a, b]); const r = T.snapToPalette(d, n);
    if (r.merged < 1 || r.mergedWorst < 5) throw new Error('the merged shades were not counted: ' + JSON.stringify(r)); }
  /* the worst is unrounded and the word follows the true value */
  { const { d, n } = fill([hex('#66402d')]); const r = T.snapToPalette(d, n);
    if (Number.isInteger(r.worst)) throw new Error('worst is still rounded: ' + r.worst);
    if (Math.abs(r.worst - 11.44) > 0.05) throw new Error('Dark Skin dominant should move 11.44, got ' + r.worst);
    if (T.deltaWord(r.worst) !== 'a clear change') throw new Error('word: ' + T.deltaWord(r.worst)); }
  /* on-palette art is untouched and reports nothing moved */
  { const p = T.nearestPaletteColour(10, 200, 30); const { d, n } = fill([[p.r, p.g, p.b]]); const before = Array.from(d); const r = T.snapToPalette(d, n);
    if (r.colours !== 0 || r.worst !== 0 || Array.from(d).join() !== before.join()) throw new Error('on-palette art was touched: ' + JSON.stringify(r)); }
});

fs.renameSync(TMP, FILE);
console.log('patch503 written, ' + grew + ' bytes');
