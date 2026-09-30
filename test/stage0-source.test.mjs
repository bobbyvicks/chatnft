import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { findSecrets } from './secrets.mjs';
import { foldAll, firstArgOf } from './jsfold.mjs';

/* GUARDS ON WHAT THE REPO PUBLISHES, for rules no behaviour test can pin
   because they are about what must never be there. Comments are stripped
   by patchkit's own code(), so a comment quoting a rule cannot satisfy it.
   The site serves every tracked file and the GitHub repository is public,
   so the secret scan covers every tracked file, not only the page.

   Each check has a control that must be found, or a case that must fail,
   so a check that cannot say no does not pass as one that said yes. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const kit = require('../tools/patchkit.cjs');
const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
const code = kit.code(kit.scriptOf(page));

test('stage 0 never opens a chatnft.v2 store and never sets the migration flag (design B1)', () => {
  assert.doesNotMatch(code, /chatnft\.v2/);
  assert.doesNotMatch(code, /setItem\(\s*["']pb\.migrating/);
  /* The control: it does read the flag - in s0FlagOn, for a store and each
     of this account's uids (patch602, the audit's Finding 4). */
  assert.ok(code.includes('localStorage.getItem("pb.migrating."+dbn+"."+u)'), 'the control: it does read the flag');
});

/* FOLLOW-UP P4: THE SAME TWO RULES, FOR A NAME BUILT FROM PIECES. Test 1
   reads the text, so it passes a name that is never written out whole:
   localStorage.setItem(S0_MIG+db+'.x','1'), S0_MIG a constant holding the
   flag's prefix, and indexedDB.deleteDatabase('chatnft'+'.v2.x') both passed
   it (measured). jsfold.mjs folds every + chain of the script - literals,
   constants, and functions of no arguments that return one - and these
   read what the pieces can say:
   - the migration flag: a chain that can hold "pb.migrating" is allowed
     only as getItem's first argument, or as the initialiser of a constant
     that folds completely (its every use is a chain read here too). So a
     setItem, a removeItem, a localStorage[...] write, or a key kept in a
     variable part-built from it, is found wherever its pieces come from.
   - chatnft.v2: no chain can say it, in a run of known text or with the
     unknown parts left out ("chatnft"+x+".v2").
   Out of reach, and so not claimed: a name made by anything the folder does
   not follow (an array join, a replace, a +=, a value read at run time). */
