/* THE THREE REASONS THAT WERE STILL GUESSES.

   Two commits ago the page stopped inventing a cause for a trait that did not
   reach the group. Three of the causes it now names are still inferred rather
   than known, and all three send somebody the wrong way.

   ONE: A REVOKED SESSION READS AS "COULD NOT REACH THE GROUP".

   The trick that separates signed-out from could-not-ask is whether the stored
   session survived the attempt, because sbToken clears it only on a definitive
   400, 401 or 403. That is sound for a REFRESH that was rejected. It is not
   sound for a token that is simply no longer accepted: sbToken hands the
   stored token over without asking anybody, /auth/v1/user answers 401, and
   sbUser returns null WITHOUT clearing the session - unlike sbAuthState, which
   clears it and says "out". So the session is still in storage, the inference
   reads "unreachable", and somebody whose sign-in has been revoked is told to
   press Save to cloud when they are back. That button will answer 401 every
   time, forever, which is the exact loop this work exists to end.

   sbAuthState asks the same question with the same one request and gives three
   answers instead of two. cloudPush already uses it for this reason and its
   own comment says why: "Could not ask is not you are signed out, and telling
   a signed-in person to sign in is an instruction to do the one thing that
   risks losing local work." This is that, one layer down.

   The header guards keep the old inference, because there it IS sound - they
   fire when sbToken came back empty, which is the case the trick was written
   for.

   TWO: 408 AND 429 ARE NOT REFUSALS.

   The upload splits on status, under 500 a refusal. A 429 is the server saying
   "not right now" and a 408 is a timeout; both are the definition of try again
   later, and both were being reported as a settled no with no way forward.
   They join the 5xx side. Everything else under 500 stays a refusal - a 400 on
   a malformed key and a 413 over the size limit do not improve by waiting.

   THREE: A 401 IS NOT A MEMBERSHIP PROBLEM.

   401 and 403 were answered together with "this account is not allowed to
   write to the group. Ask whoever set it up to add you." That is right for a
   403, which is the policy refusing a member who is not one. A 401 means the
   request carried no identity the server would accept - the fix is to sign in,
   not to ask somebody for an invitation - and being sent to a person instead
   of to the sign-in box is a slow way to find that out. Split, on both
   requests.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE PREMISE: sbAuthState clears the session on a definitive answer and
   sbUser does not. That difference is the whole of finding one, so it is
   asserted rather than assumed. */
{
  const as = kit.inFunction(L, 'async function sbAuthState(){');
  kit.only(L, l => l === '    if(r.status===401||r.status===403){ sbSaveSession(null); return {state:"out"}; }',
    'sbAuthState clearing the session on a definitive no', as);
  const su = kit.inFunction(L, 'async function sbUser(){');
  const body = L.slice(su.start, su.end + 1);
  if (body.some(l => /sbSaveSession\(null\)/.test(l)))
    throw new Error('sbUser now clears the session too, so the two no longer differ');
}

/* ---- 1. three answers, not two --------------------------------- */

{
  const at = kit.only(L, l => l === '  const u=ctx.u||await sbUser(); if(!u) return outOrOffline();',
    'the user lookup');
  kit.replace(L, { start: at, end: at }, [
    '  /* THREE ANSWERS, NOT TWO, and not by inference. outOrOffline separates',
    '     signed-out from could-not-ask by asking whether the stored session',
    '     survived - sound when a REFRESH was rejected, because sbToken clears',
    '     it then. Not sound for a token that is simply no longer accepted:',
    '     sbToken hands the stored token over, /auth/v1/user answers 401, and',
    '     sbUser returns null WITHOUT clearing it. So a revoked sign-in read as',
    '     "could not reach the group" and sent somebody to a button that will',
    '     answer 401 every time.',
    '',
    '     sbAuthState is the same one request and clears the session on a',
    '     definitive 401 or 403, which is what makes its "out" true. cloudPush',
    '     already uses it, for the reason its own comment gives.',
    '',
    '     Only when the caller has not already done it. cloudPush passes ctx.u',
    '     straight from sbAuthState, so a 60-trait push does not ask 60 times. */',
    '  let u=ctx.u;',
    '  if(!u){',
    '    const who=await sbAuthState();',
    '    if(who.state!=="in") return say(who.state==="out"?"signedout":"unreachable");',
    '    u=who.user;',
    '  }',
    '  if(!u) return outOrOffline();',
  ]);
}

/* ---- 2 and 3. the two status splits ----------------------------- */

