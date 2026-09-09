/* FIFTEEN SECONDS OF WORK ON EVERY LOAD FOR AN ANSWER THAT NEVER CHANGES, AND
   A WALL BETWEEN YOU AND YOUR OWN COLLECTION WHEN THE SIGNAL DROPS.

   1. THE PIXEL BLOCK IS A PROPERTY OF THE ARTWORK AND WAS RE-DERIVED EVERY
      TIME. autoCanvas asks each trait what size its pixels are drawn at, which
      means decoding it and scanning up to 1.6 million pixels. Measured at the
      collection's size: 3,401 ms here and about 14,800 ms at a sixth of this
      CPU, on every page load, for 318 numbers that are 1, 5, 8 or 10 and will
      be the same numbers tomorrow.

      Remembered in localStorage rather than in the store. It is a derived
      cache, it belongs to this device, and putting it in IndexedDB would put
      it in the thing that syncs to the group and the thing "clear project"
      empties - neither of which is true of it. Keyed per workspace, because
      wsDbName already keys the database that way and two projects have
      different traits under the same ids.

      INVALIDATED BY THE BLOB'S LENGTH. An entry is used only when the record's
      PNG is still exactly as long as it was when the number was measured. A
      re-cut trait almost always changes length, and one that does not is worth
      re-measuring rather than trusting. That is a weaker check than a hash and
      it is on the right side: being wrong here means one scan too many, not a
      wrong canvas.

   2. WITH NO SIGNAL YOU CANNOT SEE YOUR OWN WORK. cloudRender returns early
      when it cannot reach the server, and everything that puts this device's
      collection on screen - authed, gateShow, bootLocal - is below that
      return. So a cold load on the underground, in a lift, or on wifi that
      passes no traffic gives the sign-in wall: 318 traits sitting in IndexedDB
      on the phone, a valid session in localStorage, and no way through, because
      the only route past the wall is a password form that also needs the
      network.

      The guard's own comment says why it exists - "one dropped request set
      authed=false and raised the gate ... Everything is left exactly as it
      was" - and it is right about a mid-session drop and wrong at boot, where
      "as it was" is a full-screen wall over an empty page.

      THE TRADE, STATED. Opening the local view on an unverified session means
      that on this device, offline, a stored session is treated as proof. It is
      the same credential the page would send the moment there was signal, the
      data is already on the device in this browser's own storage, and the
      alternative is locking the owner out of their own collection because the
      train went into a tunnel. Only at boot, only when a session is actually
      stored, and only when the gate has not already been answered.

   3. A FAILED SAVE SAID NOTHING. autosaveNow ends `.then(done, done)` - the
      same callback for kept and lost - so a write refused by a full or evicted
      store resolved exactly like one that worked. Storage is the flaky part of
      a phone. It says so now, and the promise reports which happened, so a
      caller that wants to know can ask. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1: the block sizes are remembered -------------------------- */
{
  const at = kit.only(L, l => l === 'let autoSide=null, autoKey="";', 'the canvas memo');
  kit.replace(L, { start: at, end: at }, [
    'let autoSide=null, autoKey="";',
    '/* WHAT EACH TRAIT\'S PIXEL BLOCK IS, kept between visits.',
    '',
    '   Working it out costs a decode and a scan of up to 1.6 million pixels per',
    '   trait - 3,401 ms across the collection here, about 14,800 at a sixth of',
    '   this CPU - and the answer is a small integer that belongs to the artwork',
    '   and does not change while the artwork does not.',
    '',
    '   localStorage, not the store: this is a derived cache belonging to this',
    '   device, and IndexedDB is the thing that syncs to the group and the thing',
    '   "clear project" empties. Keyed by the database name, because wsDbName',
    '   already separates workspaces and two projects reuse ids.',
    '',
    '   An entry is trusted only while the record\'s PNG is the same LENGTH it',
    '   was when measured. Weaker than a hash, and wrong in the safe direction:',
    '   a false miss costs one scan, a false hit would choose a canvas from the',
    '   picture before an edit. */',
    'function blockStoreKey(){ return "pb.blocks."+wsDbName(); }',
    'let blockStoreRead=false;',
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
    'function saveBlocks(list){',
    '  try{',
    '    const out={};',
    '    for(const r of (list||[])){',
    '      const b=r&&blockOf.get(r.id);',
    '      if(b!==undefined&&r.blob) out[r.id]={b:b,s:r.blob.size};',
    '    }',
    '    localStorage.setItem(blockStoreKey(),JSON.stringify(out));',
    '  }catch(_){}',
    '}',
  ]);

  const r = kit.inFunction(L, 'async function autoCanvas(recs){');
  const seen = kit.only(L, l => l === '  const seen=[];', 'the sweep list', r);
  kit.replace(L, { start: seen, end: seen }, [
    '  /* Before the loop, so a visit after the first finds every answer already',
    '     here and decodes nothing at all. */',
    '  loadBlocks(list);',
    '  const seen=[];',
  ]);
  const after = kit.only(L, l => l === '  if(!seen.length) return CANVAS_SIDE;', 'the end of the sweep', r);
  kit.replace(L, { start: after, end: after }, [
    '  /* Only when something was actually measured, so an ordinary render does',
    '     not rewrite a string of thirteen kilobytes for nothing. Not awaited:',
    '     the answer below does not depend on it. */',
    '  if(scanned) saveBlocks(list);',
    '  if(!seen.length) return CANVAS_SIDE;',
  ]);

  /* A record whose artwork changed drops its number here as well. */
  const drop = kit.inFunction(L, 'function cBitmapDrop(id){');
  const line = kit.only(L, l => l === '  try{ blockOf.delete(id); autoKey=""; autoSide=null; }catch(_){}',
    'the block invalidation', drop);
  kit.replace(L, { start: line, end: line }, [
    '  /* And the remembered copy, or the next load reads back the number for a',
    '     picture that is gone. The blob length would usually catch it; saying it',
    '     here does not depend on that. */',
    '  try{ blockOf.delete(id); autoKey=""; autoSide=null; blockStoreRead=false; }catch(_){}',
  ]);
}

