/* A REFRESH NEVER ASKED THE GROUP FOR ANYTHING.

   Reported: a teammate reordered traits and moved one to another layer, and
   after a refresh none of it was there.

   MEASURED, on the live database. The work is on the server - one collection,
   288 rows in the Market Makers team, rows updated all afternoon - and the
   pull machinery handles exactly this case: cloudPull matches a row by its
   SERVER ID, which survives a rename and a layer move, and hands it to
   mergeRemoteShelfRecord, which applies the refreshed layer and shelf order
   without touching local artwork. There is a node test for that.

   Nothing calls it. On a signed-in page load cloudRender does bootLocal(),
   which renders whatever this browser already had, and wsRender(), which
   fills the project dropdown. The only two things that fetch are wsSwitch -
   changing the dropdown or joining - and the Load from cloud button. There is
   no interval, no focus handler and no visibilitychange handler; grepped.

   So the group's work arrived, the code that would show it works, and the
   refresh a person actually performs runs neither.

   The catch-up moves out of wsSwitch and is called on load as well. One
   function, so the two paths cannot drift into disagreeing about what
   "opening the group" means.

   AND THE DELETION PASS GAINS A GUARD. It removes local traits the server no
   longer has, which is right - otherwise one person's delete is undone by the
   next person to open the project. cloudPull returns an EMPTY set when the
   collection reads as zero rows, and until now that meant "everybody deleted
   everything": on a switch, rare; on every page load, a standing offer to
   erase 288 synced traits on one odd read. A server that reports nothing at
   all while this device holds hundreds of records it believes it sent is far
   more likely to be a bad read than an emptied collection, so that case now
   changes nothing and says so. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the catch-up becomes a function ---------------------------- */
swap(block([
  '    try{',
  '      const onServer=await cloudPull({quiet:true, keepMine:true});',
  '      if(onServer){',
  '        let gone=0;',
  '        for(const it of await dbAll()){',
  '          if(it.kind!=="trait"&&it.kind!=="ref") continue;',
  '          if(!it.synced) continue;',
  '          if(onServer.has(shelfCore.recordKey(it))) continue;',
  '          await dbDel(it.id); gone++;',
  '        }',
  '        if(gone) toast(gone+" removed by someone else");',
  '      }',
  '    }catch(_){}',
  '    await renderShelf();',
]), block([
  '    await groupCatchUp();',
]));

/* ---- 2. and gains a home, and a guard ------------------------------ */
swap(block([
  'async function wsSwitch(id){',
]), block([
  '/* Take whatever the group has: their edits, their draw order, the layer they',
  '   moved something to, and anything they removed.',
  '',
  '   ONE FUNCTION FOR TWO CALLERS. Opening the project from the dropdown and',
  '   opening the page are the same act as far as a person is concerned, and',
  '   only the first of them used to do this - so a teammate\'s reorder was on',
  '   the server, the code to apply it worked, and a refresh ran none of it.',
  '',
  '   Failures are swallowed on purpose: this runs at boot, and a group that',
  '   cannot be reached must leave somebody with their own work on screen',
  '   rather than an error where the shelf should be. */',
  'async function groupCatchUp(){',
  '  try{',
  '    const onServer=await cloudPull({quiet:true, keepMine:true});',
  '    if(onServer){',
  '      /* NOT WHEN THE SERVER SAYS NOTHING AT ALL. Anything this device holds',
  '         that the group no longer has was removed by somebody, and putting it',
  '         back on every open is how one person\'s delete gets undone by the',
  '         next person to look. But an empty answer beside hundreds of records',
  '         this device believes it SENT is a read that went wrong far more',
  '         often than it is a collection somebody emptied - and now that this',
  '         runs on every page load rather than only on a switch, that would be',
  '         a standing offer to erase the lot. */',
  '      const mine=(await dbAll()).filter(i=>(i.kind==="trait"||i.kind==="ref")&&i.synced);',
  '      if(!onServer.size && mine.length){',
  '        toast("The group came back empty, so nothing was removed here."',
  '          +" Press Load from cloud if it really is empty.");',
  '      } else {',
  '        let gone=0;',
  '        for(const it of mine){',
  '          if(onServer.has(shelfCore.recordKey(it))) continue;',
  '          await dbDel(it.id); gone++;',
  '        }',
  '        if(gone) toast(gone+" removed by someone else");',
  '      }',
  '    }',
  '  }catch(_){}',
  '  await renderShelf();',
  '}',
  '',
  'async function wsSwitch(id){',
]));

/* ---- 3. a page load asks too --------------------------------------- */
swap(block([
  '  if(!inn){ $("teamrow").hidden=true; $("teamnote").hidden=true; }',
  '  if(inn) cloudStatus(u);',
  '  return u;',
  '}',
]), block([
  '  if(!inn){ $("teamrow").hidden=true; $("teamnote").hidden=true; }',
  '  if(inn) cloudStatus(u);',
  '  /* THE REFRESH A PERSON ACTUALLY PERFORMS. Everything above this renders',
  '     what this browser already had; nothing asked the group for anything, so',
  '     a teammate\'s reorder or layer move sat on the server unseen until',
  '     somebody thought to press Load from cloud.',
  '',
  '     Once per page, not per call - cloudRender runs again on every auth',
  '     change, and pulling the collection each time would download a teammate\'s',
  '     edits repeatedly for nothing. Not awaited, so the shelf that is already',
  '     on screen is not held back by the network; groupCatchUp re-renders when',
  '     it lands. */',
  '  if(inn && activeWs && !groupCaughtUp){ groupCaughtUp=true; groupCatchUp(); }',
  '  return u;',
  '}',
]));

/* The flag lives beside the one bootLocal already uses, for the same reason. */
swap('function bootLocal(){' + NL + '  if(localBooted) return;',
  block([
    '/* Set once a page load has asked the group for its changes, so the several',
    '   cloudRender calls an auth handshake makes do not each pull the whole',
    '   collection. Same shape as localBooted below, and for the same reason. */',
    'let groupCaughtUp=false;',
    'function bootLocal(){',
    '  if(localBooted) return;',
  ]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function groupCatchUp(){', 'let groupCaughtUp=false;',
  '  if(inn && activeWs && !groupCaughtUp){ groupCaughtUp=true; groupCatchUp(); }',
  '    await groupCatchUp();',
  '      if(!onServer.size && mine.length){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* ONE copy of the catch-up. Two would be two answers to "what does opening
   the group do", which is the drift this extraction exists to prevent. */
const pulls = code.split('await cloudPull({quiet:true, keepMine:true})').length - 1;
if (pulls !== 1) throw new Error('expected one quiet pull, found ' + pulls);
const dels = code.split('await dbDel(it.id); gone++;').length - 1;
if (dels !== 1) throw new Error('expected one deletion pass, found ' + dels);

/* The manual button is untouched: it is the way to force the case the guard
   above declines to decide. */
if (code.indexOf("$('cloudpull').onclick=cloudPull;") < 0)
  throw new Error('Load from cloud changed');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
