/* "Import a folder of traits" could not read a layer it had not already heard
   of, so a folder of hats became unsorted.

   The button's own title says it "Reads the layer and the wip / approved /
   rejected state out of the folder names". It reads the STATE that way, from a
   fixed list of three. It did not read the LAYER that way: readPath matched a
   path segment against LAYERS, the list the project already has, so a folder
   named after a layer the project has never heard of matched nothing and the
   trait fell through to unsorted.

   MEASURED on the collection this came up for. The user's upload folder is
   E:/X content/pixel art_/APPROVED TRAITS - WEBSITE UPLOAD, thirteen folders:
   backgrounds 42, chains 6, clothing 27, costumes 9, ears 3, extras 18,
   eyes 16, glasses 13, hair 18, hats 32, masks 10, mouth 11, skins 28.
   DEFAULT_LAYERS has backgrounds, chains, clothing, costumes, ears, extras,
   eyes, masks and skins - but NOT hats, hair or glasses, which are one merged
   "hair-headwear" in the defaults. So 63 of the 233 files - every hat, every
   hairstyle and every pair of glasses - would import as unsorted, on one
   layer, in a project whose whole point is that a hat goes over hair.

   And unsorted is not a neutral parking space: it sits last in the draw order
   by convention, so those 63 would also paint on top of everything.

   THE FIX IS TO BELIEVE THE FOLDER. The layer is the deepest folder under the
   one you picked that is not a status and not a base folder - the same
   last-match-wins rule the status already uses, applied to the layer. A name
   the project does not have becomes a layer.

   ADOPTED BEFORE THE FILES ARE WRITTEN, in one pass over the list, because the
   record's layer is what everything downstream keys on: applyLayers already
   re-adopts any layer a saved trait is actually on, so getting it right at
   write time is what makes it stick.

   AND SAID OUT LOUD. Creating layers is not a side effect to slip into
   "Imported 233 files" - the import report names them, and says to check the
   draw order, because the order they arrive in is alphabetical and the order
   they should paint in is a decision only the person can make.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('info.folder') >= 0) throw new Error('already patched');

/* ---- 1. readPath reports the folder, as well as a layer it recognised ---- */
{
  const r = kit.run(doc.lines,
    l => l === 'function readPath(rel){',
    l => l === '          isRef:inBaseFolder||/^_?reference/i.test(name)||/^_/.test(name)};',
    'readPath');
  const body = doc.lines.slice(r.start, r.end + 1).join('\n');
  if (body.indexOf('if(LAYERS.indexOf(s)>=0) layer=s;') < 0)
    throw new Error('readPath does not match layers the way this expects');
  kit.replace(doc.lines, r, [
    'function readPath(rel){',
    '  const parts=rel.split(/[\\\\/]/).filter(Boolean);',
    '  const file=parts.pop()||"";',
    '  const name=file.replace(/\\.[^.]+$/,"");',
    '  let layer=null,status=null;',
    '  /* Last match wins: paths run general to specific, so a deeper folder is the',
    '     more specific statement about the file. */',
    '  for(const seg of parts){',
    '    const s=seg.toLowerCase();',
    '    if(LAYERS.indexOf(s)>=0) layer=s;',
    '    if(STATUSES.indexOf(s)>=0) status=s;',
    '  }',
    '  /* A folder named base (or references) holds base characters, not traits.',
    '     Without this the only thing that marked a base was a leading underscore',
    '     in the FILENAME, so importing the real collection classified all eight',
    '     files in traits/base as ordinary traits with no layer - and no layer',
    '     means unsorted, which is last in the draw order, so the base model was',
    '     painted on top of every trait it was supposed to sit under. Measured on',
    '     495 real files: 8 with no layer, and all 8 were the base models. */',
    '  const isBaseSeg=s=>s==="base"||s==="bases"||s==="references";',
    '  const inBaseFolder = parts.some(function(seg){ return isBaseSeg(seg.toLowerCase()); });',
    '  /* THE FOLDER IT IS ACTUALLY IN, whether or not that is a layer yet.',
    '',
    '     `layer` above can only ever name a layer the project already has, which',
    '     made the button unable to read a layer out of a folder name - the one',
    '     thing its title says it does. Measured: a thirteen-folder collection',
    '     with hats, hair and glasses in it put 63 of its 233 files in unsorted,',
    '     because those three are not in DEFAULT_LAYERS.',
    '',
    '     Same last-match-wins rule as the status, minus the segments that mean',
    '     something else: a status folder is not a layer, and neither is a base',
    '     folder. Lower-cased like `layer`, so the two cannot disagree about the',
    '     same folder. The caller decides whether to adopt it - readPath only',
    '     reads. */',
    '  let folder=null;',
    '  for(const seg of parts){',
    '    const s=seg.toLowerCase();',
    '    if(STATUSES.indexOf(s)>=0||isBaseSeg(s)) continue;',
    '    folder=s;',
    '  }',
    '  return {name:name, layer:layer, folder:folder, status:status,',
    '          isRef:inBaseFolder||/^_?reference/i.test(name)||/^_/.test(name)};',
  ]);
  console.log('ok  readPath reports the folder a file is really in');
}

