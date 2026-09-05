/* When Save to cloud is allowed to delete pictures out of the bucket.

   cloudsweep.spec.js covers what cloudSweep does with the keep-list it is
   handed. This covers who is allowed to hand it one, which is a different
   question and was the unguarded half.

   The end of cloudPush does two deletes, one line apart. The first, removing
   rows the server has and this device does not, is guarded twice with the
   reason for each written beside it:

     if(!activeWs && !failed){ ... }

       !activeWs  "a row that is not here may be somebody else's work"
       !failed    "deleting rows off a partial picture is how the destructive
                   version got it wrong in the first place"

   The second had neither. cloudSweep removes every file under the collection's
   prefix that is not in the list it is given, and that list is built from THIS
   browser's items - so an upload that failed contributes nothing to it, and
   neither does a trait belonging to anybody else in the group.

   MEASURED, with a bucket holding two of my files and one of a teammate's:

     in a group, nothing failing
       deleted   ws1/c1/trait-theirs-skins-approved.png
       said      "Saved 2 to the cloud, removed 1 old image"

     personal page, one upload failing
       deleted   ws1/c1/trait-mine1-skins-approved.png
                 ws1/c1/trait-theirs-skins-approved.png
       said      "Saved 1 to the cloud, 1 failed, removed 2 old images"

   In the group case the teammate's ROW survived, because the delete above
   refused - so the group kept a row pointing at a file that was gone, for
   everybody. In the second, the file destroyed was the previous good copy of
   the trait that had just failed to upload: the one moment the old copy is the
   only copy there is.

   THE CONTROL IS THE POINT OF THE FILE. Refusing to sweep is trivially safe
   and would turn a working feature into a disabled one that reads as caution.
   A clean push on a personal page must still remove a genuine orphan, and must
   still leave alone the files it has just put there.
*/
import { test, expect } from '@playwright/test';

/* Two of my traits, a bucket, and a stubbed server. `failUploadOf` drops the
   upload of whichever trait's name it names, the way a connection does. */
const withServer = (page, opts) => page.evaluate(async (o) => {
  const { group, failUploadOf, orphan } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = group ? 'ws1' : null;
  LAYERS = ['skins', 'unsorted'];
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  for (const n of ['mine1', 'mine2']) {
    await dbPut({ id: 't_' + n + '_skins_approved', kind: 'trait', name: n, layer: 'skins',
      status: 'approved', blob: new Blob([new Uint8Array(16)]), w: 160, h: 160,
      rarity: 1, at: 1 });
  }
  /* The bucket. Both of mine from a previous push, plus one belonging to
     somebody else in the group that this browser has never pulled. */
  const bucket = ['trait-mine1-skins-approved.png', 'trait-mine2-skins-approved.png',
    'trait-theirs-skins-approved.png'];
  /* A file no row and no local record points at - what the sweep exists for. */
  if (orphan) bucket.push('trait-deletedlongago-skins-approved.png');

  const state = { deleted: [], uploads: 0 };
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'GET')
      return json([{ id: 'c1', layers: ['skins'], updated_at: 'now' }]);
    if (s.indexOf('/rest/v1/collections') >= 0) return json({});
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) {
      // limit and offset honoured, or the sweep pages forever.
      const b = JSON.parse(io.body);
      return json(bucket.slice(b.offset, b.offset + b.limit).map(n => ({ name: n })));
    }
    if (s.indexOf('/storage/v1/object/traits') >= 0 && m === 'DELETE') {
      state.deleted.push(...JSON.parse(io.body).prefixes);
      return json([]);
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      state.uploads++;
      if (failUploadOf && s.indexOf(failUploadOf) >= 0) return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'row_x' }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
    return real(u, io);
  };
  window.__srv = { state, real };
  return true;
}, opts);

const push = (page) => page.evaluate(async () => {
  await cloudPush();
  return {
    deleted: window.__srv.state.deleted.slice(),
    uploads: window.__srv.state.uploads,
    said: document.getElementById('toast').textContent,
  };
});

const restore = (page) => page.evaluate(() => { window.fetch = window.__srv.real; });

test.describe('what a push is allowed to delete from the bucket', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function');
  });

  test('a push inside a group does not delete a file it has never seen', async ({ page }) => {
    await withServer(page, { group: true });
    const r = await push(page);
    await restore(page);
    expect(r.uploads, 'the push really ran').toBeGreaterThan(0);
    expect(r.deleted, "the teammate's artwork is untouched").toEqual([]);
    expect(r.said, 'and it does not claim to have tidied anything')
      .not.toContain('old image');
  });

  test('a push where an upload failed does not delete that picture', async ({ page }) => {
    /* The sharpest case: mine1's upload fails, so its path is not in the
       keep-list, so its previous good copy on the server reads as unwanted -
       at the one moment that copy is the only one there is. */
    await withServer(page, { group: false, failUploadOf: 'mine1' });
    const r = await push(page);
    await restore(page);
    expect(r.said, 'the failure really happened').toContain('1 failed');
    expect(r.deleted, 'and nothing was removed on that partial picture').toEqual([]);
  });

  test('a clean push on your own page still removes a real orphan', async ({ page }) => {
    /* THE CONTROL, and the reason the guard is two conditions rather than
       "never sweep". A feature turned off reads as caution and is not. */
    await withServer(page, { group: false, orphan: true });
    const r = await push(page);
    await restore(page);
    expect(r.deleted, 'the file nothing points at is gone')
      .toContain('ws1/c1/trait-deletedlongago-skins-approved.png');
    expect(r.said, 'and it says so').toContain('old image');
  });

  test('and never the files it has just uploaded', async ({ page }) => {
    // The counterweight: a sweep that removed everything would satisfy the
    // test above and empty the collection.
    await withServer(page, { group: false, orphan: true });
    const r = await push(page);
    await restore(page);
    expect(r.deleted, 'mine1 stays').not.toContain('ws1/c1/trait-mine1-skins-approved.png');
    expect(r.deleted, 'and so does mine2').not.toContain('ws1/c1/trait-mine2-skins-approved.png');
  });
});
