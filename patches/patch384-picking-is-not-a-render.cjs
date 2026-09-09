/* PICKING SIX TRAITS TO MOVE THEM REBUILT THE WHOLE SHELF SIX TIMES.

   Picking is a selection. It changes a button's label, a border, and a count
   in the bar at the top - and it rebuilt all 318 tiles, re-ran every layer
   filter, rebuilt the compose panel and the plan panel, and re-registered
   every observer, for each one.

   Measured at the collection's size: a render is 232 ms here with the memo
   warm and 2,705 ms at a sixth of this CPU. Picking six traits to move them
   together - which is the whole reason picking exists - was six of those. On a
   phone that is sixteen seconds of frozen screen to select six things.

   Nothing about the collection changes when you pick something, so nothing
   below the selection needs to know. shelfPickPaint writes the three things
   that actually differ, in place:

     the tile's own picked border and its button's label and pressed state
     the count in the bar
     whether Move and Clear are available

   Pick all and Clear go through the same function, for the same reason and
   with the same saving - Pick all was 318 tiles rebuilt to set 318 booleans.

   MOVE STILL RENDERS. bulkMoveToLayer changes which layer a record is in,
   which is a change to the collection, and every count and heading downstream
   of it has to be redrawn. The line this patch draws is not "avoid rendering",
   it is "a selection is not a change".

   The pick button gets a class so it can be found again. It had none, and the
   alternative - reaching for a position inside .shelftools - would break the
   next time a button was added to that row. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the painter, beside the state it paints -------------------- */
{
  const at = kit.only(L, l => l === 'let shelfPick=new Set();', 'the pick set');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '/* WHAT PICKING ACTUALLY CHANGES ON SCREEN.',
    '',
    '   All three of these went through renderShelf, which rebuilds 318 tiles,',
    '   every layer filter, the compose panel and the plan panel - 232 ms here',
    '   with the distribution memo warm, 2,705 ms at a sixth of this CPU. Picking',
    '   six traits to move them together was six of those.',
    '',
    '   Nothing below the selection needs to know, because nothing about the',
    '   collection has changed. bulkMoveToLayer still renders: moving a record',
    '   between layers IS a change, and every count and heading has to follow it.',
    '',
    '   Reads the DOM rather than a list, so it cannot disagree with what is on',
    '   screen: whatever tiles are there now get the state their key says. */',
    'function shelfPickPaint(){',
    '  const n=shelfPick.size;',
    '  const bar=$("shelfpick");',
    '  if(bar){',
    '    const c=$("shelfpickcount"); if(c) c.textContent = n ? n+" picked" : "Nothing picked";',
    '    const mv=$("shelfpickmove"); if(mv) mv.disabled=!n;',
    '    const cl=$("shelfpicknone"); if(cl) cl.disabled=!n;',
    '  }',
    '  for(const el of document.querySelectorAll("#projbody [data-shelf-card-key]")){',
    '    const on=shelfPick.has(el.dataset.shelfCardKey);',
    '    el.classList.toggle("picked",on);',
    '    const b=el.querySelector(".pickbtn");',
    '    if(!b) continue;',
    '    b.textContent=on?"picked":"pick";',
    '    b.setAttribute("aria-pressed",String(on));',
    '    b.title=(on?"Unpick ":"Pick ")+(el.title||"this")+" to move it with others";',
    '  }',
    '}',
  ]);
}

/* ---- the tile's pick button --------------------------------------- */
{
  const r = kit.inFunction(L, 'async function renderShelf(){');
  const at = kit.only(L, l => l === '      const pick=document.createElement("button"); pick.type="button";',
    'the pick button', r);
  kit.replace(L, { start: at, end: at }, [
    '      /* A class, so shelfPickPaint can find it again. Reaching for a',
    '         position inside .shelftools would break the next time a button was',
    '         added to that row. */',
    '      const pick=document.createElement("button"); pick.type="button";',
    '      pick.className="pickbtn";',
  ]);
  const r2 = kit.inFunction(L, 'async function renderShelf(){');
  const click = kit.only(L, l => l === '      pick.onclick=ev=>{ ev.stopPropagation();', 'the pick handler', r2);
  if (L[click + 1] !== '        if(shelfPick.has(key)) shelfPick.delete(key); else shelfPick.add(key);')
    throw new Error('the pick handler does not toggle where this expects');
  if (L[click + 2] !== '        renderShelf();')
    throw new Error('the pick handler does not render where this expects');
  kit.replace(L, { start: click, end: click + 2 }, [
    '      pick.onclick=ev=>{ ev.stopPropagation();',
    '        if(shelfPick.has(key)) shelfPick.delete(key); else shelfPick.add(key);',
    '        /* Not renderShelf: see shelfPickPaint. */',
    '        shelfPickPaint();',
  ]);
}

