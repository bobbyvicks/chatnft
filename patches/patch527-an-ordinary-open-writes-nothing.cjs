/* AN ORDINARY OPEN WRITES NOTHING.

   The comment above cloudPull's repair loop says "Only the ones actually
   missing it, so an ordinary open writes nothing." The loop below it wrote
   every matched row back: a repair entry was pushed for every row whose id
   this device already held, merged from the server's metadata, and put -
   whether or not anything differed. Measured 2026-09-22 on the working
   copy with 311 traits and a server holding exactly what the device held:
   311 record writes per catch-up, which is per page load. Each write is a
   full record including the picture, so on the real collection that is
   the whole project rewritten into IndexedDB on every open, and since
   patch526 every one of those writes also marks its id as touched.

   The repair entry now carries the record the plan was made from, and the
   loop compares the merged record with it on every field a merge can
   change - id, row, path, kind, name, layer, status, weight, order, flag
   and stamp - and writes only when one differs. The stamp counts: a row
   whose only change is a newer updated_at still has to be recorded, or
   the next pull cannot tell whether the server has moved on.

   And the count is said. `repaired` was incremented and read by nothing;
   a teammate's move to another layer, reorder or reweight arrived in
   silence while a re-uploaded picture was announced as "updated by the
   group". The note now says "N changed in place by the group". */
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
const pullR = () => kit.inFunction(L, 'async function cloudPull(opts){');

/* ---- 1. the helper, before cloudPull ------------------------------------- */
{
  const fn = pullR();
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* THE SAME RECORD, on every field a merge from the server can change. The',
    '   picture is not compared: a repair never carries one. */',
    'function sameRepair(a,b){',
    '  const v=(r,k)=>(r&&r[k]!==undefined?r[k]:null);',
    '  for(const k of ["id","rowId","path","kind","name","layer","status","rarity","shelfOrder","synced","rowAt"])',
    '    if(v(a,k)!==v(b,k)) return false;',
    '  return true;',
    '}',
    'async function cloudPull(opts){',
  ]);
}

/* ---- 2. every repair remembers what it was made from --------------------- */
swap('      repair.push({oldId:cur.id,record:refreshed,rowAt:row.updated_at||null});',
  ['      repair.push({oldId:cur.id,record:refreshed,rowAt:row.updated_at||null,was:cur});'], 'the row-id repair', pullR());
swap('      repair.push({oldId:cur.id,record:shelfCore.mergeRemoteShelfRecord(cur,row,taken),',
  ['      repair.push({oldId:cur.id,record:shelfCore.mergeRemoteShelfRecord(cur,row,taken),was:cur,'], 'the name repair', pullR());

/* ---- 3. and writes only when something differs ---------------------------- */
swap('  /* Only the ones actually missing it, so an ordinary open writes nothing. */', [
  '  /* ONLY THE ONES THAT DIFFER, so an ordinary open writes nothing. This',
  '     sentence used to stand above a loop that wrote every matched row back;',
  '     measured, 311 record writes per open on 311 unchanged traits. */',
], 'the old claim', pullR());
swap('      if(rp.rowAt!==undefined) rp.record.rowAt=rp.rowAt;', [
  '      if(rp.rowAt!==undefined) rp.record.rowAt=rp.rowAt;',
  '      if(rp.was && sameRepair(rp.was,rp.record)) continue;',
], 'the compare', pullR());

/* ---- 4. the count is said -------------------------------------------------- */
swap('  if(incoming.length) bits.push(incoming.length+" updated by the group");', [
  '  if(incoming.length) bits.push(incoming.length+" updated by the group");',
  '  /* A move to another layer, a reorder or a reweight by a teammate arrives',
  '     through the repair, not a download, and used to arrive in silence. */',
  '  if(repaired) bits.push(repaired+" changed in place by the group");',
], 'the note', pullR());

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('function sameRepair(a,b){');
  once('sameRepair(', 2);
  once('was:cur', 2);
  once('if(rp.was && sameRepair(rp.was,rp.record)) continue;');
  once('bits.push(repaired+" changed in place by the group")');
  /* The compare comes after rowAt is set on the record and before the write. */
  const a = code.indexOf('if(rp.rowAt!==undefined) rp.record.rowAt=rp.rowAt;');
  const b = code.indexOf('if(rp.was && sameRepair(rp.was,rp.record)) continue;');
  const c = code.indexOf('await dbPut(rp.record);', a);
  if (!(a >= 0 && b > a && c > b)) throw new Error('the compare is not between the stamp and the write');
  /* repaired is now read somewhere other than its own increment. */
  if (times('repaired') < 3) throw new Error('repaired still read by nothing');
});

fs.renameSync(TMP, FILE);
console.log('patch527 written, ' + grew + ' bytes');
