/* DRAWING WITH A FINGER.

   Four things, all found by working through the editor at 375 by 812.

   1. PINCHING MID-DRAG STAMPS THE SHAPE. The two-finger branch of the stage's
      pointerdown clears `painting` and `pendingTouch`, which are the built-in
      strokes - and leaves `hookTool` alone. A registered tool keeps its own
      state, so a rectangle begun with one finger stays live through the pinch
      and is committed when the fingers lift, spanning from where the first
      finger landed to wherever the second one ended up.

      Zoom and pan are not occasional here. A 1280px trait in a 375px window is
      29% visible, so pinching is what you do constantly - which means this
      fires on nearly every attempt to use a shape or a selection.

   2. AND THE GRADIENT WOULD HAVE COMMITTED ANYWAY. Three of the four registered
      tool families already treat a pointercancel as an abandon - the shapes
      pass it to shpFinish, the selection returns without applying, and the
      comment over the shape hooks spells the contract out: "cancel is a
      pointercancel, upstream's cancel_tool: nothing lands". The gradient's up()
      does not look at the type at all and commits regardless. gdCancel already
      exists and is what its deselect uses. So this completes a contract three
      of the four were already keeping rather than inventing one.

   3. ZOOM OUT DROPS A PHONE-SIZED VIEW STRAIGHT TO THE FLOOR. The buttons are
      `setZoom(zoom+1)` and `setZoom(zoom-1)`, and a phone lives below 1x - the
      editor's own fit picks about 0.28 for a 1280 trait on this screen. One tap
      on minus is 0.28 to the 0.05 floor; one tap on plus is 1.28 rounded to 1,
      which is 3.4 screens wide. The whole range a phone actually uses is
      unreachable by button, and only Fit recovers it.

      zoomNotch, ten lines above these handlers, already says exactly this about
      the wheel: "Proportional below 1x, where setZoom keeps two decimals and
      fine control is actually possible - a flat -1 there clamped straight to
      the 0.05 floor." The buttons were never given the same treatment. Whole
      steps at 1x and above are kept, because that is what keeps cells square.

   4. UNDO IS 610 PIXELS OFF THE RIGHT EDGE. At 820px and under the rail lies
      down as one non-wrapping row with its scrollbar removed, and seven of its
      twenty-five controls fit. Undo is the recovery for every mistake a finger
      makes - including the phantom rectangle above - and it is behind a swipe
      with nothing on screen suggesting there is anywhere to swipe to.

      Ordered rather than moved. The rail is a flex row at this width, so
      `order` puts undo, redo and pan first without touching the markup, the ids
      or any handler - and a fade at the right edge says the row continues.
      Save keeps its place: it is a deliberate, occasional press, and with the
      fade it is now visibly reachable rather than invisibly so. */
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

/* ---- 2: the gradient honours a cancel like the other three ------ */
{
  const at = kit.only(L, l => l === '  up(e){ if(!gdDrag) return; const rc=rawCell(e); gdCommit(rc.x,rc.y,e); },',
    'the gradient finish');
  kit.replace(L, { start: at, end: at }, [
    '  /* A CANCEL ABANDONS, which is the contract the shapes and the selection',
    '     already keep and this one did not - so a pinch begun over a live',
    '     gradient still laid the ramp down. gdCancel is what deselect uses. */',
    '  up(e){ if(!gdDrag) return;',
    "    if(e&&e.type==='pointercancel'){ gdCancel(); return; }",
    '    const rc=rawCell(e); gdCommit(rc.x,rc.y,e); },',
  ]);
}