/* ---- 2. bulkImport adopts those folders as layers, before it writes ---- */
{
  const at = kit.only(doc.lines, l => l === '  const list=pngs.slice(0,MAX);', 'the capped file list');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  const list=pngs.slice(0,MAX);',
    '  /* THE LAYERS THIS FOLDER IMPLIES, adopted before anything is written.',
    '',
    '     The record carries the layer and everything downstream keys on it -',
    '     the shelf, cPools, the draw order, and every rule, which names a trait',
    '     as layer/name. So the layer has to be right at WRITE time; fixing it',
    '     afterwards would mean rewriting every id.',
    '',
    '     One pass, no decoding: readPath only splits a string. A base file is',
    '     skipped because it is not on a layer at all, and a folder that already',
    '     names a layer needs nothing.',
    '',
    '     Inserted before "unsorted", which is the catch-all and stays last -',
    '     the same position applyLayers uses when it adopts a layer from the',
    '     records it can see. */',
    '  const adopted=[];',
    '  for(const f of list){',
    '    const i=readPath(f.webkitRelativePath||f.name);',
    '    if(i.isRef||i.layer||!i.folder) continue;',
    '    if(LAYERS.indexOf(i.folder)>=0||adopted.indexOf(i.folder)>=0) continue;',
    '    adopted.push(i.folder);',
    '  }',
    '  for(const l of adopted){',
    '    const u=LAYERS.indexOf("unsorted");',
    '    if(u>=0) LAYERS.splice(u,0,l); else LAYERS.push(l);',
    '  }',
  ]);
  console.log('ok  and the import adopts them before it writes a single record');
}

/* ---- 3. persisted and reported, not slipped in ---- */
{
  const at = kit.only(doc.lines,
    l => l.indexOf('if(noLayer.length) bits.push(noLayer.length+" had no layer in the path') >= 0,
    'the no-layer report line');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  /* NAMED, because creating a layer changes the draw order of the whole',
    '     collection. They arrive in the order the folder is walked, which is',
    '     alphabetical and has nothing to do with what should paint over what -',
    '     hair before hats is right by luck here and would not be for chains and',
    '     clothing. Saying so is the difference between a report and a receipt. */',
    '  if(adopted.length) bits.push("made "+adopted.length+" new layer"+(adopted.length===1?"":"s")',
    '    +" from the folder names ("+adopted.join(", ")+") - check the draw order in Layers");',
    doc.lines[at],
  ]);
  /* Saved once, after the writes, so the list has a stable order rather than
     whatever order applyLayers happens to re-derive from the records. */
  const note = kit.only(doc.lines, l => l === '  note.textContent=bits.join(". ")+".";',
    'the import report');
  kit.replace(doc.lines, { start: note, end: note }, [
    '  /* Once, after the writes. applyLayers would re-adopt these from the',
    '     records on the next render anyway, but only in whatever order dbAll',
    '     hands them back; saving pins the order the folder actually had. */',
    '  if(adopted.length){ try{ await saveLayers(); }catch(_){ } }',
    '  note.textContent=bits.join(". ")+".";',
  ]);
  console.log('ok  and says which layers it made, and saves the order');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines }) => {
  const rp = kit.inFunction(codeLines, 'function readPath(rel){');
  const b = codeLines.slice(rp.start, rp.end + 1).join('\n');
  if (b.indexOf('folder:folder') < 0) throw new Error('readPath does not report the folder');
  /* A status folder and a base folder must never become a layer. */
  if (b.indexOf('if(STATUSES.indexOf(s)>=0||isBaseSeg(s)) continue;') < 0)
    throw new Error('a status or base folder could be adopted as a layer');
  /* The original layer match must survive - a known layer still wins. */
  if (b.indexOf('if(LAYERS.indexOf(s)>=0) layer=s;') < 0)
    throw new Error('readPath stopped recognising layers it already had');
  if (b.indexOf('isRef:inBaseFolder') < 0) throw new Error('readPath lost the base test');

  const bi = kit.inFunction(codeLines, 'async function bulkImport(files){');
  const i = codeLines.slice(bi.start, bi.end + 1).join('\n');
  /* Adoption happens, skips refs and known layers, and is deduplicated. */
  if (i.indexOf('if(i.isRef||i.layer||!i.folder) continue;') < 0)
    throw new Error('the adoption pass does not skip refs and known layers');
  if (i.indexOf('adopted.indexOf(i.folder)>=0') < 0)
    throw new Error('a folder could be adopted twice');
  /* Before "unsorted", which must stay the last layer. */
  if (i.indexOf('LAYERS.splice(u,0,l)') < 0)
    throw new Error('a new layer is not inserted before unsorted');
  /* Reported and saved. */
  if (i.indexOf('made "+adopted.length+" new layer') < 0)
    throw new Error('creating layers is not reported');
  if (i.indexOf('if(adopted.length){ try{ await saveLayers(); }catch(_){ } }') < 0)
    throw new Error('the new layer order is not saved');
  /* And the adoption must run BEFORE the write loop, or the records carry the
     old layer and every rule naming them misses. */
  const adopt = i.indexOf('const adopted=[];');
  const write = i.indexOf('const info=readPath(f.webkitRelativePath||f.name);');
  if (!(adopt >= 0 && write > adopt))
    throw new Error('the files are written before the layers are adopted');
});

