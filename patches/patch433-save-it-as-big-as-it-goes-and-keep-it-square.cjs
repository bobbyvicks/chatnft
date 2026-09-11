/* AN OPTION TO SAVE AT THE HIGHEST RESOLUTION, WITHOUT LOSING THE PIXELS.

   "we should have an option to save to the highest resolution because 8x is
   so clear but it wouldn't be ready/ good for the project. i need it to be
   crisper than crisp and high def/res"

   The Save at box already takes a size. What it did not do is keep the pixels
   square when the size is not a whole multiple of what it is scaling, and
   that is the whole of "crisper than crisp". Measured on 1280 art drawn in
   8px blocks, reading the run lengths along the middle row of the saved file:

     as it is   1280   every block 8
     2560       x2     every block 16
     3840       x3     every block 24
     4096       x3.2   blocks of 25 AND 26

   4096 is the ceiling the rest of the page draws and it is 3.2 times 1280, so
   asking for the biggest number gets the one result that is not crisp: an art
   pixel that is 25 wide in some places and 26 in others.

   TWO THINGS, then.

   A size that would scale up by a fraction is taken down to the whole
   multiple below it - 4096 becomes 3840 - and the line under the box says so
   before anything is pressed. Up only: below 1x the art is being reduced,
   which is a different intent with a different answer, and it is left alone.

   And a Max button, because "the largest whole multiple of this trait's
   footprint that fits under 4096" is not a number anybody should have to work
   out. On the 1280 traits in this collection it is 3840.

   NOTHING NEW IS INVENTED AT ANY OF THESE SIZES. A trait drawn in 8px blocks
   holds 160x160 real pixels and it still holds 160x160 at 3840 - each one is
   just 24 screen pixels instead of 8. What the bigger file buys is that
   nothing downstream gets the chance to resample it into softness, which is
   what 8x looked better for. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const X = String.fromCharCode(92) + 'u00d7';

/* ---- one place decides the scale ----------------------------------- */
{
  const at = kit.only(L, l => l === 'function saveCanvas(out){', 'the save canvas');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* THE SCALE THE SAVE WILL USE, AND WHETHER IT HAD TO MOVE.',
    '',
    '   A whole multiple keeps every art pixel the same size; a fraction does',
    '   not. Measured on 1280 art in 8px blocks: at 3840 every block is 24',
    '   across, and at 4096 - which is 3.2x - they come out 25 and 26. So a',
    '   size that would scale up by a fraction is taken down to the whole',
    '   multiple below it.',
    '',
    '   UP ONLY. Below 1x the art is being reduced rather than enlarged, which',
    '   is a different question with a different answer, and this leaves it',
    '   exactly as it was. */',
    'function saveScale(f){',
    '  const side=saveSide();',
    '  if(!(side>0)||!(f&&f.w>0)) return {k:1, asked:0};',
    '  const k=side/f.w;',
    '  if(k>1&&!Number.isInteger(k)) return {k:Math.floor(k), asked:side};',
    '  return {k:k, asked:0};',
    '}',
    '/* The largest whole multiple of this trait that fits under the ceiling the',
    '   rest of the page draws. 3840 on a 1280 trait. */',
    'function saveMaxSide(){',
    '  const f=saveFootprint();',
    '  if(!(f.w>0)) return 0;',
    '  return Math.max(f.w, Math.floor(MAX_SIDE/f.w)*f.w);',
    '}',
  ]);
  const r = kit.inFunction(L, 'function saveCanvas(out){');
  const k = kit.only(L, l => l === '  const side=saveSide();', 'where the save reads the size', r);
  if (L[k + 1] !== '  const k=side>0 ? side/f.w : 1;')
    throw new Error('the save scale is not shaped the way this expects');
  kit.replace(L, { start: k, end: k + 1 }, [
    '  /* Through saveScale, so the file and the line under the box cannot',
    '     disagree about what is about to be written. */',
    '  const k=saveScale(f).k;',
  ]);
}

