/* THINGS A FINGER CANNOT DO AT ALL, AND THINGS IT CANNOT HIT.

   ON A PHONE YOU CANNOT REMOVE A TRAIT. The button is there in the markup and
   the only rule that shows it is `.item:hover .x{display:grid}`. A touch screen
   has no hover, so on 318 tiles the remove button never appears once, and there
   is no other route to it - the shelf's own controls are drag, hide, only, copy
   and pick.

   AND THE ONE THAT DOES APPEAR IS TOO SMALL TO HIT. Measured at a 375px
   viewport: the five per-tile buttons are 23.8 x 19.9 px in a five-column grid
   with 4px between them, and the penalty for missing one is not nothing - the
   tile's own click handler opens the trait, which on a 1280x1280 record is the
   most expensive thing on the page. #clbtn, the single door to the palette,
   Replace, Erase colour and Clean up colours, is 22 x 22 with no keyboard route
   on a phone: the 'c' shortcut needs a hardware key.

   WHAT CHANGES.

   1. The remove button appears when there is no hover to reveal it, at 30px
      rather than 19 - the size this file already chose for a touch target three
      rules above. Keyed on (hover:none) rather than a width, because a tablet
      at 1024px has the same problem and a narrow desktop window does not.

   2. AND IT ASKS FIRST, on every pointer. Removing a trait is irreversible and
      was the one destructive action in the file that did not confirm - "Remove
      the layer", "Remove every saved trait", "Remove this project from the
      server", leaving a group project and three more all do. That asymmetry was
      survivable while the button could only be reached by hovering it on
      purpose; it is not survivable next to the artwork on a shelf somebody is
      scrolling with a thumb. Same idiom as the other six, naming what goes.

   3. The five per-tile buttons become two rows of three at about 40 x 36 on a
      phone, and #clbtn becomes 30 x 30, which is what this block uses for a
      target a thumb has to hit.

      SUPERSEDES "beside the swatch the same block already grew to 30", written
      here first and wrong: there is no swatch. .cur holds #clbtn and #curhex
      and nothing else, so the rule that sentence leans on matches no element
      at all. patch380 labels the dead rule in the page.

   4. "never" says why on the tile instead of only in a title attribute. A
      tooltip cannot be read with a finger, and .item .pct has pointer-events:
      none besides, so on a phone a trait reads "never" in red with no way at
      all to learn that the reason is a set switched off somewhere else on the
      page. Only the minority of tiles that are excluded grow a line. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

/* THE FILE HAS MORE THAN ONE 820px BLOCK - two, and the first closes long
   before the phone pass, so a findIndex on the opening line lands in the wrong
   one. That is how this check first refused a correct edit. Every block is
   scanned, and the rule has to be inside one of them.

   Takes a SUBSTRING rather than a pattern: escaping a regex through the layers
   of quoting these scripts are written in broke this twice. */
function insidePhoneBlock(lines, needle){
  const NL=String.fromCharCode(10);
  for(let open=0; open<lines.length; open++){
    if(lines[open]!=='@media (max-width:820px){') continue;
    let depth=0, close=-1;
    for(let i=open;i<lines.length;i++){
      for(const ch of lines[i]){ if(ch==='{') depth++; else if(ch==='}') depth--; }
      if(depth===0){ close=i; break; }
    }
    if(close<0) continue;
    if(lines.slice(open,close+1).join(NL).indexOf(needle)>=0) return {open:open, close:close};
  }
  return null;
}

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1: the remove button, and 4's styling ---------------------- */
{
  const at = kit.only(L, l => l === '.item:hover .x{display:grid; place-items:center;}',
    'the hover rule that reveals the remove button');
  kit.replace(L, { start: at, end: at }, [
    '.item:hover .x{display:grid; place-items:center;}',
    '/* WITHOUT A HOVER THERE IS NO REMOVE BUTTON AT ALL. The rule above is the',
    '   only thing that shows it, so on a touch screen it never appeared once and',
    '   nothing else on the tile removes a trait. (hover:none) rather than a',
    '   width: a tablet at 1024px has the same problem and a narrow desktop',
    '   window does not. 30px is the size this file already picked for a target a',
    '   thumb has to hit. */',
    '@media (hover:none){',
    '  .item .x{display:grid; place-items:center; width:30px; height:30px; font-size:17px;}',
    '}',
    '/* Why a trait says "never", on the tile. It was in a title attribute, on an',
    '   element with pointer-events:none, which is unreadable with a finger and',
    '   awkward with a mouse. Only the excluded minority of tiles carry one. */',
    '.item .whynot{display:block; margin-top:3px; font-size:9.5px; line-height:1.25;',
    '  color:var(--bad); white-space:normal; text-wrap:pretty;}',
  ]);
}

