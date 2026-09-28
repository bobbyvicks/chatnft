import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLiveCatalog } from './catalog.mjs';
import { verdict, probe, PROBES, SB_URL, SB_KEY, anonMayInsert, pageSupabase, main } from '../../tools/a0-rest-probe.mjs';

/* NOTHING IN THIS FILE REACHES THE NETWORK. Every probe here is handed a
   stand-in fetch; the real one is replaced for the whole file by one that
   fails the test, so a code path that forgot its stand-in fails loudly
   instead of sending a request to the live project. */
const realFetch = globalThis.fetch;
test.before(() => { globalThis.fetch = async (url) => { throw new Error('a real request was attempted: ' + url); }; });
test.after(() => { globalThis.fetch = realFetch; });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = readFileSync(join(ROOT, 'index.html'), 'utf8');

const at = (o) => PROBES.map(p => Object.assign({ name: p.name, status: 400, code: null, rows: null }, o[p.name] || {}));
const BEFORE = at({
  'select-a0': { status: 400, code: '42703' }, 'select-control': { status: 400, code: '42703' },
  'insert-a0': { status: 400, code: 'PGRST204' }, 'insert-control': { status: 400, code: 'PGRST204' },
});
const AFTER = at({
  'select-a0': { status: 200, rows: 0 }, 'select-control': { status: 400, code: '42703' },
  'insert-a0': { status: 400, code: '22P02' }, 'insert-control': { status: 400, code: 'PGRST204' },
});
const failing = (v) => v.lines.filter(l => l.startsWith('FAIL')).map(l => l.slice(5).split(':')[0]);

test('before A0 reads as before, and not as after', () => {
  assert.equal(verdict(BEFORE, 'before').ok, true);
  assert.equal(verdict(BEFORE, 'after').ok, false);
});
test('after A0 reads as after, and not as before', () => {
  assert.equal(verdict(AFTER, 'after').ok, true);
  assert.equal(verdict(AFTER, 'before').ok, false);
});
test('a schema cache that has not heard of replaces fails after, on insert-a0', () => {
  const stale = AFTER.map(r => r.name === 'insert-a0' ? Object.assign({}, r, { code: 'PGRST204' }) : r);
  const v = verdict(stale, 'after');
  assert.equal(v.ok, false);
  assert.ok(v.lines.some(l => l.startsWith('FAIL') && l.includes('insert-a0')));
});
/* Each control is broken in each state's own good answers, so the control
   is the only thing that fails. */
test('a broken control fails in both states', () => {
  const answersAsIfAColumn = { 'select-control': { status: 200, code: null, rows: 0 }, 'insert-control': { status: 400, code: '22P02' } };
  for (const name of Object.keys(answersAsIfAColumn)) {
    const breakIn = (rows) => rows.map(r => r.name === name ? Object.assign({}, r, answersAsIfAColumn[name]) : r);
    const broken = breakIn(BEFORE);
    assert.equal(verdict(broken, 'before').ok, false);
    assert.deepEqual(failing(verdict(broken, 'before')), [name]);
    const brokenAfter = breakIn(AFTER);
    assert.equal(verdict(brokenAfter, 'after').ok, false);
    assert.deepEqual(failing(verdict(brokenAfter, 'after')), [name]);
  }
});
test('anon refused by privilege after A0 still reads as after - the column parsed', () => {
  const r = AFTER.map(x => x.name === 'select-a0' ? Object.assign({}, x, { status: 401, code: '42501', rows: null }) : x);
  assert.equal(verdict(r, 'after').ok, true);
});

/* F-11: the URL and key the probe sends are the page's own. Checked against
   index.html by containment, not by extracting them a second way: the page
   declares each exactly once, and exactly as const NAME="<what the probe
   sends>";. */
const declaredOnceAs = (name, value) => PAGE.split('const ' + name + '=').length === 2
  && PAGE.includes('const ' + name + '=' + JSON.stringify(value) + ';');
