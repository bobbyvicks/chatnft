/* STAGE 0: RELOADING WHEN THE PROJECT HAS MOVED ON (design D1, B5's rule:
   "It reloads by itself only when the editor is closed and no stroke, drag
   or select is running. With the editor open it shows a bar ... and reloads
   on the press, after awaiting the draft write").

   And two things D1 implies: no reload while the fixer holds results that
   are not saved (in stage 0 they live only in memory), and at most one
   reload per tab session, since this page has no newer build to load and
   would otherwise reload for ever. These drive real reloads, so the server
   is answered with page.route, which outlives them.

   And what Task 10 added, from the controller's audit (amend-task15.md):
   the drawing's closing save, and the sign-out and switch that wait for
   it, are in hand too - a reload then lost the drawing's last strokes, or
   cut the sign-out or the switch short; the button does nothing during
   those waits, nothing for a store or an account that has gone, and
   does not reload over a draft write that failed.

   THE STAND-IN ANSWERS WHAT IT DOES NOT NAME (Ruling F-17, disclosed).
   serve() answers every request to the project's host that it does not
   name with 200 []. These tests drive real reloads and the page's whole
   signed-in start (cloudRender, the group catch-up), whose other requests
   they do not enumerate; what each measures is the protocol read's
   answer, which is named, and what the page did with it. The cost: a
   request the page makes that nothing here expects is answered, not
   failed, and would not show in these tests. Nothing reaches the network:
   page.route answers every request to the host, and the config refuses
   the name. */
import { test, expect } from '@playwright/test';
import { openTrait, S0_SWITCHING, S0_SWITCHED } from './helpers.js';

const SB = 'https://dpracoavrcqyenfieksi.supabase.co';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
async function serve(page, { protocol = 2, switching = null } = {}) {
  const ok = (body) => (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body });
  /* The catch-all first: Playwright tries the newest route first (tests/README.md, "A mock's registration order"). */
  await page.route(SB + '/**', ok('[]'));
  await page.route(SB + '/auth/v1/user', ok(JSON.stringify({ id: 'u1' })));
  await page.route(SB + '/rest/v1/rpc/my_team', ok('"me"'));
  await page.route(SB + '/rest/v1/teams**', ok(JSON.stringify([{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }])));
  await page.route(/select=id,protocol,switching_at/, ok(JSON.stringify([{ id: 'c1', protocol, switching_at: switching }])));
}
/* Signed in as u1, and this tab pinned to u1 as cloudRender's check pins a
   signed-in page (s0SeenUid): a sign-out's wait keeps it, which is what
   keeps the page on the leaving account until the wait ends. */
const signIn = (page) => page.evaluate(() => {
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  sessionStorage.clear();
  try { s0SeenUid = 'u1'; } catch (_) {}
});
const counting = (page) => { const c = { n: 0 }; page.on('load', () => { c.n++; }); return c; };
const barState = (page) => page.evaluate(() => ({ shown: !document.getElementById('s0bar').hidden, text: document.getElementById('s0text').textContent,
  kept: document.getElementById('s0kept').hidden ? null : document.getElementById('s0kept').textContent, button: !document.getElementById('s0reload').hidden }));
/* The editor's drawing, changed where nothing re-arms the autosave (a
   fillRect on the canvas itself), after any save waiting or in flight has
   landed; then, with hold, its next encode is held until __release(). */
const changeAndHold = (page, hold) => page.evaluate(async (hold) => {
  const f = s0FlushAutosave(); if (f) await f;
  if (autoPending || s0SaveInFlight) throw new Error('a save is still waiting or in flight');
  ctx.fillStyle = 'rgb(0,0,255)'; ctx.fillRect(5, 5, 1, 1);
  if (hold) {
    const encode = art.toBlob.bind(art);
    const gate = new Promise(r => { window.__release = r; });
    art.toBlob = (cb, t) => encode(b => { gate.then(() => cb(b)); }, t);
  }
}, !!hold);
/* A draft as stored: the pixel the change above made, and whose it is. */
const draft = (page, key) => page.evaluate(async (key) => {
  const d = await dbGet(key);
  if (!d || !d.blob) return null;
  const bm = await createImageBitmap(d.blob);
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  return { px: Array.from(x.getImageData(5, 5, 1, 1).data), by: d.by || null };
}, key);
/* A protocol read with the editor open and nothing else in hand. startEditor
   arms a debounced autosave (autoPending), which alone holds the reload for
   1.5 s; it is landed first, so the open editor is what holds it (measured:
   without this, the editor check could be removed and these tests passed). */
