/* PREDICTIONS for clearing the cloud, written before the run.

   This deletes a whole collection off a server that other people share, so the
   mutants are aimed at the three ways it could be quietly wrong rather than
   loudly broken:

     it deletes the rows before the pictures they name, stranding the images
       for ever - which is what every hand-run clear did, and why the live
       bucket holds 1.14 GB belonging to nothing;
     it leaves the local synced flags alone, so Save to cloud afterwards
       reports success and uploads nothing;
     it reports success without asking the server what is actually left.

   The control changes the progress message, which nothing should be pinning. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/clearcloud.spec.js',
  ntests: 12,
  mutants: [
    {
      name: 'the pictures are never swept',
      find: '    files=await cloudSweep(team,c,[]);',
      with: '    files=0;',
      kills: ['THE PICTURES GO BEFORE THE ROWS THAT NAME THEM',
        'and it takes everything under the collection, not a diff',
        'and files it could not remove are named as still there',
        'but files with no rows left are still worth clearing'],
    },
    {
      name: 'the sweep keeps something, so it is a tidy rather than a clear',
      find: '    files=await cloudSweep(team,c,[]);',
      with: '    files=await cloudSweep(team,c,["team1/c1/hats/cap.png"]);',
      kills: ['and it takes everything under the collection, not a diff'],
    },
    {
      name: 'the local synced flag is left behind',
      find: '      delete next.synced; delete next.rowId; delete next.path;',
      with: '      delete next.rowId; delete next.path;',
      kills: ['THE LOCAL COPY IS KEPT, and knows it is no longer uploaded'],
    },
    {
      name: 'the clear takes the local copy with it',
      find: '      try{ await dbPut(next); relit++; }catch(_){}',
      with: '      try{ await dbDel(rec.id); relit++; }catch(_){}',
      kills: ['THE LOCAL COPY IS KEPT, and knows it is no longer uploaded'],
    },
    {
      name: 'it stops asking',
      find: '  if(!confirm("Remove this project from the server?"',
      with: '  if(false&&confirm("Remove this project from the server?"',
      kills: ['and Cancel touches nothing at all'],
    },
    {
      name: 'success is claimed rather than read back',
      find: "    bits.push(rowsGone&&leftRows===0 ? \"The server copy is gone\"",
      with: "    bits.push(true ? \"The server copy is gone\"",
      kills: ['and a server that keeps the rows is not reported as cleared'],
    },
    {
      name: 'no rows is taken to mean nothing is there',
      find: '    const left=await cloudFilesLeft(team,c);\n    if(!left){ say("There is nothing on the server for this project."); return; }',
      with: '    say("There is nothing on the server for this project."); return;',
      kills: ['but files with no rows left are still worth clearing'],
    },
    {
      name: 'the button is not held while it runs',
      find: '  const btn=$("cloudclear"); if(btn) btn.disabled=true;',
      with: '  const btn=$("cloudclear");',
      kills: ['and it cannot be pressed twice at once'],
    },
    {
      name: 'CONTROL: the progress message changes',
      find: '  say("Clearing the server\\u2026");',
      with: '  say("Clearing the server copy\\u2026");',
      kills: [],
    },
  ],
}));
