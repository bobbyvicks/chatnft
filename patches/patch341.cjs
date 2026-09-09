/* THE RULES NOBODY SHOULD HAVE TO REPEAT.

   From the standing instructions in TRAIT-WORKFLOW-START-HERE.txt, which say
   in as many words: "do not hand routine clicks back to you or ask you to
   repeat settled rules", and about the palette, "it is fixed; stop
   reconsidering it".

   So they live in the project, once:

     PALETTE   Mrkt Mkrs 256, the Resurrect expansion. All 256 baked in, so
               the site needs no file to be correct and an agent needs no path.
     GRIDS     8x8 for suitable bodies, 4x4 where 8x8 destroys detail.
     EXEMPT    chains and eyes are not forced onto a grid.
     EXCLUDED  skins and backgrounds are left out of cleanup for now.

   AND THEY REACH THE CONTROLS, which is the difference between a settings
   screen and a rule. Open a trait on a layer the rules speak about and the
   pixel size arrives already set to what was decided, rather than to a
   measurement that is right about the art and silent about the collection.

   The measurement still wins where the rules say nothing. An exempt layer is
   not "use 8" - it is "this one is not on a grid", and the measured value is
   the honest answer there.

   THE HASH IS OF THE COLOURS, NOT OF THE FILE. Two files in the workspace hold
   the same 256 in the same order under different metadata, and the two handoff
   documents cite different hashes for what is provably the same palette.
   Hashing the wrapper made them look like different palettes; hashing the
   ordered colours says plainly that they are not.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';

/* The palette, taken from the authority the standing instructions name, and
   checked here rather than trusted: a truncated paste is a palette that looks
   right and is missing colours nobody notices until a match picks the wrong
   neighbour. */
const AUTHORITY = 'C:/Users/vicke/OneDrive/Documents/ChatGPT/pixel art_/'
  + 'resurrect-expansion-256/mrkt-mkrs-resurrect-256.json';
const authority = JSON.parse(fs.readFileSync(AUTHORITY, 'utf8'));
const hexes = authority.colors.map(c => String(c.hex).replace('#', '').toLowerCase());
if (hexes.length !== 256) throw new Error('the authority holds ' + hexes.length + ' colours');
if (new Set(hexes).size !== 256) throw new Error('the authority repeats a colour');
if (hexes.some(h => !/^[0-9a-f]{6}$/.test(h))) throw new Error('a colour is not a hex triplet');
const packed = hexes.join('');
const coloursSha = crypto.createHash('sha256').update(hexes.map(h => '#' + h.toUpperCase()).join(',')).digest('hex');

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

/* Sixteen colours a line, so the source stays readable. */
const paletteLines = [];
for (let i = 0; i < packed.length; i += 96)
  paletteLines.push('  ' + (i ? '+' : '') + '"' + packed.slice(i, i + 96) + '"');
paletteLines[paletteLines.length - 1] += ';';

