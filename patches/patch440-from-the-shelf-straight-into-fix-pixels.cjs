/* FROM THE SHELF INTO FIX PIXELS, WITHOUT GOING THROUGH THE DISK.

   "have it so that i can directly go from project traits to fix pixels
   without having to downnload a version from projects to use in there (make
   them work together better)"

   The two halves of the page did not know about each other. A trait on the
   shelf could be opened in the editor and nowhere else; the fixer could only
   be fed from a file picker or a drop. So putting a saved trait through the
   fixer meant downloading it and importing it back, which is two trips
   through the filesystem for a picture that is already in the browser.

   A button on the tile sends one. The pick bar sends as many as are picked,
   as a batch, which is the shape a folder-sized job needs and the shape the
   fixer already has for it.

   AND IT COMES BACK WHERE IT CAME FROM. The file is built with
   fileWithPath(bytes, layer + "/" + name + ".png"), which is the same shape a
   folder import arrives in - so the fixer's Save to project reads the layer
   out of the path exactly as it does for imported files, and the trait lands
   back in its own layer under its own name rather than in unsorted. That is
   the whole of "make them work together better": out and back without
   anybody retyping where it lives.

   THE SAME TWO DOORS THE DROP HANDLER USES, deliberately. One file goes to
   fixLoad with the batch panel hidden; several go to fixBatch. Written as
   one function that both buttons call, so the single and the many cannot
   drift apart the way two copies of that decision would. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the one way through ------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixSaveSay(m){ const el=$("fixsaveout"); if(el) el.textContent=m; }',
    'the fixer save line');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* TRAITS OFF THE SHELF, INTO THE FIXER.',
    '',
    '   Through fileWithPath, so each one arrives carrying "layer/name.png" -',
    '   the same shape a folder import has. That is what makes the round trip',
    '   work: the fixer Save to project reads the layer out of the path, so a',
    '   trait goes back to the layer it came from under the name it had, and',
    '   nobody has to say where it lives twice.',
    '',
    '   One goes to fixLoad and several to fixBatch, which is the same fork the',
    '   drop handler makes - written once here so the two cannot drift. */',
    'async function fixFromRecords(recs){',
    '  const list=(recs||[]).filter(r=>r&&r.blob);',
    '  if(!list.length){ toast("Nothing to send"); return false; }',
    '  if(typeof mayUse==="function"&&!mayUse()) return false;',
    '  const files=[];',
    '  for(const r of list){',
    '    let bytes;',
    '    try{ bytes=new Uint8Array(await r.blob.arrayBuffer()); }',
    '    catch(_){ continue; }',
    '    const layer=String(r.layer||"unsorted");',
    '    const name=String(r.name||"trait").replace(/[\\\\/]/g,"-");',
    '    files.push(fileWithPath(bytes,layer+"/"+name+".png"));',
    '  }',
    '  if(!files.length){ toast("Could not read those traits"); return false; }',
    '  showPage("fixer",false);',
    '  if(files.length===1){ $("fixbatch").hidden=true; await fixLoad(files[0]); }',
    '  else await fixBatch(files);',
    '  return true;',
    '}',
  ]);
}

/* ---- a button on the tile ------------------------------------------ */
{
  const at = kit.only(L, l => l === "      el.appendChild(x);", 'where the tile gets its remove button');
  kit.replace(L, { start: at, end: at }, [
    '      el.appendChild(x);',
    '      /* STRAIGHT INTO THE FIXER. Beside the remove button rather than on',
    '         the tile body, which already opens the editor - two different',
    '         things to do with a trait, two places to press. */',
    '      const fx=document.createElement("button"); fx.className="fx";',
    '      fx.textContent="fix";',
    '      fx.title="Send "+t.name+" to Fix pixels";',
    '      fx.setAttribute("aria-label","Send "+t.name+" to Fix pixels");',
    '      fx.onclick=async ev=>{ ev.stopPropagation();',
    '        if(!await fixFromRecords([t])) return;',
    '        toast("Sent "+t.name+" to Fix pixels"); };',
    '      el.appendChild(fx);',
  ]);
  const css = kit.only(L, l => l === '.item:hover .x{display:grid; place-items:center;}',
    'the remove button reveal');
  kit.replace(L, { start: css, end: css }, [
    '.item:hover .x{display:grid; place-items:center;}',
    '/* THE SAME TREATMENT AS THE REMOVE BUTTON, on the other corner. Its own',
    '   rule rather than a shared selector: the two are the same shape today',
    '   and one of them is destructive, so a change to that one must not reach',
    '   this one by accident. */',
    '.item .fx{position:absolute; top:3px; left:3px; height:19px; padding:0 6px;',
    '  border-radius:5px; background:#0b0910cc; color:var(--muted);',
    '  font-size:10px; line-height:19px; display:none;}',
    '.item:hover .fx{display:block;}',
    '.item .fx:hover{color:var(--accent);}',
    '/* And it exists on a touch screen, where there is no hover to reveal it -',
    '   the remove button carries the same note and the same 30px target. */',
    '@media (hover:none){',
    '  .item .fx{display:block; height:30px; line-height:30px; font-size:12px;',
    '    padding:0 9px;}',
    '}',
  ]);
}

