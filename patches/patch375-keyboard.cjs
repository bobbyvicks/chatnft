/* TOUCH ANY FIELD ON A PHONE AND THE WHOLE PAGE ZOOMS IN AND STAYS THERE.

   iOS Safari zooms the layout whenever a focused text field is smaller than
   16px, and it does not zoom back out on blur. Measured on this page at a 375px
   viewport: sixty-nine of sixty-nine focusable fields are under 16px. The first
   one anybody touches is the username box on the sign-in card, so the page is
   zoomed before you are even signed in, and stays zoomed - on an app whose whole
   job is a canvas fitted to the viewport.

   Twelve of those fields match no rule in the file at all and sit at the browser
   default, 13.333px in boxes 19 to 21 pixels tall: the two selects that pair a
   never-together rule, the trait name box in review, the new-layer box, the
   workspace switcher, the generate count. Two 19px selects side by side is a
   guess with a thumb.

   WHAT CHANGES.

   1. Every focusable field is 16px at 820px and under. As one rule with
      !important, which this file uses sparingly and for exactly this kind of
      reason: every other font size on a field is a DESKTOP DENSITY choice, and
      the density pass is a desktop pass - it says so itself, three comments up
      from where this lands. Colour, range, checkbox and radio are left alone;
      they do not take a caret and do not trigger the zoom.

      A blanket rule without !important would not have worked and it is worth
      saying why: .savebar input is 0,1,1 and .item .rar is 0,2,0, so a bare
      input,select,textarea at 0,0,1 loses to both - including on the sign-in
      card, which is the field this is most for.

   2. The rarity box on a shelf tile grows to fit 16px text, and the percentage
      beside it moves over. That box is 36px wide with 10px text today; leaving
      it while everything else grew would clip the number it exists to show.

   3. interactive-widget=resizes-content on the viewport meta. The page measures
      panels in dvh, and without this the keyboard covers the bottom of a card
      with no way to scroll it up - the Text panel's Place, Centre, Add to art
      and Close all live under it. With it, dvh means the space above the
      keyboard and the card recentres itself. Chrome and Android honour it;
      Safari ignores it, which is why it is an addition rather than the fix.

   4. autocapitalize off on the three fields whose text becomes an id or a name.
      iOS capitalises a text input by default, so "blue hat" typed on a phone
      is committed as "Blue hat" - and the record id is built from the name, so
      that is a SECOND trait rather than the clash the page would otherwise
      catch, and the rules naming "blue hat" no longer see it. The sign-in box
      already carries these attributes; these three did not.

   5. inputmode="text" on every number field that accepts a negative. The iOS
      numeric keypad has no minus key, so the text tool's shadow could only go
      right and down, letters could only lean one way, and the bend only bent
      one way. Found by scanning for min="-" rather than by listing ids, and
      checked the same way after, so a seventh one added later is caught. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

/* THE FILE HAS MORE THAN ONE 820px BLOCK - two, and the first closes long
   before the phone pass, so a findIndex on the opening line lands in the wrong
   one. That is how this check first refused a correct edit. Every block is
   scanned, and the rule has to be inside one of them.

   Takes a SUBSTRING rather than a pattern: escaping a regex through the layers
   of quoting these scripts are written in broke this twice. */
function insidePhoneBlock(lines, needle){
  const NL=String.fromCharCode(10);
  for(let open=0; open<lines.length; open++){
    if(lines[open]!=='@media (max-width:820px){') continue;
    let depth=0, close=-1;
    for(let i=open;i<lines.length;i++){
      for(const ch of lines[i]){ if(ch==='{') depth++; else if(ch==='}') depth--; }
      if(depth===0){ close=i; break; }
    }
    if(close<0) continue;
    if(lines.slice(open,close+1).join(NL).indexOf(needle)>=0) return {open:open, close:close};
  }
  return null;
}

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* How many negative-capable number fields there are BEFORE the edit, so the
   check afterwards is against a real population rather than a guess. */
