/* THE SHELF KEEPS ITS PICTURES, AND A QUIET GROUP OPEN DRAWS IT ONCE.

   Found 2026-09-22 by the discovery pass, ranked eighteenth of 39.
   renderShelf empties the shelf and builds every tile again, and each
   tile's thumbnail was decoded again from its full-size PNG when it came
   into view. Nothing kept a painted thumbnail, so every render blanked the
   tiles a person was looking at until they decoded again: 28 of 28 visible
   canvases blank on the first frame after a hide press, refilled by about
   0.3 s on a desktop and 0.8-2.2 s at phone speed, 42 decodes and 42 MB a
   press. And opening a group rendered three times with nothing changed -
   once at boot, once at the end of the pull, once at the end of the
   catch-up - so the visible shelf went blank twice in the first couple of
   seconds (1.7 and 2.4 s blanks at phone speed).

   PAINTED THUMBNAILS ARE KEPT. shelfTile draws a kept thumbnail at once,
   in the same task that builds the tile, so a rebuild never shows an empty
   box for a picture it has already drawn. Kept by what identifies the
   picture: the record's id, its edit time, the PNG's length and the tile
   size. Every write of a picture in this page sets the edit time - the
   editor, the import, a pull (from the server's updated_at) - so an edited
   trait is a new key and is decoded fresh. Held to THUMB_KEEP_BYTES, the
   least recently drawn let go first, and closed when let go. The
   last-edited list on the main page draws its rows at the same size and
   was decoding its ten PNGs on every full render; it uses the same kept
   pictures.

   THE PULL AND THE CATCH-UP DRAW ONLY WHAT CHANGED. The shelf records the
   touch sequence at the moment it reads the store; every store write moves
   that sequence (dbClear now included, which was the one write that did
   not). At their ends, cloudPull and the catch-up render only when the
   store has moved since the shelf last read it - by the pull, by the
   catch-up's deletions, or by the person meanwhile. That is the exhaustive
   question, rather than a list of the things a pull might have changed:
   every setting it takes (layers, rules, the empty chance) is written to
   the store, and renderShelf applies settings from the store.

   Which made a quiet pull's own writes visible: it rewrote the layer
   list, the empty chance, the rules and the decisions on every open
   whether or not they had changed, and saveRules restamped the rules as
   a change made here and sent them back to the group. Each is now written
   only when it differs from what is recorded. The rules are still sent
   when the group's copy differs from this one - answers given here that
   the group has not got - which is what the unconditional save was
   covering. */
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

/* ---- dbClear moves the sequence too ------------------------------------- */
swap('async function dbClear(){ const d=await db(); return new Promise((res,rej)=>{', [
  '/* Touches, like every other write: the shelf decides whether it is current',
  '   by the sequence, and a cleared store must not look like an unchanged one. */',
  'async function dbClear(){ touch("\\u0000clear"); const d=await db(); return new Promise((res,rej)=>{',
], 'dbClear');

