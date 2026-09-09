/* THE AGENT PAGE: collection-wide questions, asked once.

   Everything this site does is one trait at a time, and every question that is
   actually blocking the launch is about all 317 at once - which are off grid,
   which carry a colour nothing else uses, which acceptances stopped being true.
   Neither agent working on this collection could ask those through the site, so
   both kept answering them in throwaway scripts, which is why the work kept
   landing as files on a disk instead of as something the owner can press.

   TWO AUDIENCES, ONE SURFACE. Every job is a function on `PB` returning plain
   data, and a button on a page showing the same result. Agent-only tools would
   be tools the owner cannot check, and the point of a baseline is that they
   can watch it. So: PB.grids() for us, "Grid census" for them, same numbers.

   THE JOBS ARE CHOSEN BY WHAT IS UNANSWERED, not by what is easy:

     grids    the collection is on two grids - every skin is 8px and almost
              everything else is 10px - and nothing in the app said so. This
              is the census that found it, moved out of a throwaway script.
     colours  a trait using #2b2b2b where the other 316 use #2a2a2a is
              invisible one trait at a time and a visible seam once composited.
              The rare tail is where drift, mis-picks and anti-alias residue
              collect.

   DECODED ONE AT A TIME, yielding between traits. 317 PNGs at 1280x1280 is
   1.6 million pixels each; holding them would be two gigabytes and blocking on
   them would look like a hung tab. Progress is on `PB.progress` so an agent can
   watch it too, not only the page.
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

/* ---- 1. a fourth page --------------------------------------------------- */
swap(block([
  '#land[data-page="settings"] .pg-home,',
  '#land[data-page="settings"] .pg-project{display:none;}',
]), block([
  '#land[data-page="settings"] .pg-home,',
  '#land[data-page="settings"] .pg-project,',
  '/* The fourth page. These rules are pairwise on purpose - one line per',
  '   (page, section) pair rather than a clever selector - because the failure',
  '   they prevent is a section appearing on a page nobody meant it to. */',
  '#land[data-page="home"] .pg-agent,',
  '#land[data-page="project"] .pg-agent,',
  '#land[data-page="settings"] .pg-agent,',
  '#land[data-page="agent"] .pg-home,',
  '#land[data-page="agent"] .pg-project,',
  '#land[data-page="agent"] .pg-settings{display:none;}',
  '#agout{max-height:340px; overflow:auto; background:var(--panel);',
  '  border:1px solid var(--line); border-radius:8px; padding:10px;',
  '  font-size:12px; line-height:1.45; white-space:pre; margin:8px 0;}',
  '.agjob{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0;}',
  '.agjob code{font-size:12px; color:var(--muted);}',
]));

swap(block([
  '    <button type="button" class="pgtab" data-page="project">Project</button>',
]), block([
  '    <button type="button" class="pgtab" data-page="project">Project</button>',
  '    <button type="button" class="pgtab" data-page="agent"',
  '      title="Questions about the whole collection at once, for you and for an agent">Agent</button>',
]));

/* ---- 2. the page itself -------------------------------------------------- */
swap(block([
  '  <p class="tag pg-home">Edit pixel art on the grid it was <b>actually drawn on</b>. Nothing leaves your device.</p>',
]), block([
  '  <p class="tag pg-home">Edit pixel art on the grid it was <b>actually drawn on</b>. Nothing leaves your device.</p>',
  '  <section class="extract pg-agent">',
  '    <h2>Agent</h2>',
  '    <p class="note">Questions about the whole collection at once. Every job here',
  '      is a function an agent can call and a button you can press, and they give',
  '      the same answer - so you can check what was done rather than take it on',
  '      trust. Nothing leaves your device.</p>',
  '    <div class="agjob">',
  '      <button class="btn ghost" id="aggrids">Grid census</button>',
  '      <code>PB.grids()</code>',
  '      <span class="note">what block size each trait is really drawn at</span>',
  '    </div>',
  '    <div class="agjob">',
  '      <button class="btn ghost" id="agcolours">Colour census</button>',
  '      <code>PB.colours()</code>',
  '      <span class="note">every colour, rarest first - where drift shows up</span>',
  '    </div>',
  '    <p class="note mono" id="agstatus">Nothing run yet.</p>',
  '    <div id="agout" hidden></div>',
  '    <div class="btnrow">',
  '      <button class="btn ghost" id="agsave" disabled>Download the answer</button>',
  '      <button class="btn ghost" id="agstop" hidden>Stop</button>',
  '    </div>',
  '  </section>',
]));

