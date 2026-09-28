/* STAGE 0, PART 1 OF 7: EACH TAB HOLDS open:<database> WHILE IT HAS IT OPEN.

   Auto cloud save design, D1: "it holds open:<db> for the old database while
   open, so the new page's Leave and Reset can see it"; B1: "Each tab holds a
   per-tab lock, open:<db>, for each database it opens."

   db() takes a shared Web Lock named "open:" + the database name before it
   opens that database, and every connection this tab opens is tracked with
   its lock. Closing a connection - wherever that happens, cloudSignOut
   (index.html:18335) or wsSwitch (20204) - lets its lock go, because close()
   itself is wrapped. s0CloseAll(name) closes every handle this tab has on a
   database, including one db() left open when the project changed under it:
   db() has never closed the handle it replaces (4230-4231), and still does
   not, because a write in flight may hold it.

   Feature-detected: without navigator.locks (Safari before 15.4) the open
   goes ahead as before, holding nothing. The version stays 1
   (renamedoesnotorphan.spec.js opens both stores at version 1), and the name
   is still read once, as db() is called - dbPut relies on that (the comment
   above wsGen, 4212-4224).

   A store the browser will not open at all (indexedDB.open throws: storage
   denied, an opaque origin) still rejects db() with that error, as it did
   before, and lets its lock go. The first version of this patch opened
   inside the lock's callback with no catch, so the throw rejected nothing:
   db() never settled and the tab kept open:<store> (measured - a thrown
   SecurityError gave "rejected" before, "still pending after 3s" with the
   lock held after). Fixed here, not in a later patch, so this file stays
   the record of what the page carries (controller ruling, 2026-09-28).

   Nothing reads the locks yet: patch605's Leave is the first. */
const s0 = require('./stage0-common.cjs');
const doc = s0.start([]);

doc.swap(['let dbpName=null;', 'let dbp=null;'], [
  '/* STAGE 0 (auto cloud save design, D1 and B1): WHICH TABS HAVE A STORE OPEN.',
  '   Each tab holds a shared Web Lock, "open:" + the database name, for as long',
  '   as it has that database open, so a Leave - this page\'s, or the new page\'s',
  '   Leave and Reset - can see that another tab is using it. Every connection',
  '   this tab opens is tracked with its lock, and closing it lets the lock go.',
  '   Tabs from before stage 0 take no lock. */',
  'const S0_LOCK_PREFIX="open:";',
  'const s0OpenDbs=new Map();   /* database name -> Set of {d, hold} */',
  '/* The shared lock, then {release, gone}: release() lets it go, and gone()',
  '   is a promise that settles only once the lock HAS gone - calling',
  '   release() lets the callback\'s promise settle, and the browser drops the',
  '   lock after that, so a Leave that asks for the lock exclusively must wait',
  '   for gone() or meet its own tab\'s lock. null without Web Locks. */',
  'function s0Hold(name){',
  '  return new Promise(granted=>{',
  '    try{',
  '      if(!(navigator.locks&&typeof navigator.locks.request==="function")){ granted(null); return; }',
  '      let gone=null;',
  '      gone=navigator.locks.request(S0_LOCK_PREFIX+name,{mode:"shared"},',
  '        ()=>new Promise(release=>granted({release:release, gone:()=>gone})))',
  '        .catch(()=>{ granted(null); });',
  '    }catch(_){ granted(null); }',
  '  });',
  '}',
  'function s0Track(name,d,hold){',
  '  const entry={d:d, hold:hold};',
  '  if(!s0OpenDbs.has(name)) s0OpenDbs.set(name,new Set());',
  '  s0OpenDbs.get(name).add(entry);',
  '  const done=()=>{',
  '    const set=s0OpenDbs.get(name);',
  '    if(set&&set.delete(entry)&&!set.size) s0OpenDbs.delete(name);',
  '    const r=entry.hold&&entry.hold.release;',
  '    if(r){ entry.hold.release=null; try{ r(); }catch(_){} }',
  '  };',
  '  const close=d.close.bind(d);',
  '  d.close=()=>{ try{ close(); } finally{ done(); } };',
  '  /* The browser can close it too: storage cleared, the disk gone. */',
  '  d.onclose=done;',
  '  return d;',
  '}',
  '/* Every handle this tab has on one database, closed: its own Leave must',
  '   never be refused by itself. Answers how many it closed. */',
  'function s0CloseAll(name){',
  '  const set=s0OpenDbs.get(name);',
  '  if(!set) return 0;',
  '  let n=0;',
  '  for(const e of [...set]){ try{ e.d.close(); n++; }catch(_){} }',
  '  return n;',
  '}',
  '/* The same, and settles once every one of their locks has actually gone. */',
  'async function s0CloseAllGone(name){',
  '  const set=s0OpenDbs.get(name);',
  '  const waits=set ? [...set].map(e=>e.hold&&e.hold.gone&&e.hold.gone()).filter(Boolean) : [];',
  '  const n=s0CloseAll(name);',
  '  try{ await Promise.all(waits); }catch(_){ }',
  '  return n;',
  '}',
  'let dbpName=null;',
  'let dbp=null;',
]);

