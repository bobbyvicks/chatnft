/* THE RULES LIST BUILDS ITS PICKERS WHEN THEY ARE REACHED FOR.

   Found 2026-09-22 by the discovery pass, ranked twentieth of 39, measured
   by a finder and two verifiers. Every row of the Never-together list has an
   "add a trait" picker, and buildRules filled each with every trait the
   rule did not already hold - rules times traits options. At 347-349 rules
   over 311 traits that was 105,182 <option> elements, 92% of the page's
   DOM, rebuilt in 270-430 ms on every rule edit, rename, and status press
   that moves a trait into or out of the collection, even with the list on
   a page nobody is looking at. The real rules file has 188 groups, so about
   half that.

   Each picker now holds only its "add a trait" line until a person reaches
   for it - mousedown, pointerdown, focus or a key - and fills then, once,
   from the same key list. Its disabled state is worked out from the counts
   without building anything. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const fnR = () => kit.inFunction(L, 'function buildRules(traits){');
{
  const i = at('    for(const k of keys){', 'the per-row fill', { start: at('    add.appendChild(first);', 'the first option', fnR()), end: fnR().end });
  const want = [
    '    for(const k of keys){',
    '      if(g.indexOf(k)>=0) continue;',
    '      const o=document.createElement("option");',
    '      o.value=k; o.textContent=k;',
    '      add.appendChild(o);',
    '    }',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the fill moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '    /* FILLED WHEN REACHED FOR. Every row used to carry every trait it did',
    '       not hold - rules times traits options, 105,182 of them at 349 rules,',
    '       92% of the page, rebuilt in 270-430 ms on edits nobody was looking',
    '       at. Filled once, from the same list, the first time a person goes',
    '       to use it. */',
    '    const addable=keys.filter(k=>g.indexOf(k)<0).length;',
    '    let filled=false;',
    '    const fill=()=>{',
    '      if(filled) return; filled=true;',
    '      const frag=document.createDocumentFragment();',
    '      for(const k of keys){',
    '        if(g.indexOf(k)>=0) continue;',
    '        const o=document.createElement("option");',
    '        o.value=k; o.textContent=k;',
    '        frag.appendChild(o);',
    '      }',
    '      add.appendChild(frag);',
    '    };',
    '    for(const ev of ["mousedown","pointerdown","focus","keydown"]) add.addEventListener(ev,fill);',
  ]);
}
{
  const i = at('    add.disabled = add.options.length<2;', 'the disabled line', fnR());
  kit.replace(L, { start: i, end: i }, ['    add.disabled = addable<1;']);
}

const grew = kit.save(doc, ({ code }) => {
  const a = code.indexOf('function buildRules(traits){'), b = code.indexOf('\n}', a);
  const body = code.slice(a, b);
  for (const s of ['const addable=keys.filter(k=>g.indexOf(k)<0).length;', 'add.disabled = addable<1;', 'for(const ev of ["mousedown","pointerdown","focus","keydown"]) add.addEventListener(ev,fill);'])
    if (body.indexOf(s) < 0) throw new Error('missing: ' + s);
  if (body.indexOf('add.options.length<2') >= 0) throw new Error('disabled still counts the options');
});

fs.renameSync(TMP, FILE);
console.log('patch547 written, ' + grew + ' bytes');
