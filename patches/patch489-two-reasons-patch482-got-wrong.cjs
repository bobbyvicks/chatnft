/* TWO REASONS PATCH482 GOT WRONG.

   That patch set out to stop the page guessing at why a trait did not reach
   the group. Two of the answers it gave are themselves guesses.

   ONE: A 5XX ON THE ROW INSERT IS NOT A REFUSAL.

   cloudSyncOne makes two requests. The image upload classifies its failure by
   status - under 500 is a refusal, 500 and up is "could not reach" - and the
   patch's own reasoning says why: "5xx and no answer at all keep the old
   reading, because those really are try again later". The row POST thirty
   lines later got the other rule, 401/403 or else refused, so:

     the image upload answers 503   "could not reach the group. Press Save to
                                     cloud when you are back."
     the row POST answers 503       "the server refused it (503), so the group
                                     did not get it."

   One outage, one trait, two sentences, and the one that is reachable through
   the row insert is the one with no way out. It is worse than it looks: the
   upload retries three times, the row POST does not, so a single transient
   answer there is the end of the attempt. And "refused" is a definite word -
   somebody told the server refused them does not press the button again.

   A 4xx there is still a refusal and still says so; 409, the unique index,
   is the one that case was written for and is the only one a test covered.

   TWO: "TRY AGAIN IN A MOMENT" IS A CLAIM ABOUT A CAUSE NOBODY ESTABLISHED.

   cloudCollection returns null for a missing token, for a GET that failed -
   which includes a 403 from a row-level policy, meaning this account may not
   read that collection at all - and for a failed POST. The answer named all
   three "could not be opened. Try again in a moment." For the permission case
   that is the same dead end patch482 exists to remove: waiting does not grant
   membership.

   The sentence stops promising. It says what failed and nothing about what
   will fix it, because from here nothing is known about that. Telling
   somebody the layer that failed is worth more than telling them a remedy
   that may not exist - which is the whole argument of the patch this corrects.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE UPLOAD BRANCH IS THE PRECEDENT, so it has to still be there. If the
   split it applies ever changes, the row POST must be reconsidered with it
   rather than silently keeping a copy of an old rule. */
const UPLOAD = '    if(!up.ok) return say(up.status<500?"refused":"unreachable",up.status);';
kit.only(L, l => l === UPLOAD, 'the upload status split');

/* ---- 1. the row insert uses the same split ---------------------- */

{
  const at = kit.only(L,
    l => l === '    if(!r.ok) return say((r.status===401||r.status===403)?"notallowed":"refused",r.status);',
    'the row result branch');
  kit.replace(L, { start: at, end: at }, [
    '    /* THE SAME SPLIT THE UPLOAD USES, thirty lines up. This had 401/403',
    '       or else "refused", so a 502 from the gateway and a 409 from the',
    '       unique index got the same definite word - and the comment above',
    '       calls this branch "A DEFINITE NO FROM THE SERVER, which is not a',
    '       network problem", which is true of a 4xx and false of every 5xx.',
    '',
    '       It matters more here than on the upload: the upload makes three',
    '       attempts, this makes one, so a single transient answer is the end',
    '       of it - and "refused" is a word nobody presses the button again',
    '       after. */',
    '    if(!r.ok) return say((r.status===401||r.status===403) ? "notallowed"',
    '      : (r.status<500 ? "refused" : "unreachable"), r.status);',
  ]);
}

/* ---- 2. the collection answer stops promising ------------------- */

{
  const at = kit.only(L,
    l => l === '    return "the collection on the server could not be opened. Try again in a moment.";',
    'the collection sentence');
  kit.replace(L, { start: at, end: at }, [
    '    /* NO "try again in a moment". cloudCollection returns null for a',
    '       missing token, for a GET that failed - which includes a 403 from a',
    '       row policy, meaning this account may not read that collection at',
    '       all - and for a failed POST. Promising the wait will fix it is the',
    '       same dead end this whole function exists to remove. It says what',
    '       failed and stops, because nothing here knows the rest. */',
    '    return "the collection on the server could not be opened.";',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (code.indexOf(s) >= 0) throw new Error('still there: ' + s); };

  need('    if(!r.ok) return say((r.status===401||r.status===403) ? "notallowed"');
  need('      : (r.status<500 ? "refused" : "unreachable"), r.status);');
  gone('?"notallowed":"refused",r.status);');
  need('    return "the collection on the server could not be opened.";');
  gone('could not be opened. Try again in a moment.');

  /* BOTH BRANCHES NOW SPLIT AT THE SAME NUMBER. The defect was one function
     holding two rules for one question, so the check is that it holds one. */
  const body = (() => {
    const a = codeLines.findIndex(l => l === 'async function cloudSyncOne(rec,ctx,why){');
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  })();
  const splits = body.filter(l => /status<500/.test(l));
  if (splits.length !== 2)
    throw new Error('cloudSyncOne has ' + splits.length + ' status splits, expected 2 (upload and row)');

  /* And "refused" is never the answer for a 5xx anywhere in the function. */
  for (const l of body)
    if (/>=500|status>499/.test(l)) throw new Error('an inverted split crept in: ' + l.trim());

  /* Save to cloud is still named in exactly the two answers it can fix - the
     collection answer never named it and must not have gained one. */
  const w = code.slice(code.indexOf('function cloudWhyNot(why){'));
  const wEnd = w.indexOf('\nasync function cloudSyncOne');
  const mentions = (w.slice(0, wEnd < 0 ? w.length : wEnd).match(/Save to cloud/g) || []).length;
  if (mentions !== 2)
    throw new Error('cloudWhyNot names Save to cloud ' + mentions + ' times, expected 2');
});

fs.renameSync(TMP, FILE);
console.log('patch489 written, ' + grew + ' bytes');
