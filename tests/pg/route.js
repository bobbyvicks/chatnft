/* The PostgREST stand-in (test/sql/postgrest.mjs) behind page.route, for
   specs whose requests should reach real SQL in PGlite. Not a spec: it has no
   .spec. in its name, so Playwright never collects it.

   A spec using this must NOT replace window.fetch: an in-page fake answers
   before page.route ever sees the request. Each spec asserts, after each
   test, that `unrouted` and `unmapped` are empty. */
import { makePostgrest } from '../../test/sql/postgrest.mjs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range' };

export async function routeSupabase(page, db, opts) {
  const pg = makePostgrest(db, opts);
  await page.route('https://dpracoavrcqyenfieksi.supabase.co/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS, body: '' }); return; }
    const res = await pg.handle({ method: req.method(), url: req.url(), headers: req.headers(), body: req.postDataBuffer() });
    await route.fulfill({ status: res.status, headers: Object.assign({}, CORS, res.headers), body: res.body });
  });
  return pg;
}
