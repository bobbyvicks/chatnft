/* SORTING A TRAIT COULD THROW AWAY THE UNSAVED WORK ON IT, DEPENDING ON THE
   CLOCK.

   Found because one test in 1,590 went red and I chased it instead of
   re-running it. It passed twelve times out of twelve on its own.

   THE MECHANISM, MEASURED. sortApply writes the moved record with
   at:Date.now(), then draftsFollow carries the draft over and re-stamps it
   with at:Date.now(). The open path keeps a carried draft only when it is
   STRICTLY newer than the record:

     if(got&&got.blob&&got.w&&got.h&&(got.at||0)>(t.at||0)) draft=got;

   Two Date.now() calls a few statements apart usually differ by a millisecond,
   and then everything works. When they land in the SAME millisecond the draft
   ties, loses, and is discarded as a leftover from before the last save.

   Measured by freezing the clock, which is what a tie looks like from in here:

     clock running   record at ...916, draft at ...917, opened corner 20
     clock frozen    record at ...951, draft at ...951, opened corner 90

   20 is the unsaved work. 90 is the saved artwork - the edit is gone, with
   nothing said. The draft is correctly keyed and correctly carried; it is
   thrown away one step later for being the same age as the thing it belongs
   to.

   The re-stamp exists to prevent exactly this - the test that caught it says
   so in its own comment, "a draft carried across with its original timestamp
   arrives correctly keyed and is then thrown away as stale by the open path".
   It was written against a timestamp that was too OLD and left the case where
   it is merely not new enough.

   NEWER BY CONSTRUCTION, NOT BY LUCK. draftsFollow already runs in a
   readwrite transaction over the same store, so it reads the record the draft
   is landing on and stamps at least one past it. Clock resolution stops being
   part of whether somebody keeps their work.

   NOT the comparison. Loosening it to >= would keep a tie, and it would also
   keep a genuinely stale draft that happens to share a millisecond with the
   save that superseded it - the case the strict > is there for. The draft is
   the thing that should be newer, so the draft is what gets fixed.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE OTHER HALF OF THE RACE, asserted. This fix is only correct while the
   open path demands STRICTLY newer; if that ever loosens, stamping past the
   record becomes pointless rather than wrong, and whoever loosens it should
   see this refuse. */
kit.only(L, l => l === '      if(got&&got.blob&&got.w&&got.h&&(got.at||0)>(t.at||0)) draft=got;',
  'the strictly-newer test on the open path');

/* And the write order that makes the tie reachable: the record first, the
   draft second, both from Date.now(). */
{
  const sa = kit.inFunction(L, 'async function sortApply(plan){');
  kit.only(L, l => l.indexOf('const rec={...old, id:id, name:r.toName, layer:r.toLayer, at:Date.now()};') >= 0,
    'the record re-stamp in sortApply', sa);
  kit.only(L, l => l.indexOf('draftsFollow(draftMoves)') >= 0,
    'the draft carry in sortApply', sa);
}

{
  const df = kit.inFunction(L, 'async function draftsFollow(pairs){');
  const at = kit.only(L, l => l === '      q.onsuccess=()=>{', 'the draft read handler', df);
  const end = kit.only(L, l => l === '      };', 'the end of that handler', { start: at, end: df.end });
  const body = L.slice(at, end + 1);
  const expected = [
    '      q.onsuccess=()=>{',
    '        const got=q.result;',
    '        if(!got) return;',
    '        s.put(Object.assign({},got,{id:draftKey(m.to), traitId:m.to, at:Date.now()}));',
    '        s.delete(draftKey(m.from));',
    '        n++;',
    '      };',
  ];
  if (body.length !== expected.length || body.some((l, i) => l !== expected[i]))
    throw new Error('draftsFollow is not the block this expects:\n' + body.join('\n'));

  kit.replace(L, { start: at, end: end }, [
    '      q.onsuccess=()=>{',
    '        const got=q.result;',
    '        if(!got) return;',
    '        /* PAST THE RECORD IT IS LANDING ON, not just "now".',
    '',
    '           The open path keeps a carried draft only when it is STRICTLY',
    '           newer than its trait, and the caller stamps the record with',
    '           Date.now() a few statements before this stamps the draft with',
    '           Date.now(). Usually they differ by a millisecond and it works.',
    '           In the same millisecond the draft ties, loses, and somebody',
    '           loses an edit with nothing said - measured by freezing the',
    '           clock: 20 on the canvas with it running, 90 with it stopped.',
    '',
    '           Read in this same transaction, so nothing can move underneath',
    '           between the question and the write. */',
    '        const rq=s.get(m.to);',
    '        rq.onsuccess=()=>{',
    '          const rec=rq.result;',
    '          const at=Math.max(Date.now(), (((rec&&rec.at)||0)+1));',
    '          s.put(Object.assign({},got,{id:draftKey(m.to), traitId:m.to, at:at}));',
    '          s.delete(draftKey(m.from));',
    '          n++;',
    '        };',
    '      };',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const gone = (s) => { if (code.indexOf(s) >= 0) throw new Error('still there: ' + s); };

  need('        const rq=s.get(m.to);');
  need('          const at=Math.max(Date.now(), (((rec&&rec.at)||0)+1));');
  gone('{id:draftKey(m.to), traitId:m.to, at:Date.now()}');

  /* THE DELETE MOVED WITH THE PUT. If the old draft were still removed on the
     outer handler it would go whether or not the new one was written, which
     turns a timestamp bug into a lost draft. */
  const df = (() => {
    const a = codeLines.findIndex(l => l === 'async function draftsFollow(pairs){');
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  })();
  const put = df.findIndex(l => /s\.put\(Object\.assign/.test(l));
  const del = df.findIndex(l => /s\.delete\(draftKey\(m\.from\)\)/.test(l));
  const inner = df.findIndex(l => /rq\.onsuccess/.test(l));
  if (!(inner >= 0 && inner < put && put < del))
    throw new Error('the put and delete are not both inside the record read');
  /* And the count too, or a carried draft is not reported as carried. */
  const bump = df.findIndex(l => /n\+\+;/.test(l));
  if (!(del < bump)) throw new Error('the count is not with the write it counts');

  /* The arithmetic, run rather than read. */
  // eslint-disable-next-line no-new-func
  const f = new Function('now', 'recAt',
    'return Math.max(now, (((recAt&&recAt)||0)+1));');
  if (f(1000, 1000) !== 1001) throw new Error('a tie does not advance: ' + f(1000, 1000));
  if (f(1000, 999) !== 1000) throw new Error('an older record should not drag it back');
  if (f(1000, 5000) !== 5001) throw new Error('a future record is not cleared: ' + f(1000, 5000));
  if (f(1000, undefined) !== 1000) throw new Error('a record with no timestamp breaks it');
});

fs.renameSync(TMP, FILE);
console.log('patch492 written, ' + grew + ' bytes');
