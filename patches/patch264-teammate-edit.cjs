/* A TEAMMATE'S EDIT NEVER ARRIVES.

   Asked for: friends are about to be invited to make edits, "i want their
   updates to actually stay on the site". Traced end to end, they do not.

   SAVING AN EDIT CHANGES THE ROW ID. cloudSaveOne DELETEs the row and POSTs a
   new one - the comment says so, "Replacing the row this record came from" -
   so an edited trait comes back with an id nobody has seen before.

   THE PULL MATCHES TEAMMATES' WORK BY THAT ID. held is keyed on rowId, so an
   edited trait misses it, and what happens next depends only on which way it
   was pulled:

     automatic sync (keepMine:true)  the name/layer/status is already taken
                                     here, so it `continue`s - their image is
                                     never downloaded, and the local copy is
                                     stamped with their new rowId, which makes
                                     it look synced. Their work is gone.
     Load from cloud                 $('cloudpull').onclick=cloudPull passes a
                                     MouseEvent as opts, so keepMine is
                                     undefined and their trait is renamed to
                                     hat-2 and added beside yours.

   One silently discards their edit and the other duplicates it. Neither
   replaces anything, which is what an edit is.

   WHAT IT NOW DOES. A trait is identified the way a person identifies it -
   name, layer, status - and updated_at decides which copy is current.
   updated_at is worth trusting for this: it is maintained by a database
   trigger (traits_touch -> touch_updated_at), not asserted by whichever
   browser wrote last.

   AND IT WILL NOT COST YOU UNPUSHED WORK. `synced` already means exactly "this
   record reached the server and has not been edited since" - saveTrait
   rebuilds a record without it - so a local copy that is NOT synced has
   changes of its own. Theirs is newer AND mine is synced, take theirs. Theirs
   is newer and mine is not, keep mine and say so: that is a real disagreement
   between two people and it is not the sync's to settle quietly.

   rowAt is the row's updated_at as of the pull that produced this copy. It is
   what "newer" is measured against, and without it every pull would look like
   an incoming edit. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function cloudPull(opts){');

/* ---- CHECKS ------------------------------------------------------ */
const heldLine = kit.only(L,
  l => l === '  const held=new Map(existing.filter(i=>i.rowId).map(i=>[i.rowId,i]));',
  'the rowId index', fn);
const keepMine = kit.only(L, l => l === '    if(opts.keepMine && taken.has(baseId)){', 'the keepMine branch', fn);
const keepEnd = kit.only(L, l => l === '      if(cur) repair.push({oldId:cur.id,record:shelfCore.mergeRemoteShelfRecord(cur,row,taken)});',
  'the keepMine repair', fn);
if (keepEnd !== keepMine + 5) throw new Error('the keepMine branch is not shaped as assumed');
if (L[keepEnd + 1] !== '      continue;') throw new Error('the keepMine branch does not continue');
if (L[keepEnd + 2] !== '    }') throw new Error('the keepMine branch does not close');
const recLine = kit.only(L, l => l === '        const rec={id:w.id, rowId:w.row.id, path:w.row.path,', 'the pulled record', fn);
const repairPut = kit.only(L, l => l === '      if(rp.oldId!==rp.record.id) await dbDel(rp.oldId);', 'the repair write', fn);
const heldRepair = kit.only(L, l => l === '      repair.push({oldId:cur.id,record:refreshed});', 'the held repair', fn);

/* ---- WRITE, bottom upward ---------------------------------------- */

/* 4. The pulled record remembers which version of the row it is. */
kit.replace(L, { start: recLine, end: recLine }, [
  '        /* rowAt is the row\'s updated_at as of this pull, and it is what',
  '           "somebody else has edited this since" is measured against. Without',
  '           it every pull would read as an incoming edit, or none would. */',
  '        const rec={id:w.id, rowId:w.row.id, path:w.row.path, rowAt:w.row.updated_at||null,',
]);

/* 3. The repair path carries rowAt too, or a trait that was merged rather than
      downloaded would never learn which version it holds. */
kit.replace(L, { start: repairPut, end: repairPut }, [
  '      /* rowAt on the merged record as well. A trait that came back through',
  '         a metadata merge rather than a download still has to know which',
  '         version of the row it is, or the next pull cannot tell whether the',
  '         server has moved on. */',
  '      if(rp.rowAt!==undefined) rp.record.rowAt=rp.rowAt;',
  '      if(rp.oldId!==rp.record.id) await dbDel(rp.oldId);',
]);