/* ---- 2: the local view opens without the network ---------------- */
{
  const at = kit.only(L, l => l === '  if(a.state==="unknown"){', 'the unreachable branch');
  if (L[at + 1] !== '    $("cloudnote").textContent=CLOUD_UNREACHABLE;')
    throw new Error('the unreachable branch does not set the note where this expects');
  if (L[at + 2] !== '    return null;')
    throw new Error('the unreachable branch does not return where this expects');
  if (L[at + 3] !== '  }')
    throw new Error('the unreachable branch does not close where this expects');
  kit.replace(L, { start: at, end: at + 3 }, [
    '  if(a.state==="unknown"){',
    '    $("cloudnote").textContent=CLOUD_UNREACHABLE;',
    '    /* AND YOUR OWN WORK, WHICH WAS BEHIND THE WALL. Everything that puts',
    '       this device\'s collection on screen is below this return, so a cold',
    '       load with no usable signal gave the sign-in card over an empty page -',
    '       with 318 traits in IndexedDB on the device and a valid session in',
    '       localStorage, and no way through, because the only route past the',
    '       wall is a password form that also needs the network.',
    '',
    '       The comment below is right about a mid-session drop and was wrong at',
    '       boot: "left exactly as it was" is a full-screen wall when nothing has',
    '       opened yet.',
    '',
    '       THE TRADE. Offline there is no way to check a stored session, so this',
    '       treats one as proof. It is the same credential the page would send',
    '       the moment there was signal, the data is already in this browser, and',
    '       the alternative is locking somebody out of their own collection',
    '       because the train went into a tunnel. Guarded three ways: only when',
    '       the gate has not already been answered, only when a session is really',
    '       stored, and never as a downgrade - authed is only ever set true here. */',
    '    if(!authed && sbLoadSession()){',
    '      authed=true;',
    '      gateShow(false);',
    '      bootLocal();',
    '    }',
    '    return null;',
    '  }',
  ]);
}

