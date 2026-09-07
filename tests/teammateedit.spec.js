/* A teammate edits a trait. Does it reach you?

   It did not, and the reason is worth keeping because nothing about it looks
   like a bug from any single angle.

   Saving an edit DELETEs the server row and POSTs a new one, so an edited
   trait comes back carrying a row id nobody has ever seen. The pull matched
   teammates' work by that id. It therefore missed every edit anybody made,
   and what happened next depended only on which way you pulled:

     the automatic sync   saw the name/layer was already taken here, kept the
                          local copy, and stamped it with their new row id -
                          so their picture was discarded AND the local one
                          then looked synced
     Load from cloud      $('cloudpull').onclick=cloudPull hands a MouseEvent
                          in as opts, so keepMine was undefined and their
                          version arrived renamed to hat-2 beside yours

   One silently threw the edit away and the other duplicated it. Neither
   replaced anything, which is the only thing an edit can mean.

   THE TESTS COMPARE PIXELS, not counts. Every count in the broken version was
   already right: the same number of traits, the right names, the right layers.
   The single byte that differs between their picture and yours is the whole
   subject, so a test that counted rows would have passed against the defect. */
import { test, expect } from '@playwright/test';

/* A one-pixel PNG whose single byte is the payload, so "whose copy is this"
   has an exact answer. */
const png = (v) => `data:image/png;base64,${v}`;

/* A project holding one trait that came from the server, with the row id and
   the row's updated_at it was pulled at. */
const seed = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  await dbClear();
  /* The workspace key as well as the variable. activeWs decides WHICH
     IndexedDB is open, and it is read from localStorage on boot - so a test
     that sets only the variable and then reloads lands on a different
     database and finds an empty mailbox, which is what the reload test below
     first measured. */
  wsSave('team1');
  activeWs = 'team1';
  cloudTeamId = 'team1';
  MAIL = [];
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['hats', 'unsorted'], hidden: [], at: 1 });
  await dbPut({
    id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats',
    status: 'approved', rowId: 'row-old', rowAt: o.mineAt, path: 'p/cap.png',
    w: 160, h: 160, rarity: 1, at: 1,
    blob: new Blob([new Uint8Array([o.mine])]),
    synced: o.synced,
  });
  await renderShelf();
}, opts);

/* The server answers with ONE trait row, described by the caller, and hands
   out a one-byte image for any download. */
const pullWith = (page, row, theirByte) => page.evaluate(async ([ROW, BYTE]) => {
  const real = window.fetch;
  const json = (o, x) => new Response(JSON.stringify(o), { status: 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, x || {}) });
  window.fetch = (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['hats', 'unsorted'] }]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0)
      return Promise.resolve(json([], { 'Content-Range': '0-0/1' }));
    if (s.indexOf('/rest/v1/traits?select=') >= 0) return Promise.resolve(json([ROW]));
    if (s.indexOf('/storage/v1/object/traits/') >= 0)
      return Promise.resolve(new Response(new Blob([new Uint8Array([BYTE])]), { status: 200 }));
    return Promise.resolve(json([]));
  };
  try { await cloudPull({ quiet: true }); } finally { window.fetch = real; }

  const rows = (await dbAll()).filter(i => i.kind === 'trait');
  const bytes = [];
  for (const r of rows) bytes.push(new Uint8Array(await r.blob.arrayBuffer())[0]);
  return {
    count: rows.length,
    names: rows.map(r => r.name).sort(),
    bytes,
    rowAt: rows[0] && rows[0].rowAt,
    mail: MAIL.map(m => m.kind + ':' + m.name),
    note: document.getElementById('cloudnote').textContent,
    mailNote: document.getElementById('mailnote').textContent,
    mailHidden: document.getElementById('mailnote').hidden,
  };
}, [row, theirByte]);

const THEIRS = { id: 'row-new', kind: 'trait', name: 'cap', layer: 'hats',
  status: 'approved', path: 'p/cap.png', w: 160, h: 160, rarity: 1,
  updated_at: '2026-09-07T12:00:00Z' };

