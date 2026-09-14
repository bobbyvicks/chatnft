/* A BLACK DOT WHERE YOU THINK THERE IS NOTHING.

   "its hard for people to see certain colour ranges when editing and when
   theres like black spots where its supposed to be nothing but the user
   thinks they see nothing but theres actually a black dot we currently have a
   white background button but can we make the background less dark"

   THE CHEQUERBOARD WAS NEARLY BLACK, so a black pixel on it was invisible.
   Its two squares are var(--panel) - #1a1720 - and a 55% mix of --ground with
   the same, about #16131b. Measured as contrast ratios:

     backdrop            vs a black pixel   vs a white pixel   square to square
     the dark chequer          1.14               17.69              1.04
     white (the button)       21.00                1.00              1.00
     this                      4.63                3.19              1.42

   1.14 against black is not "hard to see", it is not visible: 1 is two
   identical colours. And at 1.04 the chequer did not read as a chequer
   either, so the one signal that says "this part is EMPTY" was not being
   given - which is exactly the confusion being described. Nothing and a black
   dot looked the same because they nearly were.

   A MID GREY, WHICH IS WHAT EVERY OTHER EDITOR USES AND FOR THIS REASON. Both
   ends now clear 3:1, which is the threshold for telling two non-text things
   apart; black clears 4.6, because a black pixel on empty canvas is the case
   that was reported. Chasing black further costs the other end - the next
   step up the candidates measured takes black to 5.06 and drops white to
   2.62, which starts hiding highlights instead.

   ON THE FRAME, NOT THE STAGE. The frame is sized to the artwork, so this
   lands exactly behind the trait and the dark surround stays dark - the
   chequer then MEANS the canvas, and its edge is visible without a border.
   That is the same reasoning the white background already carried.

   AND THE BUTTON TAKES A THIRD TURN. It was white or chequer; the other half
   of the complaint is colour ranges generally, and a pale trait on a pale
   backdrop is the same problem the other way up. Chequer, white, black -
   every range has a backdrop it reads against, and none of them is part of
   the artwork any more than the base is. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the backdrop -------------------------------------------------- */
{
  const at = kit.only(L, l => l === '.frame.whitebg{background:#fff;}', 'the white backdrop');
  kit.replace(L, { start: at, end: at }, [
    '/* THE EMPTY PARTS OF THE CANVAS, and the one thing that says they are',
    '   empty. It was var(--panel) against a 55% mix of --ground - #1a1720 and',
    '   #16131b - which is 1.04 between the squares and 1.14 against a black',
    '   pixel. A black dot on nothing was invisible, and the chequer that is',
    '   supposed to say "nothing" was invisible too.',
    '',
    '   #948da0 and #7a7387 measure 4.63 against black and 3.19 against white,',
    '   so both ends clear the 3:1 that tells two non-text things apart, and',
    '   1.42 between the squares reads as a chequer. Lighter helps black and',
    '   costs white: the next candidate measured was 5.06 and 2.62.',
    '',
    '   16px squares, matching the stage behind it, so the two do not beat',
    '   against each other at the frame edge. */',
    '.frame{background:',
    '  linear-gradient(45deg,#948da0 25%,transparent 25%,transparent 75%,#948da0 75%),',
    '  linear-gradient(45deg,#948da0 25%,#7a7387 25%,#7a7387 75%,#948da0 75%);',
    '  background-size:16px 16px; background-position:0 0,8px 8px;}',
    '/* A PLAIN BACKDROP, for the times the chequer itself is the thing in the',
    '   way: white for a dark trait, black for a pale one. Neither reaches a',
    '   save or an export, for the same reason the base does not - they are a',
    '   class on a div and not a canvas. */',
    '.frame.whitebg{background:#fff;}',
    '.frame.blackbg{background:#0b0910;}',
  ]);
}

