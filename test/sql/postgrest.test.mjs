import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, seedTeam } from './harness.mjs';
import { makePostgrest } from './postgrest.mjs';
import { POSTGREST_STATUS } from './postgrest-status.mjs';

const U1 = '00000000-0000-4000-8000-000000000001';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const SB = 'https://dpracoavrcqyenfieksi.supabase.co';
const as = (tok) => tok ? { authorization: 'Bearer ' + tok, apikey: 'k' } : { apikey: 'k' };
const body = (x) => Buffer.from(JSON.stringify(x));

let db, pg;
test.before(async () => {
  db = await makeDb({ through: 'a0' });
  await seedTeam(db, { uid: U1, team: T1, collection: C1 });
  pg = makePostgrest(db, { users: { 'tok-1': U1 } });
});
test.after(async () => { await db.close(); });

const row = (o = {}) => Object.assign({ collection_id: C1, team_id: T1, owner: U1, kind: 'trait', name: 'cap', layer: 'hats',
  status: 'wip', rarity: 1, shelf_order: null, w: 16, h: 16, path: T1 + '/' + C1 + '/trait-cap-hats-wip.png' }, o);

test('every status entry says where its number comes from', () => {
  for (const [code, e] of Object.entries(POSTGREST_STATUS)) assert.ok(/^(documented|measured \d{4}-\d{2}-\d{2} .+)$/.test(e.source), code);
});

test('a select of a column that does not exist is 400 42703; the same select of real columns is 200', async () => {
  const bad = await pg.handle({ method: 'GET', url: SB + '/rest/v1/collections?select=id,protocol_x', headers: as('tok-1'), body: null });
  assert.equal(bad.status, 400); assert.equal(JSON.parse(bad.body).code, '42703');
  const good = await pg.handle({ method: 'GET', url: SB + '/rest/v1/collections?select=id,protocol,switching_at&team_id=eq.' + T1 + '&order=created_at.asc,id.asc&limit=1', headers: as('tok-1'), body: null });
  assert.equal(good.status, 200); assert.deepEqual(JSON.parse(good.body), [{ id: C1, protocol: 1, switching_at: null }]);
});

test('a POST naming a column the schema cache does not know is 400 PGRST204, and no row is made', async () => {
  const r = await pg.handle({ method: 'POST', url: SB + '/rest/v1/traits', headers: Object.assign({ prefer: 'return=representation' }, as('tok-1')), body: body([row({ replaces_x: null })]) });
  assert.equal(r.status, 400); assert.equal(JSON.parse(r.body).code, 'PGRST204');
  assert.equal((await db.query('select count(*)::int as n from public.traits')).rows[0].n, 0);
});

test('a member inserts and gets the row back (201); anon is refused 42501 as 401', async () => {
  const r = await pg.handle({ method: 'POST', url: SB + '/rest/v1/traits', headers: Object.assign({ prefer: 'return=representation' }, as('tok-1')), body: body([row()]) });
  assert.equal(r.status, 201);
  const made = JSON.parse(r.body)[0];
  assert.equal(made.name, 'cap'); assert.equal(made.replaces, null); assert.match(made.updated_at, /T.*[+-]\d\d:\d\d$/);
  const a = await pg.handle({ method: 'POST', url: SB + '/rest/v1/traits', headers: as(null), body: body([row({ name: 'hat' })]) });
  assert.equal(a.status, 401); assert.equal(JSON.parse(a.body).code, '42501');
});

test('the unique index answers 409', async () => {
  const r = await pg.handle({ method: 'POST', url: SB + '/rest/v1/traits', headers: as('tok-1'), body: body([row()]) });
  assert.equal(r.status, 409); assert.equal(JSON.parse(r.body).code, '23505');
});

