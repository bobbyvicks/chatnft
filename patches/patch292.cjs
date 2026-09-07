/* THE SETTINGS PAGE IS STILL 9,437 PIXELS, AND THE PREVIEW IS TOO SMALL.

   Two things, both from the same complaint that one page was too much.

   1. PLAN RARITY OPENS AS 271 SLIDERS. Splitting the pages moved it off the
      way but did not make it usable: measured, the settings page is 9,437px
      and almost all of it is that one section. Each set folds now, and they
      start shut - so the page opens as fourteen headings and you open the one
      you are working on. A shut heading still carries its own count of what
      has no rarity yet, because the whole point of that number is to be seen.

      Which sets are open is kept in memory and not in storage. Every commit
      re-renders the plan, so a group that shut itself the moment a slider
      moved would be unusable; and "which sets I had open" is about this
      sitting rather than about the project, so it does not belong in a record
      that syncs.

   2. THE GENERATOR PREVIEW IS 300px. Three times that, as asked. It sits in a
      flex row beside the dropdowns, which are min-width 230 and wrap when
      there is no room - so a wide screen gets a 900px character and a narrow
      one gets the preview full width with the dropdowns underneath, which is
      the better shape there anyway. The 72vw cap that already stopped it
      overflowing a phone is untouched.

   And .how - the three-line "Measures / Recovers / Edits" explainer about the
   editor - is put on the main page with the rest of the editor's own
   furniture, rather than repeating under the project and its settings. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the explainer belongs with the editor ---------------------- */
swap('  <div class="how">', '  <div class="how pg-home">');

/* ---- 2. the generator preview, three times the size ---------------- */
swap('#ccanvas{width:min(300px,72vw); height:auto; image-rendering:pixelated; border-radius:10px;',
  block([
    '/* THREE TIMES THE OLD 300px, by request - the character being previewed was',
    '   too small to judge. It shares a flex row with the dropdowns, which are',
    '   min-width 230 and wrap when there is no room, so a wide screen gets a',
    '   900px character and a narrower one gets the preview full width with the',
    '   dropdowns beneath it. The 72vw cap is what already kept it inside a',
    '   phone and is unchanged. */',
    '#ccanvas{width:min(900px,72vw); height:auto; image-rendering:pixelated; border-radius:10px;',
  ]));

/* ---- 3. each set in the plan folds --------------------------------- */
swap('.plantot{font-size:11px; color:var(--dim); margin:5px 0 0;}', block([
  '.plantot{font-size:11px; color:var(--dim); margin:5px 0 0;}',
  '/* A set folds. Fourteen headings open far faster than 271 sliders, and the',
  '   heading keeps saying how many in it still need a rarity - a fold that',
  '   hid the reason to open it would be worse than the scroll. */',
  'button.planhead{width:100%; font:inherit; color:inherit; background:none;',
  '  text-align:left; cursor:pointer;}',
  'button.planhead:hover b{color:var(--accent);}',
  'button.planhead:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}',
  '.planhead .fold{font-size:11px; color:var(--dim); transition:transform .15s;}',
  '.plangrp.shut .planhead .fold{transform:rotate(-90deg);}',
  '.plangrp.shut .planbody{display:none;}',
  '.planhead .todo{color:var(--accent);}',
]));

