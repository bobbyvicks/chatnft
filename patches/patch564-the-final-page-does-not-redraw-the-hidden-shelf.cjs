/* THE FINAL PAGE DOES NOT REDRAW THE SHELF BEHIND IT.

   Found 2026-09-22 by the discovery pass, ranked thirty-seventh of 39. An
   add or remove on the final project page redrew the final page, then the
   whole project shelf - every tile, the compose panel, the rules panel -
   on a page nobody was looking at: 30-60 ms on a desktop and a 162 ms task
   at phone speed, mostly after the final page had painted, so a second
   tap straight after an add could lag. And idHolder, which asks whether
   one id is taken, read every record in the project to answer.

   On the final page the shelf is now left until it is shown: leaving the
   final page draws it if the store has moved since it last read it
   (renderShelfIfStale, patch551). idHolder reads the one record it asks
   about. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

{
  const fn = kit.inFunction(L, 'async function idHolder(id,exceptId){');
  const want = [
    'async function idHolder(id,exceptId){',
    '  if(!id||id===exceptId) return null;',
    '  let all=[];',
    '  try{ all=await dbAll(); }catch(_){ return null; }',
    '  const hit=all.find(r=>r.id===id);',
    '  return hit && hit.id!==exceptId ? hit : null;',
    '}',
  ];
  if (fn.end - fn.start + 1 !== want.length) throw new Error('idHolder changed');
  for (let k = 0; k < want.length; k++) if (L[fn.start + k] !== want[k]) throw new Error('idHolder moved at +' + k);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    'async function idHolder(id,exceptId){',
    '  if(!id||id===exceptId) return null;',
    '  /* The one record, by its key - this read every record in the project',
    '     to find it. */',
    '  let hit=null;',
    '  try{ hit=await dbGet(id); }catch(_){ return null; }',
    '  return hit && hit.id!==exceptId ? hit : null;',
    '}',
  ]);
}
{
  const fnR = () => kit.inFunction(L, 'async function finalMove(t,next){');
  swap('  if(r.stale){ toast(t.name+" changed in another tab - the page has been redrawn"); await renderFinal(); renderShelf(); return; }', [
    '  if(r.stale){ toast(t.name+" changed in another tab - the page has been redrawn"); await renderFinal(); shelfBehind(); return; }',
  ], 'the stale redraw', fnR());
  const f = fnR();
  const i = at('  await renderFinal();', 'the final redraw', f);
  if (L[i + 1] !== '  renderShelf();') throw new Error('the shelf redraw moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '  await renderFinal();',
    '  shelfBehind();',
  ]);
  const f2 = fnR();
  kit.replace(L, { start: f2.start, end: f2.start }, [
    '/* THE SHELF BEHIND THE FINAL PAGE. Drawn now only if the final page is',
    '   not what is showing; otherwise showPage draws it on the way to another',
    '   page, if the store has moved since it last read it. Redrawing a page',
    '   nobody is looking at was a 162 ms task at phone speed after each add. */',
    'function shelfBehind(){',
    '  const land=$("land");',
    '  if(land && land.getAttribute("data-page")==="final") return;',
    '  renderShelf();',
    '}',
    'async function finalMove(t,next){',
  ]);
}
{
  const fnR = () => kit.inFunction(L, 'function showPage(p,push){');
  swap('  land.setAttribute("data-page",want);', [
    '  const leaving=land.getAttribute("data-page");',
    '  land.setAttribute("data-page",want);',
  ], 'the page set', fnR());
  swap('  if(want==="final") renderFinal();', [
    '  if(want==="final") renderFinal();',
    '  /* Leaving the final page: the shelf it did not redraw, if anything moved. */',
    '  else if(leaving==="final") renderShelfIfStale();',
  ], 'the page redraw', fnR());
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('shelfBehind()') !== 3) throw new Error('shelfBehind uses: ' + times('shelfBehind()'));
});

fs.renameSync(TMP, FILE);
console.log('patch564 written, ' + grew + ' bytes');
