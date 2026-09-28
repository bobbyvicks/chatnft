/* The PostgREST stand-in (test/sql/postgrest.mjs) behind page.route, for
   specs whose requests should reach real SQL in PGlite. Not a spec: it has no
   .spec. in its name, so Playwright never collects it.

   A spec using this must NOT replace window.fetch: an in-page fake answers
   before page.route ever sees the request. Each spec asserts, after each
   test, that `unrouted` and `unmapped` are empty.

   CHANGED from the plan text (fix round 1, finding 4): the route is on the
   page's CONTEXT, not the page, so a second page or a popup reaches the
   stand-in too. One handler sees every request: the Supabase host goes to
   the stand-in; the spec server's own origin falls back to whatever else
   would handle it (the network, for the spec server); anything else is
   aborted and recorded in `unrouted`. data: and blob: URLs never reach a
   route (measured in Chromium), so they need no case here.

   The spec server's origin is the project's baseURL, read from
   test.info().project.use when routeSupabase runs - not page.url(), which is
   about:blank until the spec navigates, and a spec sets its routes before
   that. Measured: test.info() gives the config's top-level baseURL, and the
   dynamic import is the module the spec imported. A caller outside the
   Playwright runner passes opts.origin instead. */
import { makePostgrest } from '../../test/sql/postgrest.mjs';

const SB = 'https://dpracoavrcqyenfieksi.supabase.co';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range' };

export async function routeSupabase(page, db, opts = {}) {
  const pg = makePostgrest(db, opts);
  const base = opts.origin || (await import('@playwright/test')).test.info().project.use.baseURL;
  if (!base) throw new Error('routeSupabase: no baseURL in the project and no opts.origin, so the spec server cannot be told from any other host');
  const own = new URL(base).origin;
  await page.context().route('**', async (route) => {
    const req = route.request(), url = req.url();
    let origin = null;
    try { origin = new URL(url).origin; } catch (_) { /* recorded below */ }
    if (origin === SB) {
      if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS, body: '' }); return; }
      const res = await pg.handle({ method: req.method(), url, headers: req.headers(), body: req.postDataBuffer() });
      await route.fulfill({ status: res.status, headers: Object.assign({}, CORS, res.headers), body: res.body });
      return;
    }
    if (origin === own) { await route.fallback(); return; }
    pg.unrouted.push(req.method() + ' ' + url + ' - neither the Supabase host nor the spec server: aborted');
    await route.abort();
  });
  return pg;
}