/* ---- 3. the surface ------------------------------------------------------ */
swap(block([
  'const PAGES=["home","project","settings"];',
]), block([
  '/* ================= the agent surface ============================= */',
  '/* One namespace, so the names an agent depends on are a decision rather',
  '   than whatever an internal function happened to be called. Everything',
  '   returns plain data: no DOM, no promises of a rendered page. */',
  'const PB={version:1, busy:false, progress:null, last:null, stop:false,',
  '  jobs:["grids","colours"]};',
  '/* Walks every trait, decoded one at a time.',
  '',
  '   ONE AT A TIME AND YIELDING. 317 traits at 1280x1280 is 1.6 million pixels',
  '   each; holding them all would be about two gigabytes, and running straight',
  '   through them without yielding is a tab that looks hung for a minute. */',
  'async function pbEach(job,fn){',
  '  if(PB.busy) throw Error("A job is already running");',
  '  /* CLAIMED BEFORE THE FIRST AWAIT, not after. Setting it after reading the',
  '     store leaves a window the width of that read in which a second job',
  '     checks the flag, finds it clear and starts anyway - which a test caught',
  '     by launching two in the same tick and getting no error at all. */',
  '  PB.busy=true; PB.stop=false;',
  '  let items=[];',
  '  try{ items=(await dbAll()).filter(i=>i.kind==="trait"&&i.blob); }',
  '  catch(_){ items=[]; }',
  '  PB.progress={job:job, done:0, total:items.length};',
  '  const c=document.createElement("canvas");',
  '  const g=c.getContext("2d",{willReadFrequently:true});',
  '  g.imageSmoothingEnabled=false;',
  '  const skipped=[];',
  '  try{',
  '    for(const t of items){',
  '      if(PB.stop) break;',
  '      try{',
  '        const bm=await createImageBitmap(t.blob);',
  '        c.width=t.w||bm.width; c.height=t.h||bm.height;',
  '        g.clearRect(0,0,c.width,c.height);',
  '        g.drawImage(bm,0,0);',
  '        await fn(t,g.getImageData(0,0,c.width,c.height));',
  '      }catch(_){ skipped.push(traitKey(t)); }',
  '      PB.progress.done++;',
  '      /* Every eight, not every one: a yield per trait doubles the wall clock',
  '         and the screen cannot show 317 updates anyone can read. */',
  '      if(PB.progress.done%8===0){',
  '        agSay(job+": "+PB.progress.done+" of "+PB.progress.total);',
  '        await new Promise(r=>setTimeout(r,0));',
  '      }',
  '    }',
  '  }finally{ PB.busy=false; }',
  '  return {total:items.length, done:PB.progress.done,',
  '    stopped:PB.stop, skipped:skipped};',
  '}',
  '/* WHAT GRID IS EACH TRAIT ACTUALLY ON.',
  '',
  '   Measured across the real 317 in a throwaway script before this existed:',
  '   151 at 10px, 34 at 8px - every skin - and 42 with no block structure at',
  '   all. Two grids that cannot both be right, and nothing in the app said so',
  '   because nothing in the app had ever looked at more than one trait. */',
  'PB.grids=async function(){',
  '  const rows=[], byBlock={};',
  '  const run=await pbEach("grids",(t,im)=>{',
  '    const b=measuredBlock(im.data,im.width,im.height);',
  '    const plan=b>1?blockPlan(im.data,im.width,im.height,b):null;',
  '    rows.push({layer:t.layer||"", name:t.name, w:im.width, h:im.height,',
  '      block:b, share:plan?+(plan.share.toFixed(4)):1,',
  '      /* DOES IT EVEN FIT THE CANVAS. measuredBlock estimates a period from',
  '         the transitions and rounds it, so it can answer 11 on a 1280 canvas -',
  '         and 11 divides 1280 no times at all. Real, on this collection: Basic',
  '         Blue Eyes came back as 11px. A census that prints that without saying',
  '         so is inviting somebody to tidy a trait onto a grid that cannot',
  '         exist. The estimate is left alone, because the brush depends on it',
  '         and it is right about the shape; what is added is whether to',
  '         believe the number. */',
  '      divides:b>1&&im.width%b===0&&im.height%b===0,',
  '      offGrid:plan?plan.blocks-plan.flat:0});',
  '    byBlock[b]=(byBlock[b]||0)+1;',
  '  });',
  '  const out={job:"grids", at:Date.now(), traits:rows.length, byBlock:byBlock,',
  '    /* The two the collection work keeps asking about. */',
  '    onTen:rows.filter(r=>r.block%10===0).length,',
  '    onEight:rows.filter(r=>r.block%8===0).length,',
  '    noGrid:rows.filter(r=>r.block<2).length,',
  '    /* Measured at a size that cannot tile the canvas: the estimate is off,',
  '       not the art. */',
  '    oddBlocks:rows.filter(r=>r.block>1&&!r.divides)',
  '      .map(r=>({trait:r.layer+"/"+r.name, block:r.block, canvas:r.w+"x"+r.h})),',
  '    /* Drawn on a grid and not keeping to it: the repairable ones. */',
  '    drifted:rows.filter(r=>r.block>1&&r.share<0.999)',
  '      .sort((a,b)=>a.share-b.share)',
  '      .map(r=>({trait:r.layer+"/"+r.name, block:r.block, share:r.share,',
  '        offGrid:r.offGrid})),',
  '    rows:rows, run:run};',
  '  PB.last=out; agShow(out); return out;',
  '};',
  '/* EVERY COLOUR IN THE COLLECTION, RAREST FIRST.',
  '',
  '   A trait using #2b2b2b where the other 316 use #2a2a2a is invisible one',
  '   trait at a time and a seam once they are composited. The rare tail is',
  '   where drift, mis-picked shades and anti-alias residue collect, so the',
  '   answer is sorted to put them first rather than buried under the blacks.',
  '',
  '   Fully transparent pixels are not a colour and are not counted. */',
  'PB.colours=async function(opts){',
  '  const o=opts||{}, limit=o.limit===undefined?40:o.limit;',
  '  const seen=new Map();',
  '  const run=await pbEach("colours",(t,im)=>{',
  '    const key=traitKey(t), d=im.data, here=new Map();',
  '    for(let i=0;i<d.length;i+=4){',
  '      if(!d[i+3]) continue;',
  '      const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2];',
  '      here.set(k,(here.get(k)||0)+1);',
  '    }',
  '    for(const [k,n] of here){',
  '      let rec=seen.get(k);',
  '      if(!rec){ rec={n:0, traits:[]}; seen.set(k,rec); }',
  '      rec.n+=n;',
  '      /* The names, not a count of them: "which trait has this" is the',
  '         question, and a count cannot be clicked. Capped so one colour used',
  '         everywhere does not carry 317 strings. */',
  '      if(rec.traits.length<8) rec.traits.push(key);',
  '      rec.in=(rec.in||0)+1;',
  '    }',
  '  });',
  '  const hex=k=>"#"+((k>>>0)&0xffffff).toString(16).padStart(6,"0");',
  '  const all=[...seen].map(([k,v])=>({hex:hex(k), pixels:v.n, traits:v.in,',
  '    where:v.traits}));',
  '  all.sort((a,b)=>a.pixels-b.pixels||a.hex.localeCompare(b.hex));',
  '  const out={job:"colours", at:Date.now(), distinct:all.length,',
  '    /* Used by ONE trait: the shape drift takes. */',
  '    inOneTrait:all.filter(c=>c.traits===1).length,',
  '    rarest:all.slice(0,limit),',
  '    commonest:all.slice(-10).reverse(),',
  '    run:run};',
  '  PB.last=out; agShow(out); return out;',
  '};',
  'try{ window.PB=PB; }catch(_){ }',
  'function agSay(m){ const el=$("agstatus"); if(el) el.textContent=m; }',
  '/* Shown as the same data an agent gets. A summary line first, because a',
  '   thousand lines of JSON is not a report anybody reads. */',
  'function agShow(out){',
  '  const box=$("agout"); if(!box) return;',
  '  box.hidden=false;',
  '  box.textContent=JSON.stringify(out,(k,v)=>k==="rows"?undefined:v,1);',
  '  const s=$("agsave"); if(s) s.disabled=false;',
  '  if(out.job==="grids")',
  '    agSay(out.traits+" traits \\u00b7 "+Object.keys(out.byBlock).sort((a,b)=>b-a)',
  '      .map(k=>k+"px x"+out.byBlock[k]).join(", ")+" \\u00b7 "+out.drifted.length',
  '      +" drawn on a grid they do not keep to"',
  '      +(out.oddBlocks.length?" \u00b7 "+out.oddBlocks.length',
  '        +" measured at a size that does not tile the canvas":""));',
  '  else if(out.job==="colours")',
  '    agSay(out.distinct+" colours \\u00b7 "+out.inOneTrait',
  '      +" used by a single trait \\u00b7 rarest "',
  '      +(out.rarest[0]?out.rarest[0].hex+" ("+out.rarest[0].pixels+" px)":"none"));',
  '}',
  'const PAGES=["home","project","settings","agent"];',
]));