const readWithTheEditorOpen = (page) => page.evaluate(async () => {
  const f = s0FlushAutosave(); if (f) await f;
  if (autoPending || s0SaveInFlight || $('app').hidden) throw new Error('not the editor alone in hand');
  await s0Check(true);
});
const ready = (page) => page.waitForFunction(() => typeof dbGet === 'function' && typeof s0Reload === 'function' && document.readyState === 'complete');
/* A group page, team7, signed in as u1 and remembered as the page to open. */
const onTeam7 = (page) => page.evaluate(() => { activeWs = 'team7'; wsSave('team7'); cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true; });

test.describe('stage 0: the reload rule', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { localStorage.removeItem('chatnft.session'); localStorage.removeItem('chatnft.ws'); sessionStorage.clear(); }).catch(() => {});
  });

  test('with nothing in hand it reloads by itself, once, then shows the bar and its button', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await page.goto('/index.html');
    await signIn(page);
    await page.evaluate(() => localStorage.setItem('chatnft.ws', 'team7'));
    const loads = counting(page);
    await page.reload();
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(2);
    await page.waitForTimeout(3000);
    expect(loads.n, 'once: this page has no newer build to load').toBe(2);
    await page.waitForFunction(() => !document.getElementById('s0bar').hidden);
    expect(await barState(page)).toEqual({ shown: true, text: S0_SWITCHED, kept: '. Your drawings and saved fixes are kept.', button: true });
  });

  test('with the editor open it waits; the bar\'s button writes the draft, then reloads', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    const loads = counting(page);
    await readWithTheEditorOpen(page);
    await page.waitForTimeout(1500);
    expect(loads.n, 'no reload while the editor is open').toBe(0);
    expect(await page.evaluate(() => [!document.getElementById('s0bar').hidden, !document.getElementById('s0reload').hidden])).toEqual([true, true]);
    /* The press awaits the draft write (the audit's Finding 4): startEditor's
       own debounced autosave is landed first, the drawing is changed where
       nothing re-arms it, and the press's write is held. */
    await changeAndHold(page, true);
    await page.click('#s0reload');
    await page.waitForTimeout(1000);
    expect(loads.n, 'the press waits for its draft write').toBe(0);
    expect(await page.evaluate(() => [!!s0SaveInFlight, $('s0reload').disabled, $('s0reload').textContent])).toEqual([true, true, 'Saving...']);
    await page.evaluate(() => window.__release());
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
    await ready(page);
    expect(await draft(page, 'autosave.working'), 'the drawing, as it was when pressed, was written before the reload').toEqual({ px: [0, 0, 255, 255], by: 'u1' });
  });

  test('while the fixer holds results it does not reload, and the bar says to save them first', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Reload === 'function');
    await signIn(page);
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; FIX.out = { consensus: 'scaled' }; });
    const loads = counting(page);
    await page.evaluate(() => s0Check(true));
    await page.waitForTimeout(1500);
    expect(loads.n).toBe(0);
    expect(await barState(page)).toEqual({ shown: true, text: S0_SWITCHED,
      kept: '. Your drawings and saved fixes are kept. Save the fixer\'s results first: unsaved ones are not kept.', button: true });
    await page.evaluate(() => { FIX.out = null; });
  });

  /* The fixer at work: a folder run's list is empty until its first file is
     done, and one image being fixed has no result yet - a reload stopped
     either. */
  test('the fixer at work - a folder run with no file done yet, or one image being fixed - holds the reload too; done with nothing kept, the next read reloads', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Reload === 'function');
    await signIn(page);
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; fixBatchRunning = true; fixBatchFiles = []; });
    const loads = counting(page);
    await page.evaluate(() => { s0Check(true); });
    await page.waitForTimeout(1000);
    expect([loads.n, await page.evaluate(() => s0Held())], 'a folder run, no file done').toEqual([0, 'switched']);
    expect((await barState(page)).kept).toContain('Save the fixer\'s results first');
    await page.evaluate(() => { fixBatchRunning = false; fixBatchFiles = null; FIX.worker = { stand: 'in' }; s0Show(); });
    await page.waitForTimeout(500);
    expect(loads.n, 'one image being fixed').toBe(0);
    /* THE CONTROL: the fixer idle, nothing kept in it. */
    await page.evaluate(() => { FIX.worker = null; s0Show(); });
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
  });

  test('a stroke in progress holds the reload; the next read after it ends reloads', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Reload === 'function');
    await signIn(page);
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; painting = true; });
    const loads = counting(page);
    await page.evaluate(() => s0Check(true));
    await page.waitForTimeout(1000);
    expect(loads.n).toBe(0);
    await page.evaluate(() => { painting = false; s0Check(true); });
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
  });

  test('THE CONTROL: a project being switched is waited out - no reload, no button', async ({ page }) => {
    await serve(page, { protocol: 1, switching: '2026-09-27T12:00:00+00:00' });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Reload === 'function');
    await signIn(page);
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; });
    const loads = counting(page);
    await page.evaluate(() => s0Check(true));
    await page.waitForTimeout(1500);
    expect(loads.n).toBe(0);
    expect(await barState(page)).toEqual({ shown: true, text: S0_SWITCHING, kept: null, button: false });
  });

  /* THE DRAWING'S CLOSING SAVE (the audit's Finding 1). closeEditor hides
     #app, then awaits its draft write; a reload in between aborted it, and
     with it every stroke since the last 1.5 s pause. */
  test('the editor closed with its drawing\'s save still being written: no reload; the next read after it lands reloads, with the drawing kept', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    const loads = counting(page);
    await changeAndHold(page, true);
    expect(await page.evaluate(() => { closeEditor(); return { inFlight: !!s0SaveInFlight, closed: $('app').hidden }; })).toEqual({ inFlight: true, closed: true });
    await page.evaluate(() => { s0Check(true); });
    await page.waitForTimeout(1000);
    expect(loads.n, 'no reload while the closing save is being written').toBe(0);
    expect(await page.evaluate(() => [s0Held(), !!s0SaveInFlight]), 'the read landed, and the save is still held').toEqual(['switched', true]);
    await page.evaluate(() => window.__release());
    await page.waitForFunction(() => !s0SaveInFlight);
    await page.evaluate(() => { s0Check(true); });
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
    await ready(page);
    expect(await draft(page, 'autosave.working')).toEqual({ px: [0, 0, 255, 255], by: 'u1' });
  });

  test('the editor closed with its drawing\'s save still being written: the button waits for that write, then reloads', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    const loads = counting(page);
    await changeAndHold(page, true);
    await page.evaluate(() => { closeEditor(); if (!s0SaveInFlight) throw new Error('the closing save is not in flight'); s0Check(true); });
    await page.waitForTimeout(1000);
    expect([loads.n, await page.evaluate(() => s0Held())]).toEqual([0, 'switched']);
    await page.click('#s0reload');
    await page.waitForTimeout(1000);
    expect(loads.n, 'the press waits for the closing write').toBe(0);
    expect(await page.evaluate(() => [!!s0SaveInFlight, $('s0reload').disabled, $('s0reload').textContent])).toEqual([true, true, 'Saving...']);
    await page.evaluate(() => window.__release());
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
    await ready(page);
    expect(await draft(page, 'autosave.working')).toEqual({ px: [0, 0, 255, 255], by: 'u1' });
  });

  /* THE SIGN-OUT'S WAIT (Finding 1). Cut short, the sign-out never ran:
     chatnft.ws still named the leaving account's group, and its invite
     stayed. The bar sits above the sign-in scrim, so its button can be
     pressed in the wait (Finding 2): it says to press again. */
  test('a sign-out waiting for the drawing\'s save: no reload, the button says to wait, and the sign-out ends on no group', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await onTeam7(page);
    const loads = counting(page);
    await changeAndHold(page, true);
    await page.evaluate(() => { closeEditor(); if (!s0SaveInFlight) throw new Error('the closing save is not in flight'); s0Check(true); });
    await page.waitForTimeout(1000);
    expect([loads.n, await page.evaluate(() => s0Held())]).toEqual([0, 'switched']);
    /* Through the account panel, as a person signs out, then the bar redrawn
       as the tab message ("migrating") redraws it. */
    expect(await page.evaluate(async () => {
      $('acctpanel').hidden = true; acctToggle();
      await new Promise(r => setTimeout(r, 100));
      $('cloudout').click();
      if (!s0SignOutWait) throw new Error('sign-out is not waiting for the save');
      s0Show();
      return { waiting: !!s0SignOutWait, held: s0Held(), shown: !$('s0bar').hidden, button: !$('s0reload').hidden };
    })).toEqual({ waiting: true, held: 'switched', shown: true, button: true });
    await page.waitForTimeout(1000);
    expect(loads.n, 'no reload in the sign-out\'s wait').toBe(0);
    await page.click('#s0reload');
    expect(await page.evaluate(() => [$('toast').textContent, !!s0SignOutWait, $('s0reload').disabled])).toEqual([
      'Saving your drawing first - press Reload again in a moment', true, false]);
    await page.waitForTimeout(500);
    expect(loads.n, 'the press in the wait does not reload').toBe(0);
    await page.evaluate(() => { if (!s0SaveInFlight || !s0SignOutWait) throw new Error('the wait ended before the save was released'); window.__release(); });
    await page.waitForFunction(() => !s0SignOutWait);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ({ activeWs, storedWs: localStorage.getItem('chatnft.ws'), shown: !$('s0bar').hidden, button: !$('s0reload').hidden })))
      .toEqual({ activeWs: null, storedWs: null, shown: false, button: false });
    expect(loads.n, 'and none after it').toBe(0);
    const inTeam7 = await page.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; try { const d = await dbGet('autosave.working'); return d ? d.by || null : 'none'; } finally { activeWs = null; dbp = null; dbpName = null; } });
    expect(inTeam7, 'the drawing landed in the group, by its maker').toBe('u1');
  });

  /* THE WAITS, NAMED (Finding 1). Today each wait exists only while a save is
     in flight, so the save alone holds the reload; s0Busy reads the waits
     too, so a change to when they wait cannot reopen the gap. Set here with
     no save anywhere, which today's page does not make, to pin that it
     reads them - a switch to My page waits with s0WsWant === null. */
  test('a sign-out or a switch waiting, even with no save in flight, holds the reload - a switch to My page included', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0Reload === 'function');
    await signIn(page);
    await page.evaluate(() => { try { authed = true; } catch (_) {} gateShow(false); activeWs = null; });
    const loads = counting(page);
    const hold = (page, which) => page.evaluate((which) => {
      if (which === 'signOut') s0SignOutWait = new Promise(() => {});
      else if (which === 'toGroup') s0WsWant = 'team7';
      else if (which === 'toMine') s0WsWant = null;
      if (s0SaveInFlight || autoPending || !$('app').hidden) throw new Error('something else is in hand');
    }, which);
    const letGo = (page) => page.evaluate(() => { s0SignOutWait = null; s0WsWant = undefined; });
    await hold(page, 'signOut');
    await page.evaluate(() => { s0Check(true); });
    await page.waitForTimeout(1000);
    expect([loads.n, await page.evaluate(() => s0Held())], 'a sign-out waiting').toEqual([0, 'switched']);
    for (const which of ['toGroup', 'toMine']) {
      await letGo(page);
      await hold(page, which);
      await page.evaluate(() => { s0Show(); });
      await page.waitForTimeout(500);
      expect(loads.n, which === 'toMine' ? 'a switch to My page waiting' : 'a switch to a group waiting').toBe(0);
    }
    /* THE CONTROL: nothing waiting, the same redraw reloads. */
    await letGo(page);
    await page.evaluate(() => { s0Show(); });
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
  });

  /* A DRAFT WRITE THAT FAILED (Finding 7). autosaveNow resolves false and
     says "copy it out with Download"; a reload would wipe the canvas and
     the warning. */
  test('a draft write storage refuses: the press does not reload, and the warning stays; the same press reloads once it is taken', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    const loads = counting(page);
    await readWithTheEditorOpen(page);
    await changeAndHold(page, false);
    await page.evaluate(() => { window.__dbPut = dbPut; dbPut = () => Promise.reject(new Error('refused')); });
    await page.click('#s0reload');
    await page.waitForTimeout(1000);
    expect(loads.n, 'no reload over a write that failed').toBe(0);
    expect(await page.evaluate(() => [$('toast').textContent, $('s0reload').disabled, $('s0reload').textContent])).toEqual([
      'Could not save your work to this browser - copy it out with Download before closing the tab.', false, 'Reload']);
    /* THE CONTROL: storage takes the write again. */
    await page.evaluate(() => { dbPut = window.__dbPut; });
    await page.click('#s0reload');
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
    await ready(page);
    expect(await draft(page, 'autosave.working')).toEqual({ px: [0, 0, 255, 255], by: 'u1' });
  });

  /* A PRESS FOR A STORE OR ACCOUNT THAT HAS GONE (the verifier's missed
     item). The bar goes with the account (Task 11); a press it can no longer
     take is made anyway here, as by a bar any path left up. Written, the
     draft was stamped with nobody over the one sessionEnded's final save
     kept (Task 10 item 6), or filed in My page after a sign-out. */
  test('a session the server ends with the editor open: the bar goes, and a press then writes nothing and does not reload', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { activeWs = null; dbp = null; dbpName = null; });
    const loads = counting(page);
    await readWithTheEditorOpen(page);
    await changeAndHold(page, false);
    expect(await page.evaluate(async () => {
      sbSaveSession(null); sessionEnded();   /* its final save takes u1 before the uid goes */
      const g = s0SaveInFlight; if (g) await g;
      const d = await dbGet('autosave.working');
      return { by: d ? d.by || null : 'none', held: s0Held(), shown: !$('s0bar').hidden, button: !$('s0reload').hidden, editor: !$('app').hidden };
    })).toEqual({ by: 'u1', held: null, shown: false, button: false, editor: true });
    await page.evaluate(() => { ctx.fillStyle = 'rgb(0,255,0)'; ctx.fillRect(6, 6, 1, 1); document.getElementById('s0reload').click(); });
    await page.waitForTimeout(1000);
    expect(loads.n).toBe(0);
    expect(await page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); const d = await dbGet('autosave.working'); return d ? d.by || null : 'none'; }), 'the draft keeps its maker').toBe('u1');
  });

  test('signed out after closing a drawing in a group: the bar goes, and a press then writes nothing into My page and does not reload', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { clearTimeout(autoPending); autoPending = null; });
    await onTeam7(page);
    const loads = counting(page);
    await readWithTheEditorOpen(page);
    await changeAndHold(page, false);
    expect(await page.evaluate(async () => {
      activeWs = null; dbp = null; dbpName = null;
      const mine = (await dbAll()).filter(i => i.kind === 'autosave').length;
      activeWs = 'team7'; dbp = null; dbpName = null;
      await closeEditor();   /* the drawing lands in team7 */
      cloudSignOut();        /* nothing waiting: at once */
      return { mine, activeWs, storedWs: localStorage.getItem('chatnft.ws'), held: s0Held(), shown: !$('s0bar').hidden, button: !$('s0reload').hidden };
    })).toEqual({ mine: 0, activeWs: null, storedWs: null, held: null, shown: false, button: false });
    await page.evaluate(() => { document.getElementById('s0reload').click(); });
    await page.waitForTimeout(1000);
    expect(loads.n).toBe(0);
    expect(await page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); return (await dbAll()).filter(i => i.kind === 'autosave').map(i => i.id); }),
      'nothing written into My page').toEqual([]);
  });

  test('THE CONTROL: the same closed drawing, still signed in: the press reloads, and the drawing is in the group, by its maker', async ({ page }) => {
    await serve(page, { protocol: 2 });
    await openTrait(page, { w: 16, h: 16, draw: (set) => { set(1, 1, [255, 0, 0]); } });
    await signIn(page);
    await page.evaluate(() => { clearTimeout(autoPending); autoPending = null; });
    await onTeam7(page);
    const loads = counting(page);
    await readWithTheEditorOpen(page);
    await changeAndHold(page, false);
    await page.evaluate(async () => { await closeEditor(); });
    expect(await page.evaluate(() => [s0Held(), !$('s0reload').hidden])).toEqual(['switched', true]);
    await page.click('#s0reload');
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
    await ready(page);
    expect(await page.evaluate(() => activeWs), 'back on the group').toBe('team7');
    expect(await draft(page, 'autosave.working')).toEqual({ px: [0, 0, 255, 255], by: 'u1' });
  });

  /* Final fixes, B2. A PERSON'S OWN OPERATION IS IN HAND. A layer rename in
     a group sends trait by trait, and each send reads the protocol first;
     on a project that switched before this tab read it, the rename's own
     first send is the read that finds protocol 2. The page reloaded then,
     in the middle of the loop: the traits not yet reached stayed on the
     old layer, drawings were left under ids no trait has, one moved trait
     was marked synced and never sent, and no marks, rules or layer list
     were written (measured by the final review, 3 of 3 runs). The rename
     is in hand now: it finishes - every trait moved and kept unsent, every
     drawing offered, the marks and the layer list written - and the page
     reloads once it has. team7 holds cap, hood and visor on hats, synced,
     each with a drawing newer than its saved picture; the store is read
     after the reload, by name. */
  const seedRename = (page) => page.evaluate(async () => {
    LAYERS = ['hats', 'skins', 'unsorted'];
    await dbPut({ id: 'settings.layers', kind: 'settings', at: 1, layers: ['hats', 'skins', 'unsorted'], hidden: [] });
    const blob = () => new Blob([new Uint8Array(16)], { type: 'image/png' });
    let i = 0;
    for (const n of ['cap', 'hood', 'visor']) {
      i++;
      await dbPut({ id: 't_' + n + '_hats_wip', kind: 'trait', name: n, layer: 'hats', status: 'wip', blob: blob(), w: 16, h: 16, rarity: 1, at: 1000,
        shelfOrder: i, rowId: 'row-' + i, rowAt: '2026-01-01T00:00:00+00:00', path: 'team7/c1/trait-' + n + '-hats-wip.png', synced: true });
      await dbPut({ id: 'autosave.t_' + n + '_hats_wip', kind: 'autosave', traitId: 't_' + n + '_hats_wip', name: n + '.png', w: 16, h: 16, blob: blob(), at: 5000 });
    }
    await renderShelf();
    /* A fresh tab: nothing read yet, no reload made. */
    s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
    s0Seen2.clear();
    sessionStorage.clear();
  });
  const team7Store = (page) => page.evaluate(async () => {
    const d = await new Promise((res, rej) => { const r = indexedDB.open('chatnft.ws.team7', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise((res, rej) => { const t = d.transaction('items', 'readonly'); const q = t.objectStore('items').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); });
    d.close();
    const traits = all.filter(x => x.kind === 'trait');
    return {
      traits: traits.map(x => x.id + (x.synced ? ' synced' : ' unsent')).sort(),
      /* Offered: a drawing under its trait's id, newer than the trait (the open path takes only a newer one). */
      offered: traits.map(t => { const d = all.find(x => x.id === 'autosave.' + t.id); return t.name + (d && d.at > (t.at || 0) ? ' offered' : ' none'); }).sort(),
      orphans: all.filter(x => x.kind === 'autosave' && x.traitId && !traits.some(t => t.id === x.traitId)).map(x => x.id),
      layers: (all.find(x => x.id === 'settings.layers') || {}).layers,
      moves: ((all.find(x => x.id === 'settings.gonemarks') || {}).marks || []).filter(m => m.what === 'moved').map(m => m.from.id + ' -> ' + m.to.id).sort(),
    };
  });

  test('a layer rename whose first send finds protocol 2 finishes - every trait moved, every drawing offered, marks and layer list written - and reloads only after', async ({ page }) => {
    await serve(page, { protocol: 2 });
    /* The rename looks its collection up before each send (named, not the catch-all). */
    await page.route(/\/rest\/v1\/collections\?select=id,layers/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify([{ id: 'c1', layers: ['hats', 'skins', 'unsorted'], rules: [], decisions: [], decide_order: [], empty_chance: null, rules_at: null }]) }));
    await page.goto('/index.html');
    await ready(page);
    await signIn(page);
    await onTeam7(page);
    await seedRename(page);
    const loads = counting(page);
    await page.evaluate(() => { window.__renaming = renameLayer('hats', 'caps'); });
    await expect.poll(() => loads.n, { timeout: 20000 }).toBe(1);
    await ready(page);
    expect(await team7Store(page)).toEqual({
      traits: ['t_cap_caps_wip unsent', 't_hood_caps_wip unsent', 't_visor_caps_wip unsent'],
      offered: ['cap offered', 'hood offered', 'visor offered'], orphans: [],
      layers: ['caps', 'skins', 'unsorted'],
      moves: ['t_cap_hats_wip -> t_cap_caps_wip', 't_hood_hats_wip -> t_hood_caps_wip', 't_visor_hats_wip -> t_visor_caps_wip'] });
    await page.waitForTimeout(2000);
    expect(loads.n, 'once').toBe(1);
  });
});
