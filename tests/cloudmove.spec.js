/* A comment describing the safe order, above code doing the unsafe one.

   cloudMoveOne runs when a trait is renamed, restatused, or moved between
   layers inside a group. A trait's identity on the server is its name, layer
   and status, so all three of those are a removal of the old copy and an
   arrival of the new one. The comment above it said:

     "Doing it in that order means a failure halfway leaves the old copy
      rather than nothing at all."

   And the code did:

     await cloudDropOne(oldRec);        <- removal
     return await cloudSyncOne(fresh);  <- arrival

   Removal first, so a failure halfway left NOTHING at all - the exact opposite
   of the promise directly above it. The reasoning was right and the order was
   backwards, which is the worst combination: anyone reading this to check
   whether a move is safe was told that it is.

   MEASURED before the fix, inside a group with the upload failing the way a
   dropped connection does:

     server rows before   ['row_hat']
     server rows after    []
     cloudMoveOne         returned null

   The group had lost the trait. And the status chip that calls this discarded
   the return value, so it said "hat -> approved" either way.

   These tests drive the REAL cloudMoveOne, cloudSyncOne and cloudDropOne
   against a stubbed fetch. No credentials, no real server. Stubbing the two
   helpers would have measured only that this file calls them in some order;
   what is at stake is which rows exist on the server afterwards, so the stub
   sits at the network and the rows are counted.

   THE CONTROLS ARE HALF THE FILE. An order that never removes the old copy
   would pass "the old copy survives a failure" and leave every rename
   duplicated forever; a chip that always says "here only" would pass "it does
   not claim success" and lie on every successful move and on every move made
   outside a group at all. Both are pinned.
*/
import { test, expect } from '@playwright/test';

/* A fake server. `uploadFails` rejects every PNG upload the way a dropped
   connection does - all three attempts, since cloudSyncOne retries.

   `dropFails` is the other half: the upload lands and the removal of the OLD
   row answers 503, which is what a gateway blip looks like. That leaves the
   group holding the trait twice, and for a long time it was reported exactly
   the same way as a move that worked. */
const withServer = (page, opts) => page.evaluate(async (o) => {
  const { uploadFails, dropFails, dropMatchesNothing, group } = o;
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = group ? 'ws1' : null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));

  /* One trait, already on the server as row_hat, the way a pulled or pushed
     copy is. rowId is what makes the delete of the old copy targeted. */
  await dbPut({ id: 't_hat_skins_wip', kind: 'trait', name: 'hat', layer: 'skins',
    status: 'wip', blob: new Blob([new Uint8Array(64)]), w: 160, h: 160,
    rarity: 1, at: 1, shelfOrder: 1, rowId: 'row_hat', synced: true });

  const state = { rows: [{ id: 'row_hat', path: 'ws1/c1/skins/wip/hat.png' }], log: [], uploads: 0 };
  const json = (x) => new Response(JSON.stringify(x),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/traits') >= 0 && m === 'DELETE') {
      state.log.push('image-delete'); return json([]);
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      state.uploads++; state.log.push('upload');
      if (uploadFails) return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') {
      const b = JSON.parse(io.body)[0];
      const rec = { id: 'row_new', path: b.path, name: b.name, status: b.status, layer: b.layer };
      state.rows.push(rec);
      state.log.push('row-create');
      return json([rec]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') {
      /* A gateway answering 503 on the removal. Counted rather than short
         circuited, so a test can see that it was RETRIED. */
      /* Only the TARGETED delete, which is the one cloudDropOne makes with a
         rowId. cloudSyncOne also issues a tidy-up delete by name a moment
         earlier, and failing that one too made the retry count read 4 - a
         number about two different requests wearing the label of one. */
      if (dropFails && /[?&]id=eq./.test(s)) { state.log.push('row-delete-failed'); return new Response('{}',
        { status: 503, headers: { 'Content-Type': 'application/json' } }); }
      /* THE OTHER ANSWER. A DELETE that WORKED and matched nothing - the old
         row was already gone, which for a move means there is no second copy
         and nothing to warn about. 200 with an empty list, not an error. */
      if (dropMatchesNothing && /[?&]id=eq./.test(s)) {
        state.log.push('row-delete-matched-nothing');
        return new Response('[]', { status: 200,
          headers: { 'Content-Type': 'application/json' } }); }
      /* Matched on the parameter boundary. "collection_id=eq." contains
         "id=eq.", so a substring test reads a blanket delete as a targeted
         one - a mistake this suite has already made once, and it hid the
         exact behaviour the file was written to catch. */
      const rowId = (s.match(/[?&]id=eq\.([^&]+)/) || [])[1];
      const gone = [];
      if (rowId) {
        const id = decodeURIComponent(rowId);
        state.log.push('row-delete:' + id);
        const at = state.rows.findIndex(r => r.id === id);
        if (at >= 0) gone.push(state.rows.splice(at, 1)[0]);
      } else {
        /* cloudSyncOne clears rowId on the new copy, so its own tidy-up delete
           is by name+layer+status - the NEW identity, which nothing holds. */
        const name = decodeURIComponent((s.match(/[?&]name=eq\.([^&]+)/) || [])[1] || '');
        const status = decodeURIComponent((s.match(/[?&]status=eq\.([^&]+)/) || [])[1] || '');
        const layer = decodeURIComponent((s.match(/[?&]layer=eq\.([^&]+)/) || [])[1] || '');
        state.log.push('row-delete-by-name:' + name + '/' + layer + '/' + status);
        for (let i = state.rows.length - 1; i >= 0; i--) {
          const r = state.rows[i];
          if (r.name === name && r.status === status && r.layer === layer) gone.push(state.rows.splice(i, 1)[0]);
        }
      }
      return json(gone);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return json(state.rows);
    return real(u, io);
  };
  window.__srv = { state, real };
  await renderShelf();
  await new Promise(r => setTimeout(r, 500));
  /* The shelf only draws traits whose layer is in LAYERS, so a trait filed
     under a layer this browser does not have is not on it at all. "skins" is a
     default one. Asserted rather than assumed: a first draft used "hats",
     every chip test found no card, and the helper reported that as a result
     instead of as a broken instrument. */
  if (!document.querySelector('#projbody button.cyc'))
    throw new Error('the seeded trait is not on the shelf, so nothing below measures anything');
  return true;
}, opts);