/* ---- and the button takes a third turn ------------------------------ */
{
  const at = kit.only(L, l => l === '$("basewhite").onclick=()=>{', 'the backdrop button');
  if (L[at + 4] !== '  $("frame").classList.toggle("whitebg",on);' || L[at + 5] !== '};')
    throw new Error('the backdrop button is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 5 }, [
    '/* THREE BACKDROPS, CYCLED. The label says what the NEXT press gives, which',
    '   is what it always said - there is simply one more of them now. A pale',
    '   trait on white is the same complaint as a black dot on near-black, so',
    '   black is here for the same reason white is.',
    '',
    '   aria-pressed stays true for anything that is not the chequer: the',
    '   button is "the backdrop is not the default one", which is the fact a',
    '   screen reader can use. */',
    'const FRAME_BGS=["","whitebg","blackbg"];',
    'const FRAME_BG_NEXT={"":"White background","whitebg":"Black background",',
    '  "blackbg":"Chequerboard background"};',
    'let frameBg=0;',
    '$("basewhite").onclick=()=>{',
    '  const b=$("basewhite"), f=$("frame");',
    '  frameBg=(frameBg+1)%FRAME_BGS.length;',
    '  const now=FRAME_BGS[frameBg];',
    '  for(const c of FRAME_BGS) if(c) f.classList.toggle(c,c===now);',
    '  b.setAttribute("aria-pressed",String(now!==""));',
    '  b.textContent=FRAME_BG_NEXT[now];',
    '};',
  ]);
}

/* ---- and the button says what it does now --------------------------- */
{
  const at = kit.only(L, l => l.indexOf('title="Put white behind the trait instead of the chequerboard') >= 0,
    'the backdrop button title');
  kit.replace(L, { start: at, end: at }, [
    '          title="What sits behind the trait where it is transparent:'
    + ' a chequerboard, white for judging a dark outline, or black for a pale'
    + ' one. Never part of the artwork.">White background</button>',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE BACKDROP IS NO LONGER NEARLY BLACK. */
  if (!/\.frame\{background:\r?\n  linear-gradient\(45deg,#948da0 25%/.test(text))
    throw new Error('the frame has no chequer of its own');
  if (!/linear-gradient\(45deg,#948da0 25%,#7a7387 25%,#7a7387 75%,#948da0 75%\);/.test(text))
    throw new Error('the two chequer squares are not the measured pair');
  /* AND THE OLD NEAR-BLACK PAIR IS NOT WHAT SHOWS THROUGH THE ART. The stage
     still uses it as chrome AROUND the frame, which is fine - what mattered
     is what sits behind the artwork. */
  const fr = text.indexOf('.frame{background:');
  const wb = text.indexOf('.frame.whitebg{background:#fff;}');
  if (!(fr >= 0 && fr < wb))
    throw new Error('the plain backdrops no longer override the chequer');

  /* THREE OF THEM, CYCLED, AND THE CLASSES REALLY EXIST. */
  const code = codeLines.join('\n');
  if (!/const FRAME_BGS=\["","whitebg","blackbg"\];/.test(code))
    throw new Error('there are not three backdrops');
  for (const c of ['whitebg', 'blackbg'])
    if (text.indexOf('.frame.' + c + '{background:') < 0)
      throw new Error('the ' + c + ' backdrop has no rule, so it would do nothing');
  if (!/frameBg=\(frameBg\+1\)%FRAME_BGS\.length;/.test(code))
    throw new Error('the backdrop does not cycle');
  /* ONE AT A TIME. Two backdrop classes at once is a rule fight decided by
     source order rather than by the button. */
  if (!/for\(const c of FRAME_BGS\) if\(c\) f\.classList\.toggle\(c,c===now\);/.test(code))
    throw new Error('two backdrops could be on at once');
  /* AND IT STILL SAYS WHAT THE NEXT PRESS GIVES, which is what the label has
     always meant here. */
  if (!/b\.textContent=FRAME_BG_NEXT\[now\];/.test(code))
    throw new Error('the button stopped naming what it will do');
  if (text.indexOf('Put white behind the trait instead of the chequerboard') >= 0)
    throw new Error('the button still describes a two-way toggle');

  /* NONE OF THIS REACHES THE ARTWORK. They are classes on a div; the save and
     the export read canvases, and this must stay true or a backdrop ends up
     baked into a trait. */
  if (/#art[^{]*\{[^}]*whitebg/.test(text) || /blackbg[^{]*canvas/.test(text))
    throw new Error('a backdrop is being applied to a canvas');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
