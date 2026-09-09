/* PIXEL INSPECTION: the measurement half.

   Ported from Codex's pixel-qa-core.js in the ChatNFT project, which the user
   asked to have built onto this site. The algorithm and its rules are his; the
   formatting and the comments about WHY are rewritten for this file, and the
   contract is kept identical so a report from either side means the same
   thing - including the rules block, which is what a downloaded report has to
   carry to be readable next month.

   WHAT IT LOOKS FOR, in exact canvas pixels:

     speck   a connected island of one colour, small enough to be a stray
     thin    a native one-pixel-wide run - legitimate steps, folds, letters
     narrow  a run no wider than one cell of the artwork grid
     mixed   a grid cell holding more than one colour
     alpha   partial transparency, which a binary-alpha collection should not
             have anywhere

   THE PART THAT MATTERS IS WHAT IT REFUSES TO FIX. A finding is a measurement,
   not a verdict about art, and only one kind is ever offered as a repair: an
   enclosed small island where at least 75% of the surrounding boundary agrees
   on one colour. Everything else stays manual, each for a stated reason -
   dark ink is an outline or lettering, a diagonal-only structure is drawn that
   way on purpose, an elongated run is a stroke, a boundary that disagrees is
   not enclosed, and anything touching the canvas edge or partial alpha is
   silhouette. Those refusals are the whole value; a tool that offered to
   "clean" all of them would eat the art.

   AND A REPAIR CANNOT BE APPLIED TO A CHANGED CANVAS. The report carries the
   pixels it was computed from and the repair compares against them, so a scan
   from before three brush strokes cannot be applied afterwards.
*/
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
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