/* ---- kept thumbnails ---------------------------------------------------- */
{
  const fn = kit.inFunction(L, 'function thumbPaint(cv,blob){');
  const want = [
    'function thumbPaint(cv,blob){',
    '  if(!blob) return;',
    '  createImageBitmap(blob).then(function(bm){',
    '    const g=cv.getContext("2d");',
    '    g.imageSmoothingEnabled=false;',
    '    g.clearRect(0,0,cv.width,cv.height);',
    '    g.drawImage(bm,0,0,cv.width,cv.height);',
    '    if(bm.close) bm.close();',
    '  }).catch(function(){});',
    '}',
  ];
  if (fn.end - fn.start + 1 !== want.length) throw new Error('thumbPaint changed length');
  for (let k = 0; k < want.length; k++) if (L[fn.start + k] !== want[k]) throw new Error('thumbPaint moved at +' + k);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* keep, when given, is the key this painted picture is kept under - see',
    '   thumbKept. The kept copy is taken from the canvas once it is drawn. */',
    'function thumbPaint(cv,blob,keep){',
    '  if(!blob) return;',
    '  createImageBitmap(blob).then(function(bm){',
    '    const g=cv.getContext("2d");',
    '    g.imageSmoothingEnabled=false;',
    '    g.clearRect(0,0,cv.width,cv.height);',
    '    g.drawImage(bm,0,0,cv.width,cv.height);',
    '    if(bm.close) bm.close();',
    '    if(keep) thumbKeep(keep,cv);',
    '  }).catch(function(){});',
    '}',
    '/* PAINTED THUMBNAILS, KEPT BETWEEN RENDERS. Every render builds every tile',
    '   again, and nothing kept a painted one, so the tiles in view went blank',
    '   and were decoded again from their full-size PNGs on every hide, status,',
    '   weight and search press, and twice on a group open (measured: 28 of 28',
    '   visible blank on the first frame, 42 decodes and 42 MB a press).',
    '',
    '   Keyed by what identifies the picture: id, edit time, the PNG\'s length',
    '   and the tile size. Every write of a picture sets the edit time, so an',
    '   edited trait misses and is decoded fresh. Least recently drawn let go',
    '   first, and closed, past THUMB_KEEP_BYTES - about three hundred tiles at',
    '   160 pixels, which is the collection. */',
    'let THUMB_KEEP_BYTES=40*1024*1024;',
    'const thumbKept=new Map();',
    'let thumbKeptBytes=0;',
    'function thumbKeyOf(rec,cv){',
    '  if(!rec||!rec.blob||!rec.id) return null;',
    '  return rec.id+"|"+(rec.at||0)+"|"+(rec.blob.size||0)+"|"+cv.width+"x"+cv.height;',
    '}',
    'function thumbKeep(key,cv){',
    '  createImageBitmap(cv).then(function(bm){',
    '    const was=thumbKept.get(key);',
    '    if(was){ thumbKept.delete(key); thumbKeptBytes-=was.width*was.height*4; if(was.close) was.close(); }',
    '    thumbKept.set(key,bm); thumbKeptBytes+=bm.width*bm.height*4;',
    '    for(const [k,old] of thumbKept){',
    '      if(thumbKeptBytes<=THUMB_KEEP_BYTES) break;',
    '      thumbKept.delete(k); thumbKeptBytes-=old.width*old.height*4; if(old.close) old.close();',
    '    }',
    '  }).catch(function(){});',
    '}',
    '/* Draws a kept thumbnail into cv now, or says there is none. Moved to the',
    '   back of the queue, so the pictures on screen are the last to go. */',
    'function thumbFromKept(key,cv){',
    '  const bm=key&&thumbKept.get(key);',
    '  if(!bm) return false;',
    '  thumbKept.delete(key); thumbKept.set(key,bm);',
    '  const g=cv.getContext("2d");',
    '  g.imageSmoothingEnabled=false;',
    '  g.drawImage(bm,0,0);',
    '  return true;',
    '}',
  ]);
}
{
  const fn = kit.inFunction(L, 'function shelfTile(rec,watch){');
  const want = [
    'function shelfTile(rec,watch){',
    '  const cv=thumbCanvas(rec);',
    '  const w=(arguments.length>1)?watch:shelfWatch;',
    '  if(w){ cv.pbPaint=function(){ thumbPaint(cv,rec&&rec.blob); }; w.observe(cv); }',
    '  else thumbPaint(cv,rec&&rec.blob);',
    '  return cv;',
    '}',
  ];
  if (fn.end - fn.start + 1 !== want.length) throw new Error('shelfTile changed length');
  for (let k = 0; k < want.length; k++) if (L[fn.start + k] !== want[k]) throw new Error('shelfTile moved at +' + k);
  kit.replace(L, { start: fn.start, end: fn.end }, [
    'function shelfTile(rec,watch){',
    '  const cv=thumbCanvas(rec);',
    '  const w=(arguments.length>1)?watch:shelfWatch;',
    '  /* Already drawn once: drawn again now, in the task that builds the tile. */',
    '  const key=thumbKeyOf(rec,cv);',
    '  if(thumbFromKept(key,cv)) return cv;',
    '  if(w){ cv.pbPaint=function(){ thumbPaint(cv,rec&&rec.blob,key); }; w.observe(cv); }',
    '  else thumbPaint(cv,rec&&rec.blob,key);',
    '  return cv;',
    '}',
  ]);
}

/* ---- the last-edited list draws from the same kept thumbnails ----------- */
{
  const i = at('    thumbPaint(cv,t.blob);', 'the recent row');
  if (L[i - 1] !== '    const cv=thumbCanvas(t);') throw new Error('the recent row moved');
  kit.replace(L, { start: i, end: i }, [
    '    /* The same size as a shelf tile, so the same kept picture: this list',
    '       is rebuilt on every full render and decoded ten PNGs each time. */',
    '    { const key=thumbKeyOf(t,cv); if(!thumbFromKept(key,cv)) thumbPaint(cv,t.blob,key); }',
  ]);
}

