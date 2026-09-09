/* DOES THIS TRAIT MEET THE SPEC.

   From the Creator Kit's own prompt and category briefs, which are the rules a
   trait is made to and which nothing in this site could check:

     "Choose at most 16 palette colours (8 for clothing), including black
      #000000 outlines."
     "The palette controls all NEW artwork colours, even if the example uses
      older colours."
     "No blur, antialiasing, gradients, glow, texture noise or stray pixels."

   Every one of those is a number this site can produce in a few milliseconds,
   and until now the only way to know was to look hard at the artwork and hope.

   THE CHECK IS A MEASUREMENT, NOT A VERDICT. It says how many colours, how
   many are outside the fixed palette and which, and how many pixels carry
   partial alpha. It does not refuse to save, and it does not tidy anything:
   a trait over budget may be exactly right and the budget may be what is
   wrong, and that is the owner's call, not a tool's.

   OFF-PALETTE IS NAMED, NOT COUNTED. "Nine colours are off palette" sends
   somebody hunting; "#2b0000, 412 pixels, nearest #2E222F" is a repair. The
   nearest is by squared distance in RGB, which is not perceptual and does not
   claim to be - it is a starting point for a person, offered as a suggestion
   with the distance shown so an obviously bad one is obvious.

   THE BUDGET IS PER CATEGORY because the brief is: clothing gets 8, everything
   else 16. Stored with the other collection rules, so it is settled once.
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

/* ---- 1. the budget joins the other settled rules ------------------------ */
swap(block([
  "const AGRULES_DEFAULT={version:1, bodyGrid:8, detailGrid:4,",
  '  gridExempt:["chains","eyes"], cleanupExcluded:["skins","backgrounds"],',
  '  perLayer:{}};',
]), block([
  '/* The Creator Kit brief: "at most 16 palette colours (8 for clothing),',
  '   including black #000000 outlines". */',
  "const AGRULES_DEFAULT={version:1, bodyGrid:8, detailGrid:4,",
  '  gridExempt:["chains","eyes"], cleanupExcluded:["skins","backgrounds"],',
  '  colourBudget:16, colourBudgetBy:{clothing:8},',
  '  perLayer:{}};',
]));

swap(block([
  '  for(const k of ["bodyGrid","detailGrid"])',
  '    if(Number.isInteger(rec[k])&&rec[k]>=1&&rec[k]<=64) AGENT_RULES[k]=rec[k];',
]), block([
  '  for(const k of ["bodyGrid","detailGrid","colourBudget"])',
  '    if(Number.isInteger(rec[k])&&rec[k]>=1&&rec[k]<=256) AGENT_RULES[k]=rec[k];',
  '  if(rec.colourBudgetBy&&typeof rec.colourBudgetBy==="object")',
  '    AGENT_RULES.colourBudgetBy=Object.assign({},rec.colourBudgetBy);',
]));

/* ---- 2. the check ------------------------------------------------------- */
swap(block([
  'function ruleCleanupAllowed(layer){',
]), block([
  '/* How many colours this category is allowed. */',
  'function ruleColourBudget(layer){',
  '  const by=AGENT_RULES.colourBudgetBy||{};',
  '  const own=by[String(layer||"")];',
  '  return Number.isInteger(own)&&own>=1 ? own : (AGENT_RULES.colourBudget||0);',
  '}',
  '/* THE SPEC, MEASURED. Colours used, colours outside the fixed palette, and',
  '   partial alpha - the three things the Creator Kit brief is explicit about',
  '   and the site could never answer.',
  '',
  '   Fully transparent pixels are not a colour. Alpha is not part of the',
  '   colour identity here, unlike the pixel inspection: the brief counts',
  '   COLOURS, and the same red at two opacities is one colour used wrongly,',
  '   which the partial-alpha number says on its own. */',
  'function specCheck(data,W,H,layer){',
  '  const used=new Map();',
  '  let partial=0, opaque=0;',
  '  for(let i=0;i<data.length;i+=4){',
  '    const a=data[i+3];',
  '    if(!a) continue;',
  '    if(a<255) partial++;',
  '    opaque++;',
  '    const k=(data[i]<<16)|(data[i+1]<<8)|data[i+2];',
  '    used.set(k,(used.get(k)||0)+1);',
  '  }',
  '  const hex=k=>"#"+((k>>>0)&0xffffff).toString(16).padStart(6,"0");',
  '  const allowed=new Set(paletteList().map(h=>h.toLowerCase()));',
  '  const off=[];',
  '  for(const [k,n] of used){',
  '    const h=hex(k);',
  '    if(allowed.has(h)) continue;',
  '    /* NAMED WITH A WAY OUT. A count sends somebody hunting; a nearest',
  '       colour and its distance is the start of a repair. Squared RGB, which',
  '       is not perceptual and does not pretend to be - the distance is shown',
  '       so an obviously wrong suggestion looks wrong. */',
  '    const r=(k>>16)&255, g=(k>>8)&255, b=k&255;',
  '    let best=null, bestD=Infinity;',
  '    for(const p of paletteList()){',
  '      const pr=parseInt(p.slice(1,3),16), pg=parseInt(p.slice(3,5),16), pb=parseInt(p.slice(5,7),16);',
  '      const d=(r-pr)*(r-pr)+(g-pg)*(g-pg)+(b-pb)*(b-pb);',
  '      if(d<bestD){ bestD=d; best=p; }',
  '    }',
  '    off.push({hex:h, pixels:n, nearest:best, distance:Math.round(Math.sqrt(bestD))});',
  '  }',
  '  off.sort((a,b)=>b.pixels-a.pixels);',
  '  const budget=ruleColourBudget(layer);',
  '  return {layer:String(layer||""), colours:used.size, budget:budget,',
  '    overBudget:budget?Math.max(0,used.size-budget):0,',
  '    offPalette:off, offPaletteColours:off.length,',
  '    offPalettePixels:off.reduce((a,c)=>a+c.pixels,0),',
  '    partialAlpha:partial, opaque:opaque};',
  '}',
  'function ruleCleanupAllowed(layer){',
]));

