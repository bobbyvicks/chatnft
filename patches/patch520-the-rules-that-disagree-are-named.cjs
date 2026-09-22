/* THE RULES THAT DISAGREE ARE NAMED.

   decideOrderFor derives a decide order from the rules' edges - condition
   layer before target layer - and on a cycle returns nothing, which is the
   right refusal: a made-up order would be a collection nobody could explain.
   The import then says "the rules disagree about which layer decides first,
   so the decide order was left alone" and stops. It never says WHICH layers.

   It matters now because the collection's own shipping rules file does this.
   UPLOAD-TO-PIXELBENCH-v14-311-traits.json restricts in both directions on
   six layer pairs - hats/masks, hair/hats, hair/masks, hair/costumes,
   masks/costumes, chains/costumes - introduced by five new hairs and one hat
   against the older rules the other way; v12 and v13 have no cycle
   (measured 2026-09-21 by carving planRuleImport and decideOrderFor out of
   this file and running them over the 311 records). So the owner imports
   377 groups, reads one clause, and has no way to know which of 181 rules
   to look at. The page had the answer in hand: the edges are right there.

   The note names the pairs now: "the rules disagree about which layer
   decides first (hats and masks, hair and hats, ...), so the decide order
   was left alone". A cycle with no direct pair - A before B before C before
   A - names the layers it could not place instead. decideOrderFor itself is
   untouched: still nothing on a cycle. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. the sibling that says why the order was refused ------------------ */
{
  const fn = kit.inFunction(L, 'function decideOrderFor(edges){');
  kit.replace(L, { start: fn.end, end: fn.end }, [
    '}',
    '/* WHY THERE WAS NO ORDER, in layer names. Only asked when decideOrderFor',
    '   returned nothing, and it answers two ways: the pairs of layers whose',
    '   rules run both ways (the usual case, and each is one rule to look at),',
    '   and, if a cycle has no direct pair - A before B before C before A - the',
    '   layers the same walk could not place. The walk is decideOrderFor\'s,',
    '   repeated rather than shared, so the refusal above stays one function',
    '   that returns one thing. */',
    'function decideOrderClashes(edges){',
    '  const have=new Set(LAYERS);',
    '  const dir=new Set();',
    '  for(const [a,b] of edges) if(have.has(a)&&have.has(b)&&a!==b) dir.add(a+"\\u0000"+b);',
    '  const pairs=[];',
    '  for(const s of dir){',
    '    const [a,b]=s.split("\\u0000");',
    '    if(dir.has(b+"\\u0000"+a)&&LAYERS.indexOf(a)<LAYERS.indexOf(b)) pairs.push([a,b]);',
    '  }',
    '  /* In paint order, not in the order the file happened to list its rules,',
    '     so the same disagreement reads the same however the file is sorted. */',
    '  pairs.sort((p,q)=>(LAYERS.indexOf(p[0])-LAYERS.indexOf(q[0]))||(LAYERS.indexOf(p[1])-LAYERS.indexOf(q[1])));',
    '  const indeg=new Map(LAYERS.map(l=>[l,0]));',
    '  const next=new Map(LAYERS.map(l=>[l,[]]));',
    '  for(const s of dir){ const [a,b]=s.split("\\u0000"); next.get(a).push(b); indeg.set(b,indeg.get(b)+1); }',
    '  const left=LAYERS.slice();',
    '  for(;;){',
    '    const i=left.findIndex(l=>indeg.get(l)===0);',
    '    if(i<0) break;',
    '    const l=left.splice(i,1)[0];',
    '    for(const m of next.get(l)) indeg.set(m,indeg.get(m)-1);',
    '  }',
    '  return {pairs:pairs, stuck:left};',
    '}',
  ]);
}

/* ---- 2. the plan carries it ---------------------------------------------- */
swap('  out.order=decideOrderFor(out.edges);', [
  '  out.order=decideOrderFor(out.edges);',
  '  out.clashes=out.order.length ? {pairs:[],stuck:[]} : decideOrderClashes(out.edges);',
], 'the plan order');

/* ---- 3. the note says which --------------------------------------------- */
swap('  else bits.push("the rules disagree about which layer decides first, so the decide order was left alone");', [
  '  else {',
  '    /* WHICH LAYERS, because a clause with no names sends somebody through',
  '       181 rules by hand. The pairs are one rule each to look at; the',
  '       fallback names what could not be placed when no pair is direct. */',
  '    const c=plan.clashes||{pairs:[],stuck:[]};',
  '    const which = c.pairs.length ? " ("+c.pairs.map(p=>p[0]+" and "+p[1]).join(", ")+")"',
  '      : c.stuck.length ? " (among "+c.stuck.join(", ")+")" : "";',
  '    bits.push("the rules disagree about which layer decides first"+which+", so the decide order was left alone");',
  '  }',
], 'the disagree note');

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  for (const s of ['function decideOrderClashes(edges){',
    'out.clashes=out.order.length ? {pairs:[],stuck:[]} : decideOrderClashes(out.edges);',
    '"the rules disagree about which layer decides first"+which+", so the decide order was left alone"']) need(s);
  const times = (re) => (code.match(re) || []).length;
  if (times(/decideOrderClashes\(/g) !== 2) throw new Error('decideOrderClashes: 1 definition + 1 caller expected');
  /* decideOrderFor IS UNTOUCHED - still nothing on a cycle. */
  const a = code.indexOf('function decideOrderFor(edges){'), b = code.indexOf('\n}', a);
  const was = kit.code(kit.scriptOf(doc.original));
  const a0 = was.indexOf('function decideOrderFor(edges){'), b0 = was.indexOf('\n}', a0);
  if (code.slice(a, b) !== was.slice(a0, b0)) throw new Error('decideOrderFor changed');
  /* THE SIBLING, EXERCISED against a LAYERS it is handed. */
  const c = code.indexOf('function decideOrderClashes(edges){'), d = code.indexOf('\n}', c);
  const clashes = new Function('LAYERS', code.slice(c, d + 2) + '\nreturn decideOrderClashes;');
  const LS = ['backgrounds', 'hair', 'hats', 'masks', 'unsorted'];
  const f = clashes(LS);
  const is = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(label + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
  is(f([['hats', 'hair']]), { pairs: [], stuck: [] }, 'one edge, no clash');
  is(f([['hats', 'masks'], ['masks', 'hats']]), { pairs: [['hats', 'masks']], stuck: ['hats', 'masks'] }, 'a direct pair');
  is(f([['hair', 'hats'], ['hats', 'masks'], ['masks', 'hair']]), { pairs: [], stuck: ['hair', 'hats', 'masks'] }, 'a three-cycle names the stuck layers');
  is(f([['hats', 'visors'], ['visors', 'hats']]), { pairs: [], stuck: [] }, 'a layer the project has not got is ignored, as decideOrderFor ignores it');
  is(f([['hats', 'masks'], ['masks', 'hats'], ['hair', 'hats'], ['hats', 'hair']]).pairs, [['hair', 'hats'], ['hats', 'masks']], 'two pairs, in paint order whatever order the rules came in');
});

fs.renameSync(TMP, FILE);
console.log('patch520 written, ' + grew + ' bytes');
