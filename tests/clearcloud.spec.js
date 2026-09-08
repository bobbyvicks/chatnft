/* Clearing the server copy of a project, from a button.

   "i want to clear the cloud, also make a button to do that so we dont have to
   keep doing it" - and the second half is what forced the first, because the
   clear CANNOT be done anywhere else. Measured against the live project:

     ERROR: 42501: Direct deletion from storage tables is not allowed.
            Use the Storage API instead.

   A trigger refuses it. So every clear done by hand against the database
   removed the rows and left the pictures: the bucket holds 2,178 files where
   the rows account for 302 - 1.14 GB belonging to nothing. This runs as the
   signed-in person, through the Storage API, which is the only thing that can.

   THE ORDER TEST IS THE ONE THAT MATTERS. The rows are what name the files.
   Delete them first and the pictures are unreachable for ever, which is
   exactly how the bucket reached its current state - so "pictures before rows"
   is not a preference, it is the whole reason this is worth writing.

   AND THE FLAGS. Local records carry synced/rowId/path, and cloudPush skips
   anything already synced. A clear that left those behind would make Save to
   cloud report success and upload nothing - the collection would be gone from
   the server with no way to notice.
*/
import { test, expect } from '@playwright/test';

/* Signed in, in a group, with every server call stubbed and ORDERED, so the
   sequence can be asserted rather than the individual calls. */
const ready = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = 'team1';
  await dbClear();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  for (const n of ['cap', 'visor']) {
    await dbPut({ id: 't_' + n + '_hats_approved', kind: 'trait', name: n,
      layer: 'hats', status: 'approved', blob, w: 8, h: 8, at: 1,
      synced: true, rowId: 'row-' + n, path: 'team1/c1/hats/' + n + '.png' });
  }
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  await renderShelf();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-me' } }));

  window.__seq = [];          /* every call, in order */
  window.__asked = [];
  window.__rows = o.rows === undefined ? 2 : o.rows;
  window.__files = o.files === undefined ? ['hats/cap.png', 'hats/visor.png'] : o.files;
  window.confirm = (m) => { window.__asked.push(String(m)); return o.say !== false; };

  const real = window.fetch;
  const json = (x, headers) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
  window.fetch = (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u-me' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['hats'], rules: [], decisions: [] }]));
    /* The count request, answered the way PostgREST answers count=exact. */
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) {
      window.__seq.push('count');
      return Promise.resolve(json([], { 'Content-Range': '0-0/' + window.__rows }));
    }
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) {
      window.__seq.push('list');
      if (o.listFails) return Promise.resolve(new Response('no', { status: 500 }));
      const body = JSON.parse((opt && opt.body) || '{}');
      const off = body.offset || 0;
      return Promise.resolve(json(window.__files.slice(off, off + (body.limit || 100))
        .map(n => ({ name: n }))));
    }
    if (s.indexOf('/storage/v1/object/traits') >= 0 && m === 'DELETE') {
      window.__seq.push('delete-files');
      window.__deleted = JSON.parse((opt && opt.body) || '{}').prefixes;
      if (o.fileDeleteFails) return Promise.resolve(new Response('no', { status: 500 }));
      window.__files = [];
      return Promise.resolve(json({}));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      window.__seq.push('delete-rows');
      if (o.rowDeleteFails) return Promise.resolve(new Response('no', { status: 500 }));
      window.__rows = 0;
      return Promise.resolve(json({}));
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return Promise.resolve(json([]));
    return real(u, opt);
  };
}, opts || {});

const after = (page) => page.evaluate(async () => {
  const all = await dbAll();
  const traits = all.filter(i => i.kind === 'trait');
  return {
    seq: window.__seq, asked: window.__asked, deleted: window.__deleted,
    note: document.getElementById('cloudnote').textContent,
    localCount: traits.length,
    stillSynced: traits.filter(t => t.synced || t.rowId || t.path).map(t => t.name),
  };
});

