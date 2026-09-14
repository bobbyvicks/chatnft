/* ON A TOUCH SCREEN THE TOOLS FOLD, AND THE PANEL STOPS SCROLLING THERE TOO.

   "can we get rid of the scroll bar on smaller screens too i want to make
   this site as seamless and efficient as possible"

   patch453 took the two-column layout down to 821px, which is where the touch
   sheet begins, so every laptop is now scroll-free. Below that it is not a
   gate that can be lowered - it is arithmetic.

   TWO COLUMNS ARE NOT AVAILABLE ON THE SHEET. The palette is 16 wide and the
   sheet floors every target at 30px for touch. In one 560px card those come
   out 32 across; split into two columns they would be 15.6, which is under
   the floor the sheet exists to enforce. Measured on the sheet: 1,234px of
   content in a card of 864.

   SO THE TWO TOOL BLOCKS FOLD, and only there. Collapsed, the panel is about
   783 against 810 on a 390x844 phone - the trait's colours and all 256 of the
   palette visible at once with no scrollbar, which is the pair the panel is
   for. What folds is Recolour and Palette file: the things you go and use,
   not the things you look at.

   CSS DECIDES IT, NOT A REMEMBERED SETTING. The fold only exists inside the
   sheet's media query, so on a desktop both blocks are open and their toggles
   are not rendered at all - there is no state to persist, nothing to get
   stuck collapsed on a big screen, and no first-run rule to reason about. A
   tap adds .open and that wins inside the query.

   OPENING ONE DOES SCROLL, and that is the honest shape of it: 531px of
   palette plus a 380px tool block cannot both be on a phone screen. What is
   gone is the scrollbar you get for doing nothing. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- wrap the two blocks, bottom one first -------------------------- */
{
  const fileStart = kit.only(L, l => l === '      <!-- UNDER THE PALETTE, because loading and writing a palette file',
    'the palette-file block');
  const fileEnd = kit.only(L, l => l === '      <input type="file" id="piofile" accept=".gpl,.pal,.hex,image/*" hidden>',
    'the end of the palette-file block');
  const toolStart = kit.only(L, l => l === '      <!-- UNDER THE TRAIT\'S OWN COLOURS, because that is what Replace,',
    'the recolour block');
  const toolEnd = kit.only(L, l => l === '        <button class="btn" id="rcclean">Clean up colours</button>',
    'the end of the recolour block');
  if (L[toolEnd + 1] !== '      </div>')
    throw new Error('the recolour block does not close where this expects');
  if (!(toolStart < toolEnd && toolEnd < fileStart && fileStart < fileEnd))
    throw new Error('the two blocks are not where this expects');

  const sec = (id, label) => ([
    '      <section class="clsec" id="' + id + '">',
    '        <button type="button" class="clsectog" aria-expanded="false"',
    '          aria-controls="' + id + 'body">' + label,
    '          <span class="fold" aria-hidden="true">▾</span></button>',
    '        <div class="clsecbody" id="' + id + 'body">',
  ]);

  kit.replace(L, { start: fileEnd, end: fileEnd }, [
    L[fileEnd],
    '        </div>',
    '      </section>',
  ]);
  kit.replace(L, { start: fileStart, end: fileStart - 1 }, sec('clfile', 'Palette file'));
  kit.replace(L, { start: toolEnd + 1, end: toolEnd + 1 }, [
    L[toolEnd + 1],
    '        </div>',
    '      </section>',
  ]);
  kit.replace(L, { start: toolStart, end: toolStart - 1 }, sec('clrc', 'Recolour'));
}

