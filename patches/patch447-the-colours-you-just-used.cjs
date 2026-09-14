/* THE COLOURS YOU JUST USED, UNDER THE ONES IN THE PICTURE.

   "but allso underneith colours now i want to to show your most recently
   used colours"

   There was no colour history anywhere. The two things in the file called
   "recent" are the trait shelf's and the Fix pixels file rail's, and both are
   about images.

   ONE HOOK, because there is one writer. The drawing colour is a module-level
   hex string and setColor is the only place it is written - the picker, every
   swatch in both views, the eyedropper and PB all go through it - so the list
   is filled there and cannot miss a path.

   WHAT "USED" MEANS, and it is the whole difficulty. <input type=color>
   fires input CONTINUOUSLY while the OS picker is dragged, so recording every
   call fills the strip with the colours you swept PAST on the way to the one
   you wanted - the list would be mostly noise, and the noise would push out
   the real entries. So the live drag says so, and the picker's change event -
   which fires once, when the picker is done - is what records. Every other
   caller is a deliberate pick already and records as it always would.

   The most recent is first and a colour already in the list MOVES rather than
   repeating, or picking between two colours fills the strip with two colours.

   SIXTEEN, which is one row of the project palette's grid. It is a shortcut
   back to something you were just using, not a second palette; a list long
   enough to hunt through is the thing it exists to avoid.

   THIS BROWSER, THIS SESSION. Not written to the project: what colours one
   person reached for this afternoon is not a fact about the collection, which
   is the same line the layer hidden-set follows. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. where it goes on the page ---------------------------------- */
{
  const at = kit.only(L, l => l === '      <div class="swatches" id="pal"></div>',
    'the trait colours grid');
  kit.replace(L, { start: at, end: at }, [
    '      <div class="swatches" id="pal"></div>',
    '      <!-- UNDER the colours in the picture, which is where it was asked',
    '           for and also where it belongs: these are colours you have used,',
    '           and the ones above are the colours that are actually in the',
    '           artwork. Hidden until there is something in it rather than',
    '           showing an empty row on a trait nobody has painted yet. -->',
    '      <p class="note" id="palrecentlab" hidden style="margin-top:8px">Just used</p>',
    '      <div class="swrow" id="palrecent" hidden role="group"',
    '        aria-label="Colours you have just used"></div>',
  ]);
}

/* ---- 1b. its own class, deliberately not .swatches ------------------ */
{
  const at = kit.only(L, l => l === '.swatches{display:grid; grid-template-columns:repeat(8,1fr); gap:4px;}',
    'the swatch grid rule');
  kit.replace(L, { start: at, end: at }, [
    '.swatches{display:grid; grid-template-columns:repeat(8,1fr); gap:4px;}',
    '/* THE SAME SHAPE, A DIFFERENT SET. .swatches does not mean "a grid of',
    '   colours" in this file - it means A VIEW OF THE COLOURS IN THE PICTURE,',
    '   and recolour.spec.js asserts that every element carrying it holds the',
    '   same colours with the same replace marks. Colours you have just used',
    '   are a different set by definition: one of them may not be in the',
    '   artwork at all. So it borrows the layout and not the name. */',
    '.swrow{display:grid; grid-template-columns:repeat(8,1fr); gap:4px;}',
  ]);
  /* And the phone width, where .swatches widens to ten across. */
  const ph = kit.only(L, l => l === '  .swatches{grid-template-columns:repeat(10,1fr);} .sw{min-height:30px;}',
    'the phone swatch rule');
  kit.replace(L, { start: ph, end: ph }, [
    '  .swatches,.swrow{grid-template-columns:repeat(10,1fr);} .sw{min-height:30px;}',
  ]);
}