/* ---- 3: the per-tile row, and the colour button ----------------- */
{
  const at = kit.only(L, l => l === '  .cur input[type=color]{width:30px; height:30px;}',
    'the colour swatch restore in the phone block');
  kit.replace(L, { start: at, end: at }, [
    '  .cur input[type=color]{width:30px; height:30px;}',
    '  /* AND THE BUTTON BESIDE IT, which is the well now. #clbtn is the only door',
    '     to the palette, Replace, Erase colour and Clean up colours, and its',
    '     keyboard shortcut needs a hardware key - so at 22x22 it was a quarter of',
    '     a touch target guarding every colour operation on the page. */',
    '  #clbtn{width:30px; height:30px;}',
    '  /* FIVE ACROSS IS 24px EACH. Two rows of three is about 40 wide and 36',
    '     tall, and a miss here opens the trait rather than doing nothing. */',
    '  .shelftools{grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px;}',
    '  .shelftools button,.shelftools .dup{padding:10px 2px; font-size:10.5px;}',
    '  /* AND THE COMPOSE ROWS, which are fourteen dropdowns stacked six pixels',
    '     apart and were the browser default: 19px tall on a 25px pitch. .crow',
    '     select carries only flex and min-width, so every rule that gives a',
    '     control a floor here missed it - it is in neither .opts nor .card. Sized',
    '     rather than added to those lists, because the list rule also sets',
    '     appearance:none and the chevron that replaces it is drawn elsewhere. */',
    '  .crow select{min-height:30px; padding:6px 7px;}',
  ]);
}

/* ---- the fixer drop zone, which is wider than the screen -------- */
{
  const at = kit.only(L, l => l === '.drop:hover,.drop.hot{border-color:var(--accent); background:var(--panel-2);}',
    'the drop zone hover rule');
  kit.replace(L, { start: at, end: at }, [
    '.drop:hover,.drop.hot{border-color:var(--accent); background:var(--panel-2);}',
    '/* .drop is 92vw, which is right on the home page where it is a centred child',
    '   of .land and wrong inside a panel that is itself 92vw and padded: the Fix',
    '   pixels dropzone hung 36px past the right edge of the screen, and was the',
    '   only horizontal overflow on the site at 375px. */',
    '#fixdrop{width:100%;}',
  ]);
}

/* ---- 2: removing a trait asks first ----------------------------- */
{
  const REF = "      x.onclick=async ev=>{ ev.stopPropagation(); const gone=await dbDelShared(t); renderShelf(); toast(gone ? ('Removed '+t.name) : ('Removed '+t.name+' here, but the group still has it - it will come back')); };";
  const TILE = "      x.onclick=async ev=>{ ev.stopPropagation(); const gone=await dbDelShared(t); visibility.show(key); renderShelf(); toast(gone ? ('Removed '+t.name) : ('Removed '+t.name+' here, but the group still has it - it will come back')); };";
  const a = kit.only(L, l => l === REF, 'the reference remove handler');
  kit.replace(L, { start: a, end: a }, [
    '      /* ASKS FIRST. See the trait tile below for why this is here now. */',
    '      x.onclick=async ev=>{ ev.stopPropagation();',
    '        if(!confirm(\'Remove the reference "\'+t.name+\'"?\')) return;',
    "        const gone=await dbDelShared(t); renderShelf(); toast(gone ? ('Removed '+t.name) : ('Removed '+t.name+' here, but the group still has it - it will come back')); };",
  ]);
  const b = kit.only(L, l => l === TILE, 'the trait remove handler');
  kit.replace(L, { start: b, end: b }, [
    '      /* ASKS FIRST, and this is a change on every pointer, not only touch.',
    '         Removing a trait is irreversible and was the one destructive action',
    '         in this file that did not confirm - the layer, the whole project,',
    '         the server copy, leaving a group and two more all do. That was',
    '         survivable while the button could only be reached by hovering it on',
    '         purpose. The rule above now shows it permanently on a touch screen,',
    '         beside the artwork, on a shelf being scrolled with a thumb. */',
    '      x.onclick=async ev=>{ ev.stopPropagation();',
    '        if(!confirm(\'Remove "\'+t.name+\'" from \'+(t.layer||"unsorted")+\'?\')) return;',
    "        const gone=await dbDelShared(t); visibility.show(key); renderShelf(); toast(gone ? ('Removed '+t.name) : ('Removed '+t.name+' here, but the group still has it - it will come back')); };",
  ]);
}