/* ---- what it looks like, and only on the sheet ---------------------- */
{
  const at = kit.only(L, l => l === '#clscrim>.card{max-height:min(96dvh,940px);}',
    'the colours card height');
  kit.replace(L, { start: at, end: at }, [
    L[at],
    '/* THE FOLD EXISTS ONLY ON THE TOUCH SHEET. On anything wider there is',
    '   room for both blocks, so the toggle is not rendered and the body is',
    '   never hidden - which is also why no state is stored anywhere: a',
    '   collapsed block cannot follow you onto a big screen and sit there',
    '   shut. */',
    '.clsectog{display:none;}',
    '@media (max-width:820px){',
    '  .clsectog{display:flex; align-items:center; gap:8px; width:100%;',
    '    background:none; border:0; border-top:1px solid var(--line);',
    '    color:var(--muted); font:inherit; font-size:12.5px; letter-spacing:.04em;',
    '    text-transform:uppercase; padding:11px 0 9px; margin-top:8px;',
    '    min-height:36px; text-align:left; cursor:pointer;}',
    '  .clsectog:hover{color:var(--ink);}',
    '  .clsectog:focus-visible{outline:2px solid var(--accent); outline-offset:3px;',
    '    border-radius:4px;}',
    '  .clsectog .fold{margin-left:auto; font-size:13px; line-height:1;',
    '    transition:transform .15s;}',
    '  .clsec:not(.open) .clsectog .fold{transform:rotate(-90deg);}',
    '  .clsec:not(.open) .clsecbody{display:none;}',
    '}',
  ]);
}

/* ---- and the tap ---------------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function popAt(id){', 'the pop-out placer');
  kit.replace(L, { start: at, end: at }, [
    '/* A SECTION THAT FOLDS, on the touch sheet only - the rule that hides a',
    '   body lives inside that media query, so on a desktop this class does',
    '   nothing and the toggle it is on is not rendered. Delegated from the',
    '   panel rather than bound per button, because the panel is built once',
    '   and this is two buttons. */',
    '(function(){',
    '  const p=$("clscrim"); if(!p) return;',
    '  p.addEventListener("click",e=>{',
    '    const b=e.target.closest(".clsectog"); if(!b||!p.contains(b)) return;',
    '    const sec=b.closest(".clsec"); if(!sec) return;',
    '    const open=sec.classList.toggle("open");',
    '    b.setAttribute("aria-expanded",String(open));',
    '  });',
    '})();',
    'function popAt(id){',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE TWO BLOCKS ARE SECTIONS, once each, and they hold what they say. */
  for (const id of ['clrc', 'clfile'])
    if ((text.match(new RegExp('id="' + id + '"', 'g')) || []).length !== 1)
      throw new Error('the ' + id + ' section is not in exactly one place');
  const rc = text.indexOf('id="clrc"'), rcEnd = text.indexOf('id="rcclean"');
  const fl = text.indexOf('id="clfile"'), flEnd = text.indexOf('id="pioexport"');
  if (!(rc >= 0 && rc < rcEnd)) throw new Error('the recolour tools are not inside their section');
  if (!(fl >= 0 && fl < flEnd)) throw new Error('the palette file rows are not inside their section');
  /* AND EACH BODY IS WHAT THE TOGGLE POINTS AT, or the fold hides nothing and
     a screen reader is told about a region that does not exist. */
  for (const id of ['clrc', 'clfile']) {
    if (text.indexOf('aria-controls="' + id + 'body"') < 0)
      throw new Error('the ' + id + ' toggle points at no body');
    if (text.indexOf('class="clsecbody" id="' + id + 'body"') < 0)
      throw new Error('the ' + id + ' body is not there to point at');
  }

  /* THE FOLD IS ONLY ON THE SHEET. A rule outside the query would let a block
     sit collapsed on a desktop with no way to see that it had. */
  if (!/\.clsectog\{display:none;\}/.test(text))
    throw new Error('the toggle shows on a desktop, where it does nothing');
  const q = text.indexOf('@media (max-width:820px){\r\n  .clsectog{display:flex;');
  if (q < 0) throw new Error('the fold is not inside the touch sheet query');
  const hide = text.indexOf('.clsec:not(.open) .clsecbody{display:none;}');
  if (hide < q) throw new Error('the hiding rule is outside the query that scopes it');

  /* AND NOTHING IS REMEMBERED, which is what keeps it from following anybody
     onto a screen where it makes no sense. */
  if (/clsec[^\n]*localStorage/.test(text))
    throw new Error('the fold is being stored, so it can outlive the screen it was for');

  /* THE TAP WORKS AND SAYS SO. */
  const code = codeLines.join('\n');
  if (code.indexOf('const open=sec.classList.toggle("open");') < 0)
    throw new Error('nothing opens a folded section');
  if (code.indexOf('b.setAttribute("aria-expanded",String(open));') < 0)
    throw new Error('the toggle does not report its own state');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
