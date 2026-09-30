/* FOLLOW-UP D: COPIES KEPT AFTER LEAVE ARE CLEARED SAFELY, AND LISTED
   (patch612; the owner's answer of 2026-09-29 to question 3, "Clear safely,
   plus a list").

   Leave clears the group's copy when nothing is unsent (about 66 MB a
   group). When it kept it - another tab had it open, a tab from before this
   update had it, the page still showed it, the check failed, this tab was
   still writing, or it held unsent work - nothing ever cleared it later
   (measured on 91eb861's page by the first test). Now:
   - a copy Leave keeps is written down, and is cleared by itself the next
     time the team list is read, once nothing in it is unsent and no tab
     holds it - by the same s0DeleteIfAlone that Leave uses;
   - "Projects you have left" (headed "Group projects kept on this device"
     since fix round 1), in the account panel, lists each such copy
     with its size and a Clear button, which never clears a copy with
     unsent work and says so instead;
   - a project rejoined is taken off the list, and its copy kept;
   - a group copy on this device that was never written down (kept by a
     Leave before this update) is listed, and cleared only by its button;
   - (fix round 1) and the words say so: the panel's note speaks only of
     copies left here since this update, and a copy never written down says
     on its own row that it is not cleared by itself.

   The stand-in is stage0leave.spec.js's, copied (Ruling F-15), with the
   trait unsent on request; `serve` answers the team list for the reads
   after the Leave. */
import { test, expect } from '@playwright/test';