/* ---- 3: a failed save says so ----------------------------------- */
{
  const r = kit.inFunction(L, 'function autosaveNow(){');
  const at = kit.only(L, l => l === '  return new Promise(done=>{', 'the autosave promise', r);
  if (L[at + 1] !== '    art.toBlob(b=>{') throw new Error('the encode is not where this expects');
  if (L[at + 2] !== '      if(!b){ done(); return; }') throw new Error('the empty-blob guard moved');
  if (L[at + 5] !== '        .then(done, done);') throw new Error('the write tail is not where this expects');
  kit.replace(L, { start: at, end: at + 5 }, [
    '  /* RESOLVES WITH WHETHER IT WORKED. This was `.then(done, done)` - the same',
    '     callback for kept and lost - so a write refused by a full or evicted',
    '     store finished exactly like one that succeeded, and the editor closed',
    '     over it without a word. Storage is the flaky part of a phone: iOS',
    '     clears an origin after seven days, and a transaction can be aborted',
    '     when the OS reclaims memory. It says so now, once, where somebody can',
    '     act on it. */',
    '  return new Promise(done=>{',
    '    art.toBlob(b=>{',
    '      if(!b){ done(false); return; }',
    '      dbPut({id:key, kind:"autosave", traitId:of, name:fileName||"untitled.png",',
    '             w:art.width, h:art.height, blob:b, at:Date.now()})',
    '        .then(()=>done(true), ()=>{',
    '          try{ toast("Could not save your work to this browser - copy it out"',
    '            +" with Download before closing the tab."); }catch(_){}',
    '          done(false);',
    '        });',
  ]);
  /* The two early returns say the same thing in the same currency. */
  const r2 = kit.inFunction(L, 'function autosaveNow(){');
  const e1 = kit.only(L, l => l === '  if(!ctx) return Promise.resolve();', 'the no-canvas exit', r2);
  kit.replace(L, { start: e1, end: e1 }, ['  if(!ctx) return Promise.resolve(false);']);
  const e2 = kit.only(L, l => l === '  if(of && undoStack.length===savedDepth) return Promise.resolve();',
    'the nothing-to-keep exit', r2);
  kit.replace(L, { start: e2, end: e2 },
    ['  if(of && undoStack.length===savedDepth) return Promise.resolve(true);']);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ code, codeLines }) => {
  const ac = kit.inFunction(codeLines, 'async function autoCanvas(recs){');
  const acBody = codeLines.slice(ac.start, ac.end + 1).join('\n');
  if (!/loadBlocks\(list\)/.test(acBody)) throw new Error('the sweep never reads what it remembered');
  if (!/if\(scanned\) saveBlocks\(list\)/.test(acBody))
    throw new Error('the sweep never writes what it measured');
  /* And it still measures when it has to, or "remembered" would mean "never
     computed" and the canvas would come out of nothing. */
  if (!/pixelBlock\(bm\)/.test(acBody)) throw new Error('the sweep no longer measures anything');

  const lb = kit.inFunction(codeLines, 'function loadBlocks(list){');
  const lbBody = codeLines.slice(lb.start, lb.end + 1).join('\n');
  if (!/e\.s===r\.blob\.size/.test(lbBody))
    throw new Error('a remembered block is trusted without checking the artwork is the same');
  if (!/typeof e\.b==="number"/.test(lbBody))
    throw new Error('a remembered block is trusted without checking it is a number');

  /* It is device-local. Nothing about this may reach the store that syncs. */
  const sb = kit.inFunction(codeLines, 'function saveBlocks(list){');
  const sbBody = codeLines.slice(sb.start, sb.end + 1).join('\n');
  if (/dbPut\(/.test(sbBody) || /dbPut\(/.test(lbBody))
    throw new Error('the block cache writes into the store that syncs to the group');
  if (!/localStorage\.setItem/.test(sbBody)) throw new Error('the block cache is not written anywhere');

  const cr = kit.inFunction(codeLines, 'async function cloudRender(){');
  const crBody = codeLines.slice(cr.start, cr.end + 1).join('\n');
  if (!/if\(!authed && sbLoadSession\(\)\)\{/.test(crBody))
    throw new Error('an unreachable server still hides this device\'s own collection');
  /* NEVER A DOWNGRADE. The guard exists because a dropped request used to set
     authed=false; this must only ever set it true. */
  const unknownAt = crBody.indexOf('a.state==="unknown"');
  const seg = crBody.slice(unknownAt, crBody.indexOf('return null;', unknownAt));
  if (/authed=false/.test(seg) || /gateShow\(true\)/.test(seg))
    throw new Error('the unreachable branch can now take the view away, which is what it was written to stop');

  const an = kit.inFunction(codeLines, 'function autosaveNow(){');
  const anBody = codeLines.slice(an.start, an.end + 1).join('\n');
  if (/\.then\(done, done\)/.test(anBody))
    throw new Error('a failed write is still indistinguishable from a good one');
  if (!/done\(true\)/.test(anBody) || !/done\(false\)/.test(anBody))
    throw new Error('the autosave does not report which happened');
  if (!/toast\(/.test(anBody)) throw new Error('a failed write still says nothing to anyone');
  void code;
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
