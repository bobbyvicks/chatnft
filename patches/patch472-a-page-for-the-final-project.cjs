/* A PAGE THAT HOLDS ONLY THE TRAITS GOING INTO THE FINAL PROJECT.

   Asked for: "right now its a whole mess of traits that are worked on and not
   worked on and its annoying. We have a STFP button but i want it to route to
   a page that will ONLY hold the traits that I want in the final project, make
   it a tab in the sense where when youre inn project it opens up like project
   settings does".

   stfp already exists as a status - the tile chip cycles through it and its
   own tooltip says "Save to final project - the traits that ship" - and
   inCollection already counts it. What was missing was somewhere to stand and
   look at only those.

   A SIXTH PAGE, reached from Project by a button beside Project settings, with
   its own way back. Same jump pattern, which costs ten new pairwise hiding
   rules because that block writes one rule per (page, section) pair on
   purpose: "the failure they prevent is a section appearing on a page nobody
   meant it to".

   WHAT IT SHOWS. The count, then a line per layer, then any layer with nothing
   chosen named as a warning - a layer with no final trait means every
   character generated is missing that piece. Then one block per layer: the
   chosen tiles with a button to take each out, and under them a fold holding
   that layer_s other traits with a button to add each.

   THE FOLD IS BUILT WHEN IT IS OPENED. Each tile decodes a picture, and this
   page is about the set you have chosen rather than the pile you have not - a
   project with 324 traits would otherwise decode all of them to show you the
   twelve you picked.

   TAKING A TRAIT OUT SETS IT TO approved, not wip: it passed review, it is
   just not in the final cut.

   AND BOTH BUTTONS GO THROUGH setTraitStatus, the function 471 extracted. A
   status change is an id change, and six things have to follow it - the
   record, the unsaved draft, the hidden key, the picked key, the group copy,
   and both keys again after the upload gives the record a new row id. A second
   copy of that list here would agree today and drift on the next thing added
   to it, which is the failure the last three commits were about.

   The stfp filter on the shelf is untouched. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the page hides what is not on it ---- */
{
  const at = kit.only(L, l => l === '#land[data-page="fixer"] .pg-agent{display:none;}',
    'the end of the page-hiding rules');
  kit.replace(L, { start: at, end: at }, [
    '#land[data-page="fixer"] .pg-agent,',
    '/* The sixth page, same shape. Ten more lines because the block above says',
    '   why it is pairwise: "the failure they prevent is a section appearing on a',
    '   page nobody meant it to". */',
    '#land[data-page="home"] .pg-final,',
    '#land[data-page="project"] .pg-final,',
    '#land[data-page="settings"] .pg-final,',
    '#land[data-page="agent"] .pg-final,',
    '#land[data-page="fixer"] .pg-final,',
    '#land[data-page="final"] .pg-home,',
    '#land[data-page="final"] .pg-project,',
    '#land[data-page="final"] .pg-settings,',
    '#land[data-page="final"] .pg-agent,',
    '#land[data-page="final"] .pg-fixer{display:none;}',
    '/* The final-set page. The tiles reuse .items and .item, which are generic',
    '   grid and card rules, and add nothing but the row of buttons - there is no',
    '   status chip, no drag handle and no hide button here, because getting away',
    '   from those is the point of the page. */',
    '#finalset .item{cursor:default;}',
    '#finalset .fsnote{font-size:10px; color:var(--muted); opacity:.8;}',
    '#finalset .fsadd{margin-top:9px;}',
    '#finalset .fsadd>summary{cursor:pointer; font-size:11px; color:var(--muted);',
    '  padding:5px 2px; list-style:revert;}',
    '#finalset .fsadd>summary:hover{color:var(--ink);}',
    '#finalset .fsadd .items{margin-top:8px;}',
    '#finalset .fswarn{margin:10px 0 4px; padding:8px 10px; border-radius:8px;',
    '  border:1px solid var(--line); background:var(--ground); font-size:12px;}',
    '#finalset .fscount{font-variant-numeric:tabular-nums;}',
  ]);
}