/* ---- 2. the list, and the one place it is filled -------------------- */
{
  const at = kit.only(L, l => l === 'function setColor(h){', 'the one writer of the colour');
  kit.replace(L, { start: at, end: at }, [
    '/* THE COLOURS YOU JUST USED. Newest first, no repeats.',
    '',
    '   Sixteen is one row of the project palette grid. This is a shortcut back',
    '   to a colour you were just using, not a second palette - a list long',
    '   enough to search is the thing it exists to save you from.',
    '',
    '   In this browser and this session only. What somebody reached for this',
    '   afternoon is not a fact about the collection, which is the same reason',
    '   the hidden layer sets are not sent to the group. */',
    'const RECENT_COLOURS_MAX=16;',
    'let recentColours=[];',
    'function recentColourAdd(h){',
    '  const s=String(h||"").toLowerCase();',
    '  if(!/^#[0-9a-f]{6}$/.test(s)) return;',
    '  /* MOVED, not repeated. Going back and forth between two colours would',
    '     otherwise fill the whole strip with those two. */',
    '  const i=recentColours.indexOf(s);',
    '  if(i>=0) recentColours.splice(i,1);',
    '  recentColours.unshift(s);',
    '  if(recentColours.length>RECENT_COLOURS_MAX) recentColours.length=RECENT_COLOURS_MAX;',
    '  buildRecentColours();',
    '}',
    '/* The same swatch the palette uses, through the same helper, so a recent',
    '   colour looks and behaves like a colour - one difference, deliberate:',
    '   clicking one paints with it and does NOT mark it for replacing. The',
    '   marks are about colours that are IN the picture, and a colour you used',
    '   an hour ago may not be in it at all. */',
    'function buildRecentColours(){',
    '  const wrap=$("palrecent"), lab=$("palrecentlab");',
    '  if(!wrap) return;',
    '  const any=recentColours.length>0;',
    '  wrap.hidden=!any; if(lab) lab.hidden=!any;',
    '  wrap.innerHTML="";',
    '  for(const h of recentColours){',
    '    const b=document.createElement("button");',
    '    b.className="sw"; b.dataset.hex=h; b.style.background=h;',
    '    b.title=h+" \\u00b7 just used";',
    '    b.setAttribute("aria-pressed",String(h===String(color||"").toLowerCase()));',
    '    b.setAttribute("aria-label","Recently used colour "+h);',
    '    b.onclick=()=>setColor(h);',
    '    wrap.appendChild(b);',
    '  }',
    '}',
    '/* used=false is a colour being PREVIEWED, not chosen. The OS colour picker',
    '   fires input on every movement inside it, and recording those puts every',
    '   colour swept past into the list - see the picker handlers below, where',
    '   input previews and change is what commits. */',
    'function setColor(h,used){',
    '  if(used!==false) recentColourAdd(h);',
  ]);
  /* The original line opened the function; the replacement re-opens it with
     the new parameter, so the old opener must be gone. */
  const dupe = kit.only(L, l => l === 'function setColor(h,used){', 'the new setColor');
  if (dupe < 0) throw new Error('setColor did not survive the rewrite');
}

/* ---- 3. the picker previews, and commits once ----------------------- */
{
  const at = kit.only(L, l => l === "$('picker').oninput=e=>{ setColor(e.target.value); selectTool('pencil'); };",
    'the colour picker');
  kit.replace(L, { start: at, end: at }, [
    '/* TWO EVENTS, ON PURPOSE. input fires the whole time the OS picker is',
    '   being dragged - that is what makes the canvas follow it live, and it is',
    '   also why those colours must not be recorded: they are the ones swept',
    '   past, not the one chosen. change fires once, when the picker is done,',
    '   and that is the colour that was actually picked. */',
    "$('picker').oninput=e=>{ setColor(e.target.value,false); selectTool('pencil'); };",
    "$('picker').onchange=e=>{ setColor(e.target.value); };",
  ]);
}