/* One list, named once, used by both requests - the defect the previous
   commit fixed was this function holding two rules for one question, and two
   copies of a literal is the same mistake with extra steps. */
{
  const at = kit.only(L, l => l === 'function cloudWhyNot(why){', 'cloudWhyNot');
  kit.replace(L, { start: at, end: at }, [
    '/* THE STATUSES THAT MEAN "NOT RIGHT NOW" RATHER THAN "NO".',
    '',
    '   408 is a timeout and 429 is the server asking to be left alone; both are',
    '   the definition of try again later and both were being reported as a',
    '   settled refusal with nothing to do about it. 425 is here for the same',
    '   reason and costs nothing. Everything else under 500 stays a refusal - a',
    '   400 on a malformed object key and a 413 over the bucket limit do not get',
    '   better by waiting. */',
    'const RETRY_LATER=[408,425,429];',
    'function cloudLater(st){ return !(st<500) || RETRY_LATER.indexOf(st)>=0; }',
    'function cloudWhyNot(why){',
  ]);
}

{
  const at = kit.only(L,
    l => l === '    if(!up.ok) return say(up.status<500?"refused":"unreachable",up.status);',
    'the upload status split');
  L[at] = '    if(!up.ok) return say(cloudLater(up.status)?"unreachable":"refused",up.status);';
}

{
  const at = kit.only(L, l => l === '    if(!r.ok) return say((r.status===401||r.status===403) ? "notallowed"',
    'the row status split');
  if (L[at + 1] !== '      : (r.status<500 ? "refused" : "unreachable"), r.status);')
    throw new Error('the row split is not the two lines this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '    /* 401 AND 403 ARE NOT THE SAME ANSWER. 403 is the policy refusing a',
    '       member who is not one, which is a thing to ask somebody about. 401',
    '       is the request carrying no identity the server accepts, which is a',
    '       thing to fix by signing in - and being sent to a person instead of',
    '       to the sign-in box is a slow way to find that out. */',
    '    if(!r.ok) return say(r.status===403 ? "notallowed"',
    '      : r.status===401 ? "signedout"',
    '      : cloudLater(r.status) ? "unreachable" : "refused", r.status);',
  ]);
}

{
  const at = kit.only(L,
    l => l === '        if(up.status===401||up.status===403) return say("notallowed",up.status);',
    'the upload permission branch');
  kit.replace(L, { start: at, end: at }, [
    '        /* Split for the same reason as the row insert below: a 401 is a',
    '           sign-in problem and a 403 is a membership one, and neither is',
    '           retried - both are definitive. */',
    '        if(up.status===403) return say("notallowed",up.status);',
    '        if(up.status===401) return say("signedout",up.status);',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (code.indexOf(s) >= 0) throw new Error('still there: ' + s); };

  need('    const who=await sbAuthState();');
  need('    if(who.state!=="in") return say(who.state==="out"?"signedout":"unreachable");');
  gone('const u=ctx.u||await sbUser();');
  need('const RETRY_LATER=[408,425,429];');
  need('function cloudLater(st){ return !(st<500) || RETRY_LATER.indexOf(st)>=0; }');
  need('    if(!up.ok) return say(cloudLater(up.status)?"unreachable":"refused",up.status);');
  need('    if(!r.ok) return say(r.status===403 ? "notallowed"');
  gone('if(up.status===401||up.status===403) return say("notallowed"');

  /* ONE RULE FOR ONE QUESTION. Both requests go through cloudLater, and no
     bare status literal decides transience anywhere in the function. */
  const body = (() => {
    const a = codeLines.findIndex(l => l === 'async function cloudSyncOne(rec,ctx,why){');
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  })();
  const later = body.filter(l => /cloudLater\(/.test(l));
  if (later.length !== 2)
    throw new Error('cloudLater is consulted ' + later.length + ' times, expected 2');
  for (const l of body)
    if (/status<500|status>=500/.test(l))
      throw new Error('a bare status split survives: ' + l.trim());

  /* cloudLater really does answer what this claims. Run it rather than read
     it - the last two of these were wrong in a comment. */
  // eslint-disable-next-line no-new-func
  const f = new Function('const RETRY_LATER=[408,425,429];'
    + 'function cloudLater(st){ return !(st<500) || RETRY_LATER.indexOf(st)>=0; }'
    + 'return cloudLater;')();
  for (const [st, want] of [[400, false], [409, false], [413, false], [404, false],
    [408, true], [425, true], [429, true], [500, true], [502, true], [503, true], [504, true]])
    if (f(st) !== want)
      throw new Error('cloudLater(' + st + ') = ' + f(st) + ', want ' + want);

  /* Save to cloud is still named in exactly the two answers it can fix. */
  const w = code.slice(code.indexOf('function cloudWhyNot(why){'));
  const wEnd = w.indexOf('\nasync function cloudSyncOne');
  const mentions = (w.slice(0, wEnd < 0 ? w.length : wEnd).match(/Save to cloud/g) || []).length;
  if (mentions !== 2)
    throw new Error('cloudWhyNot names Save to cloud ' + mentions + ' times, expected 2');
});

fs.renameSync(TMP, FILE);
console.log('patch491 written, ' + grew + ' bytes');
