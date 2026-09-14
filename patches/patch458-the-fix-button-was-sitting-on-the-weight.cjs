/* THE FIX BUTTON WAS SITTING ON TOP OF THE RARITY WEIGHT.

   Found by a sweep, and it is mine: patch440 put the per-tile "fix" button on
   the tile and its comment says "THE SAME TREATMENT AS THE REMOVE BUTTON, on
   the other corner". I never checked what was on the other corner. Two things
   were - the rarity input and the status dot, both at left:3px; top:3px.

   .fx is appended last, has no z-index and an opaque background, so it wins
   the hit test. On a desktop the collision only appears while the tile is
   hovered - which is the only way to reach either of them, so it is every
   time. On a touch screen the (hover:none) rule shows .fx unconditionally at
   30px tall over a 46px-wide input: tapping a trait's weight to retype it
   sends the trait to Fix pixels instead. There is no other way to set a
   weight from the shelf, so on a phone that number could not be changed at
   all.

   Measured on a real tile at three widths: the tile is 155-160px, .rar
   occupies 4..50 from the left, the remove button is 19px (30 on touch) at
   the right edge. Moving .fx to the right of it puts it at 101..129 on a
   desktop and 79..119 on touch, both clear of 50 with room to spare.

   AND THE STATUS DOT GOES, because it has never once been visible. .st is 9px
   at left:3px; top:3px, appended BEFORE the rarity input, which is opaque and
   larger in both directions - so the input has painted over it on every tile
   at every width since it was added. Its title is unreachable for the same
   reason. Nothing needs it: .cyc sits on the same tile and says the status in
   words, which is also why nobody noticed. The giveaway is in the stylesheet
   - .st.wip, .st.approved and .st.rejected have colours and stfp was never
   given one, because a missing colour on an invisible dot looks like nothing.

   Deleted rather than moved: a second status indicator two centimetres from
   the one that works is not worth the tile space, and "move it somewhere" is
   a design decision nobody has asked for. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. off the corner that was already taken ----------------------- */
{
  const at = kit.only(L, l => l === '.item .fx{position:absolute; top:3px; left:3px; height:19px; padding:0 6px;',
    'the fix button');
  kit.replace(L, { start: at, end: at }, [
    '/* NEXT TO THE REMOVE BUTTON, not opposite it. The comment above said "on',
    '   the other corner" and the other corner already held the rarity input,',
    '   which this covered - and covered opaquely, appended last, so the tap',
    '   landed here and sent the trait to Fix pixels instead of focusing the',
    '   number. On a touch screen, where this shows without a hover, that was',
    '   the only way to set a weight from the shelf.',
    '',
    '   26 = the remove button at right:3px plus its 19px plus a gap. Measured',
    '   on a real tile: 155-160px wide, the input ends at 50 from the left and',
    '   this starts at 101. */',
    '.item .fx{position:absolute; top:3px; right:26px; height:19px; padding:0 6px;',
  ]);
}
{
  const at = kit.only(L, l => l === '  .item .fx{display:block; height:30px; line-height:30px; font-size:12px;',
    'the touch fix button');
  if (L[at + 1] !== '    padding:0 9px;}')
    throw new Error('the touch rule is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  /* 37 here, because the remove button is 30px on touch rather than 19.',
    '     Measured on a 390px phone: this lands at 79 from the left and the',
    '     46px-wide input ends at 50. */',
    '  .item .fx{display:block; height:30px; line-height:30px; font-size:12px;',
    '    padding:0 9px; right:37px;}',
  ]);
}

/* ---- 2. and the dot nobody has ever seen ---------------------------- */
{
  const at = kit.only(L, l => l === '.item .st{position:absolute; top:3px; left:3px; width:9px; height:9px; border-radius:50%;',
    'the status dot rule');
  if (L[at + 1] !== '  border:1px solid #0008;}'
    || L[at + 2] !== '.st.wip{background:var(--accent);} .st.approved{background:var(--good);} .st.rejected{background:var(--bad);}')
    throw new Error('the status dot rules are not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '/* THE STATUS DOT IS GONE. It was 9px at left:3px; top:3px, appended before',
    '   the rarity input, which sits at the same point, is opaque and is larger',
    '   in both directions - so it was painted over on every tile at every',
    '   width from the day it was added, and its title was unreachable with it.',
    '   .cyc says the status in words on the same tile, which is why nobody',
    '   ever noticed. The stylesheet said so too: wip, approved and rejected',
    '   had colours and stfp was never given one. */',
  ]);
  const mk = kit.only(L, l => l.indexOf("st.className='st '+(t.status||'wip');") >= 0,
    'where the status dot is made');
  if (L[mk - 1].indexOf("const st=document.createElement('span');") < 0)
    throw new Error('the status dot is not made the way this expects');
  kit.replace(L, { start: mk - 1, end: mk }, []);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE TWO ARE NO LONGER ON THE SAME CORNER. */
  if (!/\.item \.fx\{position:absolute; top:3px; right:26px;/.test(text))
    throw new Error('the fix button is still on the rarity corner');
  if (!/\.item \.rar\{position:absolute; left:3px; top:3px;/.test(text))
    throw new Error('the rarity input moved, so the numbers above are now wrong');
  if (!/\.item \.fx\{display:block; height:30px; line-height:30px; font-size:12px;\r?\n    padding:0 9px; right:37px;\}/.test(text))
    throw new Error('the touch rule does not clear the bigger remove button');
  /* AND NOT ON THE REMOVE BUTTON EITHER - that is the corner it moved to. */
  if (!/\.item \.x\{position:absolute; top:3px; right:3px; width:19px; height:19px;/.test(text))
    throw new Error('the remove button moved, so right:26px may now overlap it');

  /* THE DOT IS GONE, ELEMENT AND RULES. Leaving either half would be a dead
     class or an element with no styling. */
  if (/\.item \.st\{/.test(text) || /\.st\.wip\{/.test(text))
    throw new Error('the status dot still has rules');
  const code = codeLines.join('\n');
  if (code.indexOf("st.className='st '") >= 0)
    throw new Error('the status dot is still being built');
  /* AND WHAT REPLACED IT IS STILL THERE: the tile still says its status. */
  if (code.indexOf("cyc.className='cyc'") < 0)
    throw new Error('nothing on the tile says the status any more');
  /* No orphan: the variable it was assigned to must be gone too. */
  if (/const st=document\.createElement\('span'\);/.test(code))
    throw new Error('the status dot element is still created');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
