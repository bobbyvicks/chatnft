/* A PULL DECIDED THAT WORK THIS DEVICE NEVER SENT HAD BEEN SENT.

   mergeRemoteShelfRecord refreshes a local record from the server row it came
   from - the layer, the status, the rarity, the shelf order, the row id - and
   returned

     synced: true,

   unconditionally. Nothing on the way in looks at whether the local copy had
   actually reached the server.

   The branch that calls it is "already have this exact row", matched on rowId
   alone, and a record whose upload FAILED still carries its rowId: saveTrait
   copies openRec.rowId onto the rebuilt record - it has to, it is how a delete
   finds the row - and deliberately does not set synced when cloudSyncOne comes
   back null. So a save that could not reach the group leaves exactly the
   record this branch matches.

   AND THE NEXT PAGE LOAD CALLS IT A SENT ONE. groupCatchUp runs a quiet pull
   on every open. The merge keeps the local blob, so the edited pixels are
   still on the device, but the record now claims it reached the server.

   THEN Save to cloud SKIPS IT. Its test is

     if(it.synced && it.rowId && it.path===p){ unchangedSkipped++; ... }

   and for a pixel-only edit the name, layer and status are unchanged, so the
   path it computes is the path the merge just copied in. The item goes into
   "already up to date" and is never uploaded. Pressing the button the failed
   save told you to press is a no-op.

   AND IT DOES NOT DRIFT BACK. Every later open repeats the same repair, so the
   false flag is re-asserted rather than merely left. The only writers of a
   falsy synced are setRarity and relightUnsynced, and relightUnsynced is
   reachable only from Clear the cloud, which wipes the group's copy for
   everyone.

   The warning goes with it: "1 of these is only on this device and nobody else
   in the group can see it", with a Send to group button, becomes "All 1 of
   these are in this group, so everyone in it can see them."

   SO THE FLAG IS CARRIED, NOT MANUFACTURED. synced means this device's bytes
   are on the server, and only an upload can learn that. A merge of the
   server's metadata is not an upload. Everything else the merge does is
   unchanged - it is still the row the record came from, so the row id, the
   path and the shared fields all still come from the row.

   IT FIXES THE OTHER CALL SITE TOO, and that one is worse. The acknowledged-
   clash branch carries the comment "Taking theirs would destroy work this
   device never sent, which is the one thing pulling must not do" - and then
   went through this same merge and stamped that unsent work as sent.

   NOT THE PATH. Keeping remote.path is right even when unsynced: it is where
   the server's file actually is, which is what that field describes. The skip
   test is an AND, so the flag alone decides it.

   NOT cloudStatus EITHER. It compares which paths exist on each side, and an
   edited-but-unsent trait occupies the same path on both, so it will still say
   they match. That is a true answer to the question it asks - which files are
   there - and a different question from whether the bytes agree. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const fn = kit.inFunction(L, '  function mergeRemoteShelfRecord(local, remote, takenIds) {');
  const at = kit.only(L, l => l === '      synced: true,', 'the merged synced flag', fn);
  kit.replace(L, { start: at, end: at }, [
    '      /* CARRIED, NOT MANUFACTURED. This was `synced: true`, which told every',
    '         record that came back through a pull that it had reached the server -',
    '         including one whose upload failed, because a failed save keeps its',
    '         rowId and that is all this branch matches on.',
    '',
    '         synced means the bytes on this device are on the server, and only an',
    '         upload can learn that. A merge of the server metadata is not an',
    '         upload. Measured: save a trait with the connection down, reload, and',
    '         Save to cloud counted it as "already up to date" and uploaded',
    '         nothing - and every later open re-asserted the same flag, so it did',
    '         not drift back on its own either. */',
    '      synced: !!local.synced,',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const mm = kit.inFunction(codeLines, '  function mergeRemoteShelfRecord(local, remote, takenIds) {');
  const mmb = codeLines.slice(mm.start, mm.end + 1).join('\n');
  if (/synced: true,/.test(mmb))
    throw new Error('the merge still decides for itself that the work was sent');
  if (!/synced: !!local\.synced,/.test(mmb))
    throw new Error('the merge does not carry the flag the local record had');
  /* EVERYTHING ELSE STILL COMES FROM THE ROW. The record IS that row, so a
     timid fix that also stopped taking the row id or the shared fields would
     break the thing the merge is for. */
  for (const [needle, why] of [
    ['rowId: remote.id,', 'the record would forget which row it is'],
    ['path: remote.path || local.path,', 'the record would forget where the server file is'],
    ['if (typeof remote.rarity === "number") refreshed.rarity = remote.rarity;', 'a teammate rarity would not arrive'],
    ['if (hasOrder(remote.shelf_order)) refreshed.shelfOrder = remote.shelf_order;', 'a teammate reorder would not arrive'],
  ]) {
    if (mmb.indexOf(needle) < 0)
      throw new Error('the merge stopped refreshing from the row: ' + why);
  }
  /* AND THE SKIP TEST IT FEEDS IS UNTOUCHED, so this is the flag changing and
     not the test being loosened around it. */
  const code = codeLines.join('\n');
  if (!/if\(it\.synced && it\.rowId && it\.path===p\)\{ unchangedSkipped\+\+;/.test(code))
    throw new Error('the push skip test changed, which is not what this fixes');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
