/* WHY A TRAIT DID NOT REACH THE GROUP, said instead of guessed at.

   "when im trying to save to final project theres a green popup sayin save to
   cloud and a bunch of other stuff i just want to be able to add it to my
   team"

   MEASURED FIRST. Adding a trait to the final project inside a group, with
   the server made to fail six different ways:

     signed out           hat is in the final project here only - the group
                          still has the old one
     could not ask        ... the same sentence
     no collection        ... the same sentence
     403 on the upload    ... the same sentence
     connection dropped   ... the same sentence
     row refused          ... the same sentence

   cloudSyncOne answers null for all six and the caller cannot tell them
   apart, so the message picks the one it likes and tells you to press Save to
   cloud. For three of those six, pressing Save to cloud does exactly what
   just failed and fails again - which is what somebody stuck in a loop of
   this is describing. A transient failure fixes itself; only a persistent one
   gets complained about, and the advice is written for the other case.

   cloudRarity in this same file already answers with a named outcome and its
   caller acts on it. This is that, on the upload.

   AND THE RECORD STOPS CLAIMING IT ARRIVED. Same probe: after every one of
   those failures the stored trait came back synced=true. setTraitStatus builds
   the new record by spreading the old one, so a trait that was on the server
   carries `synced` and `path` into an identity the server has never seen.
   The identical spread, one level over, is what kept a rarity change out of
   the group; setRarity has carried the correction since and this had none.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. cloudSyncOne says why ----------------------------------- */

const sync = kit.inFunction(L, 'async function cloudSyncOne(rec,ctx){');

/* Every early exit, asserted before anything is written. Six of them return a
   bare null and that is the whole defect, so the count is the check. */
const bareNulls = [];
for (let i = sync.start; i <= sync.end; i++)
  if (/return null;/.test(L[i])) bareNulls.push(i);
if (bareNulls.length !== 8)
  throw new Error('cloudSyncOne: expected 8 bare "return null", found ' + bareNulls.length);

const sig = kit.only(L, l => l === 'async function cloudSyncOne(rec,ctx){',
  'the cloudSyncOne signature');
L[sig] = 'async function cloudSyncOne(rec,ctx,why){';

const ctxLine = kit.only(L, l => l === '  ctx=ctx||{};', 'the ctx default', sync);
kit.replace(L, { start: ctxLine, end: ctxLine }, [
  '  /* WHY IT DID NOT ARRIVE, for the caller that has to say something.',
  '',
  '     AN OUT-PARAMETER, not a return value, and the shape is forced. All',
  '     seven call sites read this answer as true-or-false, and four tests',
  '     replace the whole function with a stub. Returning {ok,reason} would',
  '     make every failure an object - always truthy - so "if(!await',
  '     cloudSyncOne(...))" would stop firing at four call sites at once,',
  '     silently. Writing the reason into an object the caller supplies',
  '     leaves the answer exactly as it was: a caller that passes nothing,',
  '     and a stub that fills nothing, both get the message they got before.',
  '',
  '     cloudRarity answers with a named outcome and setRarity acts on it.',
  '     The vocabulary here is the same one. */',
  '  const say=(reason,status)=>{',
  '    if(why){ why.reason=reason; why.status=(typeof status==="number"?status:null); }',
  '    return null;',
  '  };',
  '  /* SIGNED OUT, OR NEVER ASKED. sbUser collapses those into one null and',
  '     its own comment says why it is left that way: five other callers read',
  '     the null as "signed out". The difference is the difference between an',
  '     instruction that fixes this and one that cannot, and recovering it',
  '     costs nothing - sbToken clears the stored session ONLY on a definitive',
  '     400, 401 or 403, so a session still in storage after it came back',
  '     empty means the question never got an answer. */',
  '  const outOrOffline=()=>say(sbLoadSession()?"unreachable":"signedout");',
  '  ctx=ctx||{};',
]);

/* The three lines that follow it, each now naming its own reason. Matched one
   at a time inside the function so nothing anchors on a duplicate. */
const now = () => kit.inFunction(L, 'async function cloudSyncOne(rec,ctx,why){');
const swap = (exact, replacement) => {
  const at = kit.only(L, l => l === exact, 'cloudSyncOne: ' + exact.trim(), now());
  L[at] = replacement;
};