/* ---- and the readout says when it moved ---------------------------- */
{
  const r = kit.inFunction(L, 'function saveSizeNote(){');
  const at = kit.only(L, l => l === '  const f=saveFootprint(), side=saveSide();',
    'where the note reads the size', r);
  if (L[at + 1] !== '  const k=side>0 ? side/f.w : 1;')
    throw new Error('the note scale is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  const f=saveFootprint();',
    '  const sc=saveScale(f), k=sc.k;',
  ]);
  const el = kit.only(L, l => l === '  el.textContent = (tw===W&&th===H)', 'the note text', kit.inFunction(L, 'function saveSizeNote(){'));
  if (L[el + 1] !== '    ? "Writes "+W+"' + X + '"+H')
    throw new Error('the note text is not shaped the way this expects');
  kit.replace(L, { start: el, end: el }, [
    '  /* SAID BEFORE ANYTHING IS PRESSED. A size taken down to a whole',
    '     multiple is a change to what was asked for, and the reason is worth',
    '     one clause: the alternative is blocks of 25 and 26. */',
    '  const movedNote = sc.asked',
    '    ? " \\u00b7 not "+sc.asked+": that is "+(Math.round(sc.asked/f.w*100)/100)',
    '      +"' + X + ' and the pixels would come out uneven"',
    '    : "";',
    '  el.textContent = (tw===W&&th===H)',
  ]);
  let tail = el + 6;
  while (L[tail].indexOf('+" where it sits on the base";') < 0) tail++;
  kit.replace(L, { start: tail, end: tail }, [
    '      +" where it sits on the base";',
  ]);
  /* Both branches of the sentence get the note. */
  const one = kit.only(L, l => l === '    ? "Writes "+W+"' + X + '"+H', 'the short form', kit.inFunction(L, 'function saveSizeNote(){'));
  kit.replace(L, { start: one, end: one }, [
    '    ? "Writes "+W+"' + X + '"+H+movedNote',
  ]);
  const two = kit.only(L, l => l === '      +" where it sits on the base";', 'the long form', kit.inFunction(L, 'function saveSizeNote(){'));
  kit.replace(L, { start: two, end: two }, [
    '      +" where it sits on the base"+movedNote;',
  ]);
}

/* ---- the button that fills in the biggest one ---------------------- */
{
  const at = kit.only(L, l => l.indexOf('          <span class="mono">px</span>') === 0,
    'the px label beside the save size');
  kit.replace(L, { start: at, end: at }, [
    '          <span class="mono">px</span>',
    '          <!-- The largest whole multiple that fits under the page ceiling.',
    '               Not a number anybody should have to work out, and the whole',
    '               multiple is what keeps every art pixel the same size. -->',
    '          <button class="btn ghost" id="savemax" style="width:auto;padding:6px 10px;font-size:12px"',
    '            title="Fill in the largest whole multiple of this trait that fits. Bigger adds no detail - it is the same pixels, larger - but nothing downstream gets to soften them.">Max</button>',
  ]);
  const wire = kit.only(L, l => l === "$('dlSize').onclick=downloadAtSize;", 'the size download wiring');
  kit.replace(L, { start: wire, end: wire }, [
    "$('dlSize').onclick=downloadAtSize;",
    "$('savemax').onclick=()=>{",
    '  const n=saveMaxSide();',
    "  if(!n) return;",
    "  const box=$('savesize');",
    "  box.value=String(n);",
    "  box.dispatchEvent(new Event('input',{bubbles:true}));",
    '};',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* WHOLE MULTIPLES ONLY, GOING UP. */
  const ss = kit.inFunction(codeLines, 'function saveScale(f){');
  const sb = codeLines.slice(ss.start, ss.end + 1).join('\n');
  if (!/if\(k>1&&!Number\.isInteger\(k\)\) return \{k:Math\.floor\(k\), asked:side\};/.test(sb))
    throw new Error('a fractional enlargement is still allowed, so blocks come out uneven');
  /* AND DOWN IS LEFT ALONE - reducing is a different question. */
  if (!/return \{k:k, asked:0\};/.test(sb))
    throw new Error('a reduction is being snapped too');

  /* THE FILE AND THE LINE COME FROM THE SAME PLACE. */
  const sc = kit.inFunction(codeLines, 'function saveCanvas(out){');
  if (!/const k=saveScale\(f\)\.k;/.test(codeLines.slice(sc.start, sc.end + 1).join('\n')))
    throw new Error('the file works its own scale out again');
  const sn = kit.inFunction(codeLines, 'function saveSizeNote(){');
  const nb = codeLines.slice(sn.start, sn.end + 1).join('\n');
  if (!/const sc=saveScale\(f\), k=sc\.k;/.test(nb))
    throw new Error('the note works its own scale out again');
  if (!/movedNote/.test(nb))
    throw new Error('a size taken down to a whole multiple is not said');
  /* Both forms of the sentence carry it, or it is silent half the time. */
  if ((nb.match(/\+movedNote/g) || []).length !== 2)
    throw new Error('the moved note is missing from one form of the sentence');

  /* THE MAX IS A WHOLE MULTIPLE UNDER THE CEILING. */
  const sm = kit.inFunction(codeLines, 'function saveMaxSide(){');
  const mb = codeLines.slice(sm.start, sm.end + 1).join('\n');
  if (!/Math\.floor\(MAX_SIDE\/f\.w\)\*f\.w/.test(mb))
    throw new Error('the biggest offered size is not a whole multiple');
  if (!/id="savemax"/.test(text))
    throw new Error('there is no way to reach it');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