/* ---- 2. the way in and the way back ---- */
{
  const at = kit.only(L, l => l === '    <button type="button" class="pgjump pg-project" id="tosettings"',
    'the settings jump');
  if (L[at + 1] !== '      data-page="settings">Project settings</button>')
    throw new Error('the settings jump is not shaped the way this expects');
  kit.replace(L, { start: at + 1, end: at + 1 }, [
    '      data-page="settings">Project settings</button>',
    '    <!-- The other room inside the project: only the traits that ship. -->',
    '    <button type="button" class="pgjump pg-project" id="tofinal"',
    '      data-page="final">Final project</button>',
    '    <button type="button" class="pgjump pg-final" id="finalback"',
    '      data-page="project">← Back to the project</button>',
  ]);
}

/* ---- 3. the page itself ---- */
{
  const at = kit.only(L, l => l === '  <section class="proj pg-settings" id="layers" hidden>',
    'the first settings section');
  kit.replace(L, { start: at, end: at }, [
    '  <!-- THE FINAL PROJECT. Only the traits marked stfp, grouped by layer,',
    '       with the count and a warning for any layer holding none of them - a',
    '       layer with no final trait means every character is missing that',
    '       piece. Adding and removing both happen here. -->',
    '  <section class="proj pg-final" id="finalset" hidden>',
    '    <h2>Final project</h2>',
    '    <p class="sub" id="finalsub">Nothing is in the final project yet.</p>',
    '    <div class="fswarn" id="finalwarn" hidden></div>',
    '    <div id="finallayers"></div>',
    '  </section>',
    '  <section class="proj pg-settings" id="layers" hidden>',
  ]);
}

/* ---- 4. the router knows about it ---- */
{
  const at = kit.only(L, l => l === 'const PAGES=["home","project","settings","agent","fixer"];', 'the page list');
  kit.replace(L, { start: at, end: at }, [
    'const PAGES=["home","project","settings","agent","fixer","final"];',
  ]);
}
{
  const at = kit.only(L, l => l === '      || (want==="settings" && b.dataset.page==="project");',
    'which tab stays lit');
  kit.replace(L, { start: at, end: at }, [
    '      || ((want==="settings"||want==="final") && b.dataset.page==="project");',
  ]);
}
{
  const at = kit.only(L, l => l === '  if(want==="settings") renderUpdates();', 'the per-page arrival work');
  kit.replace(L, { start: at, end: at }, [
    '  if(want==="settings") renderUpdates();',
    '  /* Read when you arrive rather than on every shelf render: this page is a',
    '     second pass over every trait, and the page it is on is the only one',
    '     that shows it. */',
    '  if(want==="final") renderFinal();',
  ]);
}