/* ---- 3. in the panel ---------------------------------------------------- */
swap(block([
  '        <button class="btn ghost" id="agbefore"',
]), block([
  '        <button class="btn ghost" id="agspec">Check against the spec</button>',
  '        <p class="note mono" id="agspecout"></p>',
  '        <button class="btn ghost" id="agbefore"',
]));

swap(block([
  'function agentBefore(on){',
]), block([
  '/* Run on the open trait, and said in the order somebody acts on: how many',
  '   colours against the budget, then what is off palette, then alpha. */',
  'function agentSpec(){',
  '  const el=$("agspecout"); if(!el) return null;',
  '  if(!art||!art.width||!ctx){ el.textContent="Open a trait first."; return null; }',
  '  const layer=$("tlayer")?$("tlayer").value:"";',
  '  const im=ctx.getImageData(0,0,art.width,art.height);',
  '  const r=specCheck(im.data,art.width,art.height,layer);',
  '  const bits=[r.colours+" colours"+(r.budget?" of "+r.budget+" allowed":"")];',
  '  if(r.overBudget) bits.push(r.overBudget+" over");',
  '  bits.push(r.offPaletteColours',
  '    ? r.offPaletteColours+" off palette ("+r.offPalettePixels+" px)"',
  '    : "all on palette");',
  '  bits.push(r.partialAlpha ? r.partialAlpha+" partial-alpha pixels"',
  '    : "no partial alpha");',
  '  /* The worst offender by pixels, with somewhere to go. A list of nine hex',
  '     codes in a status line is not read; one with a repair beside it is. */',
  '  if(r.offPalette.length){',
  '    const w=r.offPalette[0];',
  '    bits.push("worst "+w.hex+" \\u2192 "+w.nearest+" (distance "+w.distance+")");',
  '  }',
  '  el.textContent=bits.join("  \\u00b7  ");',
  '  agentStep("Checked against the spec",',
  '    r.colours+" colours, "+r.offPaletteColours+" off palette");',
  '  return r;',
  '}',
  'function agentBefore(on){',
]));

/* ---- 4. wired, and on the surface --------------------------------------- */
swap(block([
  'const bfr=$("agbefore");',
]), block([
  'if($("agspec")) $("agspec").onclick=()=>agentSpec();',
  'const bfr=$("agbefore");',
]));

swap(block([
  'PB.gridFor=function(layer){ return ruleGridFor(layer); };',
]), block([
  'PB.gridFor=function(layer){ return ruleGridFor(layer); };',
  'PB.budgetFor=function(layer){ return ruleColourBudget(layer); };',
  '/* The spec check on whatever is open, as data. */',
  'PB.spec=function(){ return agentSpec(); };',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function specCheck(data,W,H,layer){', 'function ruleColourBudget(layer){',
  'function agentSpec(){', 'PB.spec=function(){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE BRIEF'S OWN NUMBERS. 16, and 8 for clothing - changing them is a
   decision, not a tidy-up. */
if (code.indexOf('colourBudget:16, colourBudgetBy:{clothing:8},') < 0)
  throw new Error('the budget is no longer the one the Creator Kit brief states');

/* OFF PALETTE IS NAMED AND GIVEN SOMEWHERE TO GO. A bare count is a search. */
const sStart = code.indexOf('function specCheck(data,W,H,layer){');
const sEnd = code.indexOf(NL + 'function ruleCleanupAllowed(layer){', sStart);
if (sStart < 0 || sEnd < 0) throw new Error('could not bound specCheck');
const spec = code.slice(sStart, sEnd);
for (const part of ['nearest:best', 'distance:Math.round(Math.sqrt(bestD))', 'hex:h, pixels:n'])
  if (spec.indexOf(part) < 0) throw new Error('off-palette lost part of its answer: ' + part);

/* IT MEASURES AND DOES NOT ACT. A check that quietly repaired would make the
   number it reports unverifiable against the artwork it came from. */
for (const bad of ['putImageData', 'tidyBlocks(', 'qaRepair('])
  if (spec.indexOf(bad) >= 0) throw new Error('the check is changing the artwork: ' + bad);

/* AND FULLY TRANSPARENT PIXELS ARE NOT A COLOUR. */
if (spec.indexOf('if(!a) continue;') < 0)
  throw new Error('transparent pixels are being counted as a colour');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