test.describe('clearing the cloud', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof clearCloud === 'function');
  });

  test('THE PICTURES GO BEFORE THE ROWS THAT NAME THEM', async ({ page }) => {
    /* THE ONE THAT MATTERS. Storage refuses direct deletion from the database,
       so the only way to reach a picture is through a row that names it.
       Delete the rows first and 1.14 GB is stranded for ever - which is what
       every hand-run clear did, and why the bucket looks the way it does. */
    await ready(page);
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    const files = r.seq.indexOf('delete-files');
    const rows = r.seq.indexOf('delete-rows');
    expect(files, 'the files were deleted').toBeGreaterThan(-1);
    expect(rows, 'and so were the rows').toBeGreaterThan(-1);
    expect(files, 'pictures first, always').toBeLessThan(rows);
  });

  test('and it takes everything under the collection, not a diff',
    async ({ page }) => {
      // A sweep with a keep-list is a tidy. A clear keeps nothing.
      await ready(page);
      await page.evaluate(() => clearCloud());
      const r = await after(page);
      expect(r.deleted.sort())
        .toEqual(['team1/c1/hats/cap.png', 'team1/c1/hats/visor.png']);
    });

  test('it asks first, with the numbers and who it reaches', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    expect(r.asked.length).toBe(1);
    expect(r.asked[0], 'how much').toContain('2 traits');
    expect(r.asked[0], 'that it is the whole group').toContain('everyone');
    expect(r.asked[0], 'and that this device keeps its copy').toContain('kept');
  });

  test('and Cancel touches nothing at all', async ({ page }) => {
    /* The recorded half. A destructive action tested only on the destructive
       path passes just as well once it has stopped asking. */
    await ready(page, { say: false });
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    expect(r.seq).not.toContain('delete-files');
    expect(r.seq).not.toContain('delete-rows');
    expect(r.stillSynced.sort(), 'and the local flags are untouched')
      .toEqual(['cap', 'visor']);
  });

  test('THE LOCAL COPY IS KEPT, and knows it is no longer uploaded',
    async ({ page }) => {
      /* Both halves. The traits stay - the confirmation says so. But every one
         of them was claiming synced, and cloudPush skips anything synced, so
         leaving the flag would make Save to cloud report success and send
         nothing. */
      await ready(page);
      await page.evaluate(() => clearCloud());
      const r = await after(page);
      expect(r.localCount, 'the work on this device is still here').toBe(2);
      expect(r.stillSynced, 'and none of it claims to be on the server').toEqual([]);
    });

  test('and it says how many it will send again', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => clearCloud());
    expect((await after(page)).note).toContain('Save to cloud will send them again');
  });

  test('the result is read back, not assumed', async ({ page }) => {
    /* cloudSweep returns 0 for "nothing to delete" and for "the listing
       failed" alike. Fine for a tidy after a push; not fine for the thing
       somebody pressed on purpose. */
    await ready(page);
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    const lastCount = r.seq.lastIndexOf('count');
    const rowDel = r.seq.indexOf('delete-rows');
    expect(lastCount, 'it asked again after deleting').toBeGreaterThan(rowDel);
    expect(r.note).toContain('The server copy is gone');
  });

  test('and a server that keeps the rows is not reported as cleared',
    async ({ page }) => {
      // The shape of lie worth avoiding: "gone" over a server that still has it.
      await ready(page, { rowDeleteFails: true });
      await page.evaluate(() => clearCloud());
      const r = await after(page);
      expect(r.note, 'it says what is still there').toContain('still has 2 traits');
      expect(r.note).not.toContain('The server copy is gone');
    });

  test('and files it could not remove are named as still there',
    async ({ page }) => {
      await ready(page, { fileDeleteFails: true });
      await page.evaluate(() => clearCloud());
      const r = await after(page);
      expect(r.note).toContain('still in storage');
    });

  test('an empty server says so instead of asking', async ({ page }) => {
    await ready(page, { rows: 0, files: [] });
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    expect(r.asked, 'nothing to confirm').toEqual([]);
    expect(r.note).toContain('nothing on the server');
    expect(r.seq, 'and it deletes nothing').not.toContain('delete-rows');
    expect(r.seq).not.toContain('delete-files');
  });

  test('AND AN EMPTY SERVER STILL FIXES A BROWSER THAT THINKS OTHERWISE',
    async ({ page }) => {
      /* THE STATE THIS PROJECT IS ACTUALLY IN. Every clear before this button
         existed was run by hand against the database, which cannot touch
         storage and does not touch this browser either - so the records here
         still carry synced, rowId and path for rows that are long gone.

         cloudPush skips anything already synced. Left alone, Save to cloud
         reports success and uploads NOTHING, and nothing anywhere says so. An
         empty server is exactly when that repair is needed, and returning
         early was skipping it. */
      await ready(page, { rows: 0, files: [] });
      await page.evaluate(() => clearCloud());
      const r = await after(page);
      expect(r.localCount, 'the work is still here').toBe(2);
      expect(r.stillSynced, 'and none of it claims to be uploaded any more')
        .toEqual([]);
      expect(r.note, 'and it says why that matters')
        .toContain('Save to cloud will send them');
    });

  test('and a browser that is already right is left alone', async ({ page }) => {
    /* The control. A repair that always reports having fixed something is a
       repair nobody can read - and this message is the only evidence the user
       gets that their uploads will now work. */
    await ready(page, { rows: 0, files: [] });
    await page.evaluate(async () => {
      for (const rec of await dbAll()) {
        if (rec.kind !== 'trait') continue;
        const next = Object.assign({}, rec);
        delete next.synced; delete next.rowId; delete next.path;
        await dbPut(next);
      }
    });
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    expect(r.note, 'nothing to report').not.toContain('Save to cloud will send them');
    expect(r.note).toContain('nothing on the server');
  });

  test('but files with no rows left are still worth clearing', async ({ page }) => {
    /* THE CASE THE WHOLE FEATURE EXISTS FOR. Every hand-run clear removed the
       rows and could not remove the pictures, so zero rows and a full bucket
       is the state this found the real project in - and treating a row count
       of zero as "nothing here" would refuse to fix exactly that. */
    await ready(page, { rows: 0, files: ['hats/orphan.png'] });
    await page.evaluate(() => clearCloud());
    const r = await after(page);
    expect(r.asked.length, 'it still asks').toBe(1);
    expect(r.seq, 'and still deletes the pictures').toContain('delete-files');
    expect(r.deleted).toEqual(['team1/c1/hats/orphan.png']);
  });

  test('and it cannot be pressed twice at once', async ({ page }) => {
    await ready(page);
    const disabled = await page.evaluate(async () => {
      const p = clearCloud();
      const mid = document.getElementById('cloudclear').disabled;
      await p;
      return { mid, after: document.getElementById('cloudclear').disabled };
    });
    expect(disabled.mid, 'held while it runs').toBe(true);
    expect(disabled.after, 'and released when it finishes').toBe(false);
  });
});