swap('  const u=ctx.u||await sbUser(); if(!u) return null;',
  '  const u=ctx.u||await sbUser(); if(!u) return outOrOffline();');
swap('  const team=ctx.team||await cloudTeam(); if(!team) return null;',
  '  const team=ctx.team||await cloudTeam(); if(!team) return outOrOffline();');
swap('  const c=ctx.c||await cloudCollection(u); if(!c) return null;',
  '  const c=ctx.c||await cloudCollection(u); if(!c) return say("collection");');

/* The two header guards. "if(!h) return null;" is two lines in this file -
   cloudSweep opens with the same pair - so both are scoped to the function
   rather than searched for across it. */
{
  const at = kit.only(L, l => l === '    if(!hb) return null;',
    'the image header guard', now());
  L[at] = '    if(!hb) return outOrOffline();';
}
{
  const at = kit.only(L, l => l === '    if(!h) return null;',
    'the row header guard', now());
  L[at] = '    if(!h) return outOrOffline();';
}

swap('        if(up.status===401||up.status===403) return null;',
  '        if(up.status===401||up.status===403) return say("notallowed",up.status);');
/* A SERVER ANSWER IS NOT AN UNREACHABLE SERVER. Three attempts end here for
   everything that is not a 401 or 403, which includes a 400 on a malformed
   object name and a 413 on a file over the bucket limit - neither of which
   gets better by waiting, and both of which used to be reported as a dropped
   connection. 5xx and no answer at all keep the old reading, because those
   really are "try again later". */
kit.replace(L, (() => {
  const at = kit.only(L, l => l === '    if(!up||!up.ok) return null;',
    'the upload result', now());
  return { start: at, end: at };
})(), [
  '    if(!up) return say("unreachable");',
  '    if(!up.ok) return say(up.status<500?"refused":"unreachable",up.status);',
]);
swap('  }catch(_){ return null; }',
  '  }catch(_){ return say("unreachable"); }');

/* The row POST. Its answer was returned raw and read as a boolean; the two
   lines under it are both already guarded by r.ok, so returning early here
   changes the shape and nothing else. */
{
  const r = now();
  const at = kit.only(L, l => l === '    return r.ok;', 'the row result', r);
  const first = kit.only(L, l => l === '    let madeId=null;', 'the madeId line', r);
  kit.replace(L, { start: at, end: at }, ['    return true;']);
  kit.replace(L, { start: first, end: first }, [
    '    /* A DEFINITE NO FROM THE SERVER, which is not a network problem and',
    '       must not be reported as one. The two lines below are both already',
    '       guarded by r.ok, so leaving here skips nothing they would have',
    '       done. 401 and 403 are the same "not allowed" the upload can give,',
    '       said the same way; a 409 is the unique index, which means the group',
    '       already holds this name on this layer at this status. */',
    '    if(!r.ok) return say((r.status===401||r.status===403)?"notallowed":"refused",r.status);',
    '    if(why) why.ok=true;',
    '    let madeId=null;',
  ]);
}

/* ---- 2. the sentence, in one place ------------------------------ */

{
  const at = kit.only(L, l => l === 'async function cloudSyncOne(rec,ctx,why){',
    'the cloudSyncOne signature again');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT TO SAY WHEN IT DID NOT REACH THE GROUP.',
    '',
    '   One place, because three call sites say it and they were three copies',
    '   of one guess. Each answer names the cause and then the thing to do',
    '   about it, and only the two that Save to cloud can actually fix mention',
    '   Save to cloud - telling somebody to press a button that does exactly',
    '   what just failed is how a person ends up pressing it all afternoon.',
    '',
    '   The last line is the sentence this replaced, word for word. It is what',
    '   an unnamed reason gets, which is every caller that passes no object and',
    '   every test that stubs the upload out - so nothing that does not ask for',
    '   a reason reads any differently than it did. */',
    'function cloudWhyNot(why){',
    '  const r=why&&why.reason;',
    '  if(r==="signedout")',
    '    return "you are signed out on this device. Sign in, then press Save to cloud.";',
    '  if(r==="notallowed")',
    '    return "this account is not allowed to write to the group. Ask whoever set it up to add you.";',
    '  if(r==="refused")',
    '    return "the server refused it"+(why.status?" ("+why.status+")":"")+", so the group did not get it.";',
    '  if(r==="collection")',
    '    return "the collection on the server could not be opened. Try again in a moment.";',
    '  return "could not reach the group. Press Save to cloud when you are back.";',
    '}',
    'async function cloudSyncOne(rec,ctx,why){',
  ]);
}

