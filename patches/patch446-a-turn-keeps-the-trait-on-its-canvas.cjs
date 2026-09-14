/* A TURN KEEPS THE TRAIT ON ITS OWN CANVAS, AND THE HANDLE CAN BE GRABBED.

   "I should be able to rotate the art with the move button too, atm it
   doesnt work"

   The handle is not missing and it is not unreachable. Measured at six
   viewport and canvas sizes - including a 1280 trait at 390x844 - the round
   handle was on screen, answered elementFromPoint, and turned the art every
   time. What is wrong is what a turn DOES.

   A free turn grows the canvas. Measured: 37 degrees took a 64x64 to 90x90,
   which on a 1280 trait is 1810x1810. Every trait in this collection is lined
   up against a base at a fixed size, so a turn that silently resizes the
   canvas takes the trait off the character - which is "it doesnt work" for
   anyone working the way this project works.

   THE GROWTH IS NOT A DEFECT, so it is not simply removed. It is what the
   ported algorithm does - ceil(|W cos| + |H sin|) - and rotation.spec.js
   pins it with pixel arrays worked out one by one in REPORT.md. What changes
   is what the EDITOR asks for by default.

   ONE ANSWER FOR ALL THREE CALLERS. The file already records the rule: "the
   button, the drag handle and PB.rotate cannot disagree about what a turn
   is". So this is not a special case on the handle - it is a chip beside the
   sampling chip that all three read, exactly the shape rotalg already has.

   AND IT IS THE SAME SAMPLING. Keeping the size does not change a single
   sampled pixel: the turn is computed at its natural size and then put back
   on the original canvas through recanvas, which is the centred rule the
   rest of the app already uses - "a trait that does not sit where the
   character expects it is ruined whatever size it is". One undo step,
   because it is one restoreImage.

   WHAT IT COSTS is that a turn can now push art off the edge. That is said,
   with the number, rather than left to be discovered.

   THE QUARTER TURNS ARE LEFT ALONE. A quarter turn swaps width and height,
   and that swap IS the turn - there is nothing to keep. rotateFree routes
   90, 180 and 270 to rotateQuarter before any of this.

   AND THE HANDLE IS BIGGER. 13px, floating 36px above the canvas on a 1px
   line, is under the 22px floor this project enforces on panel controls -
   canvas handles are not in what paneldensity scans, so it escaped the rule
   rather than being exempted from it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the chip, beside the one it belongs with ------------------- */
{
  const at = kit.only(L, l => l.indexOf('title="Turn the art by the angle. A quarter turn is exact; anything else grows') >= 0,
    'the Turn button title');
  if (L[at + 1] !== '        <button class="btn ghost" id="rotgo" style="width:auto;padding:4px 9px;font-size:12px"'
    && L[at - 1] !== '        <button class="btn ghost" id="rotgo" style="width:auto;padding:4px 9px;font-size:12px"')
    throw new Error('the Turn button is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '          title="Turn the art by the angle. A quarter turn is exact; anything else'
    + ' samples the way the choice beside it says, and the canvas follows the'
    + ' Canvas chips. One undo step.">Turn</button></div>',
    '      <div class="olrow" style="margin-top:8px"><label>Canvas on a turn</label>',
    '        <div class="chips" id="turncan" role="group" aria-label="What a turn does to the canvas size">',
    '          <button type="button" data-v="keep" aria-pressed="true"',
    '            title="The canvas stays the size it is, so a turned trait still'
    + ' lines up on the character. Anything pushed past the edge is cut, and the'
    + ' message says how much.">Keep size</button>',
    '          <button type="button" data-v="grow" aria-pressed="false"',
    '            title="The canvas grows to hold the whole turn, which is what the'
    + ' turn itself produces. Nothing is cut, but the trait is no longer the size'
    + ' the collection expects.">Grow</button>',
    '        </div></div>',
  ]);
  /* The old line ended the row; the replacement carries that ending, so the
     line after it must not close the row a second time. */
  if (L[at - 1].indexOf('id="rotgo"') < 0)
    throw new Error('the Turn button did not end up above its title');
}

/* ---- 2. the chip group is live ------------------------------------- */
{
  const at = kit.only(L, l => l === 'for(const id of ["rsmode","tstatus","txalign","rotalg","rsalg"]){',
    'the chip groups');
  kit.replace(L, { start: at, end: at }, [
    'for(const id of ["rsmode","tstatus","txalign","rotalg","rsalg","turncan"]){',
  ]);
}