const arm = (page, o = {}) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  s0State = { db: null, uid: null, protocol: 1, switching: false, ok: false, at: 0 };
  await dbClear();
  await dbPut({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved', blob: new Blob([new Uint8Array(40000)]),
    w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-1', path: 'team7/c1/trait-cap-hats-approved.png', synced: !o.unsent });
  localStorage.setItem('chatnft.session', JSON.stringify({ access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  sessionStorage.setItem('pb.s0.reloaded.chatnft.ws.team7.u1', '1');
  const L = window.__L = { unknown: [], said: [], left: false, real: { fetch: window.fetch, confirm: window.confirm, toast: window.toast } };
  window.__unknown = L.unknown;
  window.__teams = [{ id: 'me', name: 'Me', personal: true }, { id: 'team7', name: 'Seven', personal: false }, { id: 'team8', name: 'Eight', personal: false }];
  const json = (x, st, h) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('select=id,protocol,switching_at') >= 0) return json([{ id: 'c1', protocol: 1, switching_at: null }]);
    if (s.indexOf('/rpc/leave_team') >= 0) {
      L.left = true;
      window.__teams = window.__teams.filter(t => t.id !== 'team7');
      return json(null);
    }
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rpc/team_member_names') >= 0) return json([]);
    if (s.indexOf('/rest/v1/teams') >= 0) return json(window.__teams);
    if (s.indexOf('/rest/v1/collections') >= 0) return json([{ id: 'c1', layers: ['hats'] }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'GET') return json([], 200, { 'Content-Range': '0-0/0' });
    if (s.indexOf('/storage/v1/object/list/') >= 0) return json([]);
    L.unknown.push(m + ' ' + s.replace(/^https?:\/\/[^/]+/, ''));
    return json({ code: 'UNROUTED' }, 501);
  };
  window.confirm = () => true;
  window.toast = (m) => L.said.push(m);
  /* The dropdown as the page has it once signed in: the project is named there. */
  await wsRender();
}, o);

const leave = async (page, o) => {
  await arm(page, o);
  await page.evaluate(() => wsLeave());
  return page.evaluate(() => window.__L.said.join(' | '));
};
const dbs = (page) => page.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
const record = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pb.left') || 'null'));
/* The team list read again - as every sign-in, render, switch and panel
   opening does - and whatever that starts left to finish. */
const readTheList = (page) => page.evaluate(async () => {
  await wsRender();
  for (let i = 0; i < 200 && typeof s0LeftTidying !== 'undefined' && s0LeftTidying; i++) await new Promise(r => setTimeout(r, 25));
});
const openPanel = (page) => page.evaluate(() => { document.getElementById('acctpanel').hidden = false; });
const listed = (page) => page.evaluate(() => {
  const box = document.getElementById('wsleft');
  if (!box) return null;
  return { hidden: box.hidden, note: (box.querySelector('.note') || {}).textContent, rows: [...document.querySelectorAll('#wsleftlist li')].map(li => ({
    db: li.dataset.db, name: li.querySelector('.leftname').textContent, size: li.querySelector('.leftsize').textContent,
    said: li.querySelector('.leftsaid').textContent })) };
});
const openElsewhere = async (context) => {
  const other = await context.newPage();
  await other.goto('/index.html');
  await other.waitForFunction(() => typeof s0CloseAll === 'function');
  await other.evaluate(async () => { activeWs = 'team7'; dbp = null; dbpName = null; await dbAll(); });
  return other;
};
const SIZE = /^\d+(\.\d)? (KB|MB)$/;
/* FIX ROUND 1 (review of ce6d786): the panel's note said "A copy with
   nothing unsent is cleared by itself once no tab has it open" above every
   row, and a copy never written down is not (test 6 pins that; measured on
   ce6d786's page by the review's probe, and again before this fix). The
   note now speaks only of copies left here since this update, and a copy
   never written down says on its own row that it is not cleared by itself. */
const NOTE = 'Group projects kept on this device. A copy you left here since this update, with nothing unsent, is cleared by itself once no tab has it open.';
const UNNOTED = 'Not cleared by itself: this device has no note of you leaving it - as after a Leave before this update, or on another device - and another account here may be in it. Press Clear to remove it from this device.';

test.describe('copies kept after Leave', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof s0DeleteIfAlone === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; localStorage.removeItem('chatnft.session'); }).catch(() => {});
  });

  test('a copy kept because another tab had it open is written down, and cleared by itself once that tab has closed', async ({ page, context }) => {
    const other = await openElsewhere(context);
    const said = await leave(page, {});
    expect(said).toContain('another BuildaNFT tab has it open');
    expect(await dbs(page)).toContain('chatnft.ws.team7');
    const rec = await record(page);
    expect(rec && rec['chatnft.ws.team7'], 'written down as left').toMatchObject({ team: 'team7', name: 'Seven', uid: 'u1' });
    /* Still open there: the list read tidies nothing. */
    await readTheList(page);
    expect(await dbs(page), 'kept while that tab has it').toContain('chatnft.ws.team7');
    await other.close();
    await expect.poll(async () => { await readTheList(page); return (await dbs(page)).includes('chatnft.ws.team7'); },
      { message: 'cleared once that tab has gone' }).toBe(false);
    expect(await record(page), 'and forgotten').toBe(null);
    expect(await page.evaluate(() => window.__L.unknown)).toEqual([]);
  });

  test('a kept copy with unsent work is never cleared by itself, and stays written down', async ({ page }) => {
    const said = await leave(page, { unsent: true });
    expect(said).toContain('what the group has not got is kept on this device');
    expect((await record(page) || {})['chatnft.ws.team7'], 'written down as left').toBeTruthy();
    await readTheList(page);
    await readTheList(page);
    expect(await dbs(page)).toContain('chatnft.ws.team7');
    expect((await record(page) || {})['chatnft.ws.team7']).toBeTruthy();
  });

  test('the list names each project left with its size; Clear says why it will not clear a copy another tab has open, and clears it once that tab has gone', async ({ page, context }) => {
    const other = await openElsewhere(context);
    await leave(page, {});
    await openPanel(page);
    await readTheList(page);
    await expect.poll(async () => { const l = await listed(page); return l && l.rows.length === 1 && SIZE.test(l.rows[0].size); },
      { message: 'one row, measured' }).toBe(true);
    const l = await listed(page);
    expect(l.hidden).toBe(false);
    expect(l.rows[0]).toMatchObject({ db: 'chatnft.ws.team7', name: 'Seven' });
    /* Fix round 1, the control for test 6: a copy written down carries no
       "not cleared by itself" line - it is cleared by itself (test 1). */
    expect(l.rows[0].said, 'a copy written down says nothing before Clear is pressed').toBe('');
    expect(l.note).toBe(NOTE);
    await page.locator('#wsleftlist li button').click();
    await expect.poll(async () => (await listed(page)).rows[0].said).toBe('Not cleared: another BuildaNFT tab has it open. Close that tab, then press Clear again.');
    expect(await dbs(page)).toContain('chatnft.ws.team7');
    await other.close();
    await expect.poll(async () => {
      const l2 = await listed(page);
      if (l2.rows.length) await page.locator('#wsleftlist li button').click();
      return (await dbs(page)).includes('chatnft.ws.team7');
    }, { message: 'Clear clears it once that tab has gone' }).toBe(false);
    await expect.poll(async () => (await listed(page)).hidden, { message: 'and the list has nothing left to show' }).toBe(true);
    expect(await page.evaluate(() => window.__L.said.slice(-1)[0])).toBe('Cleared from this device.');
    expect(await record(page)).toBe(null);
  });

  test('Clear never clears a copy with unsent work - it says so', async ({ page }) => {
    await leave(page, { unsent: true });
    await openPanel(page);
    await readTheList(page);
    await expect.poll(async () => { const l = await listed(page); return l && l.rows.length; }).toBe(1);
    await page.locator('#wsleftlist li button').click();
    await expect.poll(async () => (await listed(page)).rows[0].said)
      .toBe('Not cleared: this copy holds work the group has not got. Rejoin the project to send it.');
    expect(await dbs(page)).toContain('chatnft.ws.team7');
    expect((await record(page) || {})['chatnft.ws.team7']).toBeTruthy();
  });

  test('a project rejoined is taken off the list, and its copy is kept', async ({ page, context }) => {
    const other = await openElsewhere(context);
    await leave(page, {});
    await other.close();
    await page.evaluate(() => { window.__teams.push({ id: 'team7', name: 'Seven', personal: false }); });
    await readTheList(page);
    await readTheList(page);
    expect(await record(page)).toBe(null);
    expect(await dbs(page), 'the rejoined project\'s copy is not cleared').toContain('chatnft.ws.team7');
  });

  test('a group copy never written down - kept before this update - is listed, not cleared by itself, and cleared by its button', async ({ page }) => {
    await arm(page, {});
    await page.evaluate(async () => {
      activeWs = 'team9'; dbp = null; dbpName = null;
      await dbPut({ id: 't_hat_hats_wip', kind: 'trait', name: 'hat', layer: 'hats', status: 'wip', blob: new Blob([new Uint8Array(2000000)]),
        w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-9', path: 'team9/c9/trait-hat-hats-wip.png', synced: true });
      (await dbp).close(); dbp = null; dbpName = null;
      activeWs = 'team7'; dbp = null; dbpName = null;
    });
    await readTheList(page);
    await readTheList(page);
    expect(await dbs(page), 'not cleared by itself: another account here may be in it').toContain('chatnft.ws.team9');
    expect(await listed(page), 'nothing drawn while the panel is shut').toMatchObject({ rows: [] });
    await openPanel(page);
    await readTheList(page);
    await expect.poll(async () => { const l = await listed(page); return l && l.rows.length === 1 && l.rows[0].size; }).toBe('1.9 MB');
    expect((await listed(page)).rows[0]).toMatchObject({ db: 'chatnft.ws.team9', name: 'A group project you are not in now' });
    /* Fix round 1: the words beside it are true of it. The note had said a
       copy with nothing unsent is cleared by itself - this one has nothing
       unsent, no tab has it, and it was not, three list reads above. */
    expect((await listed(page)).note, 'the note claims nothing about copies never written down').toBe(NOTE);
    expect((await listed(page)).rows[0].said, 'its own row says it is not cleared by itself').toBe(UNNOTED);
    expect(await dbs(page), 'still here after the list was read with the panel open').toContain('chatnft.ws.team9');
    await page.locator('#wsleftlist li button').click();
    await expect.poll(async () => (await dbs(page)).includes('chatnft.ws.team9')).toBe(false);
    expect(await page.evaluate(() => window.__L.said.slice(-1)[0])).toBe('Cleared from this device.');
  });
});