/* ---- 3. cloudMoveOne carries it through ------------------------- */

{
  const at = kit.only(L, l => l === 'async function cloudMoveOne(oldRec,newRec){',
    'the cloudMoveOne signature');
  L[at] = 'async function cloudMoveOne(oldRec,newRec,why){';
  const mv = kit.inFunction(L, 'async function cloudMoveOne(oldRec,newRec,why){');
  const call = kit.only(L, l => l === '  const arrived=await cloudSyncOne(fresh);',
    'the arrival inside cloudMoveOne', mv);
  L[call] = '  const arrived=await cloudSyncOne(fresh,null,why);';
}

/* ---- 4. setTraitStatus keeps the reason, and stops lying -------- */

{
  const st = kit.inFunction(L, 'async function setTraitStatus(t,next){');
  const at = kit.only(L, l => l === '  const shared=await cloudMoveOne(t,moved);',
    'the share inside setTraitStatus', st);
  kit.replace(L, { start: at, end: at }, [
    '  /* Filled by the upload when it fails, so the tile and the final-set',
    '     page can each say WHICH failure it was. */',
    '  const why={};',
    '  const shared=await cloudMoveOne(t,moved,why);',
    '  /* AND THE RECORD STOPS CLAIMING TO BE ON THE SERVER. `moved` above is a',
    '     spread of `t`, so a trait that was synced carries `synced` and `path`',
    '     into its NEW identity - one the server has never seen. Measured, with',
    '     the upload failing: synced came back true on all six kinds of failure.',
    '',
    '     The same spread one level over is what kept a rarity change out of the',
    '     group, and setRarity has carried this correction since; this is the',
    '     sibling that did not get it.',
    '',
    '     `path` goes with it rather than being left to be harmless. Save to',
    '     cloud skips a record whose stored path equals the one it computes, and',
    '     a status change moves that path only because cloudPath happens to',
    '     encode the status - a fact in another function, which is not a thing',
    '     to depend on for whether work reaches the group.',
    '',
    '     rowId STAYS. It points at the row the old copy made, and that is still',
    '     the row a later Save to cloud has to replace; dropping it would post a',
    '     second row and leave the group holding the trait twice.',
    '',
    '     Only on failure. When the upload lands, cloudSyncOne writes synced,',
    '     rowId and path onto the record itself, and that write is the true one. */',
    '  if(activeWs && !shared){',
    '    let stored=null; try{ stored=await dbGet(moved.id); }catch(_){}',
    '    if(stored && (stored.synced||stored.path)){',
    '      const honest=Object.assign({},stored,{synced:false});',
    '      delete honest.path;',
    '      try{ await dbPut(honest); }catch(_){}',
    '    }',
    '  }',
  ]);
  const ret = kit.only(L, l => l === '  return {ok:true, moved, shared};',
    'the setTraitStatus result',
    kit.inFunction(L, 'async function setTraitStatus(t,next){'));
  L[ret] = '  return {ok:true, moved, shared, why};';
}

/* ---- 5. the three messages ------------------------------------- */

/* The shelf tile. */
{
  const at = kit.only(L, l => l === "          ? t.name+' -> '+next+' here only - the group still has the old one'",
    'the shelf chip message');
  L[at] = "          ? t.name+' -> '+next+' here only - '+cloudWhyNot(r.why)";
}

/* The final-set page. */
{
  const fm = kit.inFunction(L, 'async function finalMove(t,next){');
  const at = kit.only(L, l => l === '  toast(activeWs && !r.shared', 'the finalMove toast', fm);
  const end = kit.only(L,
    l => l === '    : t.name+(next==="stfp"?" is in the final project":" is out of the final project"));',
    'the finalMove toast end', fm);
  kit.replace(L, { start: at, end: end }, [
    '  const what=t.name+(next==="stfp"?" is in the final project":" is out of the final project");',
    '  /* r.same, because setTraitStatus returns early with shared:null when the',
    '     status is already the one asked for - and "here only" on a change that',
    '     never happened is a warning about a send nobody attempted. */',
    '  toast(activeWs && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what);',
  ]);
}