/* ---- 1. the rules themselves -------------------------------------------- */
swap(block([
  '/* ================= the agent surface ============================= */',
]), block([
  '/* ================= the collection rules ========================== */',
  '/* Mrkt Mkrs 256, Resurrect expansion, every colour, in order.',
  '',
  '   Baked in rather than fetched: the palette is a settled decision, the site',
  '   works with no network and no file, and an agent needs no path to it. The',
  '   authority it came from is recorded beside it, and the hash is of THESE',
  '   colours in THIS order rather than of the file they were read out of. */',
  'const PALETTE_HEX=',
].concat(paletteLines).concat([
  'const PALETTE_SOURCE={name:' + JSON.stringify(authority.name) + ',',
  '  edition:"Edition 03",',
  '  from:"resurrect-expansion-256/mrkt-mkrs-resurrect-256.json",',
  '  colours:"' + coloursSha + '"};',
  'function paletteList(){',
  '  const out=[];',
  '  for(let i=0;i+6<=PALETTE_HEX.length;i+=6) out.push("#"+PALETTE_HEX.slice(i,i+6));',
  '  return out;',
  '}',
  '/* The standing decisions, as the defaults a project starts from. */',
  'const AGRULES_ID="settings.agentrules";',
  'const AGRULES_DEFAULT={version:1, bodyGrid:8, detailGrid:4,',
  '  gridExempt:["chains","eyes"], cleanupExcluded:["skins","backgrounds"],',
  '  perLayer:{}};',
  'let AGENT_RULES=Object.assign({},AGRULES_DEFAULT);',
  'function applyAgentRules(items){',
  '  const rec=(items||[]).find(i=>i.id===AGRULES_ID);',
  '  AGENT_RULES=Object.assign({},AGRULES_DEFAULT,{perLayer:{}});',
  '  if(!rec) return;',
  '  for(const k of ["bodyGrid","detailGrid"])',
  '    if(Number.isInteger(rec[k])&&rec[k]>=1&&rec[k]<=64) AGENT_RULES[k]=rec[k];',
  '  for(const k of ["gridExempt","cleanupExcluded"])',
  '    if(Array.isArray(rec[k])) AGENT_RULES[k]=rec[k].map(String);',
  '  if(rec.perLayer&&typeof rec.perLayer==="object")',
  '    AGENT_RULES.perLayer=Object.assign({},rec.perLayer);',
  '}',
  '/* WHAT GRID THIS LAYER IS ON, or 0 for "the rules do not say".',
  '',
  '   0 is not a refusal and not a quiet 8. Chains and eyes are exempt on',
  '   purpose, and answering 8 for them would force the grid the decision says',
  '   to leave alone. Where the rules are silent the measurement is the honest',
  '   answer, which is what the caller falls back to. */',
  'function ruleGridFor(layer){',
  '  const l=String(layer||"");',
  '  /* NO CATEGORY IS NOT A CATEGORY. "unsorted" is the shelf saying nobody',
  '     has decided what this is, so the collection cannot have decided',
  '     anything about it either - and the standing rule is about "suitable',
  '     bodies", which is a judgement somebody has to have made.',
  '',
  '     Measured, before this line existed: a trait drawn at 10px blocks and',
  '     left on unsorted opened at the 8px body grid and offered to tidy 9,220',
  '     pixels onto a grid the art is not on. That is the exempt case again in',
  '     different clothes - where the rules are silent, the measurement is the',
  '     honest answer. */',
  '  if(!l||l==="unsorted") return 0;',
  '  if((AGENT_RULES.gridExempt||[]).indexOf(l)>=0) return 0;',
  '  const own=AGENT_RULES.perLayer?AGENT_RULES.perLayer[l]:undefined;',
  '  if(Number.isInteger(own)) return own>=1?own:0;',
  '  return AGENT_RULES.bodyGrid||0;',
  '}',
  'function ruleCleanupAllowed(layer){',
  '  return (AGENT_RULES.cleanupExcluded||[]).indexOf(String(layer||""))<0;',
  '}',
  '/* ================= the agent surface ============================= */',
])));

/* ---- 2. loaded with every other setting --------------------------------- */
swap(block([
  '  applyReview(items);',
]), block([
  '  applyReview(items);',
  '  applyAgentRules(items);',
]));

/* ---- 3. and they reach the controls ------------------------------------- */
swap(block([
  '  try{ buildPixelSizes(gridBlock); pixelSizeReport(); }catch(_){ }',
]), block([
  '  /* THE RULE FIRST, THE MEASUREMENT WHERE THERE IS NONE. A trait on a layer',
  '     the collection has already decided about should arrive set to that',
  '     decision; a measurement that is right about the art and silent about the',
  '     collection is how somebody ends up repeating a settled parameter. */',
  '  let wantBlock=gridBlock;',
  '  try{',
  '    const ruled=ruleGridFor($("tlayer")?$("tlayer").value:"");',
  '    if(ruled) wantBlock=ruled;',
  '  }catch(_){ }',
  '  try{ buildPixelSizes(wantBlock); pixelSizeReport(); }catch(_){ }',
]));

/* ---- 4. on the surface --------------------------------------------------- */
swap(block([
  'PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };',
]), block([
  '/* The settled parameters, readable and settable without a screen. */',
  'PB.rules=function(){ return JSON.parse(JSON.stringify(AGENT_RULES)); };',
  'PB.palette=function(){ return {source:PALETTE_SOURCE, hexes:paletteList()}; };',
  'PB.gridFor=function(layer){ return ruleGridFor(layer); };',
  'PB.cleanupAllowed=function(layer){ return ruleCleanupAllowed(layer); };',
  'PB.setRules=async function(patch){',
  '  const next=Object.assign({},AGENT_RULES,patch||{});',
  '  await dbPut(Object.assign({id:AGRULES_ID, kind:"settings", at:Date.now()},next));',
  '  applyAgentRules(await dbAll());',
  '  try{ agRules(); }catch(_){ }',
  '  return PB.rules();',
  '};',
  'PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };',
]));

/* ---- 5. and shown ------------------------------------------------------- */
swap(block([
  '    <p class="note mono" id="agstatus">Nothing run yet.</p>',
]), block([
  '    <div class="rule"></div>',
  '    <h2>Collection rules</h2>',
  '    <p class="note">Settled once, read by every job. The palette is fixed.</p>',
  '    <p class="note mono" id="agrules">-</p>',
  '    <div id="agswatches" aria-label="The fixed palette"></div>',
  '    <div class="rule"></div>',
  '    <p class="note mono" id="agstatus">Nothing run yet.</p>',
]));

