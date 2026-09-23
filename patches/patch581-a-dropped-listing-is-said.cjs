/* LOAD FROM CLOUD SAYS SO WHEN THE CONNECTION DROPS WHILE IT LISTS.

   cloudRows pages through the collection's rows, and its fetch was the one
   call on the pull's path with nothing around it. A connection that
   dropped while it listed - on the first page or any after - rejected out
   of cloudRows and out of cloudPull before the button was disabled or
   anything was said, and nothing on the page catches a rejection: the
   press did nothing, with no word. The same throw reached the status
   check and the quiet pull a group open makes.

   A fetch or a body that fails now answers not-ok, and says it could not
   reach the server, and cloudPull says that rather than "Could not read
   your collection", which is the answer for a server that replied no. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = () => kit.inFunction(L, 'async function cloudRows(c,h,select){');
{
  const i = kit.only(L, l => l === '    const r=await fetch(SB_URL+"/rest/v1/traits?select="+(select||"*")+"&collection_id=eq."+c.id', 'the fetch', fn());
  if (L[i + 1] !== '      +"&order=id.asc&limit="+PULL_PAGE+"&offset="+from,{headers:h});') throw new Error('the fetch moved');
  if (L[i + 2] !== '    if(!r.ok) return {rows:out, ok:false, truncated:false};') throw new Error('the answer moved');
  if (L[i + 3] !== '    const batch=await r.json();') throw new Error('the body moved');
  kit.replace(L, { start: i, end: i + 3 }, [
    '    /* A DROPPED CONNECTION IS AN ANSWER TOO. Uncaught, it left the pull',
    '       before anything was said, and nothing catches it further up. */',
    '    let r=null, batch=null;',
    '    try{',
    '      r=await fetch(SB_URL+"/rest/v1/traits?select="+(select||"*")+"&collection_id=eq."+c.id',
    '        +"&order=id.asc&limit="+PULL_PAGE+"&offset="+from,{headers:h});',
    '    }catch(_){ return {rows:out, ok:false, truncated:false, unreachable:true}; }',
    '    if(!r.ok) return {rows:out, ok:false, truncated:false};',
    '    try{ batch=await r.json(); }catch(_){ return {rows:out, ok:false, truncated:false, unreachable:true}; }',
  ]);
}
{
  const pull = kit.inFunction(L, 'async function cloudPull(opts){');
  const i = kit.only(L, l => l === '  if(!got.ok){ toast("Could not read your collection"); return; }', 'the pull says', pull);
  kit.replace(L, { start: i, end: i }, [
    '  if(!got.ok){ toast(got.unreachable ? CLOUD_OFFLINE_TOAST : "Could not read your collection"); return; }',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch581 written');