test.describe('a teammate edits a trait you already have', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function' && typeof mailShow === 'function');
  });

  test('their version replaces yours, rather than being thrown away',
    async ({ page }) => {
      /* THE DEFECT. Their edit came back as a new row id, the local copy had
         the same name and layer, and the pull kept the local one - and stamped
         it with their row id, so it then looked synced. */
      await seed(page, { mine: 7, mineAt: '2026-09-07T09:00:00Z', synced: true });
      const r = await pullWith(page, THEIRS, 42);
      expect(r.count, 'still one trait, not two').toBe(1);
      expect(r.bytes[0], 'and it is THEIR picture, not yours').toBe(42);
      expect(r.rowAt, 'and it remembers which version it now holds')
        .toBe('2026-09-07T12:00:00Z');
    });

  test('and is not added a second time under another name', async ({ page }) => {
    /* THE OTHER HALF OF THE SAME DEFECT. Pulled the manual way - which passes
       a MouseEvent as opts, so keepMine was never set - their edit arrived as
       cap-2 and both copies sat on the shelf. */
    await seed(page, { mine: 7, mineAt: '2026-09-07T09:00:00Z', synced: true });
    const r = await pullWith(page, THEIRS, 42);
    expect(r.names, 'one cap, and nothing called cap-2').toEqual(['cap']);
  });

  test('but an older copy on the server does not overwrite a newer one here',
    async ({ page }) => {
      /* THE CONTROL. Without it "always take the server's" would pass the two
         tests above while making every pull undo whatever this device last
         sent. */
      await seed(page, { mine: 7, mineAt: '2026-09-07T15:00:00Z', synced: true });
      const r = await pullWith(page, THEIRS, 42);
      expect(r.bytes[0], 'yours is newer, so yours stays').toBe(7);
      expect(r.mail, 'and nothing is reported as an update').toEqual([]);
    });

  test('and it never overwrites work you have not saved yet', async ({ page }) => {
    /* THE ONE THAT PROTECTS THE PERSON PULLING. `synced` means exactly "reached
       the server and has not been edited since", so an unsynced copy holds
       changes that exist nowhere else. Their edit is newer AND this is
       unsaved: that is two people disagreeing, and a sync does not get to
       settle it by deleting one side. */
    await seed(page, { mine: 7, mineAt: '2026-09-07T09:00:00Z', synced: false });
    const r = await pullWith(page, THEIRS, 42);
    expect(r.bytes[0], 'your unsaved work is still here').toBe(7);
    expect(r.mail, 'and the disagreement is reported rather than hidden')
      .toEqual(['clash:cap']);
  });

  test('the mailbox says what changed, and stays until it is read',
    async ({ page }) => {
      /* A pull runs on open and runs quiet by design. A message that lasts
         1.7 seconds on a page nobody is watching has told nobody anything, so
         this is a record rather than an announcement. */
      await seed(page, { mine: 7, mineAt: '2026-09-07T09:00:00Z', synced: true });
      const r = await pullWith(page, THEIRS, 42);
      expect(r.mail, 'the change is recorded').toEqual(['updated:cap']);
      expect(r.mailHidden, 'and shown on the shelf').toBe(false);
      expect(r.mailNote).toContain('cap');
      expect(r.note, 'and the pull says it too').toContain('updated by the group');

      const after = await page.evaluate(async () => {
        await renderShelf();
        return { hidden: document.getElementById('mailnote').hidden,
          text: document.getElementById('mailnote').textContent };
      });
      expect(after.hidden, 'still there after the shelf redraws').toBe(false);
      expect(after.text).toContain('cap');
    });

  test('and survives a reload, because that is what a mailbox is for',
    async ({ page }) => {
      /* THE ASSERTION THAT SEPARATES THIS FROM A TOAST. The sync that fills it
         runs on open; if the record did not persist, the only person who would
         ever see it is one who happened to be looking at that moment. */
      await seed(page, { mine: 7, mineAt: '2026-09-07T09:00:00Z', synced: true });
      await pullWith(page, THEIRS, 42);
      await page.reload();
      await page.waitForFunction(() => typeof mailShow === 'function');
      /* The gate is cleared and the shelf drawn, which is what a signed-in
         boot does for itself. Measured while writing this: after the reload the
         settings.mail record WAS in the database and MAIL was empty, because
         nothing had rendered the shelf yet - the reading happens in
         renderShelf. Waiting longer would not have fixed it, and a test that
         waited and passed would have been measuring the boot, not the store. */
      const r = await page.evaluate(async () => {
        try { authed = true; } catch (_) {}
        try { gateShow(false); } catch (_) {}
        await renderShelf();
        return {
          mail: MAIL.map(m => m.kind + ':' + m.name),
          hidden: document.getElementById('mailnote').hidden,
        };
      });
      expect(r.mail, 'the record came back').toEqual(['updated:cap']);
      expect(r.hidden, 'and is on screen again').toBe(false);
    });

  test('and Mark as read empties it, for good', async ({ page }) => {
    await seed(page, { mine: 7, mineAt: '2026-09-07T09:00:00Z', synced: true });
    await pullWith(page, THEIRS, 42);
    const r = await page.evaluate(async () => {
      await mailClear();
      const stored = (await dbAll()).find(i => i.id === 'settings.mail');
      return { mail: MAIL.length, hidden: document.getElementById('mailnote').hidden,
        stored: stored ? stored.mail.length : -1 };
    });
    expect(r.mail, 'nothing left in memory').toBe(0);
    expect(r.hidden, 'and nothing on screen').toBe(true);
    expect(r.stored, 'and nothing left to come back on the next reload').toBe(0);
  });
});