/* ---- 4. and it is rebuilt with the rest of the panel ---------------- */
{
  const fn = kit.inFunction(L, 'function buildPalette(list){');
  const at = kit.only(L, l => l === '  buildProjectPalette();', 'the project palette build', fn);
  kit.replace(L, { start: at, end: at }, [
    '  buildProjectPalette();',
    '  /* AND THE ONES JUST USED. Here for the same reason the project palette',
    '     is here: one place fills the colour panel, so there is no way to',
    '     rebuild half of it. */',
    '  buildRecentColours();',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  /* THE LIST EXISTS AND IS FILLED WHERE THE COLOUR IS WRITTEN. */
  for (const nm of ['recentColourAdd', 'buildRecentColours', 'setColor'])
    if (code.indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);
  const sc = kit.inFunction(codeLines, 'function setColor(h,used){');
  const scb = codeLines.slice(sc.start, sc.end + 1).join('\n');
  if (!/if\(used!==false\) recentColourAdd\(h\);/.test(scb))
    throw new Error('the one writer of the colour does not fill the list');
  /* ONE setColor, not a second one left beside it. */
  if ((code.match(/function setColor\(/g) || []).length !== 1)
    throw new Error('there are two setColor functions');

  /* THE LIVE PICKER DOES NOT RECORD, which is the whole difficulty: input
     fires continuously and would fill the strip with colours swept past. */
  if (code.indexOf("$('picker').oninput=e=>{ setColor(e.target.value,false); selectTool('pencil'); };") < 0)
    throw new Error('the live picker drag still records every colour it passes');
  if (code.indexOf("$('picker').onchange=e=>{ setColor(e.target.value); };") < 0)
    throw new Error('nothing records the colour the picker actually settled on');

  /* NEWEST FIRST, NO REPEATS, AND BOUNDED. */
  const ra = kit.inFunction(codeLines, 'function recentColourAdd(h){');
  const rab = codeLines.slice(ra.start, ra.end + 1).join('\n');
  if (!/recentColours\.unshift\(s\);/.test(rab))
    throw new Error('the newest colour is not first');
  if (!/const i=recentColours\.indexOf\(s\);/.test(rab) || !/splice\(i,1\)/.test(rab))
    throw new Error('a colour used twice would appear twice');
  if (!/recentColours\.length=RECENT_COLOURS_MAX;/.test(rab))
    throw new Error('the list is unbounded');
  /* AND ONLY REAL COLOURS. setColor is reached by the picker, which can hand
     over anything the platform will put in the field. */
  if (!/\^#\[0-9a-f\]\{6\}\$/.test(rab))
    throw new Error('anything at all could get into the list');

  /* IT IS UNDER THE COLOURS IN THE PICTURE, which is where it was asked for. */
  const pal = text.indexOf('<div class="swatches" id="pal"></div>');
  const rec = text.indexOf('id="palrecent"');
  const proj = text.indexOf('<div id="projpal"');
  if (pal < 0 || rec < 0 || proj < 0)
    throw new Error('one of the three colour grids is missing');
  if (!(pal < rec && rec < proj))
    throw new Error('the recent colours are not between the picture and the palette');
  /* AND IT IS NOT A VIEW OF THE PICTURE'S COLOURS. .swatches carries that
     meaning and recolour.spec.js holds every element with it to the same set
     and the same marks; a colour used an hour ago need not be in the artwork,
     so this grid borrows the layout under its own name. */
  if (/id="palrecent"[^>]*class="swatches"/.test(text)
    || /class="swatches"[^>]*id="palrecent"/.test(text))
    throw new Error('the just-used strip claims to be a view of the picture colours');
  if (!/\.swrow\{display:grid; grid-template-columns:repeat\(8,1fr\); gap:4px;\}/.test(text))
    throw new Error('the just-used strip has no layout of its own');
  /* HIDDEN WHEN EMPTY, or a trait nobody has painted shows a bare label. */
  if (!/id="palrecentlab" hidden/.test(text) || !/id="palrecent" hidden/.test(text))
    throw new Error('an empty strip would show anyway');

  /* AND IT IS REBUILT WITH THE REST OF THE PANEL. */
  const bp = kit.inFunction(codeLines, 'function buildPalette(list){');
  const bpb = codeLines.slice(bp.start, bp.end + 1).join('\n');
  if (!/buildRecentColours\(\);/.test(bpb))
    throw new Error('the panel can be rebuilt with a stale recent strip');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
