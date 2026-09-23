/* A SIGN-IN THAT EXPIRES MID-RUN IS RENEWED, NOT FATAL.

   Found 2026-09-22 by the discovery pass, ranked fifteenth of 39, measured
   by a finder and a verifier. cloudPush built its request headers once, at
   the start, and handed the same Authorization to every upload, row write
   and the closing layers PATCH; cloudPull did the same for every download.
   sbToken renews a token only when asked within a minute of its expiry, so
   a run that outlived the token carried the dead one to the end: 401s, not
   retried. Measured on the real clock with the token 70 s from expiry:
   Save to cloud 216 saved and 95 failed, with 6 pictures uploaded whose
   rows then failed; Load from cloud 216 loaded and 95 "could not be read".
   bulkImport refuses to cache headers for exactly this reason and says so;
   the push and pull were the siblings that did not.

   Headers are read per request now - sbHeaders costs nothing until the
   token is within a minute of expiry, and renews it then. And the renewal
   is single-flight: with six uploads and eight downloads in parallel, every
   one of them reaching expiry together would each have sent the same
   refresh token, and a refresh token is meant to be used once. One renews;
   the rest wait for it.

   Not covered: a server clock that disagrees with this one by more than
   the minute of slack. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. one renewal at a time ------------------------------------------ */
{
  const fn = kit.inFunction(L, 'async function sbToken(){');
  const i = at('  if(!s.refresh_token){ sbSaveSession(null); return null; }', 'the refresh start', fn);
  const t = at('  try{', 'the refresh try', { start: i, end: fn.end });
  const end = fn.end;
  if (L[end] !== '}') throw new Error('sbToken end moved');
  const body = L.slice(t, end);   /* the try ... catch lines */
  kit.replace(L, { start: t, end: end - 1 }, [
    '  /* ONE RENEWAL AT A TIME. Every request reads its headers now (a run that',
    '     outlived its token used to carry the dead one to the end), so six',
    '     uploads reaching expiry together would each send the same refresh',
    '     token. One renews; the rest wait for its answer. */',
    '  if(sbRenewing) return sbRenewing;',
    '  sbRenewing=(async()=>{',
    ...body.map(l => '  ' + l),
    '  })();',
    '  try{ return await sbRenewing; } finally{ sbRenewing=null; }',
  ]);
  const f2 = kit.inFunction(L, 'async function sbToken(){');
  kit.replace(L, { start: f2.start, end: f2.start }, ['let sbRenewing=null;', 'async function sbToken(){']);
}

/* ---- 2. the push reads its headers per request ----------------------------- */
{
  const fnR = () => kit.inFunction(L, 'async function cloudPush(){');
  swap('  const h=await sbHeaders({"Content-Type":"application/json"});', ['  let h=await sbHeaders({"Content-Type":"application/json"});'], 'the push headers', fnR());
  const i = at('  const ctx={u:u, team:team, c:c, h:h,', 'the ctx', fnR());
  if (L[i + 1] !== '    hb:await sbHeaders({"Content-Type":"image/png","x-upsert":"true"})};') throw new Error('the ctx second line moved');
  kit.replace(L, { start: i, end: i + 1 }, [
    '  /* NO HEADERS IN HERE. They were built once and shared, so a run that',
    '     outlived the token sent the dead one to the end (measured, 95 of 311',
    '     failed). cloudSyncOne and cloudPatchOne read their own per request,',
    '     which renews the token when it is due. */',
    '  const ctx={u:u, team:team, c:c};',
  ]);
  swap('      const got=await cloudRows(c,h,"id,path");', [
    '      h=(await sbHeaders({"Content-Type":"application/json"}))||h;',
    '      const got=await cloudRows(c,h,"id,path");',
  ], 'the stale read', fnR());
  swap('    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,', [
    '    h=(await sbHeaders({"Content-Type":"application/json"}))||h;',
    '    await fetch(SB_URL+"/rest/v1/collections?id=eq."+c.id,{method:"PATCH",headers:h,',
  ], 'the layers patch', fnR());
}

/* ---- 3. the pull reads its headers per download ---------------------------- */
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  swap('        const blob=await pullBlob(w.row.path,h);', [
    '        /* Per download: a pull of 311 can outlive its token. */',
    '        const blob=await pullBlob(w.row.path,(await sbHeaders())||h);',
  ], 'the download', fn);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('let sbRenewing=null;');
  once('if(sbRenewing) return sbRenewing;');
  once('const ctx={u:u, team:team, c:c};');
  once('pullBlob(w.row.path,(await sbHeaders())||h)');
  const p = code.indexOf('async function cloudPush(){'), pe = code.indexOf('\n}', p);
  if (code.slice(p, pe).indexOf('hb:await sbHeaders') >= 0) throw new Error('the push still shares one upload header');
  /* sbToken still returns the stored token without a request when it is not due. */
  const s = code.indexOf('async function sbToken(){'), se = code.indexOf('\n}', s);
  const sb = code.slice(s, se);
  if (sb.indexOf('return s.access_token;') < 0 || sb.indexOf('return s.access_token;') > sb.indexOf('if(sbRenewing)')) throw new Error('the fast path moved behind the renewal');
});

fs.renameSync(TMP, FILE);
console.log('patch543 written, ' + grew + ' bytes');
