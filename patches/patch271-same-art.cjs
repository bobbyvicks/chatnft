/* THE SAME PICTURE UNDER A NEW NAME IS THE SAME TRAIT.

   "i have new trait rules i want added but itll duplicate rules ... same goes
   for images. so we dont have 40 versions of the same skin saved."

   MEASURED FIRST, and two thirds of the worry turned out to be already
   handled - which is worth saying, because the fix for a problem you do not
   have is a new problem.

     the v6 rules file imported twice   156 rules, then 0 added   no duplication
     the same folder imported twice     replaced, not added
     a trait whose status moved         moved, not copied
     THE SAME PICTURE, NEW NAME         added as a THIRD trait

   Only the last one is real, and it is exactly the skin case: a file that
   comes back as "Retro Jazz Cup Skin v2.png" is a new name for artwork the
   project already has, and the id is built from the name, so it lands beside
   the old one and both stay for ever.

   IDENTITY IS THE BYTES. A name is what somebody typed and a version suffix is
   what they typed the second time; the picture is the thing that either is or
   is not already here. So each incoming file is hashed and matched against
   what the project holds, and a match IN THE SAME LAYER is treated as a
   rename: the old record goes, the new name stays, and the report says so.

   THE SAME LAYER, deliberately. One picture legitimately serves two layers -
   a chain drawn once and used as both a chain and an extra - and merging
   those would delete a trait somebody meant to have twice. Across layers a
   byte match is a coincidence worth nothing.

   AND IT IS A RENAME, NOT A REFUSAL. Refusing the import would leave the old
   name in the project and the new one on disk, which is the drift the absent-
   check further down exists to warn about. Renaming keeps the two in step. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function bulkImport(files){');

/* ---- CHECKS ------------------------------------------------------ */
const counters = kit.only(L, l => l === '  let fresh=0, replaced=0;', 'the import counters', fn);
const write = kit.only(L, l => l === '        await dbPut(trec);', 'the trait write', fn);
const supplied = kit.only(L, l => l === '        supplied.push({name:info.name, layer:layer, status:status, id:trec.id});',
  'the supplied list', fn);
if (supplied !== write + 1) throw new Error('the supplied push does not follow the write');
const beforeTraits = kit.only(L, l => l === '  const beforeTraits=shelfItems.filter(i=>i.kind==="trait");',
  'the before list', fn);

/* ---- WRITE, bottom upward ---------------------------------------- */

/* 2. At the write: if this picture is already here under another name in this
      layer, the old record goes. */
kit.replace(L, { start: write, end: write }, [
  '        /* THE SAME PICTURE UNDER ANOTHER NAME. The id carries the name, so',
  '           "cap v2.png" lands beside "cap" and both stay - which is how a',
  '           project ends up holding forty versions of one skin. A byte match',
  '           in the SAME layer is the same artwork renamed, so the old record',
  '           goes and this one keeps the new name.',
  '',
  '           Same layer only: one picture can legitimately serve two layers,',
  '           and merging those would delete a trait somebody meant to have',
  '           twice. Across layers an identical file is a coincidence. */',
  '        const sig=await fileSig(f);',
  '        if(sig){',
  '          for(const old of beforeTraits){',
  '            if(old.id===trec.id) continue;',
  '            if((old.layer||"unsorted")!==layer) continue;',
  '            if(movedIds.has(old.id)) continue;',
  '            if(await recSig(old)!==sig) continue;',
  '            try{ await dbDel(old.id); }catch(_){}',
  '            movedIds.add(old.id);',
  '            renames.push(old.name+" \\u2192 "+info.name);',
  '            break;',
  '          }',
  '        }',
  '        await dbPut(trec);',
]);

/* 1b. The counters. */
kit.replace(L, { start: counters, end: counters }, [
  '  let fresh=0, replaced=0;',
  '  /* Named rather than counted: "3 renamed" is a number to worry about and',
  '     "Retro Jazz Cup Skin -> Retro Jazz Cup Skin v2" is a thing you can',
  '     recognise as right or wrong at a glance. */',
  '  const renames=[];',
]);

/* 1a. The hashing, above where it is used. */
kit.replace(L, { start: beforeTraits, end: beforeTraits }, [
  '  const beforeTraits=shelfItems.filter(i=>i.kind==="trait");',
  '  /* THE BYTES, not the name. A name is what somebody typed and a version',
  '     suffix is what they typed the second time; the picture is the thing that',
  '     either is or is not already in the project.',
  '',
  '     Cached per record, because the alternative is re-hashing the whole',
  '     collection once per incoming file - 272 traits against 272 files is',
  '     74,000 reads of the same blobs. */',
  '  const sigCache=new Map();',
  '  async function fileSig(b){',
  '    try{',
  '      const buf=await b.arrayBuffer();',
  '      const h=await crypto.subtle.digest("SHA-256",buf);',
  '      return [...new Uint8Array(h)].map(v=>v.toString(16).padStart(2,"0")).join("");',
  '    }catch(_){ return null; }   /* no hash means no match, never a false one */',
  '  }',
  '  async function recSig(rec){',
  '    if(sigCache.has(rec.id)) return sigCache.get(rec.id);',
  '    const s=rec.blob ? await fileSig(rec.blob) : null;',
  '    sigCache.set(rec.id,s);',
  '    return s;',
  '  }',
]);

/* And the report says what was renamed. */
const bits = kit.only(L, l => l.indexOf('const bits=["Imported "+ok+" file') === 0
  || l.indexOf('  const bits=[') === 0, 'the import report', fn);
kit.replace(L, { start: bits, end: bits }, [
  L[bits],
  '  if(renames.length) bits.push(renames.length+" recognised as renamed ("+renames.slice(0,3).join(", ")'
  + '+(renames.length>3?" and "+(renames.length-3)+" more":"")+")");',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (code.indexOf('async function fileSig(b){') < 0) throw new Error('the hash did not land');
  if (code.indexOf('const sig=await fileSig(f);') < 0) throw new Error('nothing hashes the incoming file');
  if (code.indexOf('try{ await dbDel(old.id); }catch(_){}') < 0)
    throw new Error('the old record is not removed');
  /* Same layer only. Without this a picture used on two layers loses one. */
  if (code.indexOf('if((old.layer||"unsorted")!==layer) continue;') < 0)
    throw new Error('the same-layer guard did not land');
  /* Cached, or this is O(files x traits) blob reads. */
  if (code.indexOf('if(sigCache.has(rec.id)) return sigCache.get(rec.id);') < 0)
    throw new Error('the hash is not cached');
  if (has('  const renames=[];') !== 1) throw new Error('the rename list did not land');
  if (code.indexOf('renames.length+" recognised as renamed') < 0)
    throw new Error('the report says nothing about renames');
});

console.log('index.html grew by ' + grew + ' bytes');