/* ---- 4: the reason on the tile ---------------------------------- */
{
  const r = kit.inFunction(L, 'async function renderShelf(){');
  const at = kit.only(L, l => l === '          pct.title=ch.why;', 'where the reason is put in a tooltip', r);
  if (L[at - 1] !== '          pct.textContent="never";')
    throw new Error('the never label is not on the line above its reason');
  kit.replace(L, { start: at, end: at }, [
    '          /* KEPT for a mouse, and said out loud for everything else. A title',
    '             cannot be read with a finger, and .item .pct refuses the pointer',
    '             anyway - so on a phone this was a red "never" with no reason',
    '             obtainable at all. The layer-switched-off case is the one that',
    '             matters: the trait is approved, correctly weighted, and excluded',
    '             by a control somewhere else on the page. */',
    '          pct.title=ch.why;',
    '          if(ch.why){',
    '            const why=document.createElement("span");',
    '            why.className="whynot"; why.textContent=ch.why;',
    '            el.appendChild(why);',
    '          }',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, lines, code, codeLines }) => {
  if (!/@media \(hover:none\)\{/.test(text))
    throw new Error('nothing shows the remove button where there is no hover');
  const hv = lines.findIndex(l => l === '@media (hover:none){');
  if (!/\.item \.x\{display:grid/.test(lines[hv + 1]))
    throw new Error('the no-hover block does not reveal the remove button');

  /* BOTH remove buttons ask. Stated over the code with comments stripped, so
     the prose above cannot satisfy it. */
  const dels = codeLines.filter(l => /dbDelShared\(t\)/.test(l));
  if (dels.length !== 2) throw new Error('found ' + dels.length + ' remove handlers, expected 2');
  /* The two THIS patch adds, matched on the quote that follows the word,
     because the file already carries six other confirmations - one of them
     "Remove every saved trait", which a looser count swept up and refused a
     correct edit for. */
  const confirms = codeLines.filter(l => /confirm\('Remove ("|the reference ")/.test(l));
  if (confirms.length !== 2)
    throw new Error('found ' + confirms.length + ' of the 2 confirmations this adds');
  /* And each confirmation is above its own delete, not somewhere else. */
  for (const d of codeLines.map((l, i) => ({ l, i })).filter(x => /dbDelShared\(t\)/.test(x.l))) {
    const near = codeLines.slice(Math.max(0, d.i - 3), d.i + 1).join('\n');
    if (!/confirm\('Remove ("|the reference ")/.test(near))
      throw new Error('a remove at line ' + (d.i + 1) + ' has no confirmation above it');
  }

  /* The reason reaches the tile, not just the tooltip. */
  const rs = kit.inFunction(codeLines, 'async function renderShelf(){');
  const body = codeLines.slice(rs.start, rs.end + 1).join('\n');
  if (!/why\.className="whynot"/.test(body))
    throw new Error('the reason a trait is never drawn is still only a tooltip');
  if (!/pct\.title=ch\.why;/.test(body))
    throw new Error('the tooltip was removed rather than kept alongside');

  /* The touch sizes landed inside a phone block. */
  for(const [needle,why] of [
    ['#clbtn{width:30px; height:30px;}', 'the colour button is still a 22px target'],
    ['.shelftools{grid-template-columns:repeat(3,', 'the tile buttons are still five across'],
    ['.crow select{min-height:30px', 'the compose dropdowns are still the browser default'],
  ]) if(!insidePhoneBlock(lines, needle)) throw new Error(why);
  if(text.indexOf('#fixdrop{width:100%;}')<0)
    throw new Error('the fixer dropzone is still wider than the panel that holds it');
  void code;
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
