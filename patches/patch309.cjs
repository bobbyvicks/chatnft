/* THE LAST TEN THINGS YOU EDITED, ON THE MAIN PAGE.

   The main page is the extractor, and once a collection exists that is not
   what anybody opens the app for. It ended with three cards explaining what
   the app does to a person who has clearly worked it out. This is the space
   they were using.

   FROM THE LOCAL RECORD, not the server. Every trait carries `at`, written by
   every save, and reading it costs one store scan that renderShelf has already
   done - so this is instant, works on your own page, works offline, and works
   before anything has ever been pushed. The updates panel in project settings
   answers a different question - what the GROUP changed, by whom - and needs
   the network to do it.

   agoWords already exists for that panel and is reused, generalised to take a
   number as well as an ISO string. It refuses anything it cannot read either
   way, which is the behaviour its own test pins.

   View more goes to the project rather than expanding in place: ten is a
   glance, and the shelf is where you actually work. */
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

/* ---- 1. the section ---------------------------------------------------- */
swap(block([
  '  <p class="err" id="err" role="status"></p>',
]), block([
  '  <p class="err" id="err" role="status"></p>',
  '',
  '  <!-- What you were last working on, in the space the three explainer cards',
  '       used to hold. Ordered by the record\'s own `at`, which every save',
  '       writes, so it needs nothing from the network. -->',
  '  <section class="proj recent pg-home" id="recent" hidden>',
  '    <div class="projhead">',
  '      <h2>Last edited</h2>',
  '      <span class="count" id="recentcount"></span>',
  '      <div class="acts">',
  '        <button class="mini" id="recentmore">View more</button>',
  '      </div>',
  '    </div>',
  '    <div id="recentbody"></div>',
  '  </section>',
]));

swap(block([
  '.urow{display:flex; gap:8px; align-items:baseline; padding:4px 0;',
]), block([
  '/* One row per trait, the picture first because that is what you recognise.',
  '   The canvas is sized to the artwork and scaled down by CSS with',
  '   image-rendering:pixelated, the same way the shelf tiles do it - a 1280px',
  '   trait drawn into a 34px box any other way is a smear. */',
  '.rrow{display:flex; gap:10px; align-items:center; padding:5px 0;',
  '  border-bottom:1px solid var(--line);}',
  '.rrow:last-child{border-bottom:none;}',
  '.rrow canvas{width:34px; height:34px; flex:none; border-radius:6px;',
  '  background:var(--panel); image-rendering:pixelated; object-fit:contain;}',
  '.rrow .rname{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;',
  '  white-space:nowrap; font-size:13px;}',
  '.rrow .rlayer{color:var(--dim); font-size:11.5px;}',
  '.rrow .rwhen{color:var(--dim); font-size:11.5px; white-space:nowrap;}',
  '.urow{display:flex; gap:8px; align-items:baseline; padding:4px 0;',
]));

/* ---- 2. agoWords takes a number too ------------------------------------ */
swap(block([
  'function agoWords(iso){',
  '  const t=Date.parse(iso||"");',
]), block([
  'function agoWords(when){',
  '  /* A number or an ISO string. The updates panel reads updated_at off the',
  '     server as a string; the Last edited list reads `at` off the local record',
  '     as milliseconds. Anything it cannot read is still refused rather than',
  '     shown as 1970. */',
  '  const t = typeof when==="number" ? when : Date.parse(when||"");',
]));