test('the probe sends exactly the URL and publishable key index.html declares, and no token', async () => {
  assert.ok(declaredOnceAs('SB_URL', SB_URL), 'index.html declares SB_URL once, as the URL the probe sends to');
  assert.ok(declaredOnceAs('SB_KEY', SB_KEY), 'index.html declares SB_KEY once, as the key the probe sends');
  assert.equal(declaredOnceAs('SB_KEY', SB_KEY + 'x'), false, 'the control: a key one character off is not the page\'s');
  const seen = [];
  const fake = async (url, o) => { seen.push({ url, o }); return new Response('[]', { status: 200 }); };
  await probe(fake);
  assert.deepEqual(seen.map(s => s.o.method + ' ' + s.url), PROBES.map(p => p.method + ' ' + SB_URL + p.path));
  for (const { o } of seen) {
    assert.equal(o.headers.apikey, SB_KEY);
    assert.deepEqual(Object.keys(o.headers).sort(), o.body === undefined ? ['apikey'] : ['Content-Type', 'apikey'],
      'the publishable key and a content type, and nothing else - no Authorization');
  }
});
test('the probe keeps no copy of the page\'s values: it reads a rotated key, and refuses a page it cannot trust', () => {
  assert.deepEqual(pageSupabase(PAGE), { SB_URL, SB_KEY });
  const rotated = 'sb_publishable_' + 'R'.repeat(32);
  assert.equal(pageSupabase(PAGE.split(JSON.stringify(SB_KEY)).join(JSON.stringify(rotated))).SB_KEY, rotated);
  assert.throws(() => pageSupabase(PAGE.split('const SB_KEY=').join('const SB_KEY_OLD=')), /SB_KEY/, 'no declaration');
  assert.throws(() => pageSupabase(PAGE + '\nconst SB_KEY=' + JSON.stringify(rotated) + ';\n'), /SB_KEY/, 'two declarations');
  assert.throws(() => pageSupabase(PAGE.split(JSON.stringify(SB_KEY)).join('"a-key-that-is-not-publishable"')), /publishable/);
  assert.throws(() => pageSupabase(PAGE.split(JSON.stringify(SB_URL)).join('"https://aaaaaaaaaaaaaaaaaaaa.supabase.co"')), /not the project/);
});

const CLOSED = [{ k: 'priv|traits|anon|INSERT', has: true },
  { k: 'pol|public.traits|traits_team', permissive: 'PERMISSIVE', cmd: 'ALL', roles: '{authenticated}' }];
const OPEN = CLOSED.concat([{ k: 'pol|public.traits|open', permissive: 'PERMISSIVE', cmd: 'INSERT', roles: '{anon}' }]);
test('the POSTs are refused when the capture shows anon may insert into traits - and allowed when it does not', () => {
  assert.equal(anonMayInsert(CLOSED), false, 'the control: a members-only policy lets no anonymous row in');
  assert.equal(anonMayInsert(OPEN), true);
  assert.equal(anonMayInsert(CLOSED.concat([{ k: 'pol|public.traits|all', permissive: 'PERMISSIVE', cmd: 'ALL', roles: '{public}' }])), true);
  assert.equal(anonMayInsert(CLOSED.concat([{ k: 'pol|public.traits|both', permissive: 'PERMISSIVE', cmd: 'INSERT', roles: '{anon,authenticated}' }])), true);
  assert.equal(anonMayInsert(CLOSED.concat([{ k: 'pol|public.traits|narrow', permissive: 'RESTRICTIVE', cmd: 'INSERT', roles: '{anon}' }])), false);
  assert.equal(anonMayInsert(OPEN.map(r => r.k === 'priv|traits|anon|INSERT' ? { k: r.k, has: false } : r)), false,
    'an open policy lets nothing in without the privilege');
  assert.throws(() => anonMayInsert(OPEN.filter(r => r.k !== 'priv|traits|anon|INSERT')), /cannot say/,
    'a capture without the privilege row cannot say no, so it refuses rather than allow');
});
test('today\'s capture holds the rows anonMayInsert reads, and they let the POSTs be sent', () => {
  const rows = loadLiveCatalog().rows;
  assert.equal(rows.filter(r => r.k === 'priv|traits|anon|INSERT').length, 1);
  assert.ok(rows.some(r => r.k.startsWith('pol|public.traits|')), 'the policies on traits are captured under the key anonMayInsert looks for');
  assert.equal(anonMayInsert(rows), false);
});

test('the CLI sends nothing for a stage it does not know, or when the capture shows anon may insert - and all four otherwise', async () => {
  const sent = [];
  const fake = async (url) => { sent.push(url); return new Response(JSON.stringify({ code: '42703' }), { status: 400 }); };
  const quiet = { log: () => {}, warn: () => {} };
  assert.equal(await main(['during'], { fetchImpl: fake, captureRows: () => CLOSED, ...quiet }), 2);
  assert.equal(await main([], { fetchImpl: fake, captureRows: () => CLOSED, ...quiet }), 2);
  assert.equal(await main(['before'], { fetchImpl: fake, captureRows: () => OPEN, ...quiet }), 2);
  assert.equal(await main(['before'], { fetchImpl: fake, captureRows: () => CLOSED.slice(1), ...quiet }), 2, 'a capture that cannot say');
  assert.equal(sent.length, 0, 'nothing was sent');
  /* The control: a known stage and a closed capture do send. Every answer
     here is 400 42703, so the inserts do not read as before: exit 1. */
  assert.equal(await main(['before'], { fetchImpl: fake, captureRows: () => CLOSED, ...quiet }), 1);
  assert.equal(sent.length, PROBES.length);
});