test('a PATCH by id and a DELETE with return=representation answer with the rows', async () => {
  const id = (await db.query("select id from public.traits where name = 'cap'")).rows[0].id;
  const p = await pg.handle({ method: 'PATCH', url: SB + '/rest/v1/traits?id=eq.' + id, headers: Object.assign({ prefer: 'return=representation' }, as('tok-1')), body: body({ rarity: 7 }) });
  assert.equal(p.status, 200); assert.equal(JSON.parse(p.body)[0].rarity, 7);
  const d = await pg.handle({ method: 'DELETE', url: SB + '/rest/v1/traits?id=eq.' + id, headers: Object.assign({ prefer: 'return=representation' }, as('tok-1')), body: null });
  assert.equal(d.status, 200); assert.equal(JSON.parse(d.body)[0].id, id);
  const none = await pg.handle({ method: 'DELETE', url: SB + '/rest/v1/traits?id=eq.' + id, headers: as('tok-1'), body: null });
  assert.equal(none.status, 204);
});

test('an rpc answers the function\'s value, as the caller', async () => {
  const r = await pg.handle({ method: 'POST', url: SB + '/rest/v1/rpc/my_team', headers: as('tok-1'), body: body({}) });
  assert.equal(r.status, 200);
  assert.match(JSON.parse(r.body), /^[0-9a-f-]{36}$/);
});

test('auth answers the user for a known token and 401 otherwise; storage keeps an upload', async () => {
  assert.deepEqual(JSON.parse((await pg.handle({ method: 'GET', url: SB + '/auth/v1/user', headers: as('tok-1'), body: null })).body), { id: U1 });
  assert.equal((await pg.handle({ method: 'GET', url: SB + '/auth/v1/user', headers: as('nope'), body: null })).status, 401);
  const up = await pg.handle({ method: 'POST', url: SB + '/storage/v1/object/traits/a/b.png', headers: as('tok-1'), body: Buffer.from([1, 2, 3]) });
  assert.equal(up.status, 200); assert.equal(pg.storage.get('a/b.png').length, 3);
});

test('anything else is recorded as unrouted and answered 501', async () => {
  const before = pg.unrouted.length;
  const r = await pg.handle({ method: 'GET', url: SB + '/functions/v1/whatever', headers: as('tok-1'), body: null });
  assert.equal(r.status, 501); assert.equal(pg.unrouted.length, before + 1);
});

test('a SQL error with no status entry is recorded as unmapped, never guessed', async () => {
  const bare = makePostgrest(db, { users: { 'tok-1': U1 }, statuses: {} });
  const r = await bare.handle({ method: 'GET', url: SB + '/rest/v1/collections?select=id,nope', headers: as('tok-1'), body: null });
  assert.equal(r.status, 500); assert.deepEqual(bare.unmapped, ['42703']);
});

/* ADDED to the plan's tests (Task 6): the module's scope says everything
   outside it is unrouted, and the plan's code answered some of it as though
   it had understood - count=exact with no Content-Range (the page's Clear
   cloud sends that), a DELETE's limit dropped so every matching row went,
   nullsfirst dropped from an order. Each refusal is paired with a request
   one field away that must still be answered, so a stand-in that refused
   everything could not pass. */
