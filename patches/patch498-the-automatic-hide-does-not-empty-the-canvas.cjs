/* THE AUTOMATIC HIDE DOES NOT EMPTY THE CANVAS.

   Opening a trait runs the base-hide by itself when the base pair covers 88%
   or more of the picture, on the grounds that such a picture is a render
   rather than a trait. The threshold is measured and the gap is real: sixteen
   renders reach 94.5% at the lowest, 264 approved traits 79.1% at the highest.

   But a picture made ENTIRELY of the pair is 100% covered, and removing the
   base from it removes all of it. Measured, a 12x12 block in two flat colours
   on a 40x60 canvas:

     opened  painted 0
     said    "Hid the base - 144 pixels. Undo brings it back."

   The whole trait is gone. It is announced and it is one undo away, so nothing
   is lost - but "hide the base" never means "empty the canvas", and somebody
   who opens a two-tone trait and sees nothing has to work out that the message
   about a base is about their artwork.

   FOUND SIDEWAYS. Every multi-colour fixture I wrote today came back blank and
   I worked around it rather than asking why. The answer was this, firing on
   test artwork that is by construction exactly two flat colours.

   IS IT REACHABLE FOR REAL? Not in this collection today - 79.1% is the
   highest of 264 and the bar is 88. But the population that measurement came
   from is the traits that EXIST, and a flat two-tone trait is the archetype of
   pixel art rather than an exotic case. The threshold is a fact about what has
   been drawn so far, not about what can be.

   THE GUARD IS ON THE AUTOMATIC PATH ONLY. The button still does what it is
   told: somebody who presses Hide the base on a picture that is all base has
   asked for exactly that, and the button already says what it would take. This
   is the same split the surrounding comment argues for - "nothing here guesses
   - they get the button". A hide that would leave nothing is the one outcome
   the automatic path cannot have meant.
*/
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* THE MANUAL PATH MUST STAY UNGUARDED, so it is asserted to exist separately
   before the automatic one is changed. If these ever merge, the split this
   patch depends on is gone. */
kit.only(L, l => l === 'function hideBaseClicked(){', 'the button that asks for it deliberately');

{
  const se = kit.inFunction(L, 'function startEditor(data,w,h,srcW,srcH,pal,recovered){');
  const at = kit.only(L, l => l === '    if(r && (r.gone+r.peeled)){', 'the automatic apply', se);
  kit.replace(L, { start: at, end: at }, [
    '    /* AND SOMETHING HAS TO BE LEFT. A picture made entirely of the base',
    '       pair is 100% covered, so it passes the 88% render test and then the',
    '       hide takes all of it. Measured on a 12x12 block in two flat colours:',
    '       painted 0 afterwards, and "Hid the base - 144 pixels" said about the',
    '       whole trait.',
    '',
    '       Undoable and announced, so nothing is lost - but "hide the base"',
    '       cannot have meant "empty the canvas", and that is the one outcome',
    '       this path should refuse rather than explain.',
    '',
    '       THE BUTTON IS NOT GUARDED. Somebody who presses Hide the base on a',
    '       picture that is all base has asked for it, and the button already',
    '       says what it would take. Same split as the comment above: nothing',
    '       here guesses, they get the button. */',
    '    const left=(()=>{ try{ const q=r&&r.plan&&r.plan.im&&r.plan.im.data;',
    '      if(!q) return 0; let k=0; for(let p=3;p<q.length;p+=4) if(q[p]) k++; return k;',
    '      }catch(_){ return 0; } })();',
    '    if(r && (r.gone+r.peeled) && left){',
  ]);
}

const grew = kit.save(doc, ({ code, codeLines }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  need('    if(r && (r.gone+r.peeled) && left){');
  need('    const left=(()=>{ try{ const q=r&&r.plan&&r.plan.im&&r.plan.im.data;');

  /* THE AUTOMATIC PATH IS THE ONLY ONE GUARDED. hideBase itself and the button
     must be untouched, or a person who asks for this is refused. */
  const bodyOf = (sig) => {
    const a = codeLines.findIndex(l => l === sig);
    if (a < 0) throw new Error('no ' + sig);
    return codeLines.slice(a, codeLines.indexOf('}', a) + 1);
  };
  if (bodyOf('function hideBase(){').some(l => /left/.test(l) && /if\(/.test(l)))
    throw new Error('hideBase itself has gained a guard, so the button is refused too');
  if (bodyOf('function hideBaseClicked(){').some(l => /\bleft\b/.test(l)))
    throw new Error('the button has gained the guard, which is not the split this argues for');

  /* The declaration is above the use, and inside startEditor. */
  const se = bodyOf('function startEditor(data,w,h,srcW,srcH,pal,recovered){');
  const decl = se.findIndex(l => /const left=/.test(l));
  const use = se.findIndex(l => /\(r\.gone\+r\.peeled\) && left/.test(l));
  if (!(decl >= 0 && use >= 0 && decl < use))
    throw new Error('the guard is not declared before it is used, inside startEditor');

  /* And the else that pops the snapshot is still there, so a refusal does not
     leave an undo step for a change nobody made. */
  if (!se.some(l => /\} else undoStack\.pop\(\);/.test(l)))
    throw new Error('the snapshot is no longer popped when nothing is applied');
});

fs.renameSync(TMP, FILE);
console.log('patch498 written, ' + grew + ' bytes');
