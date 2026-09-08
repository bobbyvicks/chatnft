/* PREDICTIONS for the rename, written before the run.

   The one that matters is the first. The account name is half of the address
   this account signs in with; the copy of it in the metadata is only a copy.
   A rename that wrote there would change what the group sees, leave the login
   untouched, and leave nothing able to say which of the two was right - so
   the test that reads the request body has to be able to fail when it does.

   The last mutant is the control. It changes wording the tests are not
   supposed to be pinning, and predicts NOTHING moves. A suite where every
   mutant reds something is a suite that has memorised the file. */
const { runMutants } = require('./mutrun.cjs');

process.exit(runMutants({
  file: 'index.html',
  spec: 'tests/setname.spec.js tests/updates.spec.js',
  ntests: 23,
  mutants: [
    {
      name: 'the rename also writes the account name',
      find: '      body:JSON.stringify({data:{name:name}})});',
      with: '      body:JSON.stringify({data:{name:name, username:name}})});',
      kills: ['AND IT DOES NOT TOUCH THE NAME YOU SIGN IN WITH',
        'somebody who never chose a name starts from an empty box'],
    },
    {
      name: 'an empty name is allowed through',
      find: '  if(!name){ toast("A name cannot be empty"); return; }',
      with: '  if(!name){ toast("A name cannot be empty"); }',
      kills: ['an empty name is refused, and nothing is sent'],
    },
    {
      name: 'the length limit is off by one',
      find: '  if(name.length>MAX_NAME){ toast("Keep it under "+MAX_NAME+" characters"); return; }',
      with: '  if(name.length>=MAX_NAME){ toast("Keep it under "+MAX_NAME+" characters"); return; }',
      kills: ['exactly at the limit is allowed'],
    },
    {
      name: 'the box is seeded from the account name',
      find: '  const was=meta.name?String(meta.name):"";',
      with: '  const was=meta.name?String(meta.name):String(meta.username||"");',
      kills: ['somebody who never chose a name starts from an empty box'],
    },
    {
      name: 'cancelling is treated as text',
      find: '  if(typed===null) return;',
      with: '  if(typed===undefined) return;',
      kills: ['backing out of the box changes nothing'],
    },
    {
      name: 'the same name is sent again anyway',
      find: '  if(name===was){ toast("That is already your name"); return; }',
      with: '  if(name===was){ toast("That is already your name"); }',
      kills: ['re-typing the name you already have is not a change'],
    },
    {
      name: 'a refusal also claims it worked',
      find: '      toast(authSays(j,"Could not change your name")); return; }',
      with: '      toast(authSays(j,"Could not change your name")); }',
      kills: ['a server that refuses says so, and does not claim it worked'],
    },
    {
      name: 'your own rename leaves the stale name cached',
      find: '    memberNames=null; memberNamesFor=null;\n    await cloudRender();',
      with: '    await cloudRender();',
      kills: ['and the group is asked again who everybody is'],
    },
    {
      name: 'the panel shows the login handle again',
      find: '        for(const row of await r.json()) m.set(row.user_id, row.display_name||null);',
      with: '        for(const row of await r.json()) m.set(row.user_id, row.username||null);',
      kills: ['names the person, the trait and how long ago',
        'a failed name lookup is not remembered',
        'and Check again asks who everybody is'],
    },
    {
      name: 'Check again keeps the names it already had',
      find: '  if(again) again.onclick=()=>{\n    memberNames=null; memberNamesFor=null;\n    renderUpdates();\n  };',
      with: '  if(again) again.onclick=()=>{\n    renderUpdates();\n  };',
      kills: ['and Check again asks who everybody is'],
    },
    {
      name: 'CONTROL: the wording of the question changes',
      find: '  const typed=prompt("What should your group call you?",was);',
      with: '  const typed=prompt("What should the group call you?",was);',
      kills: [],
    },
  ],
}));
