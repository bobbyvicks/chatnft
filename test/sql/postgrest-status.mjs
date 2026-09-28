/* THE HTTP STATUS POSTGREST ANSWERS FOR EACH SQLSTATE the page can meet.

   `source` says where each number comes from: 'documented' is PostgREST's
   own error table (docs.postgrest.org, Errors); 'measured <date> <how>' is an
   answer from the live project. tools/a0-rest-probe.mjs measures 42703 and
   PGRST204, and the code insert-a0 gets; Task 7 of plan 1 writes them here.
   A spec must not rest a claim about the live site on a 'documented' entry
   (design E4: "pinned to PostgREST's measured statuses"). */
export const POSTGREST_STATUS = Object.freeze({
  '23505': { status: 409, source: 'documented' },
  '23503': { status: 409, source: 'documented' },
  '23502': { status: 400, source: 'documented' },
  '23514': { status: 400, source: 'documented' },
  '22P02': { status: 400, source: 'measured 2026-09-28 tools/a0-rest-probe.mjs' },
  '42703': { status: 400, source: 'measured 2026-09-28 tools/a0-rest-probe.mjs' },
  '42P01': { status: 404, source: 'documented' },
  '42883': { status: 404, source: 'documented' },
  'P0001': { status: 400, source: 'documented' },
  '42501': { status: { authenticated: 403, anon: 401 }, source: 'documented' },
  'PGRST204': { status: 400, source: 'measured 2026-09-28 tools/a0-rest-probe.mjs' },
});
