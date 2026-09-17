/* WHY A TRAIT DID NOT REACH THE GROUP, said rather than guessed at.

   "when im trying to save to final project theres a green popup sayin save to
   cloud and a bunch of other stuff i just want to be able to add it to my
   team"

   MEASURED BEFORE ANY OF THIS WAS WRITTEN. Adding a trait to the final
   project inside a group, with the server made to fail six ways:

     signed out           hat is in the final project here only - the group
     could not ask        still has the old one
     no collection            ... the same sentence, all six times
     403 on the upload
     connection dropped
     row refused

   cloudSyncOne answers null for every one of those and the caller cannot tell
   them apart, so the message picked one and told you to press Save to cloud.
   For three of the six, pressing Save to cloud runs exactly what just failed.
   That is the shape of being stuck: a transient failure fixes itself, so the
   only person who complains about this is the one the advice cannot help.

   The same probe found the second half: after every one of those failures the
   stored record came back synced=true. setTraitStatus builds the new record by
   spreading the old one, so a trait that WAS on the server carries `synced`
   and `path` into an identity the server has never seen.

   THE CONTROLS ARE MOST OF THIS FILE. A version that named a cause on every
   save would pass "it names the cause"; a version that warned outside a group
   would pass it too. Both are pinned, along with the one that matters most
   for the rest of the suite: an upload that fails without saying why must
   read exactly as it did before, because four other specs stub this function
   out and none of them fills in a reason.
*/
import { test, expect } from '@playwright/test';

/* A group project with one trait already on the server, and a fake server
   that fails in whichever single way the case is about. */
const seed = (page, mode) => page.evaluate(async (m) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  cloudTeamId = null;
  activeWs = (m === 'nogroup') ? null : 'ws1';
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'tok', refresh_token: 'ref',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  /* SIGNED OUT IS THE ABSENCE OF THE SESSION, not a flag. sbToken clears the
     stored session only on a definitive 400/401/403, so "no session in
     storage" is exactly what the page uses to tell signed-out from
     could-not-ask - and a test that set some other flag would not be
     measuring that. */
  if (m === 'signedout') localStorage.removeItem('chatnft.session');

  LAYERS = ['skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: ['skins', 'unsorted'], hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await dbPut({ id: 't_hat_skins_approved', kind: 'trait', name: 'hat', layer: 'skins',
    status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 1024,
    rowId: 'row_hat', synced: true, path: 'ws1/c1/trait-hat-skins-approved.png' });
  /* Already in the final set, for the case where nothing is being changed. */
  await dbPut({ id: 't_cap_skins_stfp', kind: 'trait', name: 'cap', layer: 'skins',
    status: 'stfp', blob, w: 16, h: 16, rarity: 1, at: 1, shelfOrder: 2048,
    rowId: 'row_cap', synced: true, path: 'ws1/c1/trait-cap-skins-stfp.png' });

  const json = (x, st) => new Response(JSON.stringify(x),
    { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), meth = (io && io.method) || 'GET';
    /* A refresh that cannot be made. Only the definitive codes clear the
       session, and a 500 is not one - which is what keeps "could not ask"
       distinguishable from "signed out". */
    if (s.indexOf('/auth/v1/token') >= 0) return json({}, 500);
    if (s.indexOf('/auth/v1/user') >= 0)
      return m === 'cannotask' ? json({}, 500) : json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
    if (s.indexOf('/rest/v1/collections') >= 0)
      return m === 'nocollection' ? json({}, 500) : json([{ id: 'c1', layers: ['skins'] }]);
    if (s.indexOf('/storage/v1/object/traits') >= 0 && meth === 'DELETE') return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      if (m === 'forbidden') return json({ message: 'no' }, 403);
      if (m === 'toobig') return json({ message: 'too large' }, 413);
      if (m === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
      return json({});
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && meth === 'POST') {
      if (m === 'rowclash') return json({ message: 'duplicate key' }, 409);
      /* The gateway failing on the row insert while the image upload
         succeeded - the asymmetry patch489 exists for. */
      if (m === 'rowdown') return json({ message: 'upstream' }, 503);
      return json([{ id: 'row_new' }]);
    }
    if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
    return real(u, io);
  };
  window.__realfetch = real;
  await renderShelf();
  await new Promise(r => setTimeout(r, 300));
  showPage('final', false);
  await new Promise(r => setTimeout(r, 400));
}, mode);