swap(block([
  '  const head=document.createElement("div");',
  '  head.className="planhead";',
  '  const nm=document.createElement("b"); nm.textContent=g.layer;',
  '  const cnt=document.createElement("span");',
  '  cnt.textContent=n+(n===1?" trait":" traits");',
  '  const when=document.createElement("span");',
  '  const pres=layerPresence(g.layer);',
  '  when.textContent = g.off ? "turned off - nothing here is drawn"',
  '    : pres>=1 ? "on every character"',
  '    : "on "+Math.round(pres*100)+"% of characters";',
  '  head.appendChild(nm); head.appendChild(cnt); head.appendChild(when);',
  '  wrap.appendChild(head);',
]), block([
  '  /* A BUTTON, so the keyboard, the focus ring and the aria state come free -',
  '     the same shape #proj and the side panel already fold with. */',
  '  const head=document.createElement("button");',
  '  head.type="button";',
  '  head.className="planhead";',
  '  const shut=!PLAN_OPEN.has(g.layer);',
  '  wrap.classList.toggle("shut",shut);',
  '  head.setAttribute("aria-expanded",shut?"false":"true");',
  '  const nm=document.createElement("b"); nm.textContent=g.layer;',
  '  const cnt=document.createElement("span");',
  '  cnt.textContent=n+(n===1?" trait":" traits");',
  '  const when=document.createElement("span");',
  '  const pres=layerPresence(g.layer);',
  '  when.textContent = g.off ? "turned off - nothing here is drawn"',
  '    : pres>=1 ? "on every character"',
  '    : "on "+Math.round(pres*100)+"% of characters";',
  '  head.appendChild(nm); head.appendChild(cnt); head.appendChild(when);',
  '  /* SAID ON THE SHUT HEADING TOO. The count of what still has no rarity is',
  '     the reason to open the set, so hiding it inside the thing it is telling',
  '     you to open would make the fold cost more than the scroll did. */',
  '  const todo=g.rows.filter(t=>!rarityPlanned(t)).length;',
  '  if(todo && !g.off){',
  '    const t=document.createElement("span");',
  '    t.className="todo";',
  '    t.textContent=todo+" still to set";',
  '    head.appendChild(t);',
  '  }',
  '  const car=document.createElement("span");',
  '  car.className="fold"; car.setAttribute("aria-hidden","true");',
  '  car.textContent="\\u25be";',
  '  head.appendChild(car);',
  '  head.onclick=()=>{',
  '    /* The class is toggled here rather than by re-rendering the plan: a',
  '       redraw would rebuild every other set as well, and this has to feel',
  '       like opening a drawer. */',
  '    const nowShut=wrap.classList.toggle("shut");',
  '    if(nowShut) PLAN_OPEN.delete(g.layer); else PLAN_OPEN.add(g.layer);',
  '    head.setAttribute("aria-expanded",nowShut?"false":"true");',
  '  };',
  '  wrap.appendChild(head);',
  '  /* Everything the fold hides, in one element - so the rule is one line of',
  '     CSS rather than a list of what happens to be inside a group today. */',
  '  const body=document.createElement("div");',
  '  body.className="planbody";',
]));

/* Everything that was appended to wrap now goes in the body. */
for (const [a, b] of [
  ['    wrap.appendChild(row);' + NL + '  }' + NL + '  repaint();',
    '    body.appendChild(row);' + NL + '  }' + NL + '  repaint();'],
  ['  wrap.appendChild(foot);', '  body.appendChild(foot);'],
  ['    wrap.appendChild(warn);', '    body.appendChild(warn);'],
  ['    b.onclick=async()=>{ await seedRarity(g.rows); };' + NL + '    wrap.appendChild(b);' + NL + '  }' + NL + '  return wrap;',
    '    b.onclick=async()=>{ await seedRarity(g.rows); };' + NL + '    body.appendChild(b);' + NL + '  }'
    + NL + '  wrap.appendChild(body);' + NL + '  return wrap;'],
]) swap(a, b);

/* ---- 4. which sets are open ---------------------------------------- */
swap('function renderPlan(items){', block([
  '/* Which sets are open, for this sitting only.',
  '',
  '   Not stored: every weight committed re-renders the plan, so a group that',
  '   shut itself the moment a slider moved would be unusable - and "which sets',
  '   I had open" is about now rather than about the project, so it has no place',
  '   in a record that syncs to a teammate. */',
  'const PLAN_OPEN=new Set();',
  '',
  'function renderPlan(items){',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['const PLAN_OPEN=new Set();', '  const shut=!PLAN_OPEN.has(g.layer);',
  '  body.className="planbody";', '  wrap.appendChild(body);',
  '  const todo=g.rows.filter(t=>!rarityPlanned(t)).length;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* Nothing may be appended to wrap except the head and the body, or the fold
   hides some of a group and not the rest.

   SCOPED TO planGroup. Counted over the whole file it found five, because
   `wrap` is an ordinary local name and two other functions use it - a check
   that reads the whole file to make a claim about one function is measuring
   the wrong population, which is the class of mistake this file exists to
   prevent rather than commit. */
const gStart = code.indexOf('function planGroup(');
if (gStart < 0) throw new Error('planGroup went');
const gEnd = code.indexOf('\r\nfunction ', gStart + 10);
const body = code.slice(gStart, gEnd < 0 ? code.length : gEnd);
const toWrap = (body.match(/wrap\.appendChild\(/g) || []).length;
if (toWrap !== 2)
  throw new Error('expected exactly 2 appends to wrap in planGroup, found ' + toWrap);
if ((body.match(/body\.appendChild\(/g) || []).length < 4)
  throw new Error('the foldable body is not receiving the rows, note and buttons');

if (code.indexOf('#ccanvas{width:min(900px,72vw);') < 0 && text.indexOf('#ccanvas{width:min(900px,72vw);') < 0)
  throw new Error('the preview did not grow');
if (text.indexOf('#ccanvas{width:min(300px,72vw)') >= 0)
  throw new Error('the old preview size survived');

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('class="how pg-home"').length !== 2)
  throw new Error('the explainer is not on the main page exactly once');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