/* ---- 3. one place that answers what a turn does to the canvas ------- */
{
  const at = kit.only(L, l => l.indexOf('function rotAlg(){') === 0, 'the sampling choice');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '/* WHAT A TURN DOES TO THE CANVAS, in one place for the same reason rotAlg',
    '   is in one place: the Turn button, the drag handle on the canvas and',
    '   PB.rotate must not disagree about what a turn is.',
    '',
    '   Keep is the default because every trait here is lined up against a base',
    '   at a fixed size, and a turn that resizes the canvas takes the trait off',
    '   the character. Grow is what the turn itself produces and is still one',
    '   click away. */',
    'function turnKeepsCanvas(){',
    '  return !(typeof chipVal==="function"&&chipVal("turncan")==="grow");',
    '}',
  ]);
}

/* ---- 4. the turn itself -------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function rotateFree(deg){');
  const at = kit.only(L, l => l === '  snapshot();', 'the undo step in a free turn', fn);
  if (L[at + 1] !== '  restoreImage(new ImageData(out,nw,nh));')
    throw new Error('the free turn does not commit the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* BACK ONTO THE CANVAS IT CAME FROM, when that is what was asked for.',
    '',
    '     Not a different turn: the sampling above is untouched and runs at the',
    '     size the algorithm asks for, so every pixel is the one it would have',
    '     been. This only decides which canvas the result is put down on, and',
    '     recanvas is the centred rule the rest of the app already uses for',
    '     exactly that - a scale, a pad and a turn all keep the art at the same',
    '     fraction of the canvas, or it stops sitting where the base expects.',
    '',
    '     Before snapshot(), so this is one undo step rather than two. */',
    '  const keep=turnKeepsCanvas();',
    '  let ow=nw, oh=nh;',
    '  let cut=0;',
    '  if(keep&&(nw!==W||nh!==H)){',
    '    /* SAID, NOT DISCOVERED. A turn can push art past an edge that is not',
    '       growing to meet it, and the number is the difference in painted',
    '       pixels - counted rather than predicted. */',
    '    const ink=d2=>{ let n=0; for(let i=3;i<d2.length;i+=4) if(d2[i]) n++; return n; };',
    '    const had=ink(out);',
    '    out=recanvas(out,nw,nh,W,H);',
    '    cut=Math.max(0,had-ink(out));',
    '    ow=W; oh=H;',
    '  }',
    '  snapshot();',
    '  restoreImage(new ImageData(out,ow,oh));',
  ]);
  /* `out` is assigned above, so its declaration cannot be a const. */
  const decl = kit.only(L, l => l === '  let out;', 'the turn output', kit.inFunction(L, 'function rotateFree(deg){'));
  if (decl < 0) throw new Error('the turn output is not a let');
}

/* ---- 5. and it says which it did ----------------------------------- */
{
  const fn = kit.inFunction(L, 'function rotateFree(deg){');
  const at = kit.only(L, l => l.indexOf('toast("Turned "+d.toFixed(1)') >= 0,
    'what a turn says', fn);
  kit.replace(L, { start: at, end: at }, [
    '  toast("Turned "+d.toFixed(1)+String.fromCharCode(176)',
    '    +(keep ? " - still "+ow+" by "+oh+(cut?", "+cut+" pixel"+(cut===1?"":"s")',
    '        +" turned off the canvas":"")',
    '      : " - now "+ow+" by "+oh)',
    '    +(alg==="rotxel"?" with Rotxel":""));',
  ]);
}

/* ---- 6. the scripting API can pin it ------------------------------- */
{
  const at = kit.only(L, l => l === 'PB.rotate=function(deg,alg){', 'the rotate api');
  if (L[at + 3] !== '  const turned=!!rotateFree(+deg||0);')
    throw new Error('PB.rotate is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 5 }, [
    '/* canvas is "keep" or "grow", and omitting it leaves whatever the panel',
    '   says - the same contract alg has. Named rather than a boolean so a',
    '   caller reads as the chip it is setting. */',
    'PB.rotate=function(deg,alg,canvas){',
    '  if(!ctx) return {ok:false, why:"nothing is open"};',
    '  if(alg!==undefined){ if(ROT_ALGS.indexOf(alg)<0) return {ok:false, why:"no turn called "+alg}; setChip("rotalg",alg); }',
    '  if(canvas!==undefined){',
    '    if(canvas!=="keep"&&canvas!=="grow") return {ok:false, why:"no canvas rule called "+canvas};',
    '    setChip("turncan",canvas);',
    '  }',
    '  const turned=!!rotateFree(+deg||0);',
    '  return {ok:true, deg:+deg||0, alg:rotAlg(), canvas:turnKeepsCanvas()?"keep":"grow",',
    '    turned, w:art.width, h:art.height};',
    '};',
  ]);
}

