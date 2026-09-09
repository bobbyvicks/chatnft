/* WHERE THIS TRAIT SITS, AGAINST THE REFERENCE FOR ITS CATEGORY.

   The Creator Kit carries a reference box for every category on its 1024
   working frame - where the example eyes, hat, chain or garment actually sits
   - and a brief saying what has to line up. A new trait that misses the
   neckline or the forehead is a fit failure, and until now the only way to see
   one was to composite it and look.

   THE DISTINCTION THAT MATTERS, AND IT IS NOT A DETAIL. Most of these boxes
   are ONE EXAMPLE, not a constraint. The briefs say so themselves - "hat
   height and silhouette can vary with the concept", "make the silhouette
   intentional". So the general check REPORTS A DISTANCE and refuses to call it
   a failure: how far each edge is from the reference, in pixels, for a person
   to judge. A tool that failed a tall hat would be wrong about the hat.

   TWO THINGS IN THE BRIEF ARE RULES, AND THOSE ARE CHECKED AS RULES:

     backgrounds  "Create only the background on the full square canvas."
                  A background with a transparent corner is not a background.
     eyes         "Both eyes are 136 x 64... Same top, bottom and outer shape."
                  Equal size on the same plane is stated as a requirement, and
                  a pair that fails it is wrong however good it looks alone.

   The frame is 1024 and the collection is 1280, so every reference is scaled
   by the canvas it is measured against rather than assumed. A check that
   compared 1024 numbers to a 1280 canvas would report every trait as badly
   placed and be wrong about all of them.
*/
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';

/* The reference boxes, read from the kit's own spec rather than retyped. */
const SPEC = 'C:/Users/vicke/OneDrive/Documents/ChatGPT/pixel art_/creator-kit-work/kit-spec.json';
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
if (!spec.canvas || spec.canvas.width !== 1024)
  throw new Error('the kit frame is not 1024; the scaling below assumes it');
const refs = {};
for (const c of spec.categories || []) {
  const b = c.bboxWorking;
  if (!Array.isArray(b) || b.length !== 4) continue;
  refs[String(c.id)] = b.map(v => Math.round(v));
}
if (Object.keys(refs).length < 12)
  throw new Error('only ' + Object.keys(refs).length + ' categories carry a reference box');
for (const [k, b] of Object.entries(refs))
  if (b[2] <= b[0] || b[3] <= b[1] || b[0] < 0 || b[1] < 0 || b[2] > 1024 || b[3] > 1024)
    throw new Error('the reference box for ' + k + ' is not inside the frame');

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

const refLines = Object.keys(refs).sort().map((k, i, all) =>
  '  ' + JSON.stringify(k) + ':[' + refs[k].join(',') + ']' + (i === all.length - 1 ? '};' : ','));