const MIG = /pb\.migrating/;
const V2 = /chatnft\.v2/;
function migrationUses(src) {
  const f = foldAll(src);
  const hits = f.chains.filter(c => c.texts.some(s => MIG.test(s)));
  const declOf = (c) => {
    const eq = f.toks[c.start - 1], name = f.toks[c.start - 2], kw = f.toks[c.start - 3];
    if (!eq || eq.v !== '=' || !name || name.t !== 'id' || !kw) return null;
    return (kw.t === 'id' && /^(const|let|var)$/.test(kw.v)) || kw.v === ',' ? name.v : null;
  };
  const allowed = (c) => firstArgOf(f.toks, c, 'getItem') || (!!declOf(c) && c.known);
  return { reads: hits.filter(c => firstArgOf(f.toks, c, 'getItem')).map(c => c.src),
    others: hits.filter(c => !allowed(c)).map(c => c.src), env: f.env, strings: f.toks.filter(t => t.t === 'str').length };
}
const v2Names = (src) => foldAll(src).chains.filter(c => c.texts.some(s => V2.test(s))).map(c => c.src);
test('the migration flag is only read, and no chatnft.v2 name is built, however the name is put together (follow-up P4)', () => {
  const script = kit.scriptOf(page);
  const m = migrationUses(script);
  /* The folder read the script: its strings, and the constants the page's
     own keys are made from. */
  assert.ok(m.strings > 5000, 'the tokenizer read only ' + m.strings + ' strings');
  assert.deepEqual([m.env.consts.get('DBN'), m.env.consts.get('STORE'), m.env.consts.get('SB_SESSION')],
    [['pixelbench'], ['items'], ['chatnft.session']], 'the constants a key is built from are read');
  /* The control: it finds the flag where the page does read it (s0FlagOn). */
  assert.deepEqual(m.reads, ['"pb.migrating."+dbn+"."+u'], 'the control: the one read of the flag is found');
  assert.deepEqual(m.others, [], 'the flag is built only to be read');
  assert.deepEqual(v2Names(script), [], 'no chatnft.v2 name');

  /* THE CALIBRATION: each case is added to the page's script, and must be
     found. The first of each pair is the bypass measured against test 1. */
  const plus = (s) => script + '\n;(function(){ ' + s + ' })();\n';
  const caught = [
    ['const S0_MIG="pb.migrating."; function s0Bypass(db){ localStorage.setItem(S0_MIG+db+\'.x\',\'1\'); }', "S0_MIG+db+'.x'"],
    ['const S0_MIG="pb.mig"+"rating."; function s0Bypass(db){ localStorage.setItem(S0_MIG+db,\'1\'); }', 'S0_MIG+db'],
    ['function s0Bypass(db){ const k="pb."+"migrating."+db; localStorage.setItem(k,\'1\'); }', '"pb."+"migrating."+db'],
    ['function s0Bypass(db){ localStorage["pb.migr"+"ating."+db]="1"; }', '"pb.migr"+"ating."+db'],
    ['function s0Bypass(db){ localStorage.removeItem(`pb.migrating.${db}`); }', '`pb.migrating.${db}`'],
  ];
  for (const [add, src] of caught) {
    assert.doesNotMatch(add, /setItem\(\s*["']pb\.migrating/, 'test 1\'s text check cannot see it: ' + add);
    assert.ok(migrationUses(plus(add)).others.includes(src), 'the flag built from pieces is found: ' + add);
  }
  const v2 = [
    ["indexedDB.deleteDatabase('chatnft'+'.v2.x');", "'chatnft'+'.v2.x'"],
    ['const V=".v"+2; indexedDB.open("chatnft"+V,1);', '"chatnft"+V'],
    ['function s0Bypass(sep){ return indexedDB.open("chatnft"+sep+".v2",1); }', '"chatnft"+sep+".v2"'],
    ['const VN=2; const n=`chatnft.v${VN}`;', '`chatnft.v${VN}`'],
  ];
  for (const [add, src] of v2) {
    assert.doesNotMatch(add, V2, "test 1's text check cannot see it: " + add);
    assert.ok(v2Names(plus(add)).includes(src), 'a chatnft.v2 name built from pieces is found: ' + add);
  }
  /* And what must pass: a read of the flag through a constant, and a
     chatnft name that is not v2. */
  const fine = plus('const S0_MIG2="pb.migrating."; function s0Fine(db){ return localStorage.getItem(S0_MIG2+db); } indexedDB.open("chatnft.ws."+"v2team",1);');
  assert.deepEqual(migrationUses(fine).others, [], 'a read through a constant is a read');
  assert.deepEqual(v2Names(fine), [], 'chatnft.ws. is not chatnft.v2');
});

test('no key or token that is not public, in the page or in any file the repo tracks', () => {
  assert.doesNotMatch(code, /service_role/);
  assert.ok(page.includes('sb_publishable_'), 'the control: the publishable key is there to be found');
  assert.deepEqual(findSecrets(page), []);
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean);
  const hits = [];
  let scanned = 0;
  for (const f of files) {
    let b;
    try { b = readFileSync(join(ROOT, f)); } catch (_) { continue; }
    if (b.subarray(0, 8192).includes(0)) continue;
    scanned++;
    for (const h of findSecrets(b.toString('utf8'))) hits.push(f + ': ' + h);
  }
  assert.ok(scanned > 500, 'scanned only ' + scanned + ' tracked text files: git ls-files did not list the repo');
  assert.deepEqual(hits, []);
});

test('the secret scan finds each shape it looks for, and passes the public keys - its calibration', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (role) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iss: 'supabase', role }) + '.' + 'x'.repeat(24);
  assert.deepEqual(findSecrets(jwt('anon')), [], 'a legacy anon key is public by design');
  assert.equal(findSecrets(jwt('service_role')).length, 1, 'a legacy service_role key');
  assert.equal(findSecrets('sb_' + 'secret_' + 'a'.repeat(24)).length, 1);
  assert.equal(findSecrets('sbp_' + 'oauth_' + 'a'.repeat(30)).length, 1, 'an OAuth token, underscore and all');
  assert.equal(findSecrets('Authorization: Bearer ' + 'a'.repeat(40)).length, 1);
  assert.equal(findSecrets('https://x.example/hook?token=' + 'a'.repeat(20)).length, 1);
  /* Final fixes, B6: an Anthropic key, and a GitHub token of either kind. */
  assert.equal(findSecrets('sk-' + 'ant-' + 'api03-' + 'a'.repeat(80)).length, 1, 'an Anthropic key');
  assert.equal(findSecrets('ghp' + '_' + 'a'.repeat(36)).length, 1, 'a classic GitHub token');
  assert.equal(findSecrets('github' + '_pat_' + 'a'.repeat(22) + '_' + 'b'.repeat(59)).length, 1, 'a fine-grained GitHub token');
  assert.deepEqual(findSecrets(page.match(/sb_publishable_[A-Za-z0-9_-]+/)[0]), [], 'the publishable key is public');
});

