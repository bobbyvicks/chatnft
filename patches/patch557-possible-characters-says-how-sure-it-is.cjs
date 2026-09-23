/* "POSSIBLE CHARACTERS" SAYS HOW SURE IT IS, AND READS PAST A BILLION.

   Found 2026-09-22 by the discovery pass, ranked thirty-first of 39. With
   Never-together rules, the count is the product of the layers times the
   share of combinations the rules leave, and that share came from exactly
   4,000 uniform samples. Under restrictive rules a share of a fraction of a
   percent is a dozen hits or fewer out of 4,000 - a 30-60% error, held
   still by the fixed seed so that it looked exact - and when none of the
   4,000 happened to be legal the headline read "0 possible characters" for
   a set that can make some. bigLabel had no tier past billions, so 5.15e14
   printed as "515373.7B".

   The share is now sampled until LEGAL_HITS legal combinations are seen or
   LEGAL_MAX samples are drawn, never fewer than LEGAL_SAMPLES - so a set
   whose share was already well measured gets exactly the number it had.
   The rule test asks the per-trait clash sets conflictsWith uses (the same
   predicate: two keys clash when some group holds both), which is what
   makes ten times the samples affordable on a render. When the cap is
   reached with fewer hits, the figure is printed to one significant digit
   as "about"; with none at all it is an upper bound, "fewer than", from
   the rule of three. bigLabel reads T and Q, then powers of ten. */
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

swap('const LEGAL_SAMPLES=4000;', [
  '/* At least LEGAL_SAMPLES, then on until LEGAL_HITS legal ones have been',
  '   seen or LEGAL_MAX drawn. 4,000 alone left a restrictive set a dozen hits',
  '   and a 30-60% error that the fixed seed made look exact. */',
  'const LEGAL_SAMPLES=4000, LEGAL_HITS=100, LEGAL_MAX=40000;',
], 'the sample count');
{
  const fnR = () => kit.inFunction(L, 'function legalFraction(by){');
  const i = at('  let legal=0;', 'the loop start', fnR());
  const want = [
    '  let legal=0;',
    '  for(let i=0;i<LEGAL_SAMPLES;i++){',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the loop moved at +' + k);
  kit.replace(L, { start: i, end: i + 1 }, [
    '  let legal=0, drawn=0;',
    '  for(let i=0;i<LEGAL_MAX && (i<LEGAL_SAMPLES || legal<LEGAL_HITS);i++){',
    '    drawn++;',
  ]);
  const f = fnR();
  const j = at('    let ok=true;', 'the rule test', f);
  const want2 = [
    '    let ok=true;',
    '    for(const g of RULES){',
    '      let hits=0;',
    '      for(const k of keys) if(g.indexOf(k)>=0){ hits++; if(hits>1) break; }',
    '      if(hits>1){ ok=false; break; }',
    '    }',
  ];
  for (let k = 0; k < want2.length; k++) if (L[j + k] !== want2[k]) throw new Error('the rule test moved at +' + k + ': ' + L[j + k]);
  kit.replace(L, { start: j, end: j + want2.length - 1 }, [
    '    /* Two keys clash when some group holds both - asked of the per-trait',
    '       sets conflictsWith uses, rather than scanning every group for every',
    '       key, which is what makes the extra samples affordable. */',
    '    let ok=true;',
    '    for(let a=0;a<keys.length && ok;a++){',
    '      const bad=clashSet(keys[a]);',
    '      if(!bad) continue;',
    '      for(let b=a+1;b<keys.length;b++) if(keys[b]!==keys[a] && bad.has(keys[b])){ ok=false; break; }',
    '    }',
  ]);
  const f2 = fnR();
  swap('  legalCache=legal/LEGAL_SAMPLES; legalKey=key;', [
    '  legalCache=legal/drawn; legalKey=key;',
    '  legalHits=legal; legalDrawn=drawn;',
  ], 'the result', f2);
  swap('let legalCache=null, legalKey="";', [
    'let legalCache=null, legalKey="";',
    '/* How the memoised share was measured, set with it and only with it, for',
    '   the label: hits under LEGAL_HITS mean the cap was reached and the',
    '   figure is rough. Read only when rules exist. */',
    'let legalHits=0, legalDrawn=0;',
  ], 'the memo');
}
{
  const fnR = () => kit.inFunction(L, 'function comboStats(items,wipIncluded){');
  swap('  return { distinct: distinct*share, effective: collide>0 ? 1/collide : Infinity,', [
    '  /* How sure: hits under LEGAL_HITS mean the cap was reached. */',
    '  const rough = RULES.length>0 && legalHits<LEGAL_HITS;',
    '  return { distinct: distinct*share, effective: collide>0 ? 1/collide : Infinity,',
    '    rough, none: RULES.length>0 && legalHits===0,',
    '    /* The rule of three: with no hits in n draws the share is under 3/n. */',
    '    ceiling: RULES.length>0 && legalHits===0 && legalDrawn ? distinct*3/legalDrawn : null,',
  ], 'the stats', fnR());
}
{
  const fn = kit.inFunction(L, 'function bigLabel(n){');
  swap('  return (v/1e9).toFixed(1)+"B";', [
    '  if(v<1e12) return (v/1e9).toFixed(1)+"B";',
    '  /* Past a billion it read "515373.7B". */',
    '  if(v<1e15) return (v/1e12).toFixed(1)+"T";',
    '  if(v<1e18) return (v/1e15).toFixed(1)+"Q";',
    '  const e=Math.floor(Math.log10(v));',
    '  return (v/Math.pow(10,e)).toFixed(1)+"\\u00d710^"+e;',
    '}',
    '/* The possible-characters figure as sure as it is: exact or well measured',
    '   as bigLabel gives it; rough to one significant digit, as "about"; and',
    '   with no legal sample at all, an upper bound, never "0". */',
    'function possibleLabel(cs){',
    '  /* Rounded UP: a bound rounded to the nearest can land under the truth. */',
    '  if(cs && cs.none && cs.ceiling) return "fewer than "+bigLabel(oneFigure(cs.ceiling,true));',
    '  if(cs && cs.rough) return "about "+bigLabel(oneFigure(cs.distinct));',
    '  return bigLabel(cs ? cs.distinct : 0);',
    '}',
    'function oneFigure(n,up){',
    '  if(!(n>0) || !isFinite(n)) return n;',
    '  const p=Math.pow(10,Math.floor(Math.log10(n)));',
    '  return Math.max(1,(up?Math.ceil:Math.round)(n/p))*p;',
  ], 'the billions', fn);
}
swap('      el.textContent = base+" \\u00b7 "+bigLabel(cs.distinct)+" possible character"', [
  '      el.textContent = base+" \\u00b7 "+possibleLabel(cs)+" possible character"',
], 'the headline');
swap('        +(Math.round(cs.distinct)===1?"":"s")', ['        +(Math.round(cs.distinct)===1&&!cs.rough?"":"s")'], 'the plural');
swap('      +" - "+bigLabel(cstat.distinct)+" combinations exist"', ['      +" - "+possibleLabel(cstat)+" combinations exist"'], 'the sheet line');
swap('      ? " Asked for "+r.asked+" - "+bigLabel(cstat.distinct)+" combinations exist"', ['      ? " Asked for "+r.asked+" - "+possibleLabel(cstat)+" combinations exist"'], 'the set line');

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('possibleLabel(') !== 4) throw new Error('possibleLabel uses: ' + times('possibleLabel('));
  if (times('legal/LEGAL_SAMPLES')) throw new Error('the old share is still there');
});

fs.renameSync(TMP, FILE);
console.log('patch557 written, ' + grew + ' bytes');