const restore = (page) => page.evaluate(() => { window.fetch = window.__srv.real; });

const snapshot = (page) => page.evaluate(() => ({
  rows: window.__srv.state.rows.map(r => r.id).sort(),
  log: window.__srv.state.log.slice(),
}));

/* Drives the real cloudMoveOne: wip -> approved, which is a new identity. */
const move = (page) => page.evaluate(async () => {
  const t = (await dbAll()).find(r => r.id === 't_hat_skins_wip');
  const moved = Object.assign({}, t, { id: 't_hat_skins_approved', status: 'approved' });
  const ret = await cloudMoveOne(t, moved);
  return { ret: ret === null ? null : !!ret };
});

/* Presses the real status chip and reports what it said. */
const chip = (page) => page.evaluate(async () => {
  const said = [];
  const realToast = window.toast;
  window.toast = (m) => { said.push(m); };
  const card = [...document.querySelectorAll('#projbody .item')]
    .find(el => /hat/i.test(el.textContent || ''));
  if (!card) { window.toast = realToast; throw new Error('no card to press'); }
  card.querySelector('button.cyc').click();
  await new Promise(r => setTimeout(r, 2500));   // three upload attempts, backed off
  window.toast = realToast;
  return { said: said.join(' | ') };
});

test.describe('moving a trait inside a group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudMoveOne === 'function');
  });

  test('the new copy is created before the old one is removed', async ({ page }) => {
    await withServer(page, { group: true });
    const r = await move(page);
    const s = await snapshot(page);
    await restore(page);
    expect(r.ret, 'the move reports that it landed').toBe(true);
    const created = s.log.indexOf('row-create');
    const removed = s.log.indexOf('row-delete:row_hat');
    expect(created, 'the new row is created').toBeGreaterThanOrEqual(0);
    expect(removed, 'and the old one is removed').toBeGreaterThanOrEqual(0);
    expect(created, 'in that order - this is the whole defect').toBeLessThan(removed);
  });

  test('and the group ends up holding exactly the new copy', async ({ page }) => {
    // The counterweight to the ordering test: an order that never gets round
    // to the removal would satisfy "created before removed" trivially and
    // leave every rename duplicated on the server forever.
    await withServer(page, { group: true });
    await move(page);
    const s = await snapshot(page);
    await restore(page);
    expect(s.rows, 'the old row is gone and the new one is there').toEqual(['row_new']);
  });

  test('a failed upload leaves the old copy rather than nothing at all', async ({ page }) => {
    await withServer(page, { group: true, uploadFails: true });
    const r = await move(page);
    const s = await snapshot(page);
    await restore(page);
    expect(r.ret, 'and says it did not land').toBeFalsy();
    expect(s.rows, 'the group still has the trait under its old identity').toEqual(['row_hat']);
    expect(s.log.join(' '), 'nothing deleted the old row').not.toContain('row-delete:row_hat');
    expect(s.log.join(' '), 'and nothing deleted its picture').not.toContain('image-delete');
  });

  test('A MOVE THAT LEFT THE OLD COPY BEHIND SAYS SO', async ({ page }) => {
    /* The order is deliberate - the new copy up first, the old one removed
       after - so a failure halfway leaves BOTH rather than neither, and
       cloudMoveOne's comment calls that "recoverable". Nobody was told there
       was anything to recover: the result of the removal was discarded and the
       message was identical to a clean move.

       Measured before this, with the removal answering 503:

         drop works   server rows ["hat/stfp"]
         drop fails   server rows ["hat/approved","hat/stfp"]

       and the same sentence both times. */
    await withServer(page, { group: true, dropFails: true });
    const r = await chip(page);
    const s = await snapshot(page);
    await restore(page);
    expect(s.rows.length, 'the group really does hold it twice').toBe(2);
    expect(r.said, 'the move itself worked and still says so').toContain('hat -> approved');
    expect(r.said, 'and the half that did not is named')
      .toContain('the old copy is still on the server');
  });

  test('and it tries three times before saying it - the retry', async ({ page }) => {
    /* A 503 from a gateway is the ordinary reason this fails, and the upload
       three lines earlier has survived exactly that with three attempts since
       it was written. The removal in the same operation got one. */
    await withServer(page, { group: true, dropFails: true });
    await chip(page);
    const s = await snapshot(page);
    await restore(page);
    const tries = s.log.filter(x => x === 'row-delete-failed').length;
    expect(tries, 'three attempts, like the upload').toBe(3);
  });

  test('but a move that removed the old row says nothing extra - the control',
    async ({ page }) => {
      /* Otherwise the warning is on every move, which is worse than being on
         none: it would be attached to the case that is working. */
      await withServer(page, { group: true });
      const r = await chip(page);
      const s = await snapshot(page);
      await restore(page);
      expect(s.rows.length, 'exactly one copy up there').toBe(1);
      expect(r.said).toContain('hat -> approved');
      expect(r.said).not.toContain('old copy is still on the server');
    });

  test('AND A REMOVAL THAT MATCHED NOTHING IS NOT A KEPT COPY - the control',
    async ({ page }) => {
      /* null and false are different answers from cloudDropOne and the
         difference decides what the person is told. null is "the removal could
         not be done", which leaves a second copy up there. false is "it was
         done and matched nothing" - the old row had already gone, so there is
         no second copy and nothing to say.

         WITHOUT THIS, THE DISTINCTION IS UNDEFENDED. Measured: a mutation
         changing the check to a plain falsy test killed no test at all, because
         every other case here either removes a row or fails outright. A trait
         whose old row a teammate had already deleted would have been reported
         as being up there twice. */
      await withServer(page, { group: true, dropMatchesNothing: true });
      const r = await chip(page);
      const s = await snapshot(page);
      await restore(page);
      expect(s.log.join(' '), 'the removal really did run and match nothing')
        .toContain('row-delete-matched-nothing');
      expect(r.said, 'the move is reported plainly').toContain('hat -> approved');
      expect(r.said, 'with nothing about a copy that is not there')
        .not.toContain('old copy is still on the server');
    });

  test('the status chip does not claim a move the group never got', async ({ page }) => {
    /* SUPERSEDES an assertion on the exact phrase "still has the old one",
       which this message carried and no longer does. That sentence was the
       whole of what the chip said, for every one of the six ways a save can
       fail to reach a group - and it named no cause, so the same words were
       shown to somebody whose connection had blinked and to somebody who was
       signed out, who could press Save to cloud all afternoon.

       WHAT SURVIVES IS WHAT THE TEST WAS FOR: the chip must say where the
       change actually is, and must not claim the group got it. Both are
       asserted, and the cause is asserted on top - which is stricter than
       the phrase was, because a message that named no cause used to pass.

       The uploads here fail the way a dropped connection does, so the cause
       is the try-again one. whyitdidnotreach.spec.js is where the other five
       are pinned. */
    await withServer(page, { group: true, uploadFails: true });
    const r = await chip(page);
    await restore(page);
    expect(r.said, 'it says where the change actually is').toContain('here only');
    expect(r.said, 'and why it is only there').toContain('could not reach the group');
    expect(r.said, 'and never reads as having reached it').not.toContain('shared it with the group');
  });

  test('but it says the plain thing when the move worked', async ({ page }) => {
    // THE CONTROL. A chip that always warned would pass the test above and be
    // wrong on every successful move, which is most of them.
    await withServer(page, { group: true });
    const r = await chip(page);
    await restore(page);
    expect(r.said, 'the ordinary message').toContain('hat -> approved');
    expect(r.said, 'with no warning attached').not.toContain('here only');
  });

  test('and on a personal page, where there is no group to reach', async ({ page }) => {
    /* THE OTHER CONTROL, and the one that would break the most. cloudMoveOne
       returns null when activeWs is null - nothing left the browser and
       nothing was meant to. A bare `!shared` check would read that as a
       failure and warn about a group the person is not in, on every single
       status change made outside one. */
    await withServer(page, { group: false });
    const r = await chip(page);
    await restore(page);
    expect(r.said, 'the ordinary message').toContain('hat -> approved');
    expect(r.said, 'and no mention of a group').not.toContain('here only');
  });
});
