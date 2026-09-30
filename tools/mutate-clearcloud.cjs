/* PREDICTIONS for Remove from server (clearing the cloud), written before the run.

   REBUILT 2026-09-29 (follow-up batch T, item S11). The version committed in
   37c8587 had never run as committed on the page it was meant for: it
   expected 12 tests where clearcloud.spec.js has 14, and on the page at
   91eb861 five of its nine anchors matched nothing (the sweep now takes the
   action's home, relightUnsynced moved out of clearCloudNow and lost two
   spaces of indent, and the empty-row test gained a move check). Two of its
   predictions were also wrong against the tests as they stand, by reading:
   "the pictures are never swept" cannot redden the fileDeleteFails test (the
   files are still listed afterwards either way, so the note says "still in
   storage" either way), and "it stops asking" reddens every test that counts
   the confirm, not only Cancel's.

   It now runs the three specs that say what Remove from server does:
   clearcloud.spec.js (what a clear does, as the owner), removeowner.spec.js
   (Task 17: who may press it, and a clear stays on the project it was
   pressed on) and removefromserversays.spec.js (follow-up D: the deadline on
   the role read, and a group with no owner). 14 + 18 + 11 = 43 tests.

   This deletes a whole collection off a server that other people share, so
   the mutants are aimed at the ways it could be quietly wrong rather than
   loudly broken:

     it deletes the rows before the pictures they name, stranding the images
       for ever - which is what every hand-run clear did, and why the live
       bucket holds 1.14 GB belonging to nothing;
     it leaves the local synced flags alone, so Save to cloud afterwards
       reports success and uploads nothing;
     it reports success without asking the server what is actually left;
     a member clears the group's project, or a read that failed is taken as
       an answer (Task 17, follow-up D);
     the clear goes on after the page moved, on the answer for the project
       left (Task 17, fix round 1).

   Titles are matched as substrings. The control changes the progress
   message, which nothing should be pinning. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/clearcloud.spec.js tests/removeowner.spec.js tests/removefromserversays.spec.js',
  ntests: 43,
  mutants: [
    {
      name: 'the pictures are never swept',
      find: '    files=await cloudSweep(team,c,[],s0Home);',
      with: '    files=0;',
      kills: ['THE PICTURES GO BEFORE THE ROWS THAT NAME THEM',
        'and it takes everything under the collection, not a diff',
        'but files with no rows left are still worth clearing',
        '1. group page, owner: the role is read once',
        '5. personal page: no role read',
        '17. control: the same hold with no move',
        'P6: a member of a group whose owner has left may remove it',
        'P6: the owner is asked nothing more than before'],
    },
    {
      name: 'the sweep keeps something, so it is a tidy rather than a clear',
      find: '    files=await cloudSweep(team,c,[],s0Home);',
      with: '    files=await cloudSweep(team,c,["team1/c1/hats/cap.png"],s0Home);',
      kills: ['and it takes everything under the collection, not a diff'],
    },
    {
      name: 'the local synced flag is left behind',
      find: '    delete next.synced; delete next.rowId; delete next.path;',
      with: '    delete next.rowId; delete next.path;',
      kills: ['THE LOCAL COPY IS KEPT, and knows it is no longer uploaded',
        'AND AN EMPTY SERVER STILL FIXES A BROWSER THAT THINKS OTHERWISE'],
    },
    {
      name: 'the clear takes the local copy with it',
      find: '    try{ await dbPut(next); n++; }catch(_){}',
      with: '    try{ await dbDel(rec.id); n++; }catch(_){}',
      kills: ['THE LOCAL COPY IS KEPT, and knows it is no longer uploaded',
        'AND AN EMPTY SERVER STILL FIXES A BROWSER THAT THINKS OTHERWISE'],
    },
    {
      name: 'it stops asking',
      find: '  if(!confirm("Remove this project from the server?"',
      with: '  if(false&&confirm("Remove this project from the server?"',
      kills: ['it asks first, with the numbers and who it reaches',
        'and Cancel touches nothing at all',
        'but files with no rows left are still worth clearing',
        '1. group page, owner: the role is read once',
        '5. personal page: no role read',
        '17. control: the same hold with no move',
        'P6: a member of a group whose owner has left may remove it',
        'P6: the owner is asked nothing more than before'],
    },
    {
      name: 'success is claimed rather than read back',
      find: "    bits.push(rowsGone&&leftRows===0 ? \"The server copy is gone\"",
      with: "    bits.push(true ? \"The server copy is gone\"",
      kills: ['and a server that keeps the rows is not reported as cleared'],
    },
    {
      name: 'no rows is taken to mean nothing is there',
      find: '    const left=await cloudFilesLeft(team,c);\n    if(moved()) return;\n    if(!left){',
      with: '    const left=0;\n    if(moved()) return;\n    if(!left){',
      /* removeowner 15 and 16 hold the pictures read; with none made, the
         hold is never reached and they say so. */
      kills: ['but files with no rows left are still worth clearing',
        '15. owner, rows gone and pictures left',
        '16. owner, nothing on the server'],
    },
    {
      name: 'the button is not held while it runs',
      find: '  const btn=$("cloudclear"); if(btn) btn.disabled=true;',
      with: '  const btn=$("cloudclear");',
      kills: ['and it cannot be pressed twice at once'],
    },
    {
      /* Task 17: on a group page, only the owner - or, after follow-up D, a
         member of a group with no owner. */
      name: 'a member may clear the group\'s project',
      find: '      if(role!=="owner"&&role!=="ownerless"){ say(CLOUD_OWNER_ONLY); return; }',
      with: '      /* mutant: no owner check */',
      kills: ['2. group page, member: only the role read goes out',
        '4. group page, no membership row',
        '6. the owner check comes before the stage-0 hold',
        'P6 control: a member of a group that has an owner',
        'P6: a reply to the owner read that holds any row refuses',
        'P6: no membership row at all'],
    },
    {
      /* A read that failed, or answered nothing by the deadline, is "could
         not check" - not "you are a member". */
      name: 'a role that could not be read is taken as a member\'s',
      find: '      if(role===null){ say(CLOUD_OWNER_UNKNOWN); return; }',
      with: '      /* mutant: a failed read goes on to the owner test */',
      kills: ['3. group page, the role read answers 500',
        'S12: a role read that never answers',
        'S12: a member',
        'P6: the owner read fails'],
    },
    {
      /* Follow-up D (P6): a member may clear a group with no owner. */
      name: 'a group with no owner is still the owner\'s only',
      find: '      if(role!=="owner"&&role!=="ownerless"){ say(CLOUD_OWNER_ONLY); return; }',
      with: '      if(role!=="owner"){ say(CLOUD_OWNER_ONLY); return; }',
      kills: ['P6: a member of a group whose owner has left may remove it'],
    },
    {
      /* Task 17, fix round 1: the owner's answer is for the project shown at
         the press. */
      name: 'the owner\'s answer is used after the page moved during the role read',
      find: '      if(!wsStill(gen)){ say(CLOUD_OWNER_UNKNOWN); return; }',
      with: '      /* mutant: no move check after the role read */',
      kills: ['8. the page moves to another project during the role read'],
    },
    {
      /* Task 17, fix round 1: and every read in clearCloudNow after it. With
         moved() never true, the action's home guards (fix round 4) still stop
         each of these, but later, with other words, and after asking the
         project moved to for its collection - which is how 11 makes one
         there. 12 is a real switch and asserts no note, so it is predicted
         to stay green: the home guard stops that one before any confirm. */
      name: 'the clear follows the page after the owner\'s answer',
      find: '    if(gen===undefined||wsStill(gen)) return false;',
      with: '    if(true) return false;',
      kills: ['9. owner, a move to another group during the stage-0 read',
        '10. owner, a move to another group during sbUser',
        '11. owner, a move during sbUser to a group with no project yet',
        '13. personal page, a move to a group during the stage-0 read',
        '14. owner, a move during the row count',
        '15. owner, rows gone and pictures left',
        '16. owner, nothing on the server'],
    },
    {
      name: 'CONTROL: the progress message changes',
      find: '  say("Clearing the server\\u2026");',
      with: '  say("Clearing the server copy\\u2026");',
      kills: [],
    },
  ],
}));