swap(block([
  '/* WHAT THIS ART IS DRAWN AT, block by block.',
]), block([
  '/* ================= pixel inspection ============================= */',
  '/* Ported from the ChatNFT project\'s pixel-qa-core. The rules are that',
  '   file\'s; a report from either side has to mean the same thing.',
  '',
  '   A FINDING IS A MEASUREMENT, NOT A VERDICT ABOUT ART. Only one kind is',
  '   ever offered as a repair - an enclosed small island where the boundary',
  '   agrees - and the refusals below are the point of the whole thing. */',
  'function qaValidate(im){',
  '  if(!im||!Number.isInteger(im.width)||!Number.isInteger(im.height)',
  '    ||im.width<1||im.height<1||im.width*im.height>16777216',
  '    ||!ArrayBuffer.isView(im.data)||im.data.BYTES_PER_ELEMENT!==1',
  '    ||im.data.length!==im.width*im.height*4)',
  '    throw Error("Invalid image: use a byte RGBA canvas of at most 16 million pixels");',
  '}',
  '/* One number per pixel, and 0 for anything fully transparent: invisible RGB',
  '   is not a colour, and treating it as one splits components on differences',
  '   nobody can see. */',
  'const qaKey=(d,i)=>d[i+3]?(((d[i]<<24)|(d[i+1]<<16)|(d[i+2]<<8)|d[i+3])>>>0):0;',
  'const qaRgba=k=>[k>>>24,(k>>>16)&255,(k>>>8)&255,k&255];',
  'function qaScan(im,opts){',
  '  const o=opts||{};',
  '  const cellSize=o.cellSize===undefined?4:o.cellSize;',
  '  const markSize=o.markSize===undefined?cellSize:o.markSize;',
  '  const protectedRects=o.protectedRects||[];',
  '  qaValidate(im);',
  '  if(!Number.isInteger(cellSize)||cellSize<1||cellSize>64) throw Error("Invalid cell size");',
  '  if(!Number.isInteger(markSize)||markSize<1||markSize>64) throw Error("Invalid small mark size");',
  '  const w=im.width, h=im.height, n=w*h, d=im.data;',
  '  const keys=new Uint32Array(n), protect=new Uint8Array(n);',
  '  const rects=protectedRects.map(r=>{',
  '    if(!Array.isArray(r)||r.length!==4||r.some(v=>!Number.isInteger(v))',
  '      ||r[0]<0||r[1]<0||r[2]>w||r[3]>h||r[2]<=r[0]||r[3]<=r[1])',
  '      throw Error("Invalid protected rectangle");',
  '    return r.slice();',
  '  });',
  '  for(const r of rects) for(let y=r[1];y<r[3];y++) protect.fill(1,y*w+r[0],y*w+r[2]);',
  '  for(let p=0;p<n;p++) keys[p]=qaKey(d,p*4);',
  '  const findings=[], queue=new Int32Array(n), seen=new Uint8Array(n);',
  '  /* Eight neighbours, not four. Diagonal ink stays connected rather than',
  '     becoming a row of allegedly isolated dots. */',
  '  const around=(p,fn)=>{',
  '    const x=p%w, y=(p-x)/w;',
  '    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)',
  '      if((dx||dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h) fn(p+dy*w+dx,dx,dy);',
  '  };',
  '  /* Runs, not points: a finding is drawn and repaired by horizontal runs,',
  '     and a report of 40,000 loose pixel numbers is not readable by anyone. */',
  '  function record(kind,points){',
  '    points.sort((a,b)=>a-b);',
  '    let l=w,t=h,r=0,b=0,locked=false;',
  '    const runs=[];',
  '    for(const p of points){',
  '      const x=p%w, y=(p-x)/w;',
  '      l=Math.min(l,x); t=Math.min(t,y); r=Math.max(r,x+1); b=Math.max(b,y+1);',
  '      if(protect[p]) locked=true;',
  '      const last=runs[runs.length-1];',
  '      if(last&&last[0]===y&&last[1]+last[2]===x) last[2]++; else runs.push([y,x,1]);',
  '    }',
  '    const f={id:kind+":"+points[0], kind:kind, bounds:[l,t,r,b], area:points.length,',
  '      runs:runs, protected:locked, fixable:false, reason:"Review only"};',
  '    findings.push(f);',
  '    return f;',
  '  }',
  '  for(let p=0;p<n;p++){',
  '    if(seen[p]||!keys[p]) continue;',
  '    let head=0, tail=1; queue[0]=p; seen[p]=1;',
  '    let l=w,t=h,r=0,b=0;',
  '    while(head<tail){',
  '      const q=queue[head++], x=q%w, y=(q-x)/w;',
  '      l=Math.min(l,x); t=Math.min(t,y); r=Math.max(r,x+1); b=Math.max(b,y+1);',
  '      around(q,v=>{ if(!seen[v]&&keys[v]===keys[p]){ seen[v]=1; queue[tail++]=v; } });',
  '    }',
  '    if(tail>markSize*markSize||r-l>markSize||b-t>markSize) continue;',
  '    const points=Array.from(queue.subarray(0,tail));',
  '    const f=record("speck",points), ink=qaRgba(keys[p]), boundary=new Set();',
  '    let edge=false, diagonal=false;',
  '    for(const q of points){',
  '      const x=q%w, y=(q-x)/w;',
  '      if(x===0||y===0||x===w-1||y===h-1) edge=true;',
  '      let orthogonal=0, diag=0;',
  '      around(q,(v,dx,dy)=>{',
  '        if(keys[v]===keys[p]){ if(dx&&dy) diag++; else orthogonal++; }',
  '        else boundary.add(v);',
  '      });',
  '      if(diag&&!orthogonal) diagonal=true;',
  '    }',
  '    const votes=new Map();',
  '    for(const v of boundary){',
  '      if((keys[v]&255)!==255) edge=true;',
  '      if(protect[v]) f.protected=true;',
  '      votes.set(keys[v],(votes.get(keys[v])||0)+1);',
  '    }',
  '    const sorted=[...votes].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);',
  '    const winner=sorted[0], dominance=winner?winner[1]/boundary.size:0;',
  '    f.colour=ink; f.nativeSingleton=tail===1; f.surroundingAgreement=dominance;',
  '    /* EVERY REFUSAL HAS A REASON, and the reasons are the tool. */',
  '    if(f.protected) f.reason="Protected area or its boundary";',
  '    else if(edge||ink[3]!==255) f.reason="Silhouette, canvas edge or partial opacity";',
  '    else if(Math.max(ink[0],ink[1],ink[2])<=32) f.reason="Dark ink: preserve outlines and writing";',
  '    else if(diagonal) f.reason="Diagonal-only structure";',
  '    else if(tail>1&&Math.max(r-l,b-t)>=2*Math.min(r-l,b-t)) f.reason="Elongated thin structure: manual review";',
  '    else if(dominance<0.75) f.reason="Surrounding colours disagree";',
  '    else { f.fixable=true; f.replacement=qaRgba(winner[0]);',
  '      f.reason="Enclosed small colour island; at least 75% of boundary agrees"; }',
  '  }',
  '  /* Native one-pixel runs even where they join a larger area. These include',
  '     legitimate steps, folds and letters, so this category NEVER suggests a',
  '     repair - it is there to be looked at. */',
  '  const thin=new Uint8Array(n), narrow=new Uint8Array(n), alpha=new Uint8Array(n);',
  '  for(let y=0;y<h;y++) for(let x=0;x<w;){',
  '    const start=x, k=keys[y*w+x];',
  '    while(x<w&&keys[y*w+x]===k) x++;',
  '    if(k&&x-start===1) thin[y*w+start]=1;',
  '    if(k&&x-start<=cellSize) narrow.fill(1,y*w+start,y*w+x);',
  '  }',
  '  for(let x=0;x<w;x++) for(let y=0;y<h;){',
  '    const start=y, k=keys[y*w+x];',
  '    while(y<h&&keys[y*w+x]===k) y++;',
  '    if(k&&y-start===1) thin[start*w+x]=1;',
  '    if(k&&y-start<=cellSize) for(let yy=start;yy<y;yy++) narrow[yy*w+x]=1;',
  '  }',
  '  for(let p=0;p<n;p++) if((keys[p]&255)>0&&(keys[p]&255)<255) alpha[p]=1;',
  '  function maskFindings(kind,mask){',
  '    for(let p=0;p<n;p++) if(mask[p]){',
  '      let head=0, tail=1; queue[0]=p; mask[p]=0;',
  '      while(head<tail){ const q=queue[head++]; around(q,v=>{ if(mask[v]){ mask[v]=0; queue[tail++]=v; } }); }',
  '      record(kind,Array.from(queue.subarray(0,tail)));',
  '    }',
  '  }',
  '  maskFindings("thin",thin); maskFindings("narrow",narrow); maskFindings("alpha",alpha);',
  '  /* Grid cells are measured INCLUDING protected ones: a protected logo that',
  '     is off the grid is still off the grid, and hiding that would make the',
  '     count answer a different question from the one it is asked. */',
  '  for(let y=0;y<h;y+=cellSize) for(let x=0;x<w;x+=cellSize){',
  '    const k=keys[y*w+x], r=Math.min(w,x+cellSize), b=Math.min(h,y+cellSize);',
  '    let mixed=false;',
  '    for(let yy=y;yy<b&&!mixed;yy++) for(let xx=x;xx<r;xx++) if(keys[yy*w+xx]!==k){ mixed=true; break; }',
  '    if(mixed){',
  '      const points=[];',
  '      for(let yy=y;yy<b;yy++) for(let xx=x;xx<r;xx++) points.push(yy*w+xx);',
  '      record("mixed",points);',
  '    }',
  '  }',
  '  const counts={speck:0,thin:0,narrow:0,alpha:0,mixed:0,fixable:0,protected:0,',
  '    nativeSingletons:0,thinPixels:0,narrowPixels:0,alphaPixels:0};',
  '  for(const f of findings){',
  '    counts[f.kind]++;',
  '    if(f.fixable) counts.fixable++;',
  '    if(f.protected) counts.protected++;',
  '    if(f.nativeSingleton) counts.nativeSingletons++;',
  '    if(f.kind==="thin") counts.thinPixels+=f.area;',
  '    if(f.kind==="narrow") counts.narrowPixels+=f.area;',
  '    if(f.kind==="alpha") counts.alphaPixels+=f.area;',
  '  }',
  '  return {width:w, height:h, cellSize:cellSize, markSize:markSize,',
  '    protectedRects:rects, counts:counts, findings:findings,',
  '    /* The pixels this was computed FROM, so a repair can refuse to apply',
  '       findings that describe a canvas nobody is looking at any more. */',
  '    source:new Uint8ClampedArray(d),',
  '    rules:{version:2, connectivity:8, colours:"exact RGBA; invisible RGB ignored",',
  '      speck:"connected component area <= markSize\\u00b2 and bounding width and height <= markSize",',
  '      thin:"native horizontal OR vertical same-colour run of length 1",',
  '      narrow:"horizontal OR vertical same-colour run <= cellSize pixels, including thin",',
  '      mixed:"non-uniform visible RGBA in a cell aligned to canvas origin",',
  '      repair:"enclosed opaque specks, 75% boundary agreement; no dark ink, diagonal-only structures, multi-pixel components with bounding aspect ratio >= 2, or protected regions"}};',
  '}',
  '/* A REPAIR CANNOT BE APPLIED TO A CANVAS THAT MOVED. Three brush strokes',
  '   after a scan, the findings describe a picture that no longer exists and',
  '   their coordinates now point at somebody else\'s pixels. */',
  'function qaRepair(im,report,ids){',
  '  qaValidate(im);',
  '  if(im.width!==report.width||im.height!==report.height||!report.source',
  '    ||im.data.length!==report.source.length',
  '    ||im.data.some((v,i)=>v!==report.source[i]))',
  '    throw Error("Artwork changed; scan again before applying stale findings");',
  '  const map=new Map(report.findings.map(f=>[f.id,f]));',
  '  const selected=[...new Set(ids)].map(id=>{',
  '    const f=map.get(id);',
  '    if(!f) throw Error("Unknown finding");',
  '    if(!f.fixable||f.protected||!f.replacement) throw Error("Manual-only or protected finding");',
  '    return f;',
  '  });',
  '  const out={width:im.width, height:im.height,',
  '    data:new Uint8ClampedArray(im.data), changedPixels:0, changes:[]};',
  '  for(const f of selected){',
  '    for(const run of f.runs) for(let xx=run[1];xx<run[1]+run[2];xx++){',
  '      out.data.set(f.replacement,(run[0]*im.width+xx)*4);',
  '      out.changedPixels++;',
  '    }',
  '    out.changes.push({id:f.id, runs:f.runs, from:f.colour, to:f.replacement});',
  '  }',
  '  return out;',
  '}',
  '/* Without the source pixels, which are megabytes and mean nothing in a file',
  '   somebody reads. */',
  'function qaExportReport(report){',
  '  const out={};',
  '  for(const k of Object.keys(report)) if(k!=="source") out[k]=report[k];',
  '  out.coordinateConvention="zero-based PNG pixels; bounds [left,top,right-exclusive,bottom-exclusive]; runs [y,x,length]";',
  '  out.note="Categories can overlap. Counts are measurements, not proof of artistic defects.";',
  '  return out;',
  '}',
  '/* WHAT THIS ART IS DRAWN AT, block by block.',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function qaScan(im,opts){', 'function qaRepair(im,report,ids){',
  'function qaExportReport(report){', 'const qaKey=', 'function qaValidate(im){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const sStart = code.indexOf('function qaScan(im,opts){');
const sEnd = code.indexOf(NL + 'function qaRepair(', sStart);
if (sStart < 0 || sEnd < 0) throw new Error('could not bound qaScan');
const scan = code.slice(sStart, sEnd);

/* EVERY REFUSAL IS STILL THERE. These are the whole value of the tool: a
   version that dropped one of them would offer to "clean" outlines, lettering,
   deliberate diagonals or strokes, and would pass any test that only checks
   that specks are found. */
for (const reason of ['Protected area or its boundary',
  'Silhouette, canvas edge or partial opacity',
  'Dark ink: preserve outlines and writing',
  'Diagonal-only structure',
  'Elongated thin structure: manual review',
  'Surrounding colours disagree'])
  if (scan.indexOf(reason) < 0) throw new Error('a refusal was lost: ' + reason);

/* AND FIXABLE IS SET IN EXACTLY ONE PLACE, after all of them. */
if (scan.split('f.fixable=true').length !== 2)
  throw new Error('fixable is set somewhere other than the single enclosed-island case');
if (scan.indexOf('dominance<0.75') < 0)
  throw new Error('the boundary agreement threshold is gone');

/* THE STALE-SCAN GUARD. Without it a repair from before three brush strokes
   paints its coordinates over whatever is there now. */
const rStart = code.indexOf('function qaRepair(im,report,ids){');
const repair = code.slice(rStart, rStart + 1200);
if (repair.indexOf('Artwork changed; scan again') < 0)
  throw new Error('a repair can be applied to a canvas that has moved');
if (repair.indexOf('if(!f.fixable||f.protected||!f.replacement) throw Error') < 0)
  throw new Error('a manual-only finding can be applied through the id list');

/* The report a person downloads carries the rules it was measured by. */
if (scan.indexOf('rules:{version:2, connectivity:8') < 0)
  throw new Error('the report no longer states the rules it used');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