/* ---- 1. the references and the check ------------------------------------ */
swap(block([
  '/* How many colours this category is allowed. */',
]), block([
  '/* WHERE THE EXAMPLE SITS, per category, on the kit\'s 1024 working frame.',
  '   Taken from the Creator Kit spec rather than retyped, and scaled to',
  '   whatever canvas a trait is actually on. */',
  'const PLACEMENT_FRAME=1024;',
  'const PLACEMENT_REF={',
].concat(refLines).concat([
  '/* The two the brief states as requirements rather than as an example. */',
  'const PLACEMENT_RULES={backgrounds:"fill", eyes:"pair"};',
  '/* The artwork\'s own box: the smallest rectangle holding every visible',
  '   pixel. Empty art has no box, which is not the same as a box at 0,0. */',
  'function artBox(d,W,H){',
  '  let l=W, t=H, r=-1, b=-1;',
  '  for(let y=0;y<H;y++) for(let x=0;x<W;x++){',
  '    if(!d[(y*W+x)*4+3]) continue;',
  '    if(x<l) l=x; if(y<t) t=y; if(x>r) r=x; if(y>b) b=y;',
  '  }',
  '  return r<0 ? null : [l,t,r+1,b+1];',
  '}',
  '/* The visible components, largest first, for the pair check. Eight-way,',
  '   like the pixel inspection, so a diagonal join is one thing. */',
  'function artPieces(d,W,H,cap){',
  '  const n=W*H, seen=new Uint8Array(n), q=new Int32Array(n), out=[];',
  '  for(let p=0;p<n;p++){',
  '    if(seen[p]||!d[p*4+3]) continue;',
  '    let head=0, tail=1; q[0]=p; seen[p]=1;',
  '    let l=W,t=H,r=-1,b=-1;',
  '    while(head<tail){',
  '      const c=q[head++], x=c%W, y=(c-x)/W;',
  '      if(x<l) l=x; if(y<t) t=y; if(x>r) r=x; if(y>b) b=y;',
  '      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){',
  '        if(!dx&&!dy) continue;',
  '        const xx=x+dx, yy=y+dy;',
  '        if(xx<0||yy<0||xx>=W||yy>=H) continue;',
  '        const v=yy*W+xx;',
  '        if(!seen[v]&&d[v*4+3]){ seen[v]=1; q[tail++]=v; }',
  '      }',
  '    }',
  '    out.push({box:[l,t,r+1,b+1], area:tail});',
  '    if(cap&&out.length>cap*40) break;',
  '  }',
  '  out.sort((a,b)=>b.area-a.area);',
  '  return out;',
  '}',
  '/* A DISTANCE, NOT A VERDICT - except where the brief states a rule.',
  '',
  '   Most reference boxes are one example and the briefs say the silhouette',
  '   may vary, so the general answer is how far each edge is from it and',
  '   nothing more. Backgrounds filling the square and eyes being an equal',
  '   pair on the same plane are stated as requirements, and those are the',
  '   only two this reports as pass or fail. */',
  'function placementCheck(d,W,H,layer){',
  '  const l=String(layer||"");',
  '  const box=artBox(d,W,H);',
  '  const scale=W/PLACEMENT_FRAME;',
  '  const out={layer:l, canvas:[W,H], scale:+scale.toFixed(4), box:box,',
  '    reference:null, expected:null, delta:null, rule:null, verdict:null};',
  '  const ref=PLACEMENT_REF[l];',
  '  if(ref){',
  '    out.reference=ref.slice();',
  '    out.expected=ref.map(v=>Math.round(v*scale));',
  '    if(box) out.delta={left:box[0]-out.expected[0], top:box[1]-out.expected[1],',
  '      right:box[2]-out.expected[2], bottom:box[3]-out.expected[3]};',
  '  }',
  '  const rule=PLACEMENT_RULES[l];',
  '  if(rule==="fill"){',
  '    /* "Create only the background on the full square canvas." A background',
  '       with a transparent corner is not one. */',
  '    let clear=0;',
  '    for(let i=3;i<d.length;i+=4) if(!d[i]) clear++;',
  '    out.rule="fill";',
  '    out.clearPixels=clear;',
  '    out.verdict=clear?"does not fill the canvas":"fills the canvas";',
  '  }else if(rule==="pair"){',
  '    /* "Both eyes are 136 x 64... Same top, bottom and outer shape." */',
  '    const pieces=artPieces(d,W,H,2);',
  '    out.rule="pair";',
  '    out.pieces=pieces.length;',
  '    if(pieces.length<2){ out.verdict="only "+pieces.length+" shape, so there is no pair"; }',
  '    else{',
  '      const a=pieces[0].box, b=pieces[1].box;',
  '      const left=a[0]<=b[0]?a:b, right=a[0]<=b[0]?b:a;',
  '      out.pair={left:left, right:right,',
  '        widths:[left[2]-left[0], right[2]-right[0]],',
  '        heights:[left[3]-left[1], right[3]-right[1]],',
  '        tops:[left[1], right[1]], bottoms:[left[3], right[3]]};',
  '      const dW=Math.abs(out.pair.widths[0]-out.pair.widths[1]);',
  '      const dH=Math.abs(out.pair.heights[0]-out.pair.heights[1]);',
  '      const dT=Math.abs(out.pair.tops[0]-out.pair.tops[1]);',
  '      const dB=Math.abs(out.pair.bottoms[0]-out.pair.bottoms[1]);',
  '      out.pair.offBy={width:dW, height:dH, top:dT, bottom:dB};',
  '      /* WHICH MEASUREMENT DIFFERS, BY HOW MUCH. The first wording said',
  '         "12px wider, 10px higher, 10px lower" about the same pair, which',
  '         reads as a contradiction and names no eye: wider than what, and',
  '         how is one pair both higher and lower. It is two shapes and four',
  '         measurements, so the sentence says which measurement. */',
  '      out.verdict=(dW||dH||dT||dB)',
  '        ? "not an equal pair on the same plane: "',
  '          +[dW?"widths differ by "+dW+"px":"",',
  '            dH?"heights by "+dH+"px":"",',
  '            dT?"tops by "+dT+"px":"",',
  '            dB?"bottoms by "+dB+"px":""].filter(Boolean).join(", ")',
  '        : "equal pair on the same plane";',
  '    }',
  '  }',
  '  return out;',
  '}',
  '/* How many colours this category is allowed. */',
])));

/* ---- 2. in the panel ---------------------------------------------------- */
swap(block([
  '        <button class="btn ghost" id="agspec">Check against the spec</button>',
]), block([
  '        <button class="btn ghost" id="agspec">Check against the spec</button>',
  '        <button class="btn ghost" id="agplace">Check the placement</button>',
  '        <p class="note mono" id="agplaceout"></p>',
]));

