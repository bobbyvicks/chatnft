/* A COLOUR PICKED WHILE ERASING SWITCHES TO DRAWING WITH IT.

   Asked for 2026-09-24: "if i click a colour and im on erase it switches to
   draw and im using that colour". Picking a colour is saying what to paint
   with, and with the eraser still on the next stroke erased instead. The
   colour picker and the eyedropper already switch to the pencil; the four
   swatch rows did not - the picture's own colours, the palette, the recent
   colours and an imported palette. Each now goes through paintWith, which
   sets the colour and, only when the eraser is the tool, picks the pencil.
   Any other tool is left alone: a fill, a line or a shape uses the colour
   as it is, and switching away from those would take the tool the person
   chose. setColor itself is unchanged, because it also runs when a trait
   opens and when a preset applies, and neither is a person picking. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

swap("$('picker').oninput=e=>{ setColor(e.target.value,false); selectTool('pencil'); };", [
  '/* A SWATCH PRESSED: paint with it. With the eraser on, the next stroke',
  '   erased, which is not what picking a colour means - so the eraser gives',
  '   way to the pencil. Any other tool keeps the colour and stays, and',
  '   setColor stays as it is: it also runs when a trait opens. */',
  'function paintWith(h){',
  '  setColor(h);',
  '  if(tool==="eraser") selectTool("pencil");',
  '}',
  "$('picker').oninput=e=>{ setColor(e.target.value,false); selectTool('pencil'); };",
], 'the picker');

{
  const i = at('      if(rcPick.has(h)) rcPick.delete(h); else rcPick.add(h);', 'the picture swatch');
  if (L[i + 1] !== '      setColor(h);') throw new Error('the picture swatch moved');
  kit.replace(L, { start: i + 1, end: i + 1 }, ['      paintWith(h);']);
}
swap('    b.onclick=()=>{ setColor(h); };', ['    b.onclick=()=>{ paintWith(h); };'], 'the palette swatch');
swap('    b.onclick=()=>setColor(h);', ['    b.onclick=()=>paintWith(h);'], 'the recent colour');
swap('      b.onclick=e=>{ if(pioTake||e.ctrlKey||e.metaKey){ PIO.colours[i]=null; pioRender(); return; } setColor(h); };', [
  '      b.onclick=e=>{ if(pioTake||e.ctrlKey||e.metaKey){ PIO.colours[i]=null; pioRender(); return; } paintWith(h); };',
], 'the imported palette');

kit.save(doc, ({ code }) => {
  if (code.split('paintWith(h)').length - 1 !== 5) throw new Error('four swatch rows and the definition');
});
fs.renameSync(TMP, FILE);
console.log('patch586 written');