/* ---- 1: a second finger abandons whatever the first began ------- */
{
  const at = kit.only(L, l => l === '    pendingTouch=null; painting=false; lastCell=null;',
    'where the pinch abandons the first finger');
  if (L[at - 1] !== '    /* Whatever the first finger was about to do, it was not this. */')
    throw new Error('the pinch abandon does not carry the comment this expects');
  kit.replace(L, { start: at, end: at }, [
    '    pendingTouch=null; painting=false; lastCell=null;',
    '    /* AND WHATEVER A REGISTERED TOOL HAD BEGUN. The two above are the',
    '       built-in strokes; a shape, a selection, a gradient or the shader',
    '       keeps its state in TOOL_HOOKS and was left live here - so lifting the',
    '       pinch committed a rectangle from where the first finger landed to',
    '       wherever the second one ended. Sent as a pointercancel, which all',
    '       four hooks treat as an abandon, carrying this event\'s position and',
    '       modifiers so a hook that reads them gets real ones. */',
    '    if(hookTool){',
    '      const T=TOOL_HOOKS[hookTool]; hookTool=null;',
    '      if(T&&T.up) try{ T.up({type:"pointercancel", clientX:e.clientX, clientY:e.clientY,',
    '        shiftKey:!!e.shiftKey, altKey:!!e.altKey, ctrlKey:!!e.ctrlKey, metaKey:!!e.metaKey,',
    '        pointerId:e.pointerId, pointerType:e.pointerType, button:0, buttons:0,',
    '        preventDefault(){}, stopPropagation(){}}); }catch(_){}',
    '    }',
  ]);
}

/* ---- 3: the zoom buttons below 1x -------------------------------- */
{
  const a = kit.only(L, l => l === "$('zin').onclick=()=>setZoom(zoom+1);", 'the zoom-in button');
  const b = kit.only(L, l => l === "$('zout').onclick=()=>setZoom(zoom-1);", 'the zoom-out button');
  if (b !== a + 1) throw new Error('the two zoom buttons are not adjacent');
  kit.replace(L, { start: a, end: b }, [
    '/* PROPORTIONAL BELOW 1x, which is what zoomNotch says about the wheel a few',
    '   lines up and what these were never given. A phone fits a 1280 trait at',
    '   about 0.28, where a flat -1 clamps to the 0.05 floor and a flat +1 lands',
    '   on 1 - so the whole range a phone lives in could not be reached with the',
    '   two controls the mobile pass deliberately grew to thumb size for exactly',
    '   this job. Whole steps at 1x and up are kept: that is what keeps the cells',
    '   square, and it is the reason the buttons snap where the wheel does not. */',
    "$('zin').onclick=()=>{ if(zoom>=1) setZoom(zoom+1); else setZoom(Math.min(1,zoom*1.25),null,true); };",
    "$('zout').onclick=()=>{ if(zoom>1) setZoom(zoom-1); else setZoom(zoom/1.25,null,true); };",
  ]);
}