const negBefore = L.filter(l => /type="number"/.test(l) && /min="-/.test(l)).length;
if (negBefore < 5) throw new Error('only ' + negBefore + ' negative number fields found; the scan is wrong');

/* ---- 3: the viewport meta --------------------------------------- */
{
  const at = kit.only(L, l => l.indexOf('<meta name="viewport"') >= 0, 'the viewport meta');
  if (L[at].indexOf('interactive-widget') >= 0)
    throw new Error('the viewport meta already handles the keyboard');
  kit.replace(L, { start: at, end: at }, [
    L[at].replace('viewport-fit=cover', 'viewport-fit=cover,interactive-widget=resizes-content'),
  ]);
}

/* ---- 1 and 2: the phone type size ------------------------------- */
{
  const anchor = kit.only(L, l => l === '  .opts input[type=color],.card input[type=color]{height:30px;}',
    'the colour input restore in the phone block');
  kit.replace(L, { start: anchor, end: anchor }, [
    '  .opts input[type=color],.card input[type=color]{height:30px;}',
    '  /* SIXTEEN PIXELS OR IOS ZOOMS THE PAGE IN AND DOES NOT COME BACK.',
    '',
    '     Measured at 375px: 69 of 69 focusable fields were under 16px, starting',
    '     with the username box on the sign-in card - so the page was zoomed',
    '     before anybody was signed in, on an app that fits artwork to the',
    '     viewport. Twelve of them matched no rule in this file at all and sat at',
    '     the browser default in 19px boxes.',
    '',
    '     !important, and deliberately. The density pass this block undoes is a',
    '     DESKTOP pass - the comment above says so - and its sizes are set',
    '     through .savebar input (0,1,1) and .item .rar (0,2,0), which both beat',
    '     a plain input,select,textarea at 0,0,1. The choice is between this and',
    '     restating every one of those selectors here and keeping the two lists',
    '     in step forever, which is the failure the pair-must-match comment above',
    '     already records happening once.',
    '',
    '     Colour, range, checkbox and radio are left out: they take no caret, so',
    '     they never trigger the zoom, and their size is set by width and height',
    '     a few lines up. */',
    '  input:not([type=color]):not([type=range]):not([type=checkbox]):not([type=radio]),',
    '  select,textarea{font-size:16px!important;}',
    '  /* And the one box that was sized around its old 10px text. Left at 36px',
    '     it would clip the weight it exists to show; the percentage beside it',
    '     moves over by the same amount. */',
    '  .item .rar{width:46px; padding:4px 3px;}',
    '  .item .pct{left:53px;}',
  ]);
}

/* ---- 4: the three fields whose text becomes an id --------------- */
{
  const fields = [
    ['revname', '            <input id="revname" type="text" style="flex:1;min-width:0" aria-label="Final name">'],
    ['newlayer', '        <input id="newlayer" type="text" placeholder="new layer name" aria-label="New layer name">'],
    ['tname', '          <input id="tname" type="text" placeholder="trait name" aria-label="Trait name">'],
  ];
  for (const [id, line] of fields) {
    const at = kit.only(L, l => l === line, 'the ' + id + ' field');
    kit.replace(L, { start: at, end: at }, [
      line.replace('>', ' autocapitalize="none" autocorrect="off" spellcheck="false">'),
    ]);
  }
}

/* ---- 5: the number fields that accept a minus ------------------- */
{
  let done = 0;
  for (let i = 0; i < L.length; i++) {
    if (!/type="number"/.test(L[i]) || !/min="-/.test(L[i])) continue;
    if (/inputmode=/.test(L[i])) continue;
    L[i] = L[i].replace('type="number"', 'type="number" inputmode="text"');
    done++;
  }
  if (done !== negBefore)
    throw new Error('changed ' + done + ' of ' + negBefore + ' negative number fields');
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ text, lines }) => {
  if (text.indexOf('interactive-widget=resizes-content') < 0)
    throw new Error('the viewport meta does not resize for the keyboard');

  /* EVERY negative-capable number field, recounted from what was written -
     not the list this patch happened to walk. */
  const neg = lines.filter(l => /type="number"/.test(l) && /min="-/.test(l));
  if (neg.length !== negBefore)
    throw new Error('there are ' + neg.length + ' negative number fields now, there were ' + negBefore);
  const missing = neg.filter(l => !/inputmode="text"/.test(l));
  if (missing.length)
    throw new Error(missing.length + ' negative number fields still offer a keypad with no minus');

  /* And the positive ones are untouched, or this changed something it did not
     mean to. */
  const pos = lines.filter(l => /type="number"/.test(l) && !/min="-/.test(l));
  const meddled = pos.filter(l => /inputmode="text"/.test(l));
  if (meddled.length) throw new Error(meddled.length + ' positive number fields were given a text keyboard');

  for (const id of ['tname', 'newlayer', 'revname']) {
    const l = lines.find(x => x.indexOf('id="' + id + '"') >= 0);
    if (!l || l.indexOf('autocapitalize="none"') < 0)
      throw new Error('#' + id + ' still lets a phone capitalise what becomes a record id');
  }

  /* The rule landed INSIDE a phone block, not after one - which is the whole
     difference between fixing a phone and enlarging every desktop field. */
  const at=insidePhoneBlock(lines, 'select,textarea{font-size:16px!important;}');
  if(!at) throw new Error('the 16px rule is not inside any 820px block');
  if(!insidePhoneBlock(lines, '.item .rar{width:46px'))
    throw new Error('the rarity box was not widened for its new type size');
  /* And it really is scoped: nothing outside that block says it. */
  const outside=lines.slice(0,at.open).concat(lines.slice(at.close+1)).join(String.fromCharCode(10));
  if(outside.indexOf('font-size:16px!important')>=0)
    throw new Error('the 16px rule escaped the phone block');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes  ('
  + negBefore + ' negative number fields given a keyboard with a minus)');
