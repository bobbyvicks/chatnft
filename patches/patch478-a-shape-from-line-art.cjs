/* THE SHAPE OF A LINE-ART BASE.

   "no so our nft project uses a base" - with the base itself: a character
   drawn as black 1px linework, a head, an ear, a neck and shoulders.

   477 SHIPPED A FEATURE THAT DOES NOT WORK ON THAT. Measured on a base of that
   shape at 64x64, both ways the file could be saved:

     on white        4,096 of 4,096 pixels - the whole canvas, so selecting it
                     does nothing at all
     transparent       311 of 4,096 - the strokes, a one-pixel skeleton

   Neither is the body. "Everything that trait covers" is the right idea for a
   painted trait and the wrong one for line art, where what you want is the
   area the lines ENCLOSE and the page behind them is not part of anything.

   TWO STEPS, AND THE SECOND ONE ALREADY EXISTED.

   A SOLID GROUND IS NOT PART OF THE SHAPE. If the four corners are opaque and
   agree on a colour, that colour is the page the character is drawn on, and it
   comes out. Only if taking it out leaves something behind - otherwise the
   source IS that colour, which is what a full-bleed background trait is, and
   its shape really is the whole canvas.

   Corners rather than a luminance test. drawBase has one - "these characters
   are drawn as dark lines over flat colour, so darkness is what tells the two
   apart" - and it is right for showing a base and wrong here, because it would
   also throw away every dark trait somebody asks for the shape of. What the
   four corners agree on is a fact about the file rather than a guess about the
   art.

   THEN THE AREA THE LINES ENCLOSE, through fillHolesB - the flood from the
   border that the outline tools already use. Anything the border cannot reach
   is inside. That is the whole of what makes line art work, and it costs a
   solid silhouette nothing: a shape with no holes fills to itself.

   Measured on the same base after both steps: 1,098 pixels saved on white and
   1,114 saved transparent, both boxed at 5,4 54x60 - the head, neck and
   shoulders, and the two file shapes agreeing to within the anti-aliasing on
   their edges. One rule, both files, the character.

   THE FILL IS A CHECKBOX, ON BY DEFAULT, because it is a real choice rather
   than a detail: a ring selected with it on covers its own hole. Line art
   needs it, a solid shape does not care, and somebody who wants the ring alone
   can have it. The ground is not a checkbox - "the corners agree and taking
   the colour out leaves something" is a fact about the file, and there is
   nothing for a person to decide. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the choice ------------------------------------------------------ */
{
  const at = kit.only(L, l => l.indexOf('title="Select everything that trait covers, laid out the way it is when a character is built">Use</button></div>') >= 0,
    'the use button');
  kit.replace(L, { start: at, end: at }, [
    '        title="Select the area that trait covers, laid out the way it is when a character is built">Use</button></div>',
    '    <!-- ON BY DEFAULT, because it is what a line-art base needs and a solid',
    '         shape does not notice. Off gives the ink itself, which is the only',
    '         way to select a ring without its hole. -->',
    '    <div class="olrow"><label class="olchk" for="seshapefill"',
    '      title="Take the area the lines enclose rather than the lines themselves - which is what a base drawn as linework needs">',
    '      <input type="checkbox" id="seshapefill" checked> fill the inside</label></div>',
  ]);
}

/* ---- 2a. the outside is what a corner can reach -------------------------- */
{
  const at = kit.only(L, l => l === "function fillHolesB(m,w,hh){", "the hole fill");
  kit.replace(L, { start: at, end: at }, [
    "/* THE OUTSIDE IS WHAT A CORNER CAN REACH.",
    "",
    "   fillHolesB above floods from EVERY border pixel, which is right for the",
    "   outline tools it was written for and wrong for a character. A base whose",
    "   shoulders run off the bottom of the picture has a chest that touches the",
    "   bottom edge, so a border flood walks straight into it: measured on one,",
    "   the head came back filled and the whole torso came back as two lines.",
    "",
    "   Seeded from the four corners instead. The chest is cut off from every",
    "   corner by the shoulders, so it is inside - which is how a person reads the",
    "   picture. An ordinary enclosed shape gives the same answer either way,",
    "   because its outside reaches all four corners.",
    "",
    "   All four corners inked seeds nothing and makes everything inside, which is",
    "   right: a source reaching all four corners is a full-bleed one and its shape",
    "   is the canvas.",
    "",
    "   Its own function rather than a flag on fillHolesB, which three other",
    "   callers share and none of them wants this. */",
    "function seFillInside(m,w,hh){",
    "  const seen=new Uint8Array(w*hh), q=[0,w-1,(hh-1)*w,(hh-1)*w+w-1];",
    "  for(let i=0;i<q.length;i++){ const p=q[i];",
    "    if(p<0||p>=w*hh||seen[p]||m[p]) continue;",
    "    seen[p]=1; const x=p%w,y=(p/w)|0;",
    "    if(x>0)q.push(p-1); if(x<w-1)q.push(p+1); if(y>0)q.push(p-w); if(y<hh-1)q.push(p+w);",
    "  }",
    "  const out=Uint8Array.from(m);",
    "  for(let p=0;p<w*hh;p++) if(!m[p]&&!seen[p]) out[p]=1;",
    "  return out;",
    "}",
    "function fillHolesB(m,w,hh){",
  ]);
}