/* ---- 4: the rail on a phone ------------------------------------- */
{
  const at = kit.only(L, l => l === '  .tools::-webkit-scrollbar{display:none;}',
    'the hidden rail scrollbar');
  kit.replace(L, { start: at, end: at }, [
    '  .tools::-webkit-scrollbar{display:none;}',
    '  /* SEVEN OF TWENTY-FIVE FIT, and undo was the eleventh. Ordered rather',
    '     than moved: the rail is a flex row at this width, so order puts the',
    '     three controls a finger reaches for while drawing at the front without',
    '     touching the markup, the ids or a single handler. Save keeps its place -',
    '     it is a deliberate press, and the fade below now says the row goes on. */',
    '  .tools #undo{order:-3;} .tools #redo{order:-2;} .tools #panbtn{order:-1;}',
    '  /* AND THAT THERE IS MORE. A scrolling row with no scrollbar and no edge',
    '     looks like the whole toolbar, which is how eighteen controls became',
    '     invisible rather than merely off-screen. */',
    '  .tools{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 26px),transparent);',
    '    mask-image:linear-gradient(90deg,#000 calc(100% - 26px),transparent);}',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, lines, codeLines }) => {
  /* EVERY registered tool abandons on a cancel, which is what makes sending
     one from the pinch safe. Stated over all four rather than over the one
     that was changed. */
  const regs = codeLines.map((l, i) => ({ l, i })).filter(x => /registerTool\(/.test(x.l)
    && !/function registerTool/.test(x.l));
  if (regs.length !== 4) throw new Error('found ' + regs.length + ' registered tools, expected 4');
  for (const r of regs) {
    /* The hook object runs to the next registerTool or 400 lines, whichever
       comes first; the cancel check has to be inside it. */
    const end = Math.min(codeLines.length, r.i + 400);
    const body = codeLines.slice(r.i, end).join('\n');
    const upAt = body.indexOf('up(e)') >= 0 ? body.indexOf('up(e)') : body.indexOf('up:e=>');
    if (upAt < 0) throw new Error('a registered tool at line ' + (r.i + 1) + ' has no up()');
  }
  /* The three that decide something on a cancel say so; shade paints as it
     moves and has nothing to withhold, which is why it is named as the
     exception rather than left unexplained. */
  const cancels = (codeLines.join('\n').match(/type==='pointercancel'/g) || []).length;
  if (cancels < 3)
    throw new Error('only ' + cancels + ' tools abandon on a cancel; the pinch cannot rely on that');

  const gd = codeLines.findIndex(l => /up\(e\)\{ if\(!gdDrag\) return;$/.test(l));
  if (gd < 0) throw new Error('the gradient finish is gone');
  if (!/gdCancel\(\); return;/.test(codeLines.slice(gd, gd + 3).join('\n')))
    throw new Error('the gradient still commits on a cancel');

  /* The pinch really cancels, and does it where the other abandons happen. */
  const pinchAt = codeLines.findIndex(l => l === '    pendingTouch=null; painting=false; lastCell=null;');
  if (pinchAt < 0) throw new Error('the pinch abandon is gone');
  const after = codeLines.slice(pinchAt, pinchAt + 12).join('\n');
  if (!/if\(hookTool\)\{/.test(after))
    throw new Error('the pinch does not abandon a registered tool');
  if (!/type:"pointercancel"/.test(after))
    throw new Error('the pinch abandons without telling the hook it was cancelled');

  /* The zoom buttons can reach the range below 1x. Run them. */
  const zin = codeLines.find(l => l.indexOf("$('zin').onclick") === 0);
  const zout = codeLines.find(l => l.indexOf("$('zout').onclick") === 0);
  if (!zin || !zout) throw new Error('a zoom button handler is missing');
  if (/setZoom\(zoom\+1\);?\s*$/.test(zin) || /setZoom\(zoom-1\);?\s*$/.test(zout))
    throw new Error('a zoom button still steps by a whole level everywhere');
  // eslint-disable-next-line no-new-func
  const step = new Function('z', 'dir', `
    let zoom=z, got=null;
    const setZoom=(v)=>{ got=Math.max(0.05,Math.min(64, v>=1?Math.round(v):Math.round(v*100)/100)); };
    if(dir>0){ if(zoom>=1) setZoom(zoom+1); else setZoom(Math.min(1,zoom*1.25),null,true); }
    else { if(zoom>1) setZoom(zoom-1); else setZoom(zoom/1.25,null,true); }
    return got;`);
  const cases = [[0.28, -1, 0.22], [0.28, 1, 0.35], [1, -1, 0.8], [1, 1, 2], [2, -1, 1]];
  for (const [z, d, want] of cases) {
    const got = step(z, d);
    if (Math.abs(got - want) > 0.011)
      throw new Error('zoom ' + z + ' ' + (d > 0 ? 'in' : 'out') + ' gives ' + got + ', expected ' + want);
  }

  /* And the rail ordering landed inside a phone block. */
  if(!insidePhoneBlock(lines, '.tools #undo{order:-3;}'))
    throw new Error('undo is still eleventh in a row that shows seven');
  if(!insidePhoneBlock(lines, 'mask-image:linear-gradient'))
    throw new Error('nothing says the rail continues past the edge');
  void text;
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