/* The editor. */
{
  const at = kit.only(L,
    l => l === '      const shared = moved ? await cloudMoveOne(openWas,rec) : await cloudSyncOne(rec);',
    'the save inside a group');
  kit.replace(L, { start: at, end: at }, [
    '      const why={};',
    '      const shared = moved ? await cloudMoveOne(openWas,rec,why)',
    '        : await cloudSyncOne(rec,null,why);',
  ]);
  const msg = kit.only(L,
    l => l === '        : "Saved "+name+" here only - could not reach the group. Press Save to cloud when you are back.")+offGrid+edged);',
    'the saveTrait message');
  L[msg] = '        : "Saved "+name+" here only - "+cloudWhyNot(why))+offGrid+edged);';
}

/* ---- checks ----------------------------------------------------- */

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s, label) => {
    if (code.indexOf(s) < 0) throw new Error('missing after the patch: ' + (label || s));
  };
  const gone = (s, label) => {
    if (code.indexOf(s) >= 0) throw new Error('still there after the patch: ' + (label || s));
  };

  need('function cloudWhyNot(why){', 'the sentence helper');
  need('async function cloudSyncOne(rec,ctx,why){', 'the new signature');
  need('async function cloudMoveOne(oldRec,newRec,why){', 'cloudMoveOne carries it');

  /* THE DEFECT ITSELF: every failure answering the same nothing. Six of the
     seven bare nulls named a reason; the seventh is the `say` helper. */
  const body = codeLines.slice(
    codeLines.findIndex(l => l === 'async function cloudSyncOne(rec,ctx,why){'));
  const close = body.findIndex(l => l === '}');
  const inside = body.slice(0, close < 0 ? body.length : close);
  const bare = inside.filter(l => /return null;/.test(l));
  if (bare.length !== 1)
    throw new Error('cloudSyncOne: expected exactly 1 remaining "return null" (the say helper), found '
      + bare.length);
  for (const r of ['signedout', 'unreachable', 'collection', 'notallowed', 'refused'])
    need('"' + r + '"', 'the reason ' + r);

  /* THE SENTENCE THAT WAS THERE STAYS THE DEFAULT. A stub that fills no
     reason, and every caller that asks for none, must read as they did. */
  need('return "could not reach the group. Press Save to cloud when you are back.";',
    'the old sentence, kept as the unnamed-reason answer');

  /* Save to cloud is named in exactly the two answers it can fix. */
  const whyBody = code.slice(code.indexOf('function cloudWhyNot(why){'));
  const whyEnd = whyBody.indexOf('\nasync function cloudSyncOne');
  const whyOnly = whyBody.slice(0, whyEnd < 0 ? whyBody.length : whyEnd);
  const mentions = (whyOnly.match(/Save to cloud/g) || []).length;
  if (mentions !== 2)
    throw new Error('cloudWhyNot: "Save to cloud" appears ' + mentions + ' times, expected 2');

  /* The three messages ask for the reason rather than asserting one. */
  need("? t.name+' -> '+next+' here only - '+cloudWhyNot(r.why)", 'the shelf chip');
  need('toast(activeWs && !r.shared && !r.same ? what+" here only - "+cloudWhyNot(r.why) : what);',
    'the final-set message');
  need('        : "Saved "+name+" here only - "+cloudWhyNot(why))+offGrid+edged);',
    'the editor message');
  gone('here only - could not reach the group. Press Save to cloud when you are back.',
    'the hard-coded guess in saveTrait');
  gone("' here only - the group still has the old one'", 'the hard-coded guess on the chip');

  /* The record correction. */
  need('const honest=Object.assign({},stored,{synced:false});', 'the synced correction');
  need('  return {ok:true, moved, shared, why};', 'the reason reaching the caller');

  /* The batch paths pass no object and must be untouched: naming ONE reason
     for forty traits is a different question and this does not answer it. */
  need('if(activeWs&&!await cloudMoveOne(old,rec)) stranded++;', 'retagLayer unchanged');
  need('if(activeWs&&!await cloudSyncOne(rrec, await uploadCtx())) notShared++;',
    'the ref import unchanged');
  need('if(activeWs&&!await cloudSyncOne(trec, await uploadCtx())) notShared++;',
    'the trait import unchanged');
  need('const okd=await cloudSyncOne(it,ctx);', 'Save to cloud unchanged');
});

fs.renameSync(TMP, FILE);
console.log('patch482 written, ' + grew + ' bytes');