/* ---- 2. the ground and the inside --------------------------------------- */
{
  const at = kit.only(L, l => l === 'async function seShapeRegion(rec){', 'the shape');
  kit.replace(L, { start: at, end: at }, [
    '/* How close a pixel has to be to the colour in the corners to count as the',
    '   page rather than the art. Small: this is looking for a flat ground that was',
    '   filled with one colour, not for a family of similar ones. */',
    'const SHAPE_GROUND_TOL=6;',
    'async function seShapeRegion(rec){',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function seShapeRegion(rec){');
  const at = kit.only(L, l => l === '  /* Handed back rather than left at the canvas size. */',
    'the scratch canvas being handed back', fn);
  kit.replace(L, { start: at, end: at }, [
    '  /* A SOLID GROUND IS NOT PART OF THE SHAPE.',
    '',
    '     A base drawn as linework on white is opaque everywhere, so "what this',
    '     covers" is the whole canvas and selecting it does nothing - measured,',
    '     4,096 of 4,096. If the four corners are opaque and agree on a colour,',
    '     that colour is the page and it comes out.',
    '',
    '     ONLY IF SOMETHING IS LEFT. A background trait IS one flat colour, and',
    '     its shape really is the whole canvas, so a rule that emptied it would',
    '     be wrong about the one case it is easiest to hit.',
    '',
    '     The corners rather than the darkness test drawBase uses for showing a',
    '     base: that one is right for showing linework and wrong here, because it',
    '     would throw away every dark trait somebody asks for the shape of. */',
    '  const cor=[0,W-1,(H-1)*W,(H-1)*W+W-1].map(p=>p*4);',
    '  const flat=cor.every(q=>d[q+3]>=250)',
    '    && cor.every(q=>Math.abs(d[q]-d[cor[0]])<=SHAPE_GROUND_TOL',
    '      && Math.abs(d[q+1]-d[cor[0]+1])<=SHAPE_GROUND_TOL',
    '      && Math.abs(d[q+2]-d[cor[0]+2])<=SHAPE_GROUND_TOL);',
    '  let ground=false;',
    '  if(flat&&n){',
    '    const keep=new Uint8Array(W*H); let m=0;',
    '    for(let i=0;i<W*H;i++){',
    '      if(!region[i]) continue;',
    '      const q=i*4;',
    '      const same=d[q+3]>=250',
    '        && Math.abs(d[q]-d[cor[0]])<=SHAPE_GROUND_TOL',
    '        && Math.abs(d[q+1]-d[cor[0]+1])<=SHAPE_GROUND_TOL',
    '        && Math.abs(d[q+2]-d[cor[0]+2])<=SHAPE_GROUND_TOL;',
    '      if(!same){ keep[i]=1; m++; }',
    '    }',
    '    if(m){ region=keep; n=m; ground=true; }',
    '  }',
    '  /* AND THE AREA THE LINES ENCLOSE. seFillInside is the flood in from the',
    '     CORNERS: anything a corner cannot reach is inside. It is what makes a',
    '     line-art base give a body instead of a skeleton, and it costs a solid',
    '     shape nothing - a shape with no holes fills to itself. */',
    '  const box=$("seshapefill");',
    '  const inside=!box||box.checked;',
    '  if(inside&&n){',
    '    region=seFillInside(region,W,H);',
    '    n=0; for(let i=0;i<W*H;i++) if(region[i]) n++;',
    '  }',
    L[at],
  ]);
}
{
  /* region and n are written to now, so they cannot be const. */
  const fn = kit.inFunction(L, 'async function seShapeRegion(rec){');
  const at = kit.only(L, l => l === '  const region=new Uint8Array(W*H);',
    'the region', fn);
  kit.replace(L, { start: at, end: at }, ['  let region=new Uint8Array(W*H);']);
}
{
  const fn = kit.inFunction(L, 'async function seShapeRegion(rec){');
  const at = kit.only(L, l => l === '  return {region,n};', 'what the shape hands back', fn);
  kit.replace(L, { start: at, end: at }, ['  return {region,n,ground};']);
}

/* ---- 3. and it says which rule it used ---------------------------------- */
{
  const at = kit.only(L, l => l === '  toast("Selected the shape of "+(rec.name||"that trait")',
    'the message');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* SAID, because both steps are automatic and a selection that came out',
    '     smaller than the picture is otherwise unexplained. */',
    '  toast("Selected the shape of "+(rec.name||"that trait")',
    '    +" - "+out.n.toLocaleString()+" pixels"',
    '    +(out.ground?", without the flat ground it is drawn on":""));',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  const sr = kit.inFunction(codeLines, 'async function seShapeRegion(rec){');
  const srb = codeLines.slice(sr.start, sr.end + 1).join('\n');

  /* THE GROUND COMES OUT, and only when something is left. */
  if (!/const cor=\[0,W-1,\(H-1\)\*W,\(H-1\)\*W\+W-1\]\.map\(p=>p\*4\);/.test(srb))
    throw new Error('the ground is not read from the corners');
  if (!/if\(m\)\{ region=keep; n=m; ground=true; \}/.test(srb))
    throw new Error('a source that is entirely one flat colour would come back empty');
  if (!/cor\.every\(q=>d\[q\+3\]>=250\)/.test(srb))
    throw new Error('a transparent corner would be taken for a flat ground');
  /* NOT THE DARKNESS TEST, which would throw away every dark trait. */
  if (/lum\(/.test(srb))
    throw new Error('the shape drops pixels by how dark they are, which loses dark traits');

  /* THE FLOOD IS SEEDED FROM THE CORNERS, not the border. A border flood walks
     straight into the chest of any character whose shoulders run off the bottom
     of the picture - measured on one, the head filled and the torso came back
     as two lines. */
  const fi = kit.inFunction(codeLines, 'function seFillInside(m,w,hh){');
  const fib = codeLines.slice(fi.start, fi.end + 1).join('\n');
  if (!/const seen=new Uint8Array\(w\*hh\), q=\[0,w-1,\(hh-1\)\*w,\(hh-1\)\*w\+w-1\];/.test(fib))
    throw new Error('the fill is seeded from somewhere other than the four corners');
  /* AND THE SHARED ONE IS UNTOUCHED - three other callers want it as it was. */
  const fh = kit.inFunction(codeLines, 'function fillHolesB(m,w,hh){');
  const fhb = codeLines.slice(fh.start, fh.end + 1).join('\n');
  if (!/for\(let x=0;x<w;x\+\+\)\{ q\.push\(x\); q\.push\(\(hh-1\)\*w\+x\); \}/.test(fhb))
    throw new Error('the shared hole fill was changed, and three other callers want it as it was');
  /* AND THE INSIDE IS FILLED, which is what makes line art work at all. */
  if (!/region=seFillInside\(region,W,H\);/.test(srb))
    throw new Error('the lines are selected rather than what they enclose');
  if (!/const inside=!box\|\|box\.checked;/.test(srb))
    throw new Error('there is no way to take the ink itself');
  /* RECOUNTED. n is what decides the refusal and what the message prints, and
     a fill changes it. */
  if (!/n=0; for\(let i=0;i<W\*H;i\+\+\) if\(region\[i\]\) n\+\+;/.test(srb))
    throw new Error('the count is left over from before the fill');
  /* AND THE ALPHA RULE UNDERNEATH IS UNCHANGED - a threshold here would still
     shave a soft edge off before anything else ran. */
  if (!/if\(d\[i\*4\+3\]>0\)\{ region\[i\]=1; n\+\+; \}/.test(srb))
    throw new Error('the ink test changed, so a soft edge is no longer in the shape');
  if (!/let region=new Uint8Array\(W\*H\);/.test(srb))
    throw new Error('the region cannot be replaced by the ground drop or the fill');
  if (!/return \{region,n,ground\};/.test(srb))
    throw new Error('the caller cannot say whether a ground was taken out');

  /* THE CHECKBOX EXISTS AND STARTS ON. */
  if (text.indexOf('<input type="checkbox" id="seshapefill" checked>') < 0)
    throw new Error('the fill choice is missing, or starts off');
  if (text.indexOf('fill the inside') < 0)
    throw new Error('the choice has no label');

  /* AND THE MESSAGE SAYS WHEN A GROUND CAME OUT. */
  if (!/\(out\.ground\?", without the flat ground it is drawn on":""\)/.test(code))
    throw new Error('a selection smaller than the picture is left unexplained');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
