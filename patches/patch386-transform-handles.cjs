/* THE TRANSFORM TOOL HALF-WORKS ON A PHONE, WHICH READS AS BROKEN.

   Transform is one of the seven rail buttons a phone can reach without
   swiping, and its own tooltip promises resize and rotate. On a real
   1280x1280 trait you tap it, the dashed box appears - and there is no handle
   anywhere on the glass. Dragging inside the box still moves the art, so half
   of the tool works, which is worse than none of it: it reads as a rendering
   fault rather than as something off screen.

   TWO REASONS, BOTH IN fitZoom.

   1. The handles sit ON and OUTSIDE the artwork's edges. #tbox is inset:0 over
      the art, its handles are 13px square with a -7px margin, so each one hangs
      7px past the edge - and the rotate handle is at top:-36px, 43px above the
      top edge before its own overhang. fitZoom reserves 12 pixels in total.
      At the zoom it picks, the artwork fills the stage and every handle is
      outside it.

   2. fitZoom fits the CONTENT rather than the canvas when a trait is small on
      a big canvas, which is right for looking at a trait and wrong here: the
      handles are on the CANVAS box, so fitting the content puts them wherever
      the canvas happens to reach. It is already gated off when there is a base
      character, for the same shape of reason, and the comment there says so.

   THE FIT ONLY MOVES WHEN IT HAS TO. Re-fitting every time somebody picks
   Transform would take a desktop user's chosen zoom away for no reason, so the
   box is measured first: if every handle is already on screen, nothing
   happens. That check is one getBoundingClientRect per handle, on a tool
   change, and it is what makes this safe to do unconditionally.

   The reserve is 112 - 56 a side - against a rotate arm that reaches 43 above
   the artwork plus its own 7 of overhang. Deliberately more than the 50 that is
   strictly needed: a handle exactly on the edge of the stage is one a thumb
   cannot get behind. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- fitZoom leaves room, and fits the canvas ------------------- */
{
  const r = kit.inFunction(L, 'function fitZoom(){');
  const at = kit.only(L, l => l === "  const st=$('stage'), pad=12;", 'the fit padding', r);
  if (L[at + 1] !== '  const box=contentBox();')
    throw new Error('the content box is not taken where this expects');
  /* Both lines: the replacement re-declares box, so leaving the original
     behind is a second const of the same name. The parse check caught it. */
  kit.replace(L, { start: at, end: at + 1 }, [
    "  const st=$('stage');",
    '  /* ROOM FOR THE HANDLES. #tbox is inset:0 over the art; its handles are',
    '     13px with a -7px margin so each hangs 7px past the edge, and the rotate',
    '     handle is 36px above the top before its own overhang - 50px in all,',
    '     against the 12 this reserved. Every one of them was off screen at the',
    '     zoom this function picks, on a tool whose own tooltip promises resize',
    '     and rotate. 56 a side rather than the 50 that just fits: a handle',
    '     exactly on the stage edge is one a thumb cannot get behind. */',
    '  const tOn = tool==="transform" && !!ctx;',
    '  const pad = tOn ? 112 : 12;',
    '  const box=contentBox();',
  ]);
  const r2 = kit.inFunction(L, 'function fitZoom(){');
  const use = kit.only(L, l => l === '  const useBox = box && !baseBitmap && (box.w*box.h) < (art.width*art.height)*0.5;',
    'the content-fit decision', r2);
  kit.replace(L, { start: use, end: use }, [
    '  /* AND NOT THE CONTENT WHILE THE BOX IS ON. The handles are on the CANVAS,',
    '     so fitting the content puts them wherever the canvas happens to reach -',
    '     the same reason this is already gated off when there is a base. */',
    '  const useBox = box && !baseBitmap && !tOn && (box.w*box.h) < (art.width*art.height)*0.5;',
  ]);
}

