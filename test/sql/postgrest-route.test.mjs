/* tests/pg/route.js in a real Chromium, from node --test (fix round 1,
   finding 4). Nothing here can reach a network: every hostname resolves to
   NOTFOUND, and a backstop route aborts whatever the adapter lets past.
   The spec server is a route too - http://spec.test answered in-process - so
   no port is opened. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { makeDb, seedTeam } from './harness.mjs';
import { routeSupabase } from '../../tests/pg/route.js';

const U1 = '00000000-0000-4000-8000-000000000001';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const SB = 'https://dpracoavrcqyenfieksi.supabase.co';
const SPEC = 'http://spec.test';

let db, browser;
test.before(async () => {
  db = await makeDb({ through: 'a0' });
  await seedTeam(db, { uid: U1, team: T1, collection: C1 });
  browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
});
test.after(async () => { await browser.close(); await db.close(); });

test('a second page in the context reaches the stand-in; a request to another host is aborted and recorded', async () => {
  const ctx = await browser.newContext();
  /* Registered first, so they run last: a backstop that records and aborts
     anything the adapter lets past, and the spec server's stand-in, which the
     adapter's fallback for its own origin must reach. */
  const escaped = [];
  await ctx.route('**', r => { escaped.push(r.request().method() + ' ' + r.request().url()); return r.abort(); });
  await ctx.route(SPEC + '/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>spec server</p>' }));
  const first = await ctx.newPage();
  const pg = await routeSupabase(first, db, { users: { 'tok-1': U1 }, origin: SPEC });
  const second = await ctx.newPage();
  await second.goto(SPEC + '/index.html');
  const got = await second.evaluate(async ({ SB, T1 }) => {
    try {
      const r = await fetch(SB + '/rest/v1/collections?select=id&team_id=eq.' + T1, { headers: { apikey: 'k', Authorization: 'Bearer tok-1' } });
      return [r.status, await r.json()];
    } catch (e) { return ['failed', String(e)]; }
  }, { SB, T1 });
  assert.deepEqual(got, [200, [{ id: C1 }]], 'the second page is answered by the stand-in');
  const away = await second.evaluate(async () => { try { await fetch('https://elsewhere.test/x'); return 'answered'; } catch (_) { return 'failed'; } });
  assert.equal(away, 'failed', 'another host is not answered');
  assert.equal(pg.unrouted.length, 1, 'and it is recorded: ' + JSON.stringify(pg.unrouted));
  assert.match(pg.unrouted[0], /^GET https:\/\/elsewhere\.test\/x /);
  assert.deepEqual(escaped, [], 'the adapter decided every request itself');
  assert.deepEqual(pg.unmapped, []);
  await ctx.close();
});