swap(block([
  'function agSay(m){ const el=$("agstatus"); if(el) el.textContent=m; }',
]), block([
  'function agSay(m){ const el=$("agstatus"); if(el) el.textContent=m; }',
  '/* The rules, and the palette as colours rather than as a number. 256 hexes',
  '   in a list is a fact nobody checks; 256 swatches is one you can look at. */',
  'function agRules(){',
  '  const el=$("agrules"); if(!el) return;',
  '  const p=paletteList();',
  '  el.textContent=PALETTE_SOURCE.name+" ("+p.length+" colours)"',
  '    +"  \\u00b7  bodies "+AGENT_RULES.bodyGrid+"px, detail "+AGENT_RULES.detailGrid+"px"',
  '    +"  \\u00b7  not forced onto a grid: "+((AGENT_RULES.gridExempt||[]).join(", ")||"none")',
  '    +"  \\u00b7  left out of cleanup: "+((AGENT_RULES.cleanupExcluded||[]).join(", ")||"none");',
  '  const box=$("agswatches"); if(!box) return;',
  '  if(box.childElementCount===p.length) return;',
  '  box.replaceChildren();',
  '  for(const hex of p){',
  '    const s=document.createElement("span");',
  '    s.className="agsw"; s.style.background=hex; s.title=hex;',
  '    box.appendChild(s);',
  '  }',
  '}',
]));

/* ---- 6. the swatches need a shape --------------------------------------- */
swap(block([
  '.agjob code{font-size:12px; color:var(--muted);}',
]), block([
  '.agjob code{font-size:12px; color:var(--muted);}',
  '#agswatches{display:flex; flex-wrap:wrap; gap:2px; margin:6px 0;}',
  '.agsw{width:14px; height:14px; border-radius:2px; border:1px solid var(--line);}',
]));

/* ---- 7. drawn when the page is built ------------------------------------ */
swap(block([
  '  if($("aggrids")) $("aggrids").onclick=()=>run(()=>PB.grids());',
]), block([
  '  try{ agRules(); }catch(_){ }',
  '  if($("aggrids")) $("aggrids").onclick=()=>run(()=>PB.grids());',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function ruleGridFor(layer){', 'function ruleCleanupAllowed(layer){',
  'PB.rules=function(){', 'PB.palette=function(){', 'const PALETTE_HEX=',
  'applyAgentRules(items);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE PALETTE IS ALL OF IT, AND EXACTLY IT. */
const hexAt = code.indexOf('const PALETTE_HEX=');
const hexEnd = code.indexOf(NL + 'const PALETTE_SOURCE=', hexAt);
if (hexAt < 0 || hexEnd < 0) throw new Error('could not bound the palette');
const landed = (code.slice(hexAt, hexEnd).match(/[0-9a-f]{96}/g) || []).join('');
if (landed.length !== 1536)
  throw new Error('the palette landed as ' + (landed.length / 6) + ' colours, not 256');
if (landed !== packed) throw new Error('the palette that landed is not the one read');
if (new Set(landed.match(/.{6}/g)).size !== 256)
  throw new Error('the palette has repeats in it');

/* AN EXEMPT LAYER IS NOT QUIETLY GIVEN THE BODY GRID. The whole point of the
   exemption is that chains and eyes are not forced onto one. */
const gStart = code.indexOf('function ruleGridFor(layer){');
const gEnd = code.indexOf(NL + 'function ruleCleanupAllowed(layer){', gStart);
if (gStart < 0 || gEnd < 0) throw new Error('could not bound ruleGridFor');
const grid = code.slice(gStart, gEnd);
if (grid.indexOf('.gridExempt||[]).indexOf(l)>=0) return 0;') < 0)
  throw new Error('an exempt layer is no longer exempt');
/* AND AN UNCATEGORISED TRAIT IS NOT QUIETLY GIVEN ONE. */
if (grid.indexOf('if(!l||l==="unsorted") return 0;') < 0)
  throw new Error('an unsorted trait is being given the body grid');

/* AND A RULE OF 0 DOES NOT BECOME THE MEASUREMENT'S PROBLEM SILENTLY: the
   caller falls back only when the rules say nothing. */
if (code.indexOf('if(ruled) wantBlock=ruled;') < 0)
  throw new Error('the rule no longer reaches the pixel size control');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes'
  + ' (palette ' + (packed.length / 6) + ' colours, ' + coloursSha.slice(0, 12) + ')');
