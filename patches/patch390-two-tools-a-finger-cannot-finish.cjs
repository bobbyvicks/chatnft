/* TWO TOOLS A FINGER CAN START AND CANNOT FINISH.

   1. EVERY GRADIENT A PHONE DRAWS RUNS TO BLACK. gdColours is
      `[color, rcTo || "#000000"]` and rcTo is written in exactly two places,
      both of them oncontextmenu. There is no right-click on a phone, so the
      far end of every ramp is black and nothing on screen says why - while the
      tool's own tooltip advertises "the right-click target - or black - behind
      the press", which is an instruction a phone cannot follow.

      The gradient gets its own far end, in its own panel, as a colour input.
      ADDITIVE: gdTo falls back to rcTo and then to black, so right-clicking a
      swatch still does exactly what it did, the tests that set rcTo directly
      still mean what they meant, and a phone has a control.

   2. A SLOT IN AN IMPORTED PALETTE CAN ONLY BE CLEARED WITH CTRL+CLICK, and
      that is written only inside a title attribute, which a phone neither has
      a key for nor shows. Having imported a .gpl to edit and export, you can
      put colours into empty slots forever and never take one out; the only
      escape is Drop, which discards the whole palette.

      A "Take out" toggle beside Import and Drop. While it is on, a tap clears
      the slot it lands on instead of painting with it. Ctrl+click keeps
      working, because somebody with a keyboard is faster that way and taking
      it away would be a second defect.

   AND THE CAPTION STOPS NAMING A MOUSE. "left-click paints with it,
   right-click makes it the colour marked ones become" is the only instruction
   on that panel, and half of it cannot be carried out with a finger. It names
   what happens rather than which button does it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1: the gradient's far end ---------------------------------- */
{
  const at = kit.only(L, l => l === '      <div class="olrow"><label for="gdshape">Shape</label>',
    'the first gradient row');
  kit.replace(L, { start: at, end: at - 1 }, [
    '      <div class="olrow"><label for="gdto">To</label>',
    '        <input id="gdto" type="color" value="#000000"',
    '          title="The far end of the ramp. The near end is the colour you are painting with.">',
    '        <button class="mini" type="button" id="gdtoclear"',
    '          title="Back to the colour marked in the Colours panel, or black when nothing is marked">Clear</button></div>',
  ]);

  const fn = kit.only(L, l => l === 'function gdColours(){ return [hx2(color).concat(255), hx2(rcTo||"#000000").concat(255)]; }',
    'the gradient colours');
  kit.replace(L, { start: fn, end: fn }, [
    '/* THE FAR END OF THE RAMP. rcTo is set by right-clicking a swatch, which a',
    '   phone cannot do - so every gradient a finger drew ran to black, and the',
    '   tool\'s own tooltip told the person to right-click. gdTo is the gradient\'s',
    '   own, set from its panel; falling back to rcTo keeps the right-click route',
    '   working exactly as it did rather than replacing it. */',
    'let gdTo=null;',
    'function gdColours(){ return [hx2(color).concat(255), hx2(gdTo||rcTo||"#000000").concat(255)]; }',
  ]);
}