/* ---- 3. the list ------------------------------------------------------- */
swap(block([
  '/* Who the people in this group are, by the only name they have chosen.',
]), block([
  '/* THE LAST TEN THINGS EDITED, on the main page.',
  '',
  '   Given the records renderShelf has already read, so it costs no extra',
  '   store scan. `at` is written by every save; a record with none sorts last',
  '   rather than being dropped, because a trait with no timestamp is still a',
  '   trait and hiding it would make the list quietly wrong.',
  '',
  '   Refs are left out on purpose: a base character is not an edit, and two of',
  '   them at the top would push half the list off. */',
  'const RECENT_ROWS=10;',
  'function renderRecent(items){',
  '  const sec=$("recent"); if(!sec) return;',
  '  const traits=(items||[]).filter(i=>i&&i.kind==="trait");',
  '  sec.hidden=!traits.length;',
  '  if(!traits.length) return;',
  '  const by=(a,b)=>(typeof b.at==="number"?b.at:-Infinity)',
  '                 -(typeof a.at==="number"?a.at:-Infinity);',
  '  const top=traits.slice().sort(by).slice(0,RECENT_ROWS);',
  '  const body=$("recentbody"), count=$("recentcount");',
  '  /* Said as a fraction, because "10" alone reads as the whole collection. */',
  '  count.textContent = traits.length>top.length',
  '    ? top.length+" of "+traits.length : String(traits.length);',
  '  body.innerHTML="";',
  '  for(const t of top){',
  '    const row=document.createElement("div"); row.className="rrow";',
  '    const cv=document.createElement("canvas");',
  '    cv.width=Math.max(1,t.w||1); cv.height=Math.max(1,t.h||1);',
  '    /* Same as the shelf tiles: decode, draw at natural size, let CSS do the',
  '       shrinking with pixelated. A failed decode leaves an empty box rather',
  '       than throwing the whole list away. */',
  '    if(t.blob) createImageBitmap(t.blob).then(bm=>{',
  '      const g=cv.getContext("2d"); g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '    }).catch(()=>{});',
  '    row.appendChild(cv);',
  '    const nm=document.createElement("span"); nm.className="rname";',
  '    nm.textContent=t.name||"a trait"; nm.title=nm.textContent;',
  '    row.appendChild(nm);',
  '    const ly=document.createElement("span"); ly.className="rlayer";',
  '    ly.textContent=t.layer||"unsorted";',
  '    row.appendChild(ly);',
  '    const wh=document.createElement("span"); wh.className="rwhen";',
  '    wh.textContent=agoWords(t.at);',
  '    row.appendChild(wh);',
  '    /* The whole row opens it, which is what a list of things you were just',
  '       working on is for. */',
  '    row.tabIndex=0; row.style.cursor="pointer";',
  '    const open=()=>{ try{ startEditor(t); }catch(_){} };',
  '    row.onclick=open;',
  '    row.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } };',
  '    body.appendChild(row);',
  '  }',
  '}',
  '',
  '/* Who the people in this group are, by the only name they have chosen.',
]));

/* ---- 4. drawn with the shelf ------------------------------------------- */
swap(block([
  "  $('proj').hidden=!items.length;",
]), block([
  "  $('proj').hidden=!items.length;",
  '  /* Before the empty-project return below, so an emptied project takes the',
  '     list down with it rather than leaving the last ten of a collection that',
  '     is no longer there. */',
  '  renderRecent(items);',
]));

swap(block([
  "  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;",
  "    $('layers').hidden=true; $('rules').hidden=true; return; }",
]), block([
  "  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;",
  "    $('layers').hidden=true; $('rules').hidden=true; $('recent').hidden=true; return; }",
]));

swap("  const again=$(\"updrefresh\");", block([
  '  const more=$("recentmore");',
  '  if(more) more.onclick=()=>showPage("project",true);',
  '  const again=$("updrefresh");',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function renderRecent(items){', 'const RECENT_ROWS=10;',
  '  renderRecent(items);', '  if(more) more.onclick=()=>showPage("project",true);',
  '  const t = typeof when==="number" ? when : Date.parse(when||"");'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['recent', 'recentcount', 'recentmore', 'recentbody'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* IT IS A MAIN-PAGE SECTION. Without pg-home the page rules never hide it and
   it appears on all three. */
if (markup.indexOf('class="proj recent pg-home" id="recent"') < 0)
  throw new Error('the section is not marked as belonging to the main page');

/* TEN, and the number is stated once. A slice(0,10) written inline is a
   second place for the heading and the list to disagree. */
const rStart = code.indexOf('function renderRecent(items){');
/* Bounded on the next top-level DECLARATION, which here is a let rather than a
   function - '\r\nfunction ' ran 4,778 characters past the end and swept in the
   whole team-names block, which would have made every check below it a check
   on the wrong code. */
const rEnd = code.indexOf('\r\nlet memberNames', rStart);
if (rStart < 0 || rEnd < 0) throw new Error('could not bound renderRecent');
const fn = code.slice(rStart, rEnd);
if (fn.length > 2400) throw new Error('the slice is too big to be one function: ' + fn.length);
if (fn.indexOf('slice(0,RECENT_ROWS)') < 0)
  throw new Error('the row count is written out rather than named');
if (/slice\(0,\s*10\)/.test(fn))
  throw new Error('a literal ten sits beside the named one');

/* A REF IS NOT AN EDIT. Base characters would otherwise sit at the top of a
   list of the last things worked on. */
if (fn.indexOf('i.kind==="trait"') < 0)
  throw new Error('the list is not restricted to traits');

/* It must be able to hide itself. An empty project showing an empty panel is
   the shape every other section here avoids. */
if (fn.indexOf('sec.hidden=!traits.length;') < 0)
  throw new Error('an empty project would show an empty list');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
