/* A SAVE, A WEIGHT, A STATUS CHANGE AND A DELETE ACT ON THE RECORD AS IT IS
   STORED, NOT ON THE COPY THE EDITOR OR THE CARD REMEMBERED.

   Found by the reviews of the auto-save design (2026-09-25), and live today
   in a group. A group save deletes the trait's row and inserts a new one,
   and cloudSyncOne writes the new row id into the STORE. The editor's
   openRec is set to the record before the send and never learns it, and a
   card's copy was drawn before the send landed. So, in a group:

   - SAVE, KEEP DRAWING, SAVE AGAIN: the second save carried openRec's row
     id, the deleted one. Its delete matched nothing, its insert met the
     trait's own new row in the identity index (409 on the first attempt),
     and it came back "here only - refused". The picture file had already
     been overwritten at the same path, but the row was not touched, so no
     other device downloaded it - an edit that shows here and nowhere else.
     And the stale id went into the store, so every later Save to cloud
     was refused the same way until a reload's pull repaired it.
   - A STATUS CHANGE from a card drawn before the send: the move dropped
     the old row by the stale id, which matched nothing, so the server kept
     the trait twice - the old status and the new.
   - A WEIGHT from such a card: the PATCH by the stale id matched no row.
   - A DELETE from such a card: the delete by the stale id matched nothing,
     "the group still has it", and it came back on the next load.

   Each now reads the record from the store first, and takes the row id -
   and in the editor the weight, the review entry and the shelf position,
   which can also have moved since the trait was opened - from there. The
   copy the person was looking at still decides which trait it is. */
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
const swapRun = (lines, to, label) => {
  const i = at(lines[0], label);
  for (let k = 1; k < lines.length; k++) if (L[i + k] !== lines[k]) throw new Error(label + ': line ' + k + ' is ' + JSON.stringify(L[i + k]));
  kit.replace(L, { start: i, end: i + lines.length - 1 }, to);
};

/* The editor save. */
swapRun([
  "    const rec={id:id, kind:'trait', name, layer, status, blob,",
  "      w:c.width, h:c.height, at:Date.now(),",
  "      shelfOrder:openRec&&openRec.layer===layer&&typeof openRec.shelfOrder===\"number\"",
  "        ? openRec.shelfOrder : shelfCore.nextShelfOrder(shelfItems,layer)};",
], [
  "    /* THE TRAIT AS IT IS STORED NOW (patch593), not as it was when it was",
  "       opened. A group save gives the trait a new row and writes its id to",
  "       the store only, so openRec's row id is the deleted one from the first",
  "       save on: the second save's insert met the trait's own row (409) and",
  "       was refused, and no other device ever saw that edit. The weight and",
  "       the shelf position can have moved since the opening too. openRec",
  "       still says WHICH trait; the store says what it holds. */",
  "    let base=openRec;",
  "    if(openRec){ try{ const s=await dbGet(openRec.id); if(s&&s.kind===openRec.kind) base=s; }catch(_){ } }",
  "    const rec={id:id, kind:'trait', name, layer, status, blob,",
  "      w:c.width, h:c.height, at:Date.now(),",
  "      shelfOrder:base&&base.layer===layer&&typeof base.shelfOrder===\"number\"",
  "        ? base.shelfOrder : shelfCore.nextShelfOrder(shelfItems,layer)};",
], 'the save record');
swapRun([
  "    if(openRec){",
  "      if(typeof openRec.rarity===\"number\") rec.rarity=openRec.rarity;",
  "      if(openRec.rowId) rec.rowId=openRec.rowId;",
], [
  "    if(base){",
  "      if(typeof base.rarity===\"number\") rec.rarity=base.rarity;",
  "      if(base.rowId) rec.rowId=base.rowId;",
], 'the save carries');
swap("      if(openRec.reviewId) rec.reviewId=openRec.reviewId;", [
  "      if(base.reviewId) rec.reviewId=base.reviewId;",
], 'the save review entry');
swap("      const shared = moved ? await cloudMoveOne(openWas,rec,why)", [
  "      /* The old row by the id the store holds (patch593), or the drop misses",
  "         the live row and the group keeps the trait under both names. */",
  "      const shared = moved ? await cloudMoveOne(base||openWas,rec,why)",
], 'the save move');