swap(block([
  'function agentBefore(on){',
]), block([
  '/* Said as an offset from the reference, because that is what it is. The',
  '   rule categories get a verdict because the brief gives them one. */',
  'function agentPlacement(){',
  '  const el=$("agplaceout"); if(!el) return null;',
  '  if(!art||!art.width||!ctx){ el.textContent="Open a trait first."; return null; }',
  '  const layer=$("tlayer")?$("tlayer").value:"";',
  '  const im=ctx.getImageData(0,0,art.width,art.height);',
  '  const r=placementCheck(im.data,art.width,art.height,layer);',
  '  const bits=[];',
  '  if(!r.box) bits.push("nothing visible on the canvas");',
  '  else bits.push("art "+(r.box[2]-r.box[0])+"\\u00d7"+(r.box[3]-r.box[1])',
  '    +" at "+r.box[0]+","+r.box[1]);',
  '  if(r.verdict) bits.push(r.verdict);',
  '  else if(r.delta){',
  '    const d=r.delta;',
  '    const worst=Math.max(Math.abs(d.left),Math.abs(d.top),Math.abs(d.right),Math.abs(d.bottom));',
  '    /* An offset, never a pass or a fail: most of these references are one',
  '       example and the briefs say the silhouette may vary. */',
  '    bits.push(worst===0 ? "exactly on the reference for "+r.layer',
  '      : "off the "+r.layer+" reference by L"+d.left+" T"+d.top',
  '        +" R"+d.right+" B"+d.bottom+" px");',
  '  }else if(!PLACEMENT_REF[r.layer]) bits.push("no reference for this category");',
  '  el.textContent=bits.join("  \\u00b7  ");',
  '  agentStep("Checked the placement", r.verdict||(r.delta',
  '    ? "off by up to "+Math.max(Math.abs(r.delta.left),Math.abs(r.delta.top),',
  '      Math.abs(r.delta.right),Math.abs(r.delta.bottom))+"px" : "no reference"));',
  '  return r;',
  '}',
  'function agentBefore(on){',
]));

/* ---- 3. wired, and on the surface --------------------------------------- */
swap(block([
  'if($("agspec")) $("agspec").onclick=()=>agentSpec();',
]), block([
  'if($("agspec")) $("agspec").onclick=()=>agentSpec();',
  'if($("agplace")) $("agplace").onclick=()=>agentPlacement();',
]));

swap(block([
  'PB.spec=function(){ return agentSpec(); };',
]), block([
  'PB.spec=function(){ return agentSpec(); };',
  '/* Where it sits against the reference for its category. */',
  'PB.placement=function(){ return agentPlacement(); };',
  'PB.reference=function(layer){',
  '  const r=PLACEMENT_REF[String(layer||"")];',
  '  return r?{frame:PLACEMENT_FRAME, box:r.slice(),',
  '    rule:PLACEMENT_RULES[String(layer||"")]||null}:null;',
  '};',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function placementCheck(d,W,H,layer){', 'function artBox(d,W,H){',
  'function artPieces(d,W,H,cap){', 'PB.placement=function(){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* EVERY CATEGORY THE KIT DESCRIBES. A reference that quietly went missing is a
   category this cannot answer for, and it would look like "no reference". */
const rStart = code.indexOf('const PLACEMENT_REF={');
const rEnd = code.indexOf(NL + 'const PLACEMENT_RULES=', rStart);
if (rStart < 0 || rEnd < 0) throw new Error('could not bound the references');
const landed = code.slice(rStart, rEnd);
for (const k of Object.keys(refs))
  if (landed.indexOf('"' + k + '":[' + refs[k].join(',') + ']') < 0)
    throw new Error('the reference for ' + k + ' did not land, or landed changed');

/* THE FRAME IS SCALED, NOT ASSUMED. 1024 numbers against a 1280 canvas would
   report every trait in the collection as badly placed. */
const pStart = code.indexOf('function placementCheck(d,W,H,layer){');
/* BOUNDED ON CODE. kit.code() strips comments, so a bound on one is not
   found and the slice falls through - the fifth time this file has paid
   for it. The next declaration is the bound. */
const pEnd = code.indexOf(NL + 'function ruleColourBudget(layer){', pStart);
if (pStart < 0 || pEnd < 0) throw new Error('could not bound placementCheck');
const check = code.slice(pStart, pEnd);
if (check.indexOf('const scale=W/PLACEMENT_FRAME;') < 0)
  throw new Error('the reference is no longer scaled to the canvas');
if (check.indexOf('ref.map(v=>Math.round(v*scale))') < 0)
  throw new Error('the expected box is not scaled');

/* A DISTANCE, NOT A VERDICT, except for the two the brief states as rules. */
if (check.split('out.verdict=').length !== 4)
  throw new Error('a verdict is being given somewhere other than the two stated rules');
if (code.indexOf('const PLACEMENT_RULES={backgrounds:"fill", eyes:"pair"};') < 0)
  throw new Error('the two stated rules changed');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes'
  + ' (' + Object.keys(refs).length + ' category references)');