/* ---- the bar keeps its select, and takes its counts from one place - */
{
  const r = kit.inFunction(L, 'async function renderShelf(){');
  const at = kit.only(L, l => l === '      bar.hidden=!traits.length;', 'the pick bar', r);
  if (L[at + 1] !== '      const n=shelfPick.size;')
    throw new Error('the pick bar does not count where this expects');
  if (L[at + 3] !== '      $("shelfpickmove").disabled=!n;')
    throw new Error('the pick bar does not set Move where this expects');
  if (L[at + 4] !== '      $("shelfpicknone").disabled=!n;')
    throw new Error('the pick bar does not set Clear where this expects');
  kit.replace(L, { start: at, end: at + 4 }, [
    '      bar.hidden=!traits.length;',
    '      /* The count and the two buttons come from the one place that writes',
    '         them, so a render and a pick cannot say different things. */',
    '      shelfPickPaint();',
  ]);
}

/* ---- and the two bar buttons that were only selecting ------------- */
{
  const none = kit.only(L, l => l === "$('shelfpicknone').onclick=()=>{ shelfPick.clear(); renderShelf(); };",
    'the Clear button');
  kit.replace(L, { start: none, end: none }, [
    "$('shelfpicknone').onclick=()=>{ shelfPick.clear(); shelfPickPaint(); };",
  ]);
  const all = kit.only(L, l => l === "$('shelfpickall').onclick=()=>{", 'the Pick all button');
  if (L[all + 3] !== '  renderShelf();')
    throw new Error('Pick all does not render where this expects');
  kit.replace(L, { start: all + 3, end: all + 3 }, [
    '  /* 318 tiles were rebuilt to set 318 booleans. */',
    '  shelfPickPaint();',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ codeLines }) => {
  const fn = kit.inFunction(codeLines, 'function shelfPickPaint(){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');
  for (const [re, why] of [
    [/shelfpickcount/, 'the painter does not write the count'],
    [/shelfpickmove/, 'the painter does not enable Move'],
    [/shelfpicknone/, 'the painter does not enable Clear'],
    [/classList\.toggle\("picked",on\)/, 'the painter does not mark the tile'],
    [/aria-pressed/, 'the painter does not set the button state'],
  ]) if (!re.test(body)) throw new Error(why);
  if (/renderShelf\(/.test(body))
    throw new Error('the painter renders, which is the thing it exists not to do');

  /* NOT ONE of the three selection handlers renders any more. Stated over the
     handlers rather than over a count of renderShelf calls, which would move
     with any unrelated change. */
  const sel = [
    ['the tile pick button', /pick\.onclick=ev=>\{ ev\.stopPropagation\(\);/],
    ['Clear', /\$\('shelfpicknone'\)\.onclick=/],
    ['Pick all', /\$\('shelfpickall'\)\.onclick=/],
  ];
  for (const [name, re] of sel) {
    const i = codeLines.findIndex(l => re.test(l));
    if (i < 0) throw new Error(name + ' is gone');
    const near = codeLines.slice(i, i + 6).join('\n');
    if (/renderShelf\(\)/.test(near)) throw new Error(name + ' still rebuilds the shelf');
    if (!/shelfPickPaint\(\)/.test(near)) throw new Error(name + ' does not repaint the selection');
  }

  /* AND MOVE STILL DOES, because it changes the collection. This is the
     control: a patch that simply removed renderShelf calls would pass every
     check above and break the thing picking is for. */
  const mv = codeLines.findIndex(l => /\$\('shelfpickmove'\)\.onclick=/.test(l));
  if (mv < 0) throw new Error('Move is gone');
  if (!/bulkMoveToLayer/.test(codeLines[mv]))
    throw new Error('Move no longer moves anything');

  /* The button the painter looks for is really put on the tile. */
  const rs = kit.inFunction(codeLines, 'async function renderShelf(){');
  const shelf = codeLines.slice(rs.start, rs.end + 1).join('\n');
  if (!/pick\.className="pickbtn";/.test(shelf))
    throw new Error('the pick button has no class, so the painter cannot find it');
  if (!/el\.dataset\.shelfCardKey=key;/.test(shelf))
    throw new Error('the tile carries no key, so the painter cannot tell which is which');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