/* ---- and the fit is redone only when a handle is off screen ----- */
{
  const r = kit.inFunction(L, 'function tboxShow(){');
  const at = kit.only(L, l => l === '  b.classList.toggle("on", tool==="transform" && !!ctx);',
    'where the box is shown', r);
  kit.replace(L, { start: at, end: at }, [
    '  b.classList.toggle("on", tool==="transform" && !!ctx);',
    '  /* AND BRING THE HANDLES INTO VIEW, but only if they are not already.',
    '     Re-fitting on every tool change would take a chosen zoom away from',
    '     somebody who had not lost anything; measuring first costs one rect per',
    '     handle and answers the question properly. A frame later, because the',
    '     class above has not been laid out yet. */',
    '  if(b.classList.contains("on")) requestAnimationFrame(tboxFit);',
    '}',
    'function tboxFit(){',
    '  const b=$("tbox"), st=$("stage");',
    '  if(!b||!st||!b.classList.contains("on")) return;',
    '  const sr=st.getBoundingClientRect();',
    '  for(const h of b.querySelectorAll(".th")){',
    '    const r=h.getBoundingClientRect();',
    '    if(!r.width&&!r.height) continue;',
    '    if(r.left<sr.left||r.top<sr.top||r.right>sr.right||r.bottom>sr.bottom){',
    '      fitZoom();',
    '      return;',
    '    }',
    '  }',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, codeLines }) => {
  const fz = kit.inFunction(codeLines, 'function fitZoom(){');
  const body = codeLines.slice(fz.start, fz.end + 1).join('\n');
  if (!/const tOn = tool==="transform" && !!ctx;/.test(body))
    throw new Error('fitZoom does not know whether the transform box is on');
  if (!/const pad = tOn \? 112 : 12;/.test(body))
    throw new Error('fitZoom does not reserve room for the handles');
  if (!/!baseBitmap && !tOn &&/.test(body))
    throw new Error('fitZoom still fits the content while the handles are on the canvas');
  /* The 12 survives for every other tool, or this changed the fit for the
     whole editor rather than for one tool. */
  if (/pad=12;/.test(body) && !/pad = tOn \? 112 : 12;/.test(body))
    throw new Error('the ordinary padding was replaced rather than kept');

  const tf = kit.inFunction(codeLines, 'function tboxFit(){');
  const tfBody = codeLines.slice(tf.start, tf.end + 1).join('\n');
  if (!/getBoundingClientRect/.test(tfBody))
    throw new Error('the fit is redone without measuring whether it is needed');
  if (!/fitZoom\(\);/.test(tfBody)) throw new Error('nothing refits');
  /* IT MUST BE ABLE TO DO NOTHING. A version that always refits would satisfy
     every line above and take a chosen zoom away on every tool change. */
  if (!/return;/.test(tfBody.slice(tfBody.indexOf('for(')))
    || !/if\(r\.left<sr\.left/.test(tfBody))
    throw new Error('the refit is unconditional');

  const ts = kit.inFunction(codeLines, 'function tboxShow(){');
  if (!/requestAnimationFrame\(tboxFit\)/.test(codeLines.slice(ts.start, ts.end + 1).join('\n')))
    throw new Error('showing the box never checks its handles');

  /* THE GEOMETRY THE RESERVE IS SIZED FOR, read off the stylesheet rather than
     trusted: if the rotate arm or the handle size changes, 112 stops being the
     right number and this says so. */
  /* The STYLESHEET, from the whole document. code is the script with
     comments stripped and holds no CSS at all - a first version looked there,
     found nothing, and refused a correct edit. */
  const css = text.slice(0, text.indexOf(String.fromCharCode(60)+"/style"+String.fromCharCode(62)));
  const rot = css.match(/#tbox \.th\[data-h="rot"\]\{left:50%;top:(-?\d+)px\}/);
  const th = css.match(/#tbox \.th\{[^}]*width:(\d+)px;[^}]*margin:(-?\d+)px/);
  if (!rot || !th) throw new Error('cannot read the handle geometry to check the reserve against it');
  const reach = Math.abs(parseInt(rot[1], 10)) + Math.abs(parseInt(th[2], 10));
  if (112 / 2 < reach)
    throw new Error('the rotate handle reaches ' + reach + 'px and only ' + (112 / 2) + 'px is reserved');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
