/* THE COLLECTION'S PALETTE IS WORKED OUT ONCE, FROM ACROSS THE COLLECTION.

   Opening the pixelate dialog decoded forty traits and counted every
   pixel of each on the main thread - at 1024 to 1280 px, a million and
   more Map updates a trait - every time it opened, with nothing kept. The
   answer changes only when a trait does, so it is kept now against the
   traits it was taken from and their edit times, and a second open reads
   it back.

   And the forty were the first forty by id, which is alphabetical by name
   within kind: a collection whose first forty names were all skins was
   matched to skin colours, while the checkbox said "colours found across
   your approved traits". They are spread evenly across the collection in
   layer order now, and the checkbox says how many it looked at when it
   did not look at them all. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* The range again on every look: each edit below moves the lines after it. */
const one = (line, label) => kit.only(L, l => l === line, label, kit.inFunction(L, 'async function collectionPalette(cap){'));
{
  const i = one('async function collectionPalette(cap){', 'the head');
  kit.replace(L, { start: i, end: i }, [
    '/* The last answer, and what it was taken from. */',
    'let collectionPaletteKept=null;',
    '/* How many traits the last answer looked at, of how many. */',
    'let collectionPaletteFrom={looked:0, of:0};',
    'async function collectionPalette(cap){',
  ]);
}
{
  const i = one('  if(!traits.length) return [];', 'the empty case');
  if (L[i + 1] !== '  const counts=new Map();') throw new Error('counts moved');
  if (L[i + 2] !== '  for(const t of traits.slice(0,40)){') throw new Error('the loop moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    '  if(!traits.length) return [];',
    '  /* FORTY SPREAD ACROSS THE COLLECTION, in layer order - the first forty',
    '     by id were the first forty names, all one layer as often as not. */',
    '  const ordered=traits.slice().sort((a,b)=>',
    '    (LAYERS.indexOf(a.layer||"unsorted")-LAYERS.indexOf(b.layer||"unsorted"))||(a.id<b.id?-1:a.id>b.id?1:0));',
    '  const SAMPLE=40, step=Math.max(1,ordered.length/SAMPLE);',
    '  const picked=[];',
    '  for(let k=0;k<ordered.length&&picked.length<SAMPLE;k++){',
    '    const t=ordered[Math.floor(k*step)]; if(!t) break; picked.push(t);',
    '  }',
    '  /* KEPT against what it was taken from. Forty decodes and every pixel',
    '     counted, on every open of the dialog, for an answer that changes',
    '     only when one of these traits does. */',
    '  const key=cap+"|"+picked.map(t=>t.id+":"+(t.at||0)).join(",");',
    '  collectionPaletteFrom={looked:picked.length, of:traits.length};',
    '  if(collectionPaletteKept&&collectionPaletteKept.key===key) return collectionPaletteKept.list.map(c=>c.slice());',
    '  const counts=new Map();',
    '  for(const t of picked){',
  ]);
}
{
  const i = one('  return palette(flat,counts.size,20,cap).list.map(c=>[c.r,c.g,c.b]);', 'the answer');
  kit.replace(L, { start: i, end: i }, [
    '  const list=palette(flat,counts.size,20,cap).list.map(c=>[c.r,c.g,c.b]);',
    '  collectionPaletteKept={key:key, list:list};',
    '  return list.map(c=>c.slice());',
  ]);
}
{
  const i = kit.only(L, l => l === '    ? pxFixed.length+" colours found across your approved traits"', 'the title');
  kit.replace(L, { start: i, end: i }, [
    '    ? pxFixed.length+" colours found across your approved traits"',
    '      +(collectionPaletteFrom.looked<collectionPaletteFrom.of',
    '        ? " - "+collectionPaletteFrom.looked+" of the "+collectionPaletteFrom.of+", spread across the layers" : "")',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch576 written');