/* The weight. */
swap("  const cur = typeof rec.rarity===\"number\" ? rec.rarity : RAR_UNSET;", [
  "  /* THE RECORD AS STORED (patch593). A card drawn before a group send",
  "     landed carries the row id that send replaced, and the PATCH by it",
  "     matched nothing. */",
  "  { let s=null; try{ s=await dbGet(rec.id); }catch(_){ s=null; } if(s&&s.kind===rec.kind) rec=s; }",
  "  const cur = typeof rec.rarity===\"number\" ? rec.rarity : RAR_UNSET;",
], 'the weight');

/* The status change: the stored record is the one moved. */
{
  const i = at("    let now=null; try{ now=await dbGet(t.id); }catch(_){ now=null; }", 'status read');
  if (L[i - 1] !== '  {') throw new Error('the status read block moved: ' + L[i - 1]);
  kit.replace(L, { start: i - 1, end: i }, [
    "  /* Kept past the check (patch593): the move is built from the STORED",
    "     record, whose row id is the live one - the card's copy can carry the",
    "     id a group send has since replaced, and dropping the old row by it",
    "     left the server holding the trait under both statuses. */",
    "  let now=null;",
    "  {",
    "    try{ now=await dbGet(t.id); }catch(_){ now=null; }",
  ]);
}
swap("  let moved={...t, id:\"t_\"+(asName||t.name)+\"_\"+t.layer+\"_\"+next, status:next, name:asName||t.name};", [
  "  let moved={...now, id:\"t_\"+(asName||t.name)+\"_\"+t.layer+\"_\"+next, status:next, name:asName||t.name};",
], 'status moved');
swap("    moved={...t, id:\"t_\"+free+\"_\"+t.layer+\"_\"+next, status:next, name:free};", [
  "    moved={...now, id:\"t_\"+free+\"_\"+t.layer+\"_\"+next, status:next, name:free};",
], 'status moved free');
swap("  const shared=await cloudMoveOne(t,moved,why);", [
  "  const shared=await cloudMoveOne(now,moved,why);",
], 'status cloud move');

/* The delete. */
swap("async function dbDelShared(rec){", [
  "async function dbDelShared(rec){",
  "  /* THE ROW ID THE STORE HOLDS (patch593). A card drawn before a group",
  "     send landed carries the id that send replaced; the delete by it",
  "     matched nothing and the trait came back on the next load. */",
  "  { let s=null; try{ s=await dbGet(rec.id); }catch(_){ s=null; } if(s&&s.kind===rec.kind) rec=s; }",
], 'the delete');

kit.save(doc, ({ code }) => {
  if (code.indexOf('if(openRec.rowId) rec.rowId=openRec.rowId;') >= 0) throw new Error('the save still takes the row id from openRec');
  if (code.indexOf('await cloudMoveOne(t,moved,why)') >= 0) throw new Error('the status change still drops by the card copy');
  for (const must of ['if(base.rowId) rec.rowId=base.rowId;', 'await cloudMoveOne(base||openWas,rec,why)', 'await cloudMoveOne(now,moved,why)',
    'let moved={...now,', 'moved={...now,'])
    if (code.indexOf(must) < 0) throw new Error('missing: ' + must);
  if (code.split('try{ s=await dbGet(rec.id); }catch(_){ s=null; } if(s&&s.kind===rec.kind) rec=s;').length - 1 !== 2) throw new Error('the weight and the delete read the stored record');
});
fs.renameSync(TMP, FILE);
console.log('patch593 written');