/* ---- 4. wired ------------------------------------------------------------ */
swap(block([
  '(function(){',
  '  /* Tabs and jumps alike: both are "go to this page", and binding only the',
]), block([
  '(function(){',
  '  const run=async(fn)=>{',
  '    const stop=$("agstop");',
  '    if(stop) stop.hidden=false;',
  '    try{ await fn(); }',
  '    catch(e){ agSay((e&&e.message)||"That job could not finish."); }',
  '    finally{ if(stop) stop.hidden=true; }',
  '  };',
  '  if($("aggrids")) $("aggrids").onclick=()=>run(()=>PB.grids());',
  '  if($("agcolours")) $("agcolours").onclick=()=>run(()=>PB.colours());',
  '  /* A long job on 317 traits has to be interruptible, or the only way out',
  '     of one started by mistake is closing the tab. */',
  '  if($("agstop")) $("agstop").onclick=()=>{ PB.stop=true; agSay("Stopping..."); };',
  '  if($("agsave")) $("agsave").onclick=()=>{',
  '    if(!PB.last) return;',
  '    const url=URL.createObjectURL(new Blob([JSON.stringify(PB.last,null,2)],',
  '      {type:"application/json"}));',
  '    const a=document.createElement("a");',
  '    a.href=url; a.download="collection-"+PB.last.job+".json"; a.click();',
  '    setTimeout(()=>URL.revokeObjectURL(url),1000);',
  '  };',
  '})();',
  '(function(){',
  '  /* Tabs and jumps alike: both are "go to this page", and binding only the',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function pbEach(job,fn){', 'PB.grids=async function(){',
  'PB.colours=async function(opts){', 'const PAGES=["home","project","settings","agent"];',
  'try{ window.PB=PB; }catch(_){ }'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['aggrids', 'agcolours', 'agstatus', 'agout', 'agsave', 'agstop'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);
/* THE BUTTON, not every mention. The bare attribute also appears in the six
   CSS pairings above, so counting it found four and this check failed on its
   own imprecision rather than on anything wrong with the page. */
if (markup.split('class="pgtab" data-page="agent"').length !== 2)
  throw new Error('the tab is not in the nav exactly once');
if (markup.split('class="extract pg-agent"').length !== 2)
  throw new Error('the agent section is not in the markup exactly once');

/* THE PAGE IS HIDDEN EVERYWHERE ELSE, and every other page is hidden on it.
   A missing pair is a section that turns up somewhere nobody meant it to. */
const css = text.slice(0, text.indexOf('</style>'));
for (const rule of ['#land[data-page="home"] .pg-agent,',
  '#land[data-page="project"] .pg-agent,',
  '#land[data-page="settings"] .pg-agent,',
  '#land[data-page="agent"] .pg-home,',
  '#land[data-page="agent"] .pg-project,',
  '#land[data-page="agent"] .pg-settings{display:none;}'])
  if (css.indexOf(rule) < 0) throw new Error('a page pairing is missing: ' + rule);

/* IT YIELDS. Without this the tab is frozen for the length of the job and
   the progress nobody can see is worse than no progress at all. */
const eStart = code.indexOf('async function pbEach(job,fn){');
const each = code.slice(eStart, code.indexOf(NL + 'PB.grids=', eStart));
if (each.indexOf('await new Promise(r=>setTimeout(r,0));') < 0)
  throw new Error('the walk never yields to the page');
/* AND IT CAN BE STOPPED. */
if (each.indexOf('if(PB.stop) break;') < 0)
  throw new Error('a job started by mistake cannot be interrupted');
/* AND ONE UNREADABLE TRAIT DOES NOT END THE JOB. */
if (each.indexOf('catch(_){ skipped.push(traitKey(t)); }') < 0)
  throw new Error('a trait that will not decode takes the whole run with it');
/* AND ONLY ONE AT A TIME, or two sweeps share a canvas and a progress line. */
/* THE CENSUS SAYS WHICH NUMBERS TO BELIEVE. A measured block that does not
   divide the canvas is an estimator artefact, and printing it bare invites
   somebody to tidy onto a grid that cannot exist. */
if (code.indexOf('divides:b>1&&im.width%b===0&&im.height%b===0,') < 0)
  throw new Error('the census no longer says whether the block fits the canvas');
if (code.indexOf('oddBlocks:rows.filter(r=>r.block>1&&!r.divides)') < 0)
  throw new Error('the ones that do not fit are no longer collected');
if (each.indexOf('if(PB.busy) throw Error("A job is already running");') < 0)
  throw new Error('two jobs can run at once');
/* AND CLAIMED BEFORE THE FIRST AWAIT. The guard existing is not the same as
   the guard closing: with the flag set after the store read, two jobs started
   in one tick both passed it. */
if (each.indexOf('PB.busy=true') > each.indexOf('await dbAll()'))
  throw new Error('the busy flag is claimed after an await, so it can be raced');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