test('a request whose meaning the stand-in does not implement is unrouted (501); one field away it is answered', async () => {
  const made = await pg.handle({ method: 'POST', url: SB + '/rest/v1/traits', headers: Object.assign({ prefer: 'return=representation' }, as('tok-1')), body: body([row({ name: 'probe' })]) });
  assert.equal(made.status, 201);
  const id = JSON.parse(made.body)[0].id, nobody = '00000000-0000-4000-8000-0000000000ff';
  const get = (qs, h) => ({ method: 'GET', url: SB + '/rest/v1/traits?select=id&collection_id=eq.' + C1 + qs, headers: Object.assign({}, h, as('tok-1')), body: null });
  const post = (qs, h) => ({ method: 'POST', url: SB + '/rest/v1/traits' + qs, headers: Object.assign({}, h, as('tok-1')), body: body([row({ name: 'probe' })]) });
  const patch = (qs) => ({ method: 'PATCH', url: SB + '/rest/v1/traits?id=eq.' + id + qs, headers: as('tok-1'), body: body({ rarity: 1 }) });
  const del = (qs) => ({ method: 'DELETE', url: SB + '/rest/v1/traits?id=eq.' + nobody + qs, headers: Object.assign({ prefer: 'return=representation' }, as('tok-1')), body: null });
  const rpc = (qs) => ({ method: 'POST', url: SB + '/rest/v1/rpc/my_team' + qs, headers: as('tok-1'), body: body({}) });
  const pairs = [
    ['count=exact', get('', { prefer: 'count=exact' }), get('', {})],
    ['a Range header', get('', { range: '0-0' }), get('', {})],
    ['a single-object Accept', get('', { accept: 'application/vnd.pgrst.object+json' }), get('', { accept: 'application/json' })],
    ['nullsfirst in an order', get('&order=name.asc.nullsfirst', {}), get('&order=name.asc', {})],
    ['a quoted in.() item', get('&name=in.("probe")', {}), get('&name=in.(probe)', {})],
    ['an upsert Prefer', post('', { prefer: 'resolution=merge-duplicates' }), post('', { prefer: 'return=minimal' })],
    ['on_conflict on a POST', post('?on_conflict=id', {}), post('', {})],
    ['limit on a PATCH', patch('&limit=1'), patch('')],
    ['select on a DELETE', del('&select=id'), del('')],
    ['limit on a DELETE', del('&limit=1'), del('')],
    ['a query string on an rpc', rpc('?x=1'), rpc('')],
  ];
  for (const [what, refused, answered] of pairs) {
    const before = pg.unrouted.length;
    const r = await pg.handle(refused);
    assert.equal(r.status, 501, what + ': ' + r.status + ' ' + r.body);
    assert.equal(pg.unrouted.length, before + 1, what + ' is recorded');
    const c = await pg.handle(answered);
    assert.notEqual(c.status, 501, what + ' control: ' + c.body);
    assert.equal(pg.unrouted.length, before + 1, what + ' control is not recorded');
  }
  assert.equal((await db.query("select count(*)::int as n from public.traits where name = 'probe'")).rows[0].n, 1);
  await pg.handle({ method: 'DELETE', url: SB + '/rest/v1/traits?id=eq.' + id, headers: as('tok-1'), body: null });
});

test('the errors the stand-in makes itself take their status from the table too, and are unmapped without an entry', async () => {
  const table = { method: 'GET', url: SB + '/rest/v1/no_such_table?select=id', headers: as('tok-1'), body: null };
  const key = { method: 'POST', url: SB + '/rest/v1/traits', headers: as('tok-1'), body: body([row({ replaces_x: null })]) };
  const fn = { method: 'POST', url: SB + '/rest/v1/rpc/no_such_fn', headers: as('tok-1'), body: body({}) };
  const r = await pg.handle(table);
  assert.equal(r.status, 404); assert.equal(JSON.parse(r.body).code, '42P01');
  const before = pg.unmapped.length;
  const f = await pg.handle(fn);
  assert.equal(f.status, 500, 'PGRST202 has no entry, so it is not answered 404 by a guess');
  assert.deepEqual(pg.unmapped.slice(before), ['PGRST202']);
  const bare = makePostgrest(db, { users: { 'tok-1': U1 }, statuses: {} });
  for (const req of [table, key]) assert.equal((await bare.handle(req)).status, 500);
  assert.deepEqual(bare.unmapped, ['42P01', 'PGRST204']);
});

test('an error thrown outside SQL is answered 500 and recorded as unmapped, never a rejected promise', async () => {
  const bare = makePostgrest(db, { users: { 'tok-1': U1 } });
  const r = await bare.handle({ method: 'DELETE', url: SB + '/storage/v1/object/traits', headers: as('tok-1'), body: '{not json' });
  assert.equal(r.status, 500); assert.equal(bare.unmapped.length, 1); assert.deepEqual(bare.unrouted, []);
});