/* ---- 7. a handle that can be grabbed -------------------------------- */
{
  const at = kit.only(L, l => l === '#tbox .trot{background:var(--accent); border-color:#14131a; border-radius:50%; cursor:grab;}',
    'the rotate handle');
  kit.replace(L, { start: at, end: at }, [
    '/* BIGGER THAN THE REST, because it is the one you hunt for. The resize',
    '   handles sit on the corners of the art and can be found by the corner;',
    '   this one floats 36px above the top edge on a 1px line with nothing',
    '   around it, and at 13px it is under the 22px floor this project holds',
    '   panel controls to. Canvas handles are not in what paneldensity scans,',
    '   so it escaped that rule rather than being exempted from it.',
    '   The margin is half the size, which is what centres it on its point. */',
    '#tbox .trot{background:var(--accent); border-color:#14131a; border-radius:50%;',
    '  cursor:grab; width:22px; height:22px; margin:-11px 0 0 -11px;}',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  /* ONE ANSWER, and the three callers all reach it. */
  if (code.indexOf('function turnKeepsCanvas(){') < 0)
    throw new Error('there is no one place saying what a turn does to the canvas');
  const rf = kit.inFunction(codeLines, 'function rotateFree(deg){');
  const rb = codeLines.slice(rf.start, rf.end + 1).join('\n');
  if (!/const keep=turnKeepsCanvas\(\);/.test(rb))
    throw new Error('the turn does not read the canvas rule');
  if (!/out=recanvas\(out,nw,nh,W,H\);/.test(rb))
    throw new Error('the turn does not put the art back on its own canvas');
  /* THE SAMPLING IS UNTOUCHED. If recanvas ran before the sampler, this would
     be a different turn rather than the same turn placed differently. */
  if (rb.indexOf('out=recanvas(out,nw,nh,W,H);') < rb.indexOf('out=rotxelTurn('))
    throw new Error('the canvas is being changed before the pixels are sampled');
  /* ONE UNDO STEP. */
  if ((rb.match(/snapshot\(\);/g) || []).length !== 1)
    throw new Error('a turn is no longer one undo step');
  if (rb.indexOf('snapshot();') < rb.indexOf('out=recanvas('))
    throw new Error('the undo step is taken after the canvas is changed');
  /* AND IT SAYS WHAT IT CUT. */
  if (!/cut=Math\.max\(0,had-ink\(out\)\);/.test(rb))
    throw new Error('a turn that cuts art does not count what it cut');
  if (!/turned off the canvas/.test(rb))
    throw new Error('a turn that cuts art does not say so');

  /* QUARTER TURNS UNTOUCHED - the swap is the turn. */
  if (rb.indexOf('if(Math.abs(d-90)<0.05){ rotateQuarter(true); return true; }') < 0)
    throw new Error('the quarter turns stopped being routed away');
  if (rb.indexOf('const keep=turnKeepsCanvas();') < rb.indexOf('rotateQuarter(true); return true;'))
    throw new Error('the canvas rule is being applied to quarter turns');

  /* THE CHIP IS ON THE PAGE AND LIVE. */
  if (!/data-v="keep"/.test(text) || !/data-v="grow"/.test(text))
    throw new Error('the canvas rule has no control');
  if (!/id="turncan"/.test(text))
    throw new Error('the chip group is not on the page');
  if (code.indexOf('"rotalg","rsalg","turncan"') < 0)
    throw new Error('the chip group is not wired to the click handler');
  /* KEEP IS THE DEFAULT, which is the whole point for a fixed-size trait. */
  if (!/data-v="keep" aria-pressed="true"/.test(text))
    throw new Error('a turn still grows the canvas by default');

  /* EVERY NAME IT CALLS IS REAL. */
  for (const nm of ['recanvas', 'rotateQuarter', 'restoreImage', 'snapshot', 'rotAlg'])
    if (code.indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);

  /* THE HANDLE CLEARS THE FLOOR THE REST OF THE APP HOLDS TO. */
  if (!/#tbox \.trot\{[^}]*width:22px; height:22px/.test(text))
    throw new Error('the rotate handle is still too small to grab');
  if (!/#tbox \.trot\{[^}]*margin:-11px 0 0 -11px/.test(text))
    throw new Error('the bigger handle is no longer centred on its point');
  /* And the others are untouched - this is one handle, not a resize of all. */
  if (!/#tbox \.th\{[^}]*width:13px; height:13px; margin:-7px 0 0 -7px/.test(text))
    throw new Error('the resize handles changed size too');

  /* The promise on the button matches what it now does. */
  if (/anything else grows the canvas to fit/.test(text))
    throw new Error('the Turn button still promises to grow the canvas');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
