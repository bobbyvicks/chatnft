/* SHRINKING A TRAIT WAS SHRINKING THE FILE.

   "did we remove the black outline thats coming from the saves and did we
   make a high res save bc rn its stilll savinng fuzzy (i think bc it saves
   small) but i need it to be saving like its big"

   Both of those shipped and are live. And "i think bc it saves small" is the
   right diagnosis of what is left. Measured, 1280 art in 10px blocks:

     as opened, box empty     1280x1280   4 colours   blocks all 10
     shrunk to 640, empty      640x640    4 colours   blocks all 5
     shrunk to 640, box 1280  1280x1280   4 colours   blocks all 10
     as opened, Max           3840x3840   4 colours   blocks all 30

   NOTHING IS FUZZY. Four colours in, four colours out, at every size, with
   every block the same width - no save path invents a colour or a part
   pixel. What it does do is write 640 when the canvas is 640, and a 640 file
   looks soft the moment anything else scales it up, which is what a viewer
   or a mint will do.

   patch422 made the footprint the default so a trait lined up against a base
   keeps its place - and the control in that patch says what happens without
   one: "The footprint is the canvas when there is no base, so this is the
   path every save took before". That is the case being hit. Shrink to fit by
   eye, with no base pinned, and the file is the shrunken canvas.

   SO A SAVE IS NEVER SMALLER THAN THE TRAIT THAT WAS OPENED. The canvas width
   at open is remembered, and an empty box writes at least that. Nothing is
   typed and nothing has to be found.

   WHY NOT JUST DEFAULT THE BOX TO 1280, which is what I tried first: it
   enlarges everything, including traits that are deliberately small and
   traits that are the wrong size - and an off-size trait silently becoming
   on-size turns off the collection's own wrong-size check. Five tests said
   so and they were right. The size the trait OPENED at is the number that
   fixes this case and touches nothing else: a 16px trait opened at 16 has a
   floor of 16, a 200px off-size trait has a floor of 200, and a 1280 trait
   shrunk to 640 has a floor of 1280.

   A BASE STILL WINS, because the footprint is already at least the base and
   this only raises a floor. Shrinking to fit a pinned character still writes
   the character's square with the trait small inside it - that is patch422
   and it is untouched. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const X = String.fromCharCode(92) + 'u00d7';

/* ---- remember the size it opened at -------------------------------- */
{
  const at = kit.only(L, l => l === '  brushAuto=true;', 'where a fresh canvas resets the brush');
  kit.replace(L, { start: at, end: at }, [
    '  brushAuto=true;',
    '  /* THE SIZE THIS TRAIT ARRIVED AT. A save is never written smaller than',
    '     it: shrinking a trait to line it up is a change to the ARTWORK, and it',
    '     was coming out as a change to the file as well - 640 written for a',
    '     trait that opened at 1280, which looks soft the moment anything scales',
    '     it back up. */',
    '  openWide=(w>0)?w:0;',
  ]);
  const decl = kit.only(L, l => l === 'const SAVE_SIZE_KEY="pb.savesize";', 'the save size key');
  kit.replace(L, { start: decl, end: decl }, [
    'const SAVE_SIZE_KEY="pb.savesize";',
    '/* The canvas width the open trait arrived at, and the floor an empty Save',
    '   at box writes to. 0 before anything is open. */',
    'let openWide=0;',
  ]);
}

/* ---- and the empty box writes at least that ------------------------ */
{
  const fn = kit.inFunction(L, 'function saveScale(f){');
  const at = kit.only(L, l => l === '  const side=saveSide();', 'where the scale reads the box', fn);
  if (L[at + 1] !== '  if(!(side>0)||!(f&&f.w>0)) return {k:1, asked:0};')
    throw new Error('the scale is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  const side=saveSide();',
    '  if(!(f&&f.w>0)) return {k:1, asked:0};',
    '  /* NOTHING TYPED: the floor is the size the trait opened at. A whole',
    '     multiple where one fits, so the pixels stay square - 1280 over a 640',
    '     canvas is exactly 2. Only ever UP: this raises a floor, it does not',
    '     cap anything, so a base footprint bigger than the floor still wins. */',
    '  if(!(side>0)){',
    '    if(openWide>f.w){',
    '      const k=openWide/f.w;',
    '      return {k:(k>1&&!Number.isInteger(k))?Math.floor(k):k, asked:0, floor:openWide};',
    '    }',
    '    return {k:1, asked:0};',
    '  }',
  ]);
}

/* ---- and the line says why it is bigger than the canvas ------------ */
{
  const fn = kit.inFunction(L, 'function saveSizeNote(){');
  const at = kit.only(L, l => l === '  const movedNote = sc.asked', 'the moved note', fn);
  kit.replace(L, { start: at, end: at - 1 }, [
    '  /* And when the floor is what made it bigger, say so - otherwise a 640',
    '     canvas writing 1280 is a number with no explanation on screen. */',
    '  const floorNote = (!sc.asked && sc.floor)',
    '    ? " \\u00b7 the size this trait opened at"',
    '    : "";',
  ]);
  const one = kit.only(L, l => l === '    ? "Writes "+W+"' + X + '"+H+movedNote', 'the short form',
    kit.inFunction(L, 'function saveSizeNote(){'));
  kit.replace(L, { start: one, end: one }, [
    '    ? "Writes "+W+"' + X + '"+H+movedNote+floorNote',
  ]);
  const two = kit.only(L, l => l === '      +" where it sits on the base"+movedNote;', 'the long form',
    kit.inFunction(L, 'function saveSizeNote(){'));
  kit.replace(L, { start: two, end: two }, [
    '      +" where it sits on the base"+movedNote+floorNote;',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  /* THE FLOOR IS THE SIZE IT OPENED AT, not a constant. A constant enlarges
     traits that are deliberately small and turns off the collection's own
     wrong-size check by making off-size files on-size. */
  const ss = kit.inFunction(codeLines, 'function saveScale(f){');
  const body = codeLines.slice(ss.start, ss.end + 1).join('\n');
  if (!/if\(openWide>f\.w\)\{/.test(body))
    throw new Error('the floor is not the size the trait opened at');
  if (/CANVAS_SIDE/.test(body))
    throw new Error('the floor is a constant, so it enlarges traits that are meant to be small');
  /* UP ONLY: it raises a floor and caps nothing, so a base footprint bigger
     than the floor still decides. */
  if (!/if\(!\(side>0\)\)\{/.test(body))
    throw new Error('a typed size no longer wins over the floor');

  /* AND IT IS SET WHERE A TRAIT OPENS, before anything can save. */
  const se = kit.inFunction(codeLines, 'function startEditor(data,w,h,srcW,srcH,pal,recovered){');
  if (!/openWide=\(w>0\)\?w:0;/.test(codeLines.slice(se.start, se.end + 1).join('\n')))
    throw new Error('nothing records the size the trait opened at');

  /* And the line explains a file bigger than the canvas. */
  const sn = kit.inFunction(codeLines, 'function saveSizeNote(){');
  const nb = codeLines.slice(sn.start, sn.end + 1).join('\n');
  if (!/const floorNote = \(!sc\.asked && sc\.floor\)/.test(nb))
    throw new Error('a 640 canvas writing 1280 is a number with no explanation');
  if ((nb.match(/\+floorNote/g) || []).length !== 2)
    throw new Error('the explanation is missing from one form of the sentence');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
