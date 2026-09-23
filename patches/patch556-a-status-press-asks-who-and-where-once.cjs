/* A STATUS PRESS IN A GROUP ASKS WHO AND WHERE ONCE.

   Found 2026-09-22 by the discovery pass, ranked twenty-ninth of 39. A
   status press, rename or layer move inside a group runs cloudMoveOne: the
   new copy up through cloudSyncOne, then the old row down through
   cloudDropOne. Each asked the server who is signed in and which collection
   this is, so a press made those two requests twice - nine requests in
   series, 1.6 s at 150 ms round trips and 3.2-3.5 s at 300, before the tile
   changed.

   cloudMoveOne now asks once and hands the answers to both, the way
   cloudPush already hands its own to cloudSyncOne. cloudDropOne takes the
   same optional ctx; its other callers pass nothing and ask as before.
   When the question cannot be answered, the upload is handed nothing and
   asks again itself, so the reason it reports - signed out, unreachable,
   no collection - is its own, exactly as before. */
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

{
  const fnR = () => kit.inFunction(L, 'async function cloudMoveOne(oldRec,newRec,why){');
  swap('  const arrived=await cloudSyncOne(fresh,null,why);', [
    '  /* WHO AND WHERE, ONCE. Both halves asked for themselves: nine requests a',
    '     press where seven do. Handed over only when the whole question was',
    '     answered - otherwise the upload asks again and says why it could not. */',
    '  let ctx=null;',
    '  {',
    '    const who=await sbAuthState();',
    '    if(who.state==="in"){',
    '      const team=await cloudTeam();',
    '      const c=team ? await cloudCollection(who.user) : null;',
    '      if(team&&c) ctx={u:who.user, team:team, c:c};',
    '    }',
    '  }',
    '  const arrived=await cloudSyncOne(fresh,ctx,why);',
  ], 'the upload', fnR());
  swap('  const dropped=await cloudDropOne(oldRec);', ['  const dropped=await cloudDropOne(oldRec,ctx);'], 'the removal', fnR());
}
{
  const fnR = () => kit.inFunction(L, 'async function cloudDropOne(rec){');
  swap('  const u=await sbUser(); if(!u) return null;', [
    '  /* ctx: the user, team and collection the caller already has - see',
    '     cloudMoveOne. Every other caller passes nothing and asks here. */',
    '  const u=(ctx&&ctx.u)||await sbUser(); if(!u) return null;',
  ], 'the drop user', fnR());
  swap('  const team=await cloudTeam(); if(!team) return null;', ['  const team=(ctx&&ctx.team)||await cloudTeam(); if(!team) return null;'], 'the drop team', fnR());
  swap('  const c=await cloudCollection(u); if(!c) return null;', ['  const c=(ctx&&ctx.c)||await cloudCollection(u); if(!c) return null;'], 'the drop collection', fnR());
  const f = fnR();
  kit.replace(L, { start: f.start, end: f.start }, ['async function cloudDropOne(rec,ctx){']);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('async function cloudDropOne(rec,ctx){') !== 1) throw new Error('cloudDropOne signature');
  if (times('cloudDropOne(oldRec,ctx)') !== 1) throw new Error('the move does not hand it over');
  if (times('cloudSyncOne(fresh,ctx,why)') !== 1) throw new Error('the upload is not handed it');
});

fs.renameSync(TMP, FILE);
console.log('patch556 written, ' + grew + ' bytes');
