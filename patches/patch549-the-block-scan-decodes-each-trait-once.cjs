/* THE BLOCK SCAN DECODES EACH TRAIT ONCE.

   Found 2026-09-22 by the discovery pass, ranked nineteenth of 39, measured
   by three finders and their verifiers on the real boot path. autoCanvas
   works out the collection's canvas size by decoding each trait once and
   remembering its pixel block. It remembered a block only after that
   trait's decode finished, and remembered the whole answer only when a
   pass completed, so every render during the first scan started another
   pass over the same traits: a group's cold open (three renders) made
   855-924 decodes for 311 traits and drew its preview at 22.7 s instead
   of 11.4 s; three presses during the first scan made 978 decodes and took
   19.5 s instead of 7.8 s (206 s instead of 47 at phone speed).

   Each trait's decode is now shared: a pass that reaches a trait another
   pass is already decoding waits for that decode instead of starting its
   own. Progress is saved every forty decodes, so a reload in the middle of
   the first scan does not start again from nothing.

   Checking the save found two more ways the same work was repeated, both
   from the final project page and Generate asking about a subset of the
   collection. The saved numbers were read once per page and applied only
   to the first list asked about, so when the final page asked first every
   other trait was decoded again on that visit although its number was
   saved. And saveBlocks replaced what was saved with the list it was
   given, so a subset scan that measured one new trait erased every other
   trait's number, and the next open decoded them all. The saved numbers
   are now applied to every list, and a save merges into what is saved. */
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

/* ---- 1. saveBlocks merges ---------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function saveBlocks(list){');
  swap('    const out={};', [
    '    /* MERGED INTO WHAT IS SAVED. A scan of a subset - the final page scans',
    '       only the chosen traits - used to replace the lot, and the next open',
    '       scanned every other trait again. */',
    '    let out={};',
    '    try{ const was=JSON.parse(localStorage.getItem(blockStoreKey())||"{}"); if(was&&typeof was==="object") out=was; }catch(_){ out={}; }',
  ], 'the save start', fn);
}

/* ---- 1b. loadBlocks answers every list, not only the first ---------------- */
{
  const fn = kit.inFunction(L, 'function loadBlocks(list){');
  const want = [
    'function loadBlocks(list){',
    '  if(blockStoreRead) return;',
    '  blockStoreRead=true;',
    '  try{',
    '    const raw=localStorage.getItem(blockStoreKey());',
    '    if(!raw) return;',
    '    const saved=JSON.parse(raw);',
    '    if(!saved||typeof saved!=="object") return;',
    '    for(const r of (list||[])){',
    '      const e=r&&saved[r.id];',
    '      if(e&&r.blob&&e.s===r.blob.size&&typeof e.b==="number") blockOf.set(r.id,e.b);',
    '    }',
    '  }catch(_){}',
    '}',
  ];
  if (fn.end - fn.start + 1 !== want.length) throw new Error('loadBlocks changed length: ' + (fn.end - fn.start + 1));
  for (let k = 0; k < want.length; k++) if (L[fn.start + k] !== want[k]) throw new Error('loadBlocks moved at +' + k + ': ' + L[fn.start + k]);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* READ ONCE, APPLIED TO EVERY LIST. This read the saved numbers once and',
    '   applied them only to the list it was first given - the final page\'s,',
    '   when that page was the first to ask - so every other trait was decoded',
    '   again on the same visit although its number was saved. The parsed copy',
    '   is kept, keyed by the project it came from. */',
    'let blockSaved=null, blockSavedKey="";',
    'function loadBlocks(list){',
    '  if(!blockStoreRead || blockSavedKey!==blockStoreKey()){',
    '    blockStoreRead=true; blockSaved=null; blockSavedKey=blockStoreKey();',
    '    try{',
    '      const raw=localStorage.getItem(blockSavedKey);',
    '      const saved=raw ? JSON.parse(raw) : null;',
    '      if(saved&&typeof saved==="object") blockSaved=saved;',
    '    }catch(_){ blockSaved=null; }',
    '  }',
    '  if(!blockSaved) return;',
    '  for(const r of (list||[])){',
    '    if(!r || blockOf.has(r.id)) continue;',
    '    const e=blockSaved[r.id];',
    '    if(e&&r.blob&&e.s===r.blob.size&&typeof e.b==="number") blockOf.set(r.id,e.b);',
    '  }',
    '}',
  ]);
}

/* ---- 2. one decode per trait, one pass per collection -------------------- */
{
  const fn = kit.inFunction(L, 'async function autoCanvas(recs){');
  kit.replace(L, { start: fn.start, end: fn.start }, [
    '/* DECODES IN FLIGHT, by record id. Every render during the first scan',
    '   used to start another pass over the same traits: 855-924 decodes for',
    '   311 on a group\'s cold open (measured). A pass that reaches a trait',
    '   another pass is decoding now waits for that decode, which also covers',
    '   two passes over the same collection - so they are not joined as well. */',
    'const blockPending=new Map();',
    'async function autoCanvas(recs){',
  ]);
}
{
  const fnR = () => kit.inFunction(L, 'async function autoCanvas(recs){');
  const i = at('      let bm=null;', 'the decode', fnR());
  const want = [
    '      let bm=null;',
    '      try{ bm=await createImageBitmap(r.blob); blk=pixelBlock(bm); }',
    '      catch(_){ blk=1; }',
    '      if(bm&&bm.close) bm.close();',
    '      blockOf.set(r.id,blk);',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the decode moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '      /* SHARED: another pass decoding this trait is waited for, not',
    '         repeated. */',
    '      if(blockPending.has(r.id)) blk=await blockPending.get(r.id);',
    '      else {',
    '        const one=(async()=>{',
    '          let bm=null, b=1;',
    '          try{ bm=await createImageBitmap(r.blob); b=pixelBlock(bm); }',
    '          catch(_){ b=1; }',
    '          if(bm&&bm.close) bm.close();',
    '          blockOf.set(r.id,b);',
    '          return b;',
    '        })();',
    '        blockPending.set(r.id,one);',
    '        try{ blk=await one; } finally{ blockPending.delete(r.id); }',
    '        /* Saved as it goes, so a reload mid-scan keeps what was learnt. */',
    '        if(((scanned+1)%40)===0) saveBlocks(list);',
    '      }',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('const blockPending=new Map();');
  once('if(blockPending.has(r.id)) blk=await blockPending.get(r.id);');
  once('let out={};');
  once('let blockSaved=null, blockSavedKey="";');
  if (times('if(blockStoreRead) return;')) throw new Error('the read-once guard is still there');
  if (times('createImageBitmap(r.blob); b=pixelBlock(bm);') !== 1) throw new Error('the shared decode is not there once');
});

fs.renameSync(TMP, FILE);
console.log('patch549 written, ' + grew + ' bytes');
