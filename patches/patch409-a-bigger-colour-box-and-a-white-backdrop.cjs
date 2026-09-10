/* THE COLOURS ARE OUT, AND YOU STILL CANNOT SEE THEM.

   "the way that the colours stayed out is now gone again when u bring it back
   make it bigger, also i want the ability to see a white background in the
   base button so i can see the outline better"

   NOT GONE - CAPPED TOO HARD, which reads as the same thing. Measured on the
   live page: the box is there, 96px tall, holding 76 swatches. It shows about
   two rows of them. patch399 brought that cap down from 156 to 96 to stop the
   box pushing the tool rail into another column, and that traded away the one
   thing the box exists for.

   WHAT A BIGGER CAP ACTUALLY COSTS, measured at five window shapes:

     window      cap 96                cap 200               cap 260
     1280x900    z7 rail175 shows 12   z7 rail175 shows 36   z7 rail227 shows 76
     1600x1000   z8 rail123 shows  8   z8 rail175 shows 36   z8 rail179 shows 70
     1280x720    z5 rail227 shows 27   z5 rail279 shows 76   z5 rail283 shows 76
     1024x768    z6 rail175 shows 12   z6 rail227 shows 63   z6 rail231 shows 76
     900x1200    z7 rail123 shows  8   z7 rail123 shows 24   z7 rail123 shows 32

   THE ZOOM DOES NOT MOVE AT ANY CAP AT ANY SHAPE. That was the condition the
   96 was defending - "make them fit so we dont loose editinng size" - and it
   was never actually at risk from the cap; only the rail's width was, which
   is stage width. So the cap goes back up, and it is min(260px, 28dvh) rather
   than a flat number: a tall window can afford 260, a short one backs off to
   about 200 on its own instead of taking a third of the screen.

   A WHITE BACKDROP, because a black outline on a chequerboard is unreadable.
   The stage draws a chequer behind everything, which is right for judging
   transparency and wrong for judging an edge - the very thing the outline
   tool now changes. The switch lives with the base controls, which is where
   the ask put it and where the other "what am I looking at" toggles already
   are.

   It is a class on the frame and nothing else. The frame is sized to the art
   and sits under it, so white lands exactly behind the trait rather than over
   the whole stage, and it cannot reach a save or an export because it is not
   a canvas - the same reason the base itself never does.

   IT DOES NOT RESET PER TRAIT. The outline settings do, so a block size
   chosen for the last picture cannot carry into the next; this is a way of
   LOOKING rather than a setting on the work, and somebody checking 320
   outlines should not have to switch it on 320 times. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the cap goes back up ------------------------------------------ */
{
  const at = kit.only(L, l => l.indexOf('.colbox{grid-area:cols; max-height:96px;') === 0,
    'the colour box rule');
  kit.replace(L, { start: at, end: at }, [
    '.colbox{grid-area:cols; max-height:min(260px,28dvh); overflow-y:auto; padding:10px 10px 8px;',
  ]);
  /* SUPERSEDES the note that chose 96. */
  const why = kit.only(L, l => l === '/* THE COLOURS, ALWAYS ON SCREEN, AND CAPPED BY WHAT THE RAIL NEEDS. A',
    'the cap note');
  let end = -1;
  for (let i = why; i < why + 20; i++) if (L[i].indexOf('4px of what it always was. */') >= 0) { end = i; break; }
  if (end < 0) throw new Error('the cap note does not end where this expects');
  kit.replace(L, { start: why, end: end }, [
    '/* THE COLOURS, ALWAYS ON SCREEN, AND BIG ENOUGH TO BE WORTH IT.',
    '',
    '   SUPERSEDES the 96px cap and its reasoning. That number was chosen to',
    '   stop the box pushing the rail into another column, and it worked - at',
    '   the price of showing about two rows of a 76-colour trait, which is the',
    '   box not doing its job. Measured at five window shapes, caps 96 through',
    '   320: THE ZOOM DOES NOT MOVE AT ANY OF THEM. The only cost is the rail\'s',
    '   width, and at 1280x900 cap 200 is free - same rail, same stage, three',
    '   times the colours visible.',
    '',
    '   min() rather than a flat number so the give is proportional: a tall',
    '   window affords 260, a short one settles near 200 by itself instead of',
    '   taking a third of the screen. Past that it scrolls, so a trait with',
    '   ninety colours still cannot push the tools out of view. */',
  ]);
}

