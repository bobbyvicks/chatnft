/* LEAVING A GROUP SAYS WHAT IT STRANDS, AND FREES WHAT IT DOES NOT.

   Found 2026-09-22 by the discovery pass, ranked seventeenth of 39,
   verified through the real interface. The leave question was one fixed
   sentence - "Your own page is untouched, and the project stays for
   everyone else" - whatever this device held for the group. Each group has
   its own database on the device; after leaving, the dropdown lists only
   the groups the server says you are in, so that database cannot be opened
   from any screen, and whatever in it the group never got (a failed save,
   a failed reweight, an unsaved drawing) is out of reach until you rejoin.
   Measured: three unsent traits, the status line counting them, the
   question word for word the one asked with nothing unsent, and afterwards
   all three sitting in chatnft.ws.team7 with no way to them. The same
   database was never deleted either: 66 MB kept per group left.

   Before the question, the group's database is read for what the group
   has not got - traits and references not marked sent, and unsaved
   drawings - and the question names them and says to press Cancel and Save
   to cloud first. A leave with nothing unsent then deletes the group's
   copy on this device; a leave with something unsent keeps it, and says
   so, because deleting it would destroy the very work the question was
   about. Being removed by the owner is not changed here: that person's
   unsent work is theirs, and deleting it behind their back would be worse
   than the space it takes. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const fnR = () => kit.inFunction(L, 'async function wsLeave(){');

{
  const i = at('  if(!confirm("Leave this group project? Your own page is untouched, and the project stays for everyone else.")) return;', 'the question', fnR());
  kit.replace(L, { start: i, end: i }, [
    '  /* WHAT THIS DEVICE HOLDS THAT THE GROUP HAS NOT GOT. After leaving, the',
    '     group\'s database cannot be opened from any screen, so anything unsent',
    '     in it is out of reach until a rejoin - and the question used to be one',
    '     fixed sentence whatever was there (measured: three unsent traits, the',
    '     same words as with none). */',
    '  const leaving=activeWs, dbName=wsDbName();',
    '  let unsent=[], drawings=0;',
    '  try{',
    '    const all=await dbAll();',
    '    unsent=all.filter(i=>(i.kind==="trait"||i.kind==="ref")&&!i.synced).map(i=>i.name);',
    '    drawings=all.filter(i=>i.kind==="autosave"&&i.traitId).length;',
    '  }catch(_){ unsent=[]; drawings=0; }',
    '  const held=[];',
    '  if(unsent.length) held.push(unsent.length+" change"+(unsent.length===1?"":"s")+" the group has not got ("',
    '    +unsent.slice(0,3).join(", ")+(unsent.length>3?" and "+(unsent.length-3)+" more":"")+")");',
    '  if(drawings) held.push(drawings+" unsaved drawing"+(drawings===1?"":"s"));',
    '  const keeps=held.length>0;',
    '  if(!confirm(keeps',
    '    ? "Leave this group project? This device has "+held.join(" and ")+"."',
    '      +" After leaving you cannot open them unless you rejoin - press Cancel and Save to cloud first,"',
    '      +" or OK to leave anyway (they stay on this device). The project stays for everyone else."',
    '    : "Leave this group project? Your own page is untouched, and the project stays for everyone else.")) return;',
  ]);
}
{
  const i = at('    await wsRender();', 'after the switch', fnR());
  const j = at('    toast("Left the project");', 'the toast', fnR());
  if (j !== i + 1) throw new Error('the leave tail moved');
  kit.replace(L, { start: i, end: j }, [
    '    await wsRender();',
    '    /* NOTHING UNSENT: the group\'s copy on this device goes - 66 MB a group,',
    '       measured, kept for good before this. Something unsent: it stays, and',
    '       this says so, because deleting it would destroy what the question',
    '       was about. */',
    '    let freed=false;',
    '    if(!keeps && leaving && dbName && dbName!==DBN){',
    '      freed=await new Promise(res=>{',
    '        try{',
    '          const q=indexedDB.deleteDatabase(dbName);',
    '          q.onsuccess=()=>res(true); q.onerror=()=>res(false); q.onblocked=()=>res(false);',
    '        }catch(_){ res(false); }',
    '      });',
    '    }',
    '    toast(keeps ? "Left the project - what the group has not got is kept on this device"',
    '      : freed ? "Left the project, and cleared its copy from this device" : "Left the project");',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const a = code.indexOf('async function wsLeave(){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  for (const s of ['const leaving=activeWs, dbName=wsDbName();', 'indexedDB.deleteDatabase(dbName)', 'if(!keeps && leaving && dbName && dbName!==DBN){'])
    if (body.indexOf(s) < 0) throw new Error('missing: ' + s);
  if (body.indexOf('const leaving=activeWs') > body.indexOf('await wsSwitch(null)')) throw new Error('the name is read after the switch');
  if (body.indexOf('deleteDatabase') < body.indexOf('await wsSwitch(null)')) throw new Error('the database is deleted while still open');
});

fs.renameSync(TMP, FILE);
console.log('patch544 written, ' + grew + ' bytes');