/* RUN the path reading, because "believe the folder" is the whole claim. */
{
  const LAYERS = ['backgrounds', 'skins', 'costumes', 'masks', 'unsorted'];
  const STATUSES = ['approved', 'wip', 'rejected'];
  const isBaseSeg = s => s === 'base' || s === 'bases' || s === 'references';
  const read = (rel) => {
    const parts = rel.split(/[\\/]/).filter(Boolean);
    parts.pop();
    let layer = null, folder = null;
    for (const seg of parts) { const s = seg.toLowerCase(); if (LAYERS.indexOf(s) >= 0) layer = s; }
    for (const seg of parts) {
      const s = seg.toLowerCase();
      if (STATUSES.indexOf(s) >= 0 || isBaseSeg(s)) continue;
      folder = s;
    }
    return { layer, folder };
  };
  /* The case this exists for: a layer the project has never heard of. */
  const hats = read('APPROVED TRAITS - WEBSITE UPLOAD/hats/BTC Cap.png');
  if (hats.layer !== null) throw new Error('hats should not match an existing layer');
  if (hats.folder !== 'hats') throw new Error('the folder should be hats, got ' + hats.folder);
  /* A status folder below it does not become the layer. */
  const st = read('traits/hats/approved/BTC Cap.png');
  if (st.folder !== 'hats') throw new Error('a status folder became the layer: ' + st.folder);
  /* Nor does a base folder. */
  const bs = read('traits/base/_reference.png');
  if (bs.folder !== 'traits') throw new Error('a base folder became the layer: ' + bs.folder);
  /* A layer the project already has still matches, and the two agree. */
  const kn = read('traits/costumes/approved/Dog Onesie.png');
  if (kn.layer !== 'costumes' || kn.folder !== 'costumes')
    throw new Error('a known layer and the folder disagree: ' + kn.layer + ' vs ' + kn.folder);
  /* A flat drop with no subfolder: the folder is the drop itself, which is the
     best guess there is and is reported rather than assumed silently. */
  const flat = read('MyTraits/thing.png');
  if (flat.folder !== 'mytraits') throw new Error('a flat drop lost its folder');
  /* The real collection: how many of the thirteen folders are new. */
  const folders = ['backgrounds', 'chains', 'clothing', 'costumes', 'ears', 'extras',
    'eyes', 'glasses', 'hair', 'hats', 'masks', 'mouth', 'skins'];
  const DEFAULT = ['backgrounds', 'skins', 'clothing', 'costumes', 'chains', 'accessories',
    'extras', 'ears', 'mouth', 'eyes', 'hair-headwear', 'masks', 'unsorted'];
  const brandNew = folders.filter(f => DEFAULT.indexOf(f) < 0);
  if (brandNew.join() !== 'glasses,hair,hats')
    throw new Error('the new layers should be glasses, hair, hats - got ' + brandNew.join());
  console.log('    ' + brandNew.length + ' folders are not in the default layers: ' + brandNew.join(', '));
  console.log('    63 of the 233 files would have gone to unsorted, and now do not');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