/* s0Busy reads each flag through on(), which takes a flag it cannot read
   as busy - so a renamed flag would stop the page ever reloading by
   itself, silently. The names are read from s0Busy's own text, so this
   list cannot drift from the function; and the list below must equal
   them, so a flag dropped from s0Busy fails here too. */
const topLevelLet = (name) => new RegExp('^let [^\\n]*\\b' + name + '\\b', 'm').test(code);
function busyFlags() {
  const at = code.indexOf('function s0Busy(){');
  if (at < 0) return null;
  const end = code.indexOf('\n}', at);
  const body = code.slice(at, end);
  const names = new Set();
  for (const m of body.matchAll(/on\(\(\)=>([^)]*)\)/g))
    for (const id of m[1].match(/[A-Za-z_$][\w$]*/g) || []) if (id !== 'undefined') names.add(id);
  return [...names].sort();
}
test('every flag the reload rule reads is declared at the top level of the page', () => {
  const read = busyFlags();
  assert.ok(read, 'no s0Busy in the page');
  assert.ok(read.includes('painting') && read.length >= 16, 'the names were not read out of s0Busy: ' + JSON.stringify(read));
  /* (Final fixes, ruling B2: and s0Working, the count of a person's own
     operations of many records in hand - a layer rename or removal, a
     sort, a batch move, a folder or project import.) */
  assert.deepEqual(read, ['painting', 'moveBuf', 'moveFrom', 'seDrag', 'seLift', 'textDrag', 'pendingTouch', 'shelfDrag', 'shelfMoveBusy',
    'layerDrag', 'exDrag', 'gdDrag', 'autoPending', 's0SaveInFlight', 's0SignOutWait', 's0WsWant', 's0Working'].sort(),
    'the flags s0Busy reads: Task 10\'s closing save and waits (autoPending, s0SaveInFlight, s0SignOutWait, s0WsWant) and the operations in hand (s0Working) among them');
  for (const name of read) assert.ok(topLevelLet(name), name + ' is not a top-level let: s0Busy would read it as busy, always');
  /* Ruling F-13: the check itself can say no - a name the page never declares. */
  assert.equal(topLevelLet('s0NoSuchFlag'), false, 'the check finds a name the page does not declare');
  /* And what s0FixerHolds reads: the fixer's results and the fixer at work. */
  assert.match(code, /^const FIX=\{[^\n]*\bout:[^\n]*\bworker:/m);
  assert.match(code, /^let fixBatchFiles=/m);
  assert.match(code, /^let fixBatchRunning=/m);
});

/* SUPERSEDED IN PART by the integration of Task 11's fix round 4 (the
   action's home) over Tasks 12-17, which added a third open: s0InStore,
   F1's by-name open of the store an addressed send was for, so its ahead
   mark is cleared there and never through db(). The count was two - db()
   and Leave's probe - and is three now, each pinned to its function: db()
   at version 1; s0InStore at version 1, locked first and tracked as db()
   is, and aborting any upgrade, so it cannot create a store that has gone;
   and Leave's probe, below. Every other assertion stands as written. */
test('the store is opened for use in one place, at version 1; the other opens are fix 4\'s by-name clear, which cannot create a store, and Leave\'s probe, which aborts its upgrade', () => {
  assert.equal((code.match(/indexedDB\.open\(/g) || []).length, 3);
  assert.ok(code.includes('indexedDB.open(name,1)'));
  assert.ok(code.includes('r=indexedDB.open(name,2);'));
  {
    const lines = kit.lines(code);
    const opens = lines.map((l, i) => l.indexOf('indexedDB.open(') >= 0 ? i : -1).filter(i => i >= 0);
    const owner = (i) => { let j = i; while (j >= 0 && !/^(async )?function /.test(lines[j])) j--; return j >= 0 ? lines[j] : null; };
    assert.deepEqual(opens.map(owner), ['function db(){', 'function s0InStore(name){', 'function s0OthersOpen(name){'],
      'each open is in the function this guard knows');
    const st = kit.inFunction(lines, 'function s0InStore(name){');
    const sb = lines.slice(st.start, st.end + 1).join('\n');
    assert.ok(sb.includes('const r=indexedDB.open(name,1);'), 's0InStore opens at version 1');
    assert.ok(sb.includes('r.onupgradeneeded=()=>{ try{ r.transaction.abort(); }catch(_){ } };'), 's0InStore aborts an upgrade, so it cannot create a store');
    assert.ok(sb.includes('s0Hold(name).then(') && sb.includes('s0Track(name,r.result,hold)'), 's0InStore takes the open lock first and is tracked, as db() is');
  }
  /* Leave's probe (s0OthersOpen, patch605) reads the store inside the
     upgrade and then aborts it, so it stays at version 1; stage0leave
     measures the version. Here: the probe's upgrade holds its transaction
     and aborts it. */
  const lines = kit.lines(code);
  const at = kit.inFunction(lines, 'function s0OthersOpen(name){');
  const body = lines.slice(at.start, at.end + 1).join('\n');
  assert.ok(body.includes('r=indexedDB.open(name,2);'), 'the version-2 open is Leave\'s probe');
  assert.ok(body.includes('r.onupgradeneeded=()=>{'));
  assert.ok(body.includes('const t=r.transaction;'));
  assert.ok(body.includes('const stop=()=>{ try{ t.abort(); }catch(_){ } };'));
});

/* FOLLOW-UP P5: LEAVE'S PROBE, RUN. Test 5 finds the abort's text, and a
   probe whose "alone" branch skipped t.abort() passed it (measured): the
   stop() line was still there. This runs s0OthersOpen itself - the
   function's own text, cut from the page - against a stand-in for
   indexedDB that behaves as the browser does for this one request: a
   version-2 open whose upgrade is aborted ends in an error named AbortError
   and the store stays at version 1; an upgrade not aborted commits, the
   store is at version 2, and the request succeeds. The browser's own side
   of that (the version really stays 1) is stage0leave.spec.js's version
   and reopen checks; this is the probe's side: that every verdict it
   reaches, it reaches by aborting. */
function probeSource(src) {
  const lines = kit.lines(src);
  const at = kit.inFunction(lines, 'function s0OthersOpen(name){');
  return lines.slice(at.start, at.end + 1).join('\n');
}
function runProbe(fnSrc, scene) {
  const seen = { aborts: 0, version: 1, queuedAdd: 0, queuedDone: 0, closed: 0 };
  const STORE_NAME = 'items';
  const idb = {
    open(name, version) {
      const r = { result: undefined, transaction: null, error: null };
      setImmediate(() => {
        if (scene.blocked) { if (r.onblocked) r.onblocked(); return; }
        let aborted = false, pending = 0, finished = false;
        const settle = () => {
          if (finished || pending) return;
          finished = true;
          if (aborted) { r.error = { name: 'AbortError' }; r.result = undefined; if (r.onerror) r.onerror({ preventDefault() {} }); }
          else { seen.version = version; if (r.onsuccess) r.onsuccess(); }
        };
        const later = (fn) => { pending++; setImmediate(() => { pending--; if (!aborted) fn(); settle(); }); };
        const t = {
          abort() { if (aborted) throw new Error('InvalidStateError'); aborted = true; seen.aborts++; },
          objectStore(n) {
            if (n !== STORE_NAME || scene.store === null) throw new Error('NotFoundError');
            return { openCursor() {
              const c = { result: null };
              let i = 0;
              const step = () => later(() => {
                const v = scene.store[i];
                c.result = v === undefined ? null : { value: v, continue() { i++; step(); } };
                if (c.onsuccess) c.onsuccess();
              });
              step();
              return c;
            } };
          },
        };
        r.result = { objectStoreNames: { contains: (n) => scene.store !== null && n === STORE_NAME }, close() { seen.closed++; } };
        r.transaction = t;
        if (r.onupgradeneeded) r.onupgradeneeded();
        settle();
      });
      return r;
    },
  };
  // eslint-disable-next-line no-new-func
  const probe = new Function('indexedDB', 'STORE', 's0QueuedAdd', 's0QueuedDone', fnSrc + '\nreturn s0OthersOpen;')(
    idb, STORE_NAME, () => { seen.queuedAdd++; }, () => { seen.queuedDone++; });
  return Promise.race([
    probe('chatnft.ws.team7').then(v => ({ v, seen })),
    new Promise(res => setTimeout(() => res({ v: 'no answer', seen }), 2000)),
  ]);
}
const trait = (synced) => ({ id: 't', kind: 'trait', synced });
const PROBE_SCENES = [
  ['no store in it', { store: null }, 'alone'],
  ['an empty store', { store: [] }, 'alone'],
  ['only what the group has', { store: [trait(true), { id: 'r', kind: 'ref', synced: true }, { id: 's', kind: 'settings' }] }, 'alone'],
  ['a trait the group has not got', { store: [trait(true), trait(false)] }, 'held'],
  ['a draft', { store: [trait(true), { id: 'a', kind: 'autosave' }] }, 'held'],
];
/* Every scene the probe answers from inside the upgrade: the verdict, one
   abort, and the store still at version 1. Blocked is answered without an
   upgrade, and is remembered as queued. Returns what went wrong. */
async function probeFaults(fnSrc) {
  const bad = [];
  for (const [label, scene, want] of PROBE_SCENES) {
    const { v, seen } = await runProbe(fnSrc, scene);
    if (v !== want) bad.push(label + ': answered ' + v + ', not ' + want);
    if (seen.aborts !== 1) bad.push(label + ': aborted ' + seen.aborts + ' times');
    if (seen.version !== 1) bad.push(label + ': the store is at version ' + seen.version);
  }
  const b = await runProbe(fnSrc, { blocked: true, store: [] });
  if (b.v !== 'blocked' || b.seen.queuedAdd !== 1) bad.push('blocked: answered ' + b.v + ', queued ' + b.seen.queuedAdd);
  return bad;
}
test('Leave\'s probe, run: each verdict is reached by aborting its upgrade, so the store stays at version 1 (follow-up P5)', async () => {
  const src = probeSource(kit.scriptOf(page));
  assert.deepEqual(await probeFaults(src), [], 'the probe as the page has it');
  /* THE CALIBRATION: the probe with one abort taken out must fail here. The
     first is the bypass measured against test 5, which still passes it. */
  const cut = (find, repl) => {
    assert.equal(src.split(find).length, 2, 'exactly one of: ' + find);
    return src.split(find).join(repl);
  };
  const mutants = [
    ['the "alone" branch at the end of the store skips the abort', cut('if(!cur){ verdict="alone"; stop(); return; }', 'if(!cur){ verdict="alone"; return; }')],
    ['the "alone" branch for a store with nothing in it skips the abort', cut('if(!r.result.objectStoreNames.contains(STORE)){ verdict="alone"; stop(); return; }', 'if(!r.result.objectStoreNames.contains(STORE)){ verdict="alone"; return; }')],
    ['the "held" branch skips the abort', cut('verdict="held"; stop(); return;', 'verdict="held"; return;')],
  ];
  for (const [label, m] of mutants) {
    const faults = await probeFaults(m);
    assert.ok(faults.length > 0, 'this check must fail on a probe where ' + label);
  }
  /* The first mutant is exactly what test 5 cannot see. */
  assert.ok(mutants[0][1].includes('const stop=()=>{ try{ t.abort(); }catch(_){ } };'), 'test 5\'s text is still in the first mutant');
});
