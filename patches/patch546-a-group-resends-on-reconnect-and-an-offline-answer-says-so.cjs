/* A GROUP RESENDS WHAT IT OWES WHEN THE CONNECTION COMES BACK, AND AN
   ANSWER GIVEN OFFLINE SAYS SO.

   Found 2026-09-22 by the discovery pass, the second half of rank 16 of
   39. In a group, changes are sent as they are made; one that could not
   be sent is marked unsent and waits for Save to cloud. Nothing listened
   for the connection returning: real offline and online events produced
   no request at all, so a phone that lost signal while somebody reviewed
   or reweighed kept all of it to itself until they thought to press the
   button. And a review answer given offline was stored here while the
   review sheet said nothing; the rules note on the settings page says it
   has not reached the group, but only once the review is closed.

   On the browser's online event, in a group, this now sends the rules and
   answers if they never reached the server, and runs Save to cloud for the
   traits marked unsent - one at a time, and not at all while a push is
   already running. Your own page is left as it is: there nothing is ever
   sent without a press, and a reconnect is not a press. And decidePair
   hands back whether the answer reached the group; when it did not, it
   says once - not once per answer - that answers are being kept here and
   will be sent when the connection is back. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);

/* ---- 1. an answer that did not reach the group says so, once ------------ */
{
  const fn = kit.inFunction(L, 'async function decidePair(a,b,ok){');
  const want = [
    'async function decidePair(a,b,ok){',
    '  DECISIONS=mergeDecisions(DECISIONS,[{a:a,b:b,ok:!!ok,at:Date.now()}]);',
    '  applyDecision(a,b,ok);',
    '  await saveRules();',
    '}',
  ];
  for (let k = 0; k < want.length; k++) if (L[fn.start + k] !== want[k]) throw new Error('decidePair moved at +' + k);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* Said once per spell of not reaching the group, not once per answer: a',
    '   review is dozens of presses. */',
    'let answersHeldSaid=false;',
    'async function decidePair(a,b,ok){',
    '  DECISIONS=mergeDecisions(DECISIONS,[{a:a,b:b,ok:!!ok,at:Date.now()}]);',
    '  applyDecision(a,b,ok);',
    '  const sent=await saveRules();',
    '  /* AN ANSWER THE GROUP HAS NOT GOT, said. It was kept here in silence and',
    '     the sheet looked exactly as it does online. */',
    '  if(activeWs && !sent){',
    '    if(!answersHeldSaid){ answersHeldSaid=true;',
    '      toast("Answers are being kept on this device - the group has not got them yet. They are sent when the connection is back."); }',
    '  } else if(sent) answersHeldSaid=false;',
    '  return sent;',
    '}',
  ]);
}

/* ---- 2. the reconnect sends what a group is owed ------------------------ */
{
  const i = at("$('cloudpull').onclick=cloudPull;", 'the pull binding');
  kit.replace(L, { start: i, end: i }, [
    "$('cloudpull').onclick=cloudPull;",
    '/* WHEN THE CONNECTION COMES BACK, IN A GROUP: the rules and answers if they',
    '   never reached the server, then Save to cloud for what is marked unsent.',
    '   Nothing listened for this - real offline and online events produced no',
    '   request (measured) - so a phone that lost signal kept its changes until',
    '   somebody thought to press the button. Not on your own page, where',
    '   nothing is sent without a press. One at a time, and never over a push',
    '   already running. */',
    'let groupResending=null;',
    'async function groupResend(){',
    '  if(!activeWs || pushRunning || groupResending) return groupResending;',
    '  groupResending=(async()=>{',
    '    try{',
    '      if(sharedRuleSig===null && (RULES.length||DECISIONS.length)){',
    '        const sent=await shareRules();',
    '        if(sent) answersHeldSaid=false;',
    '      }',
    '      let unsent=[]; try{ unsent=(await dbAll()).filter(i=>(i.kind==="trait"||i.kind==="ref")&&!i.synced); }catch(_){ unsent=[]; }',
    '      if(unsent.length) await cloudPush();',
    '    }catch(_){ }',
    '  })();',
    '  try{ await groupResending; } finally{ groupResending=null; }',
    '}',
    "addEventListener('online',()=>{ groupResend(); });",
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once("addEventListener('online',()=>{ groupResend(); });");
  once('async function groupResend(){');
  once('const sent=await saveRules();');
  once('let answersHeldSaid=false;');
  const g = code.indexOf('async function groupResend(){'), ge = code.indexOf('\n}', g);
  if (code.slice(g, ge).indexOf('if(!activeWs') < 0) throw new Error('the resend is not limited to a group');
});

fs.renameSync(TMP, FILE);
console.log('patch546 written, ' + grew + ' bytes');