/* ---- 2: taking a colour out of an imported palette --------------- */
{
  const at = kit.only(L, l => l.indexOf('          title="Take the imported palette out of this panel.') === 0,
    'the Drop button title');
  if (L[at + 1] !== '      </div>') throw new Error('the palette row does not close where this expects');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '        <button class="btn ghost" id="piotake" hidden aria-pressed="false"',
    '          style="width:auto;padding:5px 10px;font-size:12px"',
    '          title="While this is on, tapping a colour takes it out of the imported palette instead of painting with it. Ctrl+click does the same without the toggle.">Take out</button>',
  ]);

  const note = kit.only(L, l => l.indexOf('    +" \\u00b7 left-click paints with it, right-click makes it the colour marked ones become";') === 0
    || l === '    +" · left-click paints with it, right-click makes it the colour marked ones become";',
    'the palette caption');
  kit.replace(L, { start: note, end: note }, [
    '    /* WHAT HAPPENS, not which button does it. Half of the old sentence -',
    '       "right-click makes it the colour marked ones become" - is an',
    '       instruction a phone cannot carry out, on the only line of guidance',
    '       this panel has. */',
    '    +" \\u00b7 tap to paint with it" + (pioTake ? ", or to take it out while Take out is on" : "");',
  ]);

  const click = kit.only(L, l => l === '      b.onclick=e=>{ if(e.ctrlKey||e.metaKey){ PIO.colours[i]=null; pioRender(); return; } setColor(h); };',
    'the imported swatch click');
  kit.replace(L, { start: click, end: click }, [
    '      /* The toggle and the modifier do the same thing: one for a finger,',
    '         one for the hand already on a keyboard. */',
    '      b.onclick=e=>{ if(pioTake||e.ctrlKey||e.metaKey){ PIO.colours[i]=null; pioRender(); return; } setColor(h); };',
  ]);

  /* The state, and the button that owns it. */
  const drop = kit.only(L, l => l === 'function pioRender(){', 'the palette renderer');
  kit.replace(L, { start: drop, end: drop }, [
    '/* WHETHER A TAP TAKES A COLOUR OUT. Ctrl+click was the only way, on a',
    '   control a phone has no key for and whose only mention was inside a title',
    '   attribute. */',
    'let pioTake=false;',
    'function pioRender(){',
  ]);
  const shown = kit.only(L, l => l === '  grid.hidden=!on; note.hidden=!on; drop.hidden=!on;', 'where the palette is shown');
  kit.replace(L, { start: shown, end: shown }, [
    '  grid.hidden=!on; note.hidden=!on; drop.hidden=!on;',
    '  const take=$("piotake");',
    '  if(take){',
    '    take.hidden=!on;',
    '    if(!on) pioTake=false;',
    '    take.setAttribute("aria-pressed",String(pioTake));',
    '  }',
  ]);
}

/* ---- and the two handlers ---------------------------------------- */
{
  /* Inside the same setup function the other palette buttons are wired in,
     which is where its own file input and Drop already live. */
  const at = kit.only(L, l => l === '  $("piodrop").onclick=pioDrop;', 'the Drop handler');
  kit.replace(L, { start: at, end: at }, [
    '  $("piodrop").onclick=pioDrop;',
    '  $("piotake").onclick=()=>{ pioTake=!pioTake; pioRender(); };',
  ]);
}
{
  /* The gradient panel is wired where its own rows are. oninput rather than
     onchange so the ramp follows the picker while it is open, which is how
     every other colour control on this page behaves. */
  const at = kit.only(L, l => l === '  const a=$("gdarea"); if(!a) return;',
    'the gradient panel setup');
  kit.replace(L, { start: at, end: at }, [
    '  const a=$("gdarea"); if(!a) return;',
    '  const to=$("gdto"), toclear=$("gdtoclear");',
    '  if(to) to.oninput=e=>{ gdTo=e.target.value; };',
    '  if(toclear) toclear.onclick=()=>{ gdTo=null; if(to) to.value=rcTo||"#000000"; };',
  ]);
}
/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* The gradient reads its own colour first and still falls back. */
  const gc = codeLines.find(l => l.indexOf('function gdColours()') === 0);
  if (!gc) throw new Error('gdColours is gone');
  if (gc.indexOf('gdTo||rcTo||"#000000"') < 0)
    throw new Error('the gradient does not prefer its own far end, or lost its fallback');
  if (text.indexOf('id="gdto"') < 0) throw new Error('there is no control for the far end');
  if (text.indexOf('to.oninput=e=>{ gdTo=e.target.value; }') < 0)
    throw new Error('the far-end control is not wired');

  /* Taking a colour out works from a tap AND from the modifier. */
  const cl = codeLines.find(l => l.indexOf('      b.onclick=e=>{ if(pioTake||e.ctrlKey') === 0);
  if (!cl) throw new Error('a tap cannot take a colour out');
  if (cl.indexOf('e.ctrlKey||e.metaKey') < 0)
    throw new Error('the modifier route was removed rather than joined');
  if (text.indexOf('id="piotake"') < 0) throw new Error('there is no toggle to turn on');
  if (text.indexOf('$("piotake").onclick=()=>{ pioTake=!pioTake; pioRender(); };') < 0)
    throw new Error('the toggle is not wired');

  /* THE TOGGLE CANNOT SURVIVE ITS PALETTE. Left on after a Drop, the next
     import would delete the first colour anybody touched. */
  const pr = kit.inFunction(codeLines, 'function pioRender(){');
  const body = codeLines.slice(pr.start, pr.end + 1).join('\n');
  if (!/if\(!on\) pioTake=false;/.test(body))
    throw new Error('the take-out mode outlives the palette it belongs to');

  /* And the caption no longer tells a phone to use a mouse button. */
  if (/left-click paints with it/.test(text))
    throw new Error('the palette caption still names a mouse button');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