/* ---- the shelf records what it read, and the pull asks ------------------ */
{
  const fnR = () => kit.inFunction(L, 'async function renderShelf(viewOnly){');
  swap('  else try{ items=await dbAll(); }catch(_){ $(\'proj\').hidden=true; $(\'compose\').hidden=true;', [
    '  else try{ shelfReadSeq=touchSeq; items=await dbAll(); }catch(_){ shelfReadSeq=-1; $(\'proj\').hidden=true; $(\'compose\').hidden=true;',
  ], 'the read', fnR());
  const f = fnR();
  kit.replace(L, { start: f.start, end: f.start }, [
    '/* The touch sequence when the shelf last read the store: every write moves',
    '   it, so equal means nothing has been written since the shelf was drawn. */',
    'let shelfReadSeq=-1;',
    '/* For the ends of the pull and the catch-up, which used to render',
    '   whatever happened - three renders on a quiet group open. */',
    'async function renderShelfIfStale(){',
    '  if(shelfReadSeq!==touchSeq) await renderShelf();',
    '}',
    'async function renderShelf(viewOnly){',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  const i = kit.only(L, (l, k) => l === '  await renderShelf();' && L[k + 1] === '  $("cloudpull").disabled=false;', 'the pull\'s render', fn);
  kit.replace(L, { start: i, end: i }, ['  await renderShelfIfStale();']);
}
{
  const fn = kit.inFunction(L, 'async function groupCatchUpRun(){');
  const i = kit.only(L, (l, k) => l === '  await renderShelf();' && L[k + 1] === '}', 'the catch-up\'s render', fn);
  kit.replace(L, { start: i, end: i }, ['  await renderShelfIfStale();']);
}

/* ---- a quiet pull writes nothing ------------------------------------------ */
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  const i = at('      hidden:[...HIDDEN_LAYERS].sort(), at:Date.now()}); }catch(_){}', 'the layer write', fn);
  if (L[i - 1] !== '    try{ await dbPut({id:LAYERS_ID, kind:"settings", layers:LAYERS.slice(),') throw new Error('the layer write moved');
  kit.replace(L, { start: i - 1, end: i }, [
    '    /* Only when it differs from what is recorded: a pull that wrote an',
    '       unchanged list on every open made every open look like a change. */',
    '    const hid=[...HIDDEN_LAYERS].sort();',
    '    const same=own && JSON.stringify(mine.layers)===JSON.stringify(LAYERS)',
    '      && JSON.stringify((Array.isArray(mine.hidden)?mine.hidden:[]).slice().sort())===JSON.stringify(hid);',
    '    if(!same) try{ await dbPut({id:LAYERS_ID, kind:"settings", layers:LAYERS.slice(),',
    '      hidden:hid, at:Date.now()}); }catch(_){}',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  const i = at('      pulledRules=RULES.length;', 'the rules adopt', fn);
  if (L[i + 1] !== '      await saveRules();') throw new Error('the rules save moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '      pulledRules=RULES.length;',
    '      /* WRITTEN AND STAMPED ONLY WHEN THIS CHANGED THEM. saveRules on every',
    '         pull rewrote both records, restamped the rules as a change made',
    '         here, and sent them back to the group - on every open. When',
    '         nothing changed here the group is told only if its copy differs',
    '         from this one, which is the case saveRules was covering: answers',
    '         given here that the group has not got. */',
    '      if(JSON.stringify([RULES,DECISIONS,DECIDE_ORDER])!==rulesWere) await saveRules();',
    '      else {',
    '        const theirsSig=JSON.stringify([theirs.length?theirs:[],',
    '          (Array.isArray(c.decide_order)&&c.decide_order.length)?c.decide_order.map(String).filter(Boolean):DECIDE_ORDER,',
    '          mergeDecisions([],Array.isArray(c.decisions)?c.decisions:[]),',
    '          typeof c.empty_chance==="number"?c.empty_chance:null]);',
    '        const oursSig=JSON.stringify([RULES,DECIDE_ORDER,DECISIONS,emptyChance]);',
    '        if(theirsSig===oursSig) sharedRuleSig=oursSig;',
    '        else await shareRules();',
    '      }',
  ]);
  const f2 = kit.inFunction(L, 'async function cloudPull(opts){');
  const j = at('    if(theirs.length||merged.length){', 'the rules branch', f2);
  kit.replace(L, { start: j, end: j }, [
    '    if(theirs.length||merged.length){',
    '      const rulesWere=JSON.stringify([RULES,DECISIONS,DECIDE_ORDER]);',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function takeEmptyChance(c){');
  swap('    await saveEmptyChance();', [
    '    /* Written only when the recorded value differs, for the reason the',
    '       layer list is: a pull that changed nothing must write nothing. */',
    '    let mine=null; try{ mine=await dbGet(EMPTY_ID); }catch(_){ mine=null; }',
    '    if(!(mine&&mine.chance===theirs)) await saveEmptyChance();',
  ], 'the chance write', fn);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('renderShelfIfStale()', 3);
  once('if(thumbFromKept(key,cv)) return cv;');
  once('shelfReadSeq=touchSeq;');
  once('touch("\\u0000clear");');
});

fs.renameSync(TMP, FILE);
console.log('patch551 written, ' + grew + ' bytes');
