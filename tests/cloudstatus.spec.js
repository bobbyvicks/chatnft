/* The account panel's "they match" was a subtraction, not a comparison.

   It printed how many files are here, how many are on the server, and then
   told you which button to press - all decided by comparing two counts:

     same = localN===remoteN
     same ? "They match."
          : localN>remoteN ? "upload the "+(localN-remoteN)+" that are only here"
                           : "fetch the "+(remoteN-localN)+" that are only there"

   Two counts being equal does not make two sets equal, and their difference is
   not the size of either one-sided difference. Measured before the fix:

     ten here, ten there, three of them different traits
       -> "10 files here, 10 on the server. They match."

     twelve here, ten there, five of the local ones genuinely new and three on
     the server that are not here at all
       -> "Save to cloud to upload the 2 that are only here."
          The real number is five, and the three a Load would bring down are
          never mentioned.

   The first is confidently wrong. The second names a quantity nothing measured
   and recommends an action from it.

   Paths are the identity used everywhere else in the file - cloudPath is what
   the push writes, what the sweep keeps and what the stale check diffs on - so
   the comparison is done on those.

   THE CONTROLS ARE THE POINT. A fix that simply stopped saying "they match"
   would pass a test that only checks the wrong cases, so the genuinely
   identical set and both one-sided cases are pinned too.
*/
import { test, expect } from '@playwright/test';

/* Seeds `localNames` on the device and `serverNames` on a fake server, then
   renders the status line and returns it. */
const statusFor = (page, localNames, serverNames) => page.evaluate(async ([local, remote]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null;
  cloudTeamId = null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await dbClear();
  for (const n of local) await dbPut({ id: 't_' + n, kind: 'trait', name: n, layer: 'skins',
    status: 'approved', blob: new Blob([new Uint8Array(8)]), w: 160, h: 160, rarity: 1, at: 1 });

  // Server rows built through cloudPath, the same way the push writes them, so
  // the two sides are keyed identically and the comparison is real.
  const c = { id: 'c1' };
  const rows = remote.map((n, i) => ({ id: 'r' + i,
    path: cloudPath('team1', c, { kind: 'trait', name: n, layer: 'skins', status: 'approved' }) }));

  const real = window.fetch;
  const json = (o, x) => new Response(JSON.stringify(o),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  window.fetch = async (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team1');
    if (s.indexOf('/rest/v1/collections') >= 0)
      return json([{ id: 'c1', layers: ['skins'], updated_at: new Date().toISOString() }]);
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      return json(rows.slice(off, off + lim));
    }
    return real(u);
  };
  try { await cloudStatus({ id: 'u1' }); } finally { window.fetch = real; }
  return document.getElementById('cloudnote').textContent;
}, [localNames, serverNames]);

const TEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

test.describe('what the account panel says about the two copies', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudStatus === 'function');
  });

  test('equal counts with different contents are not a match', async ({ page }) => {
    // The measured case. Ten each, three of them different, and it said
    // "They match." - which is the one sentence that stops somebody looking.
    const note = await statusFor(page, TEN, ['a','b','c','d','e','f','g','x','y','z']);
    expect(note, 'it does not claim a match').not.toContain('They match');
    expect(note, 'three of ours are not there').toContain('3 only here');
    expect(note, 'and three of theirs are not here').toContain('3 only there');
  });

  test('and the difference is not the difference of the counts', async ({ page }) => {
    // Twelve here and ten there, but five local ones are new and three server
    // ones are absent here. The subtraction printed 2.
    const note = await statusFor(page,
      ['a','b','c','d','e','f','g','h','i','j','k','l'],
      ['a','b','c','d','e','f','g','m','n','o']);
    expect(note, 'the real number of local-only files').toContain('5 only here');
    expect(note, 'and of server-only ones').toContain('3 only there');
    expect(note, 'the subtraction of the counts is not named').not.toContain('the 2 that');
  });

  test('a genuinely identical pair still says they match', async ({ page }) => {
    // THE CONTROL. Deleting the match case entirely would pass both tests above
    // and leave the panel unable to tell anyone they are safe.
    const note = await statusFor(page, ['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(note).toContain('They match');
  });

  test('files only here still point at Save to cloud', async ({ page }) => {
    const note = await statusFor(page, ['a', 'b', 'c'], ['a']);
    expect(note).toContain('Save to cloud');
    expect(note).toContain('2 that are only here');
    expect(note, 'and nothing is claimed to be only there').not.toContain('only there');
  });

  test('files only there still point at Load from cloud', async ({ page }) => {
    const note = await statusFor(page, ['a'], ['a', 'b', 'c']);
    expect(note).toContain('Load from cloud');
    expect(note).toContain('2 that are only there');
  });

  test('the counts themselves are still printed, and read properly', async ({ page }) => {
    const note = await statusFor(page, ['a'], ['a']);
    expect(note, 'one file, not "1 files"').toContain('1 file here');
    expect(note).not.toContain('1 files');
  });

  test('when the server cannot be read it claims no difference at all', async ({ page }) => {
    // Guessing is the whole defect. A failed read must not claim a match.
    //
    // WHAT THIS ACTUALLY PINS, established by a mutant that survived: it is the
    // pre-existing early return at "if(remoteN===null)", not the cannot-tell
    // branch added with this change. Setting that branch to say "They match."
    // breaks nothing, because a failed read never reaches it - remoteN stays
    // null and the function has already returned.
    //
    // That branch is therefore reachable only when the rows were read but the
    // paging ran out, which needs half a million rows. It stays because the
    // sentence must not guess if that ever happens, but no test covers it and
    // mutate-status.cjs records it as an expected survivor rather than
    // pretending otherwise.
    const note = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      activeWs = null; cloudTeamId = null;
      localStorage.setItem('chatnft.session', JSON.stringify({
        access_token: 'not-a-real-token', refresh_token: 'r',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
      await dbClear();
      await dbPut({ id: 't_a', kind: 'trait', name: 'a', layer: 'skins', status: 'approved',
        blob: new Blob([new Uint8Array(8)]), w: 160, h: 160, rarity: 1, at: 1 });
      const real = window.fetch;
      window.fetch = async (u) => {
        const s = String(u);
        const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
        if (s.indexOf('/rpc/my_team') >= 0) return json('team1');
        if (s.indexOf('/rest/v1/collections') >= 0)
          return json([{ id: 'c1', layers: ['skins'], updated_at: new Date().toISOString() }]);
        if (s.indexOf('/rest/v1/traits') >= 0) return new Response('nope', { status: 500 });
        return real(u);
      };
      try { await cloudStatus({ id: 'u1' }); } finally { window.fetch = real; }
      return document.getElementById('cloudnote').textContent;
    });
    expect(note, 'no claim about which files differ').not.toContain('only here');
    expect(note).not.toContain('only there');
    expect(note).not.toContain('They match');
  });
});