doc.swap([
  'function db(){',
  '  if(dbp && dbpName===wsDbName()) return dbp;',
  '  dbp=new Promise((res,rej)=>{',
  '    dbpName=wsDbName();',
  '    const r=indexedDB.open(wsDbName(),1);',
  '    r.onupgradeneeded=()=>{ const d=r.result;',
  "      if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE,{keyPath:'id'}); };",
  '    r.onsuccess=()=>res(r.result);',
  '    r.onerror=()=>rej(r.error);',
  '  });',
  '  return dbp;',
  '}',
], [
  'function db(){',
  '  if(dbp && dbpName===wsDbName()) return dbp;',
  '  dbp=new Promise((res,rej)=>{',
  '    /* The name, once, now - not when the lock comes (see wsGen above). */',
  '    const name=wsDbName();',
  '    dbpName=name;',
  '    /* STAGE 0: the open lock first, then the open (design D1). */',
  '    s0Hold(name).then(hold=>{',
  '      /* A store the browser will not open at all - storage denied, an opaque',
  '         origin - throws here instead of firing onerror. Before stage 0 that',
  '         throw rejected db(); inside this callback it would reject nothing,',
  '         so every caller would wait forever and the lock would stay held. */',
  '      try{',
  '        const r=indexedDB.open(name,1);',
  '        r.onupgradeneeded=()=>{ const d=r.result;',
  "          if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE,{keyPath:'id'}); };",
  '        r.onsuccess=()=>res(s0Track(name,r.result,hold));',
  '        r.onerror=()=>{ if(hold&&hold.release){ try{ hold.release(); }catch(_){} } rej(r.error); };',
  '      }catch(e){',
  '        if(hold&&hold.release){ try{ hold.release(); }catch(_){} }',
  '        rej(e);',
  '      }',
  '    });',
  '  });',
  '  return dbp;',
  '}',
]);

doc.finish(({ code, must }) => {
  must('navigator.locks.request(S0_LOCK_PREFIX+name,{mode:"shared"},', 'db() does not take the open lock');
  must('const r=indexedDB.open(name,1);', 'the store is not opened by name at version 1');
  must('r.onsuccess=()=>res(s0Track(name,r.result,hold));', 'an opened store is not tracked');
  must('async function s0CloseAllGone(name){', 'nothing can wait for this tab\'s locks to go');
  if ((code.match(/indexedDB\.open\(/g) || []).length !== 1) throw new Error('db() should be the only place a store is opened');
  /* A store that cannot be opened still rejects db(), with its lock let go. */
  const at = code.indexOf('function db(){');
  const dbBody = code.slice(at, code.indexOf('\nfunction ', at + 1));
  if (!/\}catch\(e\)\{\s*if\(hold&&hold\.release\)\{ try\{ hold\.release\(\); \}catch\(_\)\{\} \}\s*rej\(e\);/.test(dbBody))
    throw new Error('db() no longer rejects, with its lock let go, when the open throws');
});
