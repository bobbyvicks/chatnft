/* A FAILED IMAGE DELETE IS NOT A KEPT ROW.

   Found by a second adversarial review, over the eight changes the first one
   did not cover. It is a defect in the commit immediately before this.

   cloudDropOne removes the row, then removes the PNG the row pointed at:

     const paths=removed.map(x=>x.path).filter(Boolean);
     if(paths.length) await fetch(... storage ... DELETE ...);
     return removed.length>0;
   }catch(_){ return null; }

   The image delete is inside the same try as everything above it, and the
   function-level catch answers null. So if that one fetch REJECTS - a dropped
   connection, an aborted request - cloudDropOne returns null even though
   removed.length>0 was already true and the row is gone.

   That was inert while the answer was discarded. The previous commit made
   cloudMoveOne read it, and read null as "the old copy is still there", so a
   move whose row removal SUCCEEDED and whose image delete merely failed now
   tells somebody "the old copy is still on the server, so the group has it
   twice". The row is not there. Nobody sees it twice. What actually survives
   is an orphaned PNG that nothing points at, which is a different problem and
   not the one that sentence describes.

   A NON-OK RESPONSE DOES NOT DO THIS. The storage delete's result is not
   inspected at all, so a 403 or a 500 from it falls through to
   return removed.length>0 and answers true. Only a rejection reaches the
   catch. That is a narrow window and it is still a sentence that is false when
   it appears.

   THE ANSWER IS SETTLED BEFORE THE IMAGE GOES. Once the rows are back, what
   this function is being asked - did the old copy go - has an answer, and
   nothing after that can change it. The image delete gets its own catch so a
   failure there cannot rewrite it.

   WHAT THIS DOES NOT DO: report the orphan. Nothing in the app tracks orphaned
   images except cloudSweep, which is a different operation with its own
   guards, and inventing a second clause for a case nobody has seen would be
   the same mistake in the other direction. The sweep already exists to find
   them.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE CONSUMER THAT MAKES THIS MATTER. Without cloudMoveOne reading null as a
   kept copy this is invisible, and if that ever changes the reasoning here
   should be re-read rather than assumed. */
kit.only(L, l => l === '  if(dropped===null&&why) why.oldKept=true;',
  'cloudMoveOne reading null as a kept copy');

{
  const dr = kit.inFunction(L, 'async function cloudDropOne(rec){');
  const at = kit.only(L, l => l === '    const paths=removed.map(x=>x.path).filter(Boolean);',
    'the image paths', dr);
  const expected = [
    '    const paths=removed.map(x=>x.path).filter(Boolean);',
    '    if(paths.length) await fetch(SB_URL+"/storage/v1/object/traits",{method:"DELETE",',
    '      headers:h, body:JSON.stringify({prefixes:paths})});',
    '    return removed.length>0;',
  ];
  for (let i = 0; i < expected.length; i++)
    if (L[at + i] !== expected[i])
      throw new Error('not the block this expects, at line ' + (at + i + 1)
        + ':\n  want: ' + expected[i] + '\n  got:  ' + L[at + i]);

  kit.replace(L, { start: at, end: at + expected.length - 1 }, [
    '    const paths=removed.map(x=>x.path).filter(Boolean);',
    '    /* THE ANSWER IS SETTLED HERE, before the image goes. What this',
    '       function is asked is whether the old copy went, and the rows are',
    '       already back - nothing after this can change it.',
    '',
    '       The image delete used to sit inside the function-level try, whose',
    '       catch answers null. A REJECTED fetch there - a dropped connection,',
    '       an aborted request - made this return null on a path where the row',
    '       had gone, and cloudMoveOne reads null as "the old copy is still on',
    '       the server, so the group has it twice". It is not there. What',
    '       survives is an orphaned PNG, which is a different problem and not',
    '       the one that sentence describes. A non-ok RESPONSE never did this,',
    '       because the result is not inspected - only a rejection reached the',
    '       catch. */',
    '    const gone=removed.length>0;',
    '    if(paths.length){',
    '      try{ await fetch(SB_URL+"/storage/v1/object/traits",{method:"DELETE",',
    '        headers:h, body:JSON.stringify({prefixes:paths})}); }catch(_){ }',
    '    }',
    '    return gone;',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('    const gone=removed.length>0;');
  need('    return gone;');

  const dr = (() => {
    const a = codeLines.findIndex(l => l === 'async function cloudDropOne(rec){');
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  })();

  /* THE ANSWER IS COMPUTED BEFORE THE IMAGE DELETE, which is the whole fix. */
  const settled = dr.findIndex(l => /const gone=removed\.length>0;/.test(l));
  const imgDel = dr.findIndex(l => /storage\/v1\/object\/traits/.test(l) && /DELETE/.test(l));
  const ret = dr.findIndex(l => /^\s+return gone;/.test(l));
  if (!(settled >= 0 && imgDel >= 0 && ret >= 0 && settled < imgDel && imgDel < ret))
    throw new Error('the answer is not settled before the image delete');

  /* AND THE IMAGE DELETE HAS ITS OWN CATCH, so a rejection cannot reach the
     function-level one and turn a removed row into null. */
  const seg = dr.slice(imgDel - 2, imgDel + 3).join(' ');
  if (!/try\{/.test(seg) || !/catch\(_\)\{/.test(seg))
    throw new Error('the image delete is not wrapped in its own catch');

  /* The function still answers null for the failures that ARE failures. */
  if (!dr.some(l => /if\(!r\|\|!r\.ok\) return null;/.test(l)))
    throw new Error('cloudDropOne no longer reports a failed row delete');
  if (!dr.some(l => /\}catch\(_\)\{ return null; \}/.test(l)))
    throw new Error('the function-level catch is gone, so a real failure would not answer null');
});

fs.renameSync(TMP, FILE);
console.log('patch497 written, ' + grew + ' bytes');