/* ---- a white backdrop, with the base controls ---------------------- */
{
  const at = kit.only(L, l => l === '        <button class="btn ghost" id="baseoutline" aria-pressed="false">Show base outline</button>',
    'the base outline button');
  kit.replace(L, { start: at, end: at }, [
    '        <button class="btn ghost" id="baseoutline" aria-pressed="false">Show base outline</button>',
    '        <!-- A BLACK OUTLINE ON A CHEQUERBOARD IS UNREADABLE, and the outline',
    '             tool changes exactly that edge now. See patch409. -->',
    '        <button class="btn ghost" id="basewhite" aria-pressed="false"',
    '          title="Put white behind the trait instead of the chequerboard, so a dark outline reads. It is never part of the artwork.">White background</button>',
  ]);
  const css = kit.only(L, l => l === '.frame{position:relative; box-shadow:0 0 0 1px var(--line),0 18px 50px #0009;}',
    'the frame rule');
  kit.replace(L, { start: css, end: css }, [
    '.frame{position:relative; box-shadow:0 0 0 1px var(--line),0 18px 50px #0009;}',
    '/* WHITE BEHIND THE TRAIT, not over the stage. The frame is sized to the art',
    '   and sits under it, so this lands exactly behind the trait and the chequer',
    '   still surrounds it - which is what makes the edge readable rather than',
    '   just bright. A class on a div, so it cannot reach a save or an export for',
    '   the same reason the base never does: neither is a canvas. */',
    '.frame.whitebg{background:#fff;}',
  ]);
}

/* ---- and the switch ------------------------------------------------ */
{
  const at = kit.only(L, l => l === "  ob.textContent='Show base outline';", 'the base reset');
  kit.replace(L, { start: at, end: at }, [
    "  ob.textContent='Show base outline';",
  ]);
  const wire = kit.only(L, l => l.indexOf("$('baseoutline').onclick") === 0
    || l.indexOf('$("baseoutline").onclick') === 0, 'the base outline wiring');
  kit.replace(L, { start: wire, end: wire - 1 }, [
    '/* A WAY OF LOOKING, not a setting on the work - so unlike the outline',
    '   controls it is NOT reset when a trait opens. Somebody checking 320',
    '   outlines should not switch it on 320 times. */',
    '$("basewhite").onclick=()=>{',
    '  const b=$("basewhite"), on=b.getAttribute("aria-pressed")!=="true";',
    '  b.setAttribute("aria-pressed",String(on));',
    '  b.textContent=on?"Chequerboard background":"White background";',
    '  $("frame").classList.toggle("whitebg",on);',
    '};',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  const css = text.slice(0, text.indexOf('</' + 'style>'));

  if (/\.colbox\{grid-area:cols; max-height:96px;/.test(css))
    throw new Error('the colour box is still capped at the number that hid it');
  if (!/\.colbox\{grid-area:cols; max-height:min\(260px,28dvh\);/.test(css))
    throw new Error('the colour box cap is not the measured one');
  /* Still capped, and still scrolling - or ninety colours push the tools out. */
  if (!/\.colbox\{[^}]*overflow-y:auto;/.test(css))
    throw new Error('the colour box stopped scrolling, so a big palette takes the column');

  if (text.indexOf('id="basewhite"') < 0) throw new Error('there is no white background switch');
  if (!/\.frame\.whitebg\{background:#fff;\}/.test(css))
    throw new Error('the white backdrop has no rule');
  /* ON THE FRAME, NOT THE STAGE. White over the whole stage is a different
     thing and does not put the edge against anything. */
  if (/\.stage\{[^}]*background:#fff/.test(css))
    throw new Error('the white went onto the stage rather than behind the trait');
  const wire = code.slice(code.indexOf('$("basewhite").onclick'));
  const end = wire.indexOf('};');
  const body = wire.slice(0, end);
  if (!/\$\("frame"\)\.classList\.toggle\("whitebg",on\)/.test(body))
    throw new Error('the switch does not reach the frame');
  /* IT MUST NOT TOUCH A CANVAS. That is what keeps it out of every save. */
  if (/getContext|drawImage|putImageData|toBlob/.test(body))
    throw new Error('the backdrop draws onto a canvas, so it can reach a save');
  /* NOT RESET WITH THE BASE. Removing the base clears its own state; the
     backdrop is a way of looking and has to survive that. */
  const resetAt = code.indexOf("ob.textContent='Show base outline';");
  if (resetAt < 0) throw new Error('the base reset moved');
  if (code.slice(Math.max(0, resetAt - 400), resetAt + 400).indexOf('basewhite') >= 0)
    throw new Error('the backdrop is reset with the base, which it is not part of');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