/* 2. The branch that used to throw their edit away. */
kit.replace(L, { start: keepMine, end: keepEnd + 2 }, [
  '    /* THE SAME TRAIT, ARRIVING AS A DIFFERENT ROW. Saving an edit deletes',
  '       the row and inserts a new one, so a teammate\'s edit always has an id',
  '       nobody here has seen. Matching only on rowId therefore missed every',
  '       edit anybody ever made: with keepMine it kept the local copy and',
  '       stamped it with their new rowId, and without it their version arrived',
  '       renamed to hat-2 beside yours.',
  '',
  '       So the trait is identified the way a person identifies it - name,',
  '       layer, status - and updated_at settles which copy is current. That',
  '       column is maintained by a database trigger rather than by whichever',
  '       browser wrote last, which is what makes it worth deciding on. */',
  '    if(taken.has(baseId)){',
  '      const cur=byId.get(baseId);',
  '      if(!cur){ continue; }',
  '      const theirs=row.updated_at||null;',
  '      const ours=cur.rowAt||null;',
  '      const newer=!!theirs && (!ours || theirs>ours);',
  '      if(newer && cur.synced){',
  '        /* Theirs is newer and nothing here is unsaved, so their image is',
  '           downloaded over this copy. replaces carries the local id so the',
  '           puller overwrites rather than adding a second one. */',
  '        taken.add(baseId);',
  '        wanted.push({row:row, id:cur.id, name:cur.name, layer:layer, status:status,',
  '          replaces:cur.id, incoming:true});',
  '        continue;',
  '      }',
  '      if(newer && !cur.synced){',
  '        /* Two people changed the same trait and one of them is sitting here',
  '           unsaved. Taking theirs would destroy work this device never sent,',
  '           which is the one thing pulling must not do, so it is counted and',
  '           named instead of being decided quietly. */',
  '        clashed.push(cur.name);',
  '      }',
  '      repair.push({oldId:cur.id,record:shelfCore.mergeRemoteShelfRecord(cur,row,taken),',
  '        rowAt:(newer&&!cur.synced)?ours:theirs});',
  '      continue;',
  '    }',
]);

/* 1. The indexes and the counters. */
kit.replace(L, { start: heldLine, end: heldLine }, [
  '  const held=new Map(existing.filter(i=>i.rowId).map(i=>[i.rowId,i]));',
  '  /* Traits a teammate changed on this pull, and traits where their change',
  '     and an unsaved one here disagree. Counted so the pull can SAY so - an',
  '     edit that arrives silently is indistinguishable from one that did not. */',
  '  const clashed=[];',
]);

/* And the held-by-rowId path records the version it just saw. */
const heldNow = kit.only(L, l => l === '      repair.push({oldId:cur.id,record:refreshed});', 'the held repair, after', fn);
kit.replace(L, { start: heldNow, end: heldNow }, [
  '      repair.push({oldId:cur.id,record:refreshed,rowAt:row.updated_at||null});',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (code.indexOf('const newer=!!theirs && (!ours || theirs>ours);') < 0)
    throw new Error('nothing compares the two versions');
  if (code.indexOf('replaces:cur.id, incoming:true});') < 0)
    throw new Error('a newer version is not queued for download');
  /* The guard that protects unsaved work is CODE, not a comment about it. */
  if (code.indexOf('if(newer && cur.synced){') < 0) throw new Error('the synced guard did not land');
  if (code.indexOf('clashed.push(cur.name);') < 0) throw new Error('a clash is not recorded');
  /* rowAt really travels, or "newer" has nothing to compare against. */
  if (code.indexOf('rowAt:w.row.updated_at||null') < 0) throw new Error('a downloaded record has no rowAt');
  if (code.indexOf('rp.record.rowAt=rp.rowAt;') < 0) throw new Error('a merged record has no rowAt');
  /* The old branch is gone rather than sitting unreachable beneath the new. */
  if (has('    if(opts.keepMine && taken.has(baseId)){') !== 0)
    throw new Error('the keepMine branch is still there');
});

console.log('index.html grew by ' + grew + ' bytes');
