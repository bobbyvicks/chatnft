/* GENERATE SET KEEPS MORE PICTURES DECODED, WHERE THERE IS ROOM.

   Found 2026-09-22 by the discovery pass, ranked thirtieth of 39. The
   decoded-picture cache holds 96 MB - about fifteen 1280 pictures - a
   recorded decision for phone memory in the preview and the sheet. Generate
   set draws each character from the whole final set, so about 95% of its
   lookups missed and decoded the PNG again: 1000 characters took 77 s, 51
   of them decoding. The verifier measured 300 characters at 32.4 s with 96
   MB, 21.0 s with 512 MB and 11.1 s decoding each trait once, the output
   byte-identical in all three.

   For the length of a Generate run only, the cache may grow to 512 MB on a
   desktop the browser says has 8 GB or more, and 256 MB at 4 GB, then goes
   back to 96 MB and lets the rest go. A phone, or a browser that does not
   say how much memory it has, keeps 96 MB: the decision the budget records
   is about exactly those. */
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

swap('const CBITMAP_BUDGET=96*1048576;', [
  'const CBITMAP_BUDGET=96*1048576;',
  '/* What the cache may hold right now: CBITMAP_BUDGET, except during a',
  '   Generate run on a machine with room - see genBitmapBudget. */',
  'let cBitmapBudget=CBITMAP_BUDGET;',
  '/* A GENERATE RUN\'S ALLOWANCE. Characters are drawn from the whole final set,',
  '   so at 96 MB about 95% of lookups decoded the PNG again (1000 characters,',
  '   77 s, 51 of them decoding). A desktop the browser says has 8 GB gets 512',
  '   MB for the run, 4 GB gets 256; a phone, or a browser that does not say,',
  '   keeps the budget above, which is the decision it records. */',
  'function genBitmapBudget(){',
  '  let mobile=false;',
  '  try{ mobile = navigator.userAgentData ? !!navigator.userAgentData.mobile : /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent||""); }catch(_){ mobile=true; }',
  '  const mem=Number(navigator.deviceMemory);',
  '  if(mobile || !(mem>0)) return CBITMAP_BUDGET;',
  '  if(mem>=8) return 512*1048576;',
  '  if(mem>=4) return 256*1048576;',
  '  return CBITMAP_BUDGET;',
  '}',
  '/* Let the oldest go until the cache is inside the budget. */',
  'function cBitmapTrim(){',
  '  while(cBitmapBytes()>cBitmapBudget && cBitmaps.size>1){',
  '    const oldest=cBitmaps.keys().next().value;',
  '    const gone=cBitmaps.get(oldest);',
  '    cBitmaps.delete(oldest);',
  '    if(gone.close) gone.close();',
  '  }',
  '}',
], 'the budget');
{
  const fn = kit.inFunction(L, 'async function cBitmap(rec){');
  const i = at('  while(cBitmapBytes()>CBITMAP_BUDGET && cBitmaps.size>1){', 'the eviction', fn);
  const want = [
    '  while(cBitmapBytes()>CBITMAP_BUDGET && cBitmaps.size>1){',
    '    const oldest=cBitmaps.keys().next().value;',
    '    const gone=cBitmaps.get(oldest);',
    '    cBitmaps.delete(oldest);',
    '    if(gone.close) gone.close();',
    '  }',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the eviction moved at +' + k);
  kit.replace(L, { start: i, end: i + want.length - 1 }, ['  cBitmapTrim();']);
}
{
  const fnR = () => kit.inFunction(L, 'async function buildCollection(n,onProgress){');
  const i = at('  for(let i=0;i<combos.length;i++){', 'the build loop', fnR());
  kit.replace(L, { start: i, end: i }, [
    '  /* More room for the length of the run, where there is room - and back',
    '     to the budget, letting the rest go, however the run ends. */',
    '  const budgetWas=cBitmapBudget;',
    '  cBitmapBudget=Math.max(cBitmapBudget,genBitmapBudget());',
    '  try{',
    '  for(let i=0;i<combos.length;i++){',
  ]);
  const f = fnR();
  const j = at('  if(sink && files.length) await sink(files.splice(0,files.length),true);', 'the last part', f);
  kit.replace(L, { start: j, end: j }, [
    '  }finally{ cBitmapBudget=budgetWas; cBitmapTrim(); }',
    '  if(sink && files.length) await sink(files.splice(0,files.length),true);',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('cBitmapBytes()>CBITMAP_BUDGET')) throw new Error('the fixed budget is still read');
  if (times('cBitmapTrim()') !== 3) throw new Error('cBitmapTrim: ' + times('cBitmapTrim()'));
});

fs.renameSync(TMP, FILE);
console.log('patch566 written, ' + grew + ' bytes');
