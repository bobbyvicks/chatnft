import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { findSecrets } from './secrets.mjs';

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
  assert.deepEqual(read, ['painting', 'moveBuf', 'moveFrom', 'seDrag', 'seLift', 'textDrag', 'pendingTouch', 'shelfDrag', 'shelfMoveBusy',
    'layerDrag', 'exDrag', 'gdDrag', 'autoPending', 's0SaveInFlight', 's0SignOutWait', 's0WsWant'].sort(),
    'the flags s0Busy reads: Task 10\'s closing save and waits (autoPending, s0SaveInFlight, s0SignOutWait, s0WsWant) among them');
  for (const name of read) assert.ok(topLevelLet(name), name + ' is not a top-level let: s0Busy would read it as busy, always');
  /* Ruling F-13: the check itself can say no - a name the page never declares. */
  assert.equal(topLevelLet('s0NoSuchFlag'), false, 'the check finds a name the page does not declare');
  /* And what s0FixerHolds reads: the fixer's results and the fixer at work. */
  assert.match(code, /^const FIX=\{[^\n]*\bout:[^\n]*\bworker:/m);
  assert.match(code, /^let fixBatchFiles=/m);
  assert.match(code, /^let fixBatchRunning=/m);
});

test('the store is opened for use in one place, at version 1; the only other open is Leave\'s probe, which aborts its upgrade', () => {
  assert.equal((code.match(/indexedDB\.open\(/g) || []).length, 2);
  assert.ok(code.includes('indexedDB.open(name,1)'));
  assert.ok(code.includes('r=indexedDB.open(name,2);'));
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