/* Adds `hat` to the final project and reports what was said and what is
   stored. The wait covers three upload attempts with their back-off. */
const addToFinal = (page, name) => page.evaluate(async (nm) => {
  const realToast = window.toast; const out = [];
  window.toast = (msg) => out.push(String(msg));
  try {
    const t = (await dbAll()).filter(i => i.kind === 'trait').find(i => i.name === nm);
    await finalMove(t, 'stfp');
    await new Promise(r => setTimeout(r, 1600));
  } finally { window.toast = realToast; }
  const now = (await dbAll()).filter(i => i.kind === 'trait').find(i => i.name === nm);
  return { said: out.join(' | '), status: now && now.status,
    synced: !!(now && now.synced), rowId: now && now.rowId, path: now && now.path };
}, name || 'hat');

test.describe('saying why a trait did not reach the group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof finalMove === 'function');
  });

  test('SIGNED OUT SAYS SO, and does not send you to a button that cannot help',
    async ({ page }) => {
      /* The one that matters most. Pressing Save to cloud while signed out
         runs the identical upload and fails identically; somebody following
         that instruction can do it all afternoon. */
      await seed(page, 'signedout');
      const r = await addToFinal(page);
      expect(r.status, 'it is still in the final project here').toBe('stfp');
      expect(r.said).toContain('here only');
      expect(r.said, 'and names the cause').toContain('signed out on this device');
      expect(r.said, 'with the thing that actually fixes it').toContain('Sign in');
    });

  test('AND NOT ALLOWED SAYS SO - with no Save to cloud at all',
    async ({ page }) => {
      /* A 403 on the upload means this account may not write to this group.
         Save to cloud does the same upload, so naming it here would be the
         same loop. This is the assertion that a rewrite reintroducing a
         blanket "press Save to cloud" would fail. */
      await seed(page, 'forbidden');
      const r = await addToFinal(page);
      expect(r.said).toContain('not allowed to write to the group');
      expect(r.said, 'and does not send you round again').not.toContain('Save to cloud');
    });

  test('a refused row names the refusal, not the network', async ({ page }) => {
    /* 409 is the unique index: the group already holds this name on this
       layer at this status. Reported as "could not reach the group" before,
       which is a sentence about a connection that was working fine. */
    await seed(page, 'rowclash');
    const r = await addToFinal(page);
    expect(r.said).toContain('the server refused it (409)');
    expect(r.said).not.toContain('could not reach');
  });

  test('BUT A 5XX ON THE ROW INSERT IS NOT A REFUSAL', async ({ page }) => {
    /* cloudSyncOne makes two requests and had two different rules for one
       question. The image upload split on status - under 500 a refusal, 500
       and up "could not reach" - and the row POST thirty lines later used
       401/403-or-else-refused, so the same 503 produced:

         upload    "could not reach the group. Press Save to cloud when you
                    are back."
         row POST  "the server refused it (503), so the group did not get it."

       The row POST is the worse place for it: the upload makes three
       attempts, this makes one, so a single transient answer ends it - and
       "refused" is a word nobody presses the button again after. */
    await seed(page, 'rowdown');
    const r = await addToFinal(page);
    expect(r.said, 'the try-again sentence, the same as the upload gives')
      .toContain('could not reach the group. Press Save to cloud when you are back.');
    expect(r.said, 'and not the definite word').not.toContain('refused');
  });

  test('and a 4xx there still IS - the control', async ({ page }) => {
    /* Otherwise the fix is just "never say refused", which would be wrong for
       the 409 this branch was written for: the unique index, meaning the group
       already holds this name on this layer at this status. Waiting does not
       fix that one. */
    await seed(page, 'rowclash');
    const r = await addToFinal(page);
    expect(r.said).toContain('the server refused it (409)');
    expect(r.said).not.toContain('could not reach');
  });

  test('and a file the bucket refuses is not reported as a dropped connection',
    async ({ page }) => {
      /* The upload retries three times for everything that is not a 401 or
         403, and a 413 was landing in the same "unreachable" bucket as a
         dropped connection. Waiting does not shrink a file. */
      await seed(page, 'toobig');
      const r = await addToFinal(page);
      expect(r.said).toContain('refused it (413)');
    });

  test('the collection failing is its own answer', async ({ page }) => {
    await seed(page, 'nocollection');
    const r = await addToFinal(page);
    expect(r.said).toContain('collection on the server could not be opened');
    /* AND PROMISES NOTHING. This said "Try again in a moment.", which is a
       claim about a cause nobody established: cloudCollection returns null
       for a missing token, for a GET that failed - including a 403 from a row
       policy, meaning this account may not read that collection at all - and
       for a failed POST. Telling somebody to wait out a permission problem is
       the same dead end this whole file exists to remove. */
    expect(r.said, 'it does not promise the wait will fix it')
      .not.toContain('Try again in a moment');
  });

  test('COULD NOT ASK IS NOT SIGNED OUT - the distinction that costs work',
    async ({ page }) => {
      /* The session is still in storage, because only a definitive 400, 401
         or 403 clears it. Telling somebody who is signed in to sign in is an
         instruction to sign out first, on a device holding local work - the
         reason sbAuthState exists and the reason this is not just "signed
         out" whenever the user lookup comes back empty. */
      await seed(page, 'cannotask');
      const r = await addToFinal(page);
      expect(r.said, 'the ordinary try-again sentence')
        .toContain('could not reach the group. Press Save to cloud when you are back.');
      expect(r.said, 'and it does not claim you are signed out')
        .not.toContain('signed out');
    });

  test('a dropped connection keeps the sentence it always had', async ({ page }) => {
    await seed(page, 'offline');
    const r = await addToFinal(page);
    expect(r.said).toContain('could not reach the group. Press Save to cloud when you are back.');
  });

  test('AND A SAVE THAT WORKED SAYS THE PLAIN THING - the control',
    async ({ page }) => {
      /* Without this, a version that attached a cause to every save would
         pass every test above, and warn on the ordinary case - which is most
         of them. */
      await seed(page, 'ok');
      const r = await addToFinal(page);
      expect(r.said).toBe('hat is in the final project');
      expect(r.said).not.toContain('here only');
      expect(r.synced, 'and the record says it arrived').toBe(true);
    });

  test('and outside a group nothing is said about one - the control',
    async ({ page }) => {
      /* cloudMoveOne returns null when there is no group: nothing left the
         browser and nothing was meant to. A bare check on the return value
         reads that as failure and warns about a group the person is not in,
         on every status change made outside one. */
      await seed(page, 'nogroup');
      const r = await addToFinal(page);
      expect(r.said).toBe('hat is in the final project');
      expect(r.said).not.toContain('here only');
    });

  test('and a status that is already the one asked for warns about nothing',
    async ({ page }) => {
      /* setTraitStatus returns early with shared:null when there is nothing
         to change, so "here only" used to appear on a send that was never
         attempted. Reached by pressing stfp on something already stfp. */
      await seed(page, 'offline');
      const r = await addToFinal(page, 'cap');
      expect(r.said).toBe('cap is in the final project');
      expect(r.said).not.toContain('here only');
    });

  test('THE RECORD STOPS CLAIMING TO BE ON THE SERVER', async ({ page }) => {
    /* `moved` is a spread of the old record, so a synced trait carried
       `synced` and `path` into an identity the server has never seen.
       Measured before this: synced came back true on all six failures.

       rowId STAYS, deliberately. It points at the row the old copy made, and
       that is the row a later Save to cloud has to replace; dropping it would
       post a second row and leave the group holding the trait twice. */
    await seed(page, 'offline');
    const r = await addToFinal(page);
    expect(r.synced, 'it does not claim the group has it').toBe(false);
    expect(r.path, 'nor a file on the server under this name').toBeFalsy();
    expect(r.rowId, 'but it still knows which row to replace').toBe('row_hat');
  });

  test('and Save to cloud really does send it afterwards - the end to end',
    async ({ page }) => {
      /* The claim the message makes has to be true. Fail the upload, then let
         it work, then press the button the toast named and check the row
         actually arrives with the new status. */
      await seed(page, 'offline');
      await addToFinal(page);
      const sent = await page.evaluate(async () => {
        const posted = [];
        const real = window.__realfetch;
        const json = (x, st) => new Response(JSON.stringify(x),
          { status: st || 200, headers: { 'Content-Type': 'application/json' } });
        window.fetch = async (u, io) => {
          const s = String(u), meth = (io && io.method) || 'GET';
          if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
          if (s.indexOf('/rpc/my_team') >= 0) return json('ws1');
          if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['skins'] }]);
          if (s.indexOf('/storage/v1/object/list') >= 0) return json([]);
          if (s.indexOf('/storage/v1/object/traits') >= 0) return json({});
          if (s.indexOf('/rest/v1/traits') >= 0 && meth === 'POST') {
            posted.push(JSON.parse(io.body)[0]);
            return json([{ id: 'row_new' }]);
          }
          if (s.indexOf('/rest/v1/traits') >= 0) return json([]);
          return real(u, io);
        };
        await cloudPush();
        await new Promise(r => setTimeout(r, 800));
        return posted.map(p => p.name + '/' + p.layer + '/' + p.status);
      });
      expect(sent, 'the trait goes up under the status it was given')
        .toContain('hat/skins/stfp');
    });

  test('AN UPLOAD THAT FAILS WITHOUT SAYING WHY READS EXACTLY AS IT DID',
    async ({ page }) => {
      /* THE CONTROL THAT PROTECTS THE REST OF THE SUITE. Four other specs
         replace cloudSyncOne with a stub that answers null and fills in no
         reason. The reason is an out-parameter for that: the answer is
         unchanged, and anything that does not fill one in falls back to the
         sentence that was there before, word for word. */
      await seed(page, 'ok');
      const r = await page.evaluate(async () => {
        const realSync = window.cloudSyncOne;
        window.cloudSyncOne = async () => null;
        const realToast = window.toast; const out = [];
        window.toast = (msg) => out.push(String(msg));
        try {
          const t = (await dbAll()).filter(i => i.kind === 'trait').find(i => i.name === 'hat');
          await finalMove(t, 'stfp');
          await new Promise(x => setTimeout(x, 400));
        } finally { window.toast = realToast; window.cloudSyncOne = realSync; }
        return out.join(' | ');
      });
      expect(r).toBe('hat is in the final project here only - '
        + 'could not reach the group. Press Save to cloud when you are back.');
    });

  test('and the shelf tile says the same thing the final page does',
    async ({ page }) => {
      /* Two pages, one sentence. They were two copies of one guess, and a fix
         applied to one of them would have left the other guessing. */
      await seed(page, 'signedout');
      const said = await page.evaluate(async () => {
        showPage('project', false);
        await new Promise(r => setTimeout(r, 400));
        const realToast = window.toast; const out = [];
        window.toast = (m) => out.push(String(m));
        const card = [...document.querySelectorAll('#projbody .item')]
          .find(el => el.title === 'hat');
        if (!card) { window.toast = realToast; throw new Error('no card for hat'); }
        card.querySelector('button.cyc').click();
        await new Promise(r => setTimeout(r, 1600));
        window.toast = realToast;
        return out.join(' | ');
      });
      expect(said, 'the chip still says where the change is').toContain('here only');
      expect(said, 'and names the same cause').toContain('signed out on this device');
    });
});