/* ---- 5. and what it draws ---- */
{
  const at = kit.only(L, l => l === 'function showPage(p,push){', 'the router');
  kit.replace(L, { start: at, end: at }, [
    '/* ONE TILE ON THE FINAL PAGE. Picture, name, what it is if that is worth',
    '   saying, and one button. Deliberately not the shelf tile: that one carries',
    '   eight controls, and getting away from them is what this page is for. */',
    'function finalTile(t,label,note,press){',
    '  const el=document.createElement("div");',
    '  el.className="item"; el.title=t.name;',
    '  el.appendChild(shelfTile(t));',
    '  const nm=document.createElement("b"); nm.textContent=t.name; el.appendChild(nm);',
    '  if(note){ const s=document.createElement("b"); s.className="fsnote"; s.textContent=note;',
    '    el.appendChild(s); }',
    '  const b=document.createElement("button");',
    '  b.className="mini"; b.type="button"; b.textContent=label;',
    '  b.setAttribute("aria-label",label+" "+t.name);',
    '  b.onclick=press;',
    '  el.appendChild(b);',
    '  return el;',
    '}',
    '/* MOVE ONE TRAIT IN OR OUT OF THE FINAL SET.',
    '',
    '   Through setTraitStatus, which is the one place that knows what a status',
    '   change has to carry - the record, the unsaved draft, the hidden key, the',
    '   picked key, the group copy, and both keys again after the upload. A second',
    '   copy of that list here would agree today and drift tomorrow.',
    '',
    '   OUT GOES TO approved, not wip: it passed review, it is just not in the',
    '   final cut. */',
    'async function finalMove(t,next){',
    '  const r=await setTraitStatus(t,next);',
    '  if(r.clash){',
    '    toast("There is already "+article(next)+" "+t.name+" in "+(t.layer||"unsorted")',
    '      +" - rename one of them first");',
    '    return;',
    '  }',
    '  if(!r.ok) return;',
    '  await renderFinal();',
    '  renderShelf();',
    '  /* Said the same way the shelf says it, because it is the same event. */',
    '  toast(activeWs && !r.shared',
    '    ? t.name+(next==="stfp"?" is in the final project":" is out of the final project")',
    '      +" here only - the group still has the old one"',
    '    : t.name+(next==="stfp"?" is in the final project":" is out of the final project"));',
    '}',
    '/* THE FINAL PROJECT, DRAWN.',
    '',
    '   Only the traits marked stfp, grouped by layer, with the count and a',
    '   warning naming any layer holding none of them - a layer with no final',
    '   trait means every character generated is missing that piece.',
    '',
    '   unsorted is left out of that warning on purpose: a trait still in',
    '   unsorted has not been filed yet, and "unsorted has nothing final in it"',
    '   is the ordinary state of a finished project rather than a problem. */',
    'async function renderFinal(){',
    '  const host=$("finallayers"); if(!host) return;',
    '  /* SHOWN HERE, because the page rules only ever ADD display:none - the note',
    '     on them says so, so that a section which hides itself for being empty',
    '     stays hidden on its own page too. Every section carries its own hidden',
    '     attribute, and this one starts hidden like the rest.',
    '',
    '     Always shown rather than only when the set has something in it: a page',
    '     saying nothing is in the final project yet is the answer to opening it,',
    '     and a blank screen is not. */',
    '  const sec=$("finalset"); if(sec) sec.hidden=false;',
    '  let items=[];',
    '  try{ items=await dbAll(); }catch(_){ }',
    '  const traits=items.filter(i=>i&&i.kind==="trait");',
    '  const isIn=t=>String(t&&t.status||"wip")==="stfp";',
    '  const chosen=traits.filter(isIn);',
    '  const sub=$("finalsub");',
    '  if(sub) sub.textContent = chosen.length',
    '    ? chosen.length+" trait"+(chosen.length===1?"":"s")+" will go into the final project."',
    '    : "Nothing is in the final project yet. Add traits below, or press stfp on a trait in the project.";',
    '  /* LAYERS first, because that is paint order, then any layer a trait names',
    '     that the list has never heard of - a trait in a layer nobody declared is',
    '     exactly the one somebody needs to see. */',
    '  const order=LAYERS.slice();',
    '  for(const t of traits){ const l=t.layer||"unsorted"; if(order.indexOf(l)<0) order.push(l); }',
    '  const bare=[];',
    '  host.innerHTML="";',
    '  for(const layer of order){',
    '    const mine=traits.filter(t=>(t.layer||"unsorted")===layer);',
    '    if(!mine.length) continue;',
    '    const keep=mine.filter(isIn);',
    '    if(!keep.length && layer!=="unsorted") bare.push(layer);',
    '    const sec=document.createElement("div"); sec.className="layer";',
    '    const h=document.createElement("h3");',
    '    h.className="fscount";',
    '    h.textContent=layer+" \\u00b7 "+keep.length+" of "+mine.length;',
    '    sec.appendChild(h);',
    '    if(keep.length){',
    '      const g=document.createElement("div"); g.className="items";',
    '      for(const t of keep) g.appendChild(finalTile(t,"take out","",',
    '        ()=>finalMove(t,"approved")));',
    '      sec.appendChild(g);',
    '    }',
    '    const rest=mine.filter(t=>!isIn(t));',
    '    if(rest.length){',
    '      const d=document.createElement("details"); d.className="fsadd";',
    '      const sm=document.createElement("summary");',
    '      sm.textContent="add from "+layer+" ("+rest.length+")";',
    '      d.appendChild(sm);',
    '      const g=document.createElement("div"); g.className="items";',
    '      d.appendChild(g);',
    '      /* FILLED WHEN IT IS OPENED. Every tile decodes a picture, and this page',
    '         is about the set you have chosen - a project of 324 would otherwise',
    '         decode all of them to show you the twelve you picked. */',
    '      d.ontoggle=()=>{',
    '        if(!d.open||g.childElementCount) return;',
    '        for(const t of rest) g.appendChild(finalTile(t,"add",String(t.status||"wip"),',
    '          ()=>finalMove(t,"stfp")));',
    '      };',
    '      sec.appendChild(d);',
    '    }',
    '    host.appendChild(sec);',
    '  }',
    '  const warn=$("finalwarn");',
    '  if(warn){',
    '    warn.hidden=!bare.length;',
    '    warn.textContent=bare.length',
    '      ? "Nothing is in the final project from "+bare.join(", ")',
    '        +" - every character would be missing that."',
    '      : "";',
    '  }',
    '}',
    'function showPage(p,push){',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* THE PAGE EXISTS AND THE ROUTER KNOWS IT. */
  if (!/const PAGES=\["home","project","settings","agent","fixer","final"\];/.test(code))
    throw new Error('the router does not know about the page, so its hash goes to home');
  if (!/<section class="proj pg-final" id="finalset" hidden>/.test(text))
    throw new Error('there is no section for the page to show');
  if (!/if\(want==="final"\) renderFinal\(\);/.test(code))
    throw new Error('arriving at the page draws nothing');
  /* Project stays lit from inside its rooms, which is what makes it a room. */
  if (!/\(want==="settings"\|\|want==="final"\) && b\.dataset\.page==="project"/.test(code))
    throw new Error('the Project tab goes dark while you are inside the project');

  /* AND EVERY PAIR IS WRITTEN, because the block says why it is pairwise. Ten
     rules: the new section hidden on five pages, and five sections hidden on
     the new one. Named one at a time - a count passes with one written twice. */
  for (const p of ['home', 'project', 'settings', 'agent', 'fixer']) {
    if (text.indexOf('#land[data-page="' + p + '"] .pg-final,') < 0)
      throw new Error('the final section would appear on the ' + p + ' page');
    const tail = p === 'fixer' ? '{display:none;}' : ',';
    if (text.indexOf('#land[data-page="final"] .pg-' + p + tail) < 0)
      throw new Error('the ' + p + ' section would appear on the final page');
  }

  /* BOTH BUTTONS GO THROUGH THE ONE FUNCTION. A second copy of what a status
     change has to carry is the whole thing 471 was for. */
  const fm = kit.inFunction(codeLines, 'async function finalMove(t,next){');
  const fmb = codeLines.slice(fm.start, fm.end + 1).join('\n');
  if (!/const r=await setTraitStatus\(t,next\);/.test(fmb))
    throw new Error('the page changes a status its own way');
  for (const leaked of ['draftsFollow', 'pickTransfer', 'cloudMoveOne', 'dbDel(']) {
    if (fmb.indexOf(leaked) >= 0)
      throw new Error('the page has its own copy of ' + leaked + ', which will drift');
  }
  /* And it refuses a clash rather than overwriting, same as the shelf. */
  if (!/if\(r\.clash\)\{/.test(fmb))
    throw new Error('a name clash would be overwritten rather than named');

  /* OUT GOES TO approved. wip would throw away that it was ever reviewed. */
  if (!/finalMove\(t,"approved"\)/.test(code))
    throw new Error('taking a trait out sends it somewhere other than approved');
  if (!/finalMove\(t,"stfp"\)/.test(code))
    throw new Error('adding a trait does not put it in the final set');

  /* THE FOLD IS LAZY, which is the difference between this page opening and
     this page decoding 324 pictures. */
  const rf = kit.inFunction(codeLines, 'async function renderFinal(){');
  const rfb = codeLines.slice(rf.start, rf.end + 1).join('\n');
  /* AND IT SHOWS ITS OWN SECTION. The page rules only ever ADD display:none, so
     a section that starts hidden stays hidden on its own page - which is a
     blank screen under a lit tab, and is what the first browser look showed. */
  if (!/const sec=\$\("finalset"\); if\(sec\) sec\.hidden=false;/.test(rfb))
    throw new Error('the page draws into a section that nothing ever unhides');
  if (!/d\.ontoggle=\(\)=>\{/.test(rfb) || !/if\(!d\.open\|\|g\.childElementCount\) return;/.test(rfb))
    throw new Error('the add list is built on every render rather than when it is opened');
  /* The warning names the layers rather than counting them. */
  if (!/bare\.join\(", "\)/.test(rfb))
    throw new Error('the warning says how many layers are bare rather than which');
  /* unsorted is excluded from it on purpose. */
  if (!/if\(!keep\.length && layer!=="unsorted"\) bare\.push\(layer\);/.test(rfb))
    throw new Error('unsorted having nothing final in it is reported as a problem');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