/* ---- and the picked ones, as a batch -------------------------------- */
{
  const at = kit.only(L, l => l === '        <button class="mini go" id="shelfpickmove" disabled>Move</button>',
    'the pick bar move button');
  kit.replace(L, { start: at, end: at }, [
    '        <button class="mini go" id="shelfpickmove" disabled>Move</button>',
    '        <!-- The same traits, the other way out. -->',
    '        <button class="mini" id="shelfpickfix" disabled',
    '          title="Send the picked traits to Fix pixels as one run. They come back to the layers they came from.">Fix pixels</button>',
  ]);
  const paint = kit.only(L, l => l === '    const cl=$("shelfpicknone"); if(cl) cl.disabled=!n;',
    'where the pick bar buttons are enabled');
  kit.replace(L, { start: paint, end: paint }, [
    '    const cl=$("shelfpicknone"); if(cl) cl.disabled=!n;',
    '    const fx=$("shelfpickfix"); if(fx) fx.disabled=!n;',
  ]);
  const wire = kit.only(L, l => l.indexOf("$('shelfpicknone').onclick=") === 0,
    'the pick bar clear wiring');
  kit.replace(L, { start: wire, end: wire - 1 }, [
    "/* THE PICKED TRAITS, INTO THE FIXER. Read out of the same records the",
    "   shelf rendered, in the order they are on the shelf, so what is sent is",
    "   what is showing. */",
    "$('shelfpickfix').onclick=async()=>{",
    '  const keys=[...shelfPick];',
    '  if(!keys.length){ toast("Pick some traits first"); return; }',
    '  let items=[];',
    '  try{ items=await dbAll(); }catch(_){ toast("Could not read the project"); return; }',
    '  const want=new Set(keys);',
    '  const recs=items.filter(i=>i&&i.kind==="trait"&&want.has(shelfCore.recordKey(i)));',
    '  if(!recs.length){ toast("Those traits are no longer here"); return; }',
    '  if(!await fixFromRecords(recs)) return;',
    '  toast("Sent "+recs.length+" trait"+(recs.length===1?"":"s")+" to Fix pixels");',
    '};',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const ff = kit.inFunction(codeLines, 'async function fixFromRecords(recs){');
  const body = codeLines.slice(ff.start, ff.end + 1).join('\n');
  /* IT COMES BACK WHERE IT CAME FROM. Without the layer in the path the
     fixer save reads no category and everything lands in unsorted. */
  if (!/files\.push\(fileWithPath\(bytes,layer\+"\/"\+name\+"\.png"\)\);/.test(body))
    throw new Error('the layer is not carried, so a round trip lands in unsorted');
  /* THE SAME FORK THE DROP HANDLER MAKES, not a second opinion about it. */
  if (!/if\(files\.length===1\)\{ \$\("fixbatch"\)\.hidden=true; await fixLoad\(files\[0\]\); \}/.test(body))
    throw new Error('one trait does not go down the single-image path');
  if (!/else await fixBatch\(files\);/.test(body))
    throw new Error('several traits do not go down the batch path');
  /* And it lands you on the page it just filled. */
  if (!/showPage\("fixer",false\);/.test(body))
    throw new Error('it fills the fixer and leaves you looking at the shelf');

  /* BOTH DOORS EXIST. */
  if (!/id="shelfpickfix"/.test(text))
    throw new Error('there is no way to send the picked traits');
  if (!/fx\.className="fx";/.test(text))
    throw new Error('there is no way to send one');
  /* The tile button must not also open the editor - the tile body does that. */
  const tile = text.match(/const fx=document\.createElement\("button"\);[\s\S]*?el\.appendChild\(fx\);/);
  if (!tile) throw new Error('the tile button was not found');
  if (!/ev\.stopPropagation\(\);/.test(tile[0]))
    throw new Error('pressing fix would open the editor as well');

  /* AND IT IS REACHABLE WITHOUT A HOVER. The remove button carries the same
     note for the same reason: the reveal rule is the only thing that shows
     it, and on a touch screen it never fires. */
  /* \s* rather than a literal newline between the two lines: the file is
     CRLF, so \n never matches and the guard fires on correct code. */
  if (!/@media \(hover:none\)\{\s*\.item \.fx\{display:block;/.test(text))
    throw new Error('the button does not exist on a touch screen');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
