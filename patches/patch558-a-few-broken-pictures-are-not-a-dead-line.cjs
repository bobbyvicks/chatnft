/* A FEW BROKEN PICTURES ARE NOT A DEAD LINE.

   Found 2026-09-23 by the full suite: cloudpull.spec's "a genuinely bad
   connection still loses some" lost 22 more traits than it should in 2 of
   20 repeats, on every commit since 4feca4e (patch545) and on none before
   it. 45301df: 20 of 20 green; e0d3a2e, d418e6f, cce2d41: 1-4 of 20 red,
   each with exactly 170 of 200 loaded where 192 is right.

   Patch545 ended a pull or a push after three transfers in a row that
   could not reach the server - "every picture after them would find the
   same". In a row means in completion order across eight downloads (six
   uploads) running at once. Successes reset it, but when every worker
   happens to be on a picture that fails for its own reasons, their
   failures complete back to back with no success between, and the run
   stopped while the line was fine - leaving the rest untried and saying
   the server had stopped answering.

   Three in a row now asks a question before it decides: fetch again a
   picture that already came through on this run. A dead line fails that
   too and the run stops as before; a line that answers means the failures
   were those pictures, and the run goes on. A run that has had no success
   yet has nothing to ask with, and stops as before - which is the dead
   line from the start that deadconnection.spec pins. One question at a
   time per run, however many workers reach the count together. */
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

/* ---- the question ---------------------------------------------------------- */
{
  const fn = kit.inFunction(L, 'async function cloudPush(){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* IS THE LINE STILL THERE? Asked when three transfers in a row could not',
    '   reach the server: fetch again a picture that already came through on',
    '   this run. Three in a row across concurrent transfers is also what a',
    '   few pictures that fail on their own look like (measured: a pull of',
    '   200 with 8 unreadable stopped at 170). No path - nothing has come',
    '   through yet - is no evidence the line works. */',
    'async function lineStillAnswers(path){',
    '  if(!path) return false;',
    '  const h=await sbHeaders();',
    '  if(!h) return false;',
    '  try{ return !!(await pullBlob(path,h,{})); }catch(_){ return false; }',
    '}',
    'async function cloudPush(){',
  ]);
}

/* ---- the push -------------------------------------------------------------- */
{
  const fnR = () => kit.inFunction(L, 'async function cloudPush(){');
  swap('  let saved=0, failed=0, done=0, patched=0, streak=0, broke=false;', [
    '  let saved=0, failed=0, done=0, patched=0, streak=0, broke=false;',
    '  /* The last picture that landed, and the one question in flight. */',
    '  let goodPath=null, asking=null;',
  ], 'the push counters', fnR());
  swap('      if(okd){ rows.push({path:cloudPath(team,c,it)}); streak=0; }', [
    '      if(okd){ rows.push({path:cloudPath(team,c,it)}); streak=0; goodPath=cloudPath(team,c,it); }',
  ], 'the push success', fnR());
  const f = fnR();
  const i = at('        if(streak>=3) broke=true;', 'the push breaker', f);
  kit.replace(L, { start: i, end: i }, [
    '        if(streak>=3 && !broke){',
    '          if(!asking) asking=lineStillAnswers(goodPath).finally(()=>{ asking=null; });',
    '          if(await asking) streak=0; else broke=true;',
    '        }',
  ]);
}

/* ---- the pull -------------------------------------------------------------- */
{
  const fnR = () => kit.inFunction(L, 'async function cloudPull(opts){');
  swap('  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false, streak=0, broke=false;', [
    '  let added=0, renamed=0, failed=0, done=0, skipped=0, full=false, streak=0, broke=false;',
    '  /* The last picture that came through, and the one question in flight. */',
    '  let goodPath=null, asking=null;',
  ], 'the pull counters', fnR());
  const f = fnR();
  const i = at('        if(!blob){ streak = bwhy.reason==="unreachable" ? streak+1 : 0; if(streak>=3) broke=true; }', 'the pull breaker', f);
  if (L[i + 1] !== '        else streak=0;') throw new Error('the pull reset moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '        if(!blob){',
    '          streak = bwhy.reason==="unreachable" ? streak+1 : 0;',
    '          if(streak>=3 && !broke){',
    '            if(!asking) asking=lineStillAnswers(goodPath).finally(()=>{ asking=null; });',
    '            if(await asking) streak=0; else broke=true;',
    '          }',
    '        }',
    '        else { streak=0; goodPath=w.row.path; }',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('lineStillAnswers(goodPath)') !== 2) throw new Error('both runs ask');
  if (times('if(streak>=3) broke=true;')) throw new Error('an unasked breaker is left');
});

fs.renameSync(TMP, FILE);
console.log('patch558 written, ' + grew + ' bytes');
