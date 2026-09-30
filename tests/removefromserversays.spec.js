/* FOLLOW-UP D: REMOVE FROM SERVER SAYS WHAT HAPPENED, AND WHO MAY PRESS IT
   (patch612; the follow-up plan's S12 and S15, and the owner's answers of
   2026-09-29 to questions 1 and 2).

   Each was measured on 91eb861's page first, by these tests:
   - S12. The role read had no deadline: a read that never answered kept
     the button disabled, and nothing was said, for as long as the browser
     waited.
   - S15. cloudRole sat between the "ONE AT A TIME" comment and clearCloud,
     the function that comment describes.
   - Owner's answer 1 (P6): "Any member may remove it" - a group whose owner
     has left. A member of such a group was told only the owner can, and no
     one could ever remove it. A member's press now also asks whether the
     group still has an owner; measured on the SQL harness (the report has
     the rows), that read answers [] once the owner has left.
   - Owner's answer 2 (P7): the button is "Remove from server", and its hover
     text is the page's own.

   On armStage0's stand-in (tests/helpers.js, imported, not edited), with the
   server holding two rows and two pictures (removeowner.spec.js's `holding`,
   copied), and the owner read - team_members with role=eq.owner - answered
   here: `owners` 'none' ([]), 'one' ([{role:'owner'}]), 'ignored' (a row
   that is not an owner's, as a reply that ignored the filter would give),
   500, or 'hang'. armStage0 answers every team_members read by its role
   option, so this answers the owner read after it has been logged there. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { armStage0 } from './helpers.js';

const MEMBER = "Only this project's owner can remove it from the server. Your copy on this device is untouched.";
const UNKNOWN = 'Could not check who owns this project, so nothing was changed.';
const OWNERLESS = 'This project has no owner now, so any member may remove it from the server.';
const DONE = 'The server copy is gone. 2 pictures removed from storage.';
const ROLE_READ = 'GET /rest/v1/team_members?select=role&team_id=eq.team7&user_id=eq.u1';
const OWNER_READ = 'GET /rest/v1/team_members?select=role&team_id=eq.team7&role=eq.owner&limit=1';
const TITLE_OWN = 'Removes your project from the server. Your copy on this device is kept.';
const TITLE_GROUP = 'Removes this project from the server for everyone in the group. Only its owner can - or any member, once it has no owner. Every device keeps its own copy.';
const isDelete = (l) => l.startsWith('DELETE ');

const holding = (page, o = {}) => page.evaluate((o) => {
  const inner = window.fetch;
  const st = { rows: 2, files: ['trait-cap-hats-wip.png', 'trait-visor-hats-wip.png'] };
  const json = (x, st2, h) => new Response(JSON.stringify(x), { status: st2 || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  const never = () => new Promise(() => {});
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const own = s.indexOf('/rest/v1/team_members?') >= 0 && s.indexOf('&user_id=eq.') >= 0;
    const owner = s.indexOf('/rest/v1/team_members?') >= 0 && s.indexOf('role=eq.owner') >= 0;
    const r = await inner(u, io);
    if (own && o.roleHang) return never();
    if (owner) {
      if (o.owners === 'hang') return never();
      if (o.owners === 500) return json({ code: 'XX000', message: 'down' }, 500);
      if (o.owners === 'none') return json([]);
      if (o.owners === 'ignored') return json([{ role: 'member' }]);
      if (o.owners === 'one') return json([{ role: 'owner' }]);
    }
    if (m === 'GET' && s.indexOf('/rest/v1/traits?select=id&collection_id=') >= 0) return json([], 200, { 'Content-Range': '0-0/' + st.rows });
    if (m === 'POST' && s.indexOf('/storage/v1/object/list/traits') >= 0) {
      const off = JSON.parse((io && io.body) || '{}').offset || 0;
      return json(off > 0 ? [] : st.files.map(name => ({ name })));
    }
    if (m === 'DELETE' && s.indexOf('/storage/v1/object/traits') >= 0 && r.ok) st.files = [];
    if (m === 'DELETE' && s.indexOf('/rest/v1/traits?collection_id=') >= 0 && r.ok) st.rows = 0;
    return r;
  };
}, o);

/* Presses it, with the confirm answered yes in the page and the note read
   as it was when the confirm was asked; settles or says it is still
   waiting after `wait` ms. */
const press = (page, wait = 3000) => page.evaluate(async (wait) => {
  const asked = [], real = window.confirm;
  window.confirm = (m) => { asked.push({ m, note: document.getElementById('cloudnote').textContent }); return true; };
  const t0 = Date.now();
  let how;
  try { how = await Promise.race([clearCloud().then(() => 'settled'), new Promise(res => setTimeout(() => res('still waiting'), wait))]); }
  finally { window.confirm = real; }
  const b = document.getElementById('cloudclear');
  return { how, ms: Date.now() - t0, asked, log: window.__s0.log.slice(), unknown: window.__s0.unknown.slice(),
    note: document.getElementById('cloudnote').textContent, disabled: b.disabled, busy: clearingCloud };
}, wait);

test.describe('Remove from server says what happened, and who may press it', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof clearCloud === 'function' && typeof s0Refuse === 'function');
  });

  /* ---- S12 ---------------------------------------------------------------- */
  test('S12: a role read that never answers - after the deadline the note says it could not check, and the button is back', async ({ page }) => {
    await armStage0(page);
    await holding(page, { roleHang: true });
    const r = await press(page, 9000);
    expect(r.how, 'the press ends by itself').toBe('settled');
    expect(r.ms, 'at the deadline, not before').toBeGreaterThanOrEqual(5900);
    expect(r.log).toEqual([ROLE_READ]);
    expect(r.asked).toEqual([]);
    expect(r.note).toBe(UNKNOWN);
    expect(r.disabled, 'the button is enabled again').toBe(false);
    expect(r.busy).toBe(false);
    expect(r.unknown).toEqual([]);
  });

  test('S12: a member\'s owner read that never answers - the same', async ({ page }) => {
    await armStage0(page, { role: 'member' });
    await holding(page, { owners: 'hang' });
    const r = await press(page, 9000);
    expect(r.how).toBe('settled');
    expect(r.log).toEqual([ROLE_READ, OWNER_READ]);
    expect(r.asked).toEqual([]);
    expect(r.note).toBe(UNKNOWN);
    expect(r.disabled).toBe(false);
    expect(r.unknown).toEqual([]);
  });

  /* ---- P6 ----------------------------------------------------------------- */
  test('P6: a member of a group whose owner has left may remove it - told so, asked, and the project is removed', async ({ page }) => {
    await armStage0(page, { role: 'member' });
    await holding(page, { owners: 'none' });
    const r = await press(page);
    expect(r.how).toBe('settled');
    expect(r.log.slice(0, 2), 'the role, then whether the group has an owner').toEqual([ROLE_READ, OWNER_READ]);
    expect(r.asked.length, 'the confirm is shown').toBe(1);
    expect(r.asked[0].m, 'the group confirm').toContain('everyone');
    expect(r.asked[0].note, 'and the note said why a member may').toBe(OWNERLESS);
    const files = r.log.indexOf('DELETE /storage/v1/object/traits');
    const rows = r.log.indexOf('DELETE /rest/v1/traits?collection_id=eq.c1');
    expect(files, 'the storage sweep went out').toBeGreaterThan(-1);
    expect(rows, 'and the rows DELETE, after it').toBeGreaterThan(files);
    expect(r.note).toBe(DONE);
    expect(r.disabled).toBe(false);
    expect(r.unknown).toEqual([]);
  });

  test('P6 control: a member of a group that has an owner is told it is the owner\'s - the two reads, and nothing else', async ({ page }) => {
    await armStage0(page, { role: 'member' });
    await holding(page, { owners: 'one' });
    const r = await press(page);
    expect(r.log).toEqual([ROLE_READ, OWNER_READ]);
    expect(r.asked).toEqual([]);
    expect(r.log.filter(isDelete)).toEqual([]);
    expect(r.note).toBe(MEMBER);
    expect(r.disabled).toBe(false);
    expect(r.unknown).toEqual([]);
  });

  test('P6: a reply to the owner read that holds any row refuses - a filter ignored never grants', async ({ page }) => {
    await armStage0(page, { role: 'member' });
    await holding(page, { owners: 'ignored' });
    const r = await press(page);
    expect(r.log).toEqual([ROLE_READ, OWNER_READ]);
    expect(r.asked).toEqual([]);
    expect(r.note).toBe(MEMBER);
  });

  test('P6: the owner read fails - could not check, and nothing is sent', async ({ page }) => {
    await armStage0(page, { role: 'member' });
    await holding(page, { owners: 500 });
    const r = await press(page);
    expect(r.log).toEqual([ROLE_READ, OWNER_READ]);
    expect(r.asked).toEqual([]);
    expect(r.note).toBe(UNKNOWN);
    expect(r.unknown).toEqual([]);
  });

  test('P6: no membership row at all - the owner read is not asked, and it is not ours to remove', async ({ page }) => {
    await armStage0(page, { role: 'none' });
    await holding(page, { owners: 'none' });
    const r = await press(page);
    expect(r.log, 'a group with no owner is concluded only for a member').toEqual([ROLE_READ]);
    expect(r.asked).toEqual([]);
    expect(r.note).toBe(MEMBER);
  });

  test('P6: the owner is asked nothing more than before', async ({ page }) => {
    await armStage0(page);
    await holding(page, { owners: 'none' });
    const r = await press(page);
    expect(r.log.filter(l => l.indexOf('/rest/v1/team_members') >= 0)).toEqual([ROLE_READ]);
    expect(r.asked.length).toBe(1);
    expect(r.asked[0].note, 'no ownerless note for the owner').not.toBe(OWNERLESS);
    expect(r.note).toBe(DONE);
  });

  /* ---- P7 ----------------------------------------------------------------- */
  test('P7: the button is named Remove from server, and its hover text is the page\'s own', async ({ page }) => {
    const first = await page.evaluate(() => {
      const b = document.getElementById('cloudclear');
      return { text: b.textContent, title: b.getAttribute('title') };
    });
    expect(first.text).toBe('Remove from server');
    expect(first.title, 'as the page opens, on your own page').toBe(TITLE_OWN);
    await armStage0(page, { ws: null });
    const titles = await page.evaluate(async () => {
      const b = document.getElementById('cloudclear');
      const out = {};
      await cloudRender(); out.own = b.getAttribute('title'); out.shown = !b.hidden;
      await wsSwitch('team7'); out.group = b.getAttribute('title');
      await wsSwitch(null); out.back = b.getAttribute('title');
      activeWs = 'team7'; b.title = 'stale';
      await cloudRender(); out.groupRender = b.getAttribute('title');
      activeWs = null;
      return out;
    });
    expect(titles.shown, 'the button is shown, signed in').toBe(true);
    expect(titles.own).toBe(TITLE_OWN);
    expect(titles.group, 'on a group page, after a switch').toBe(TITLE_GROUP);
    expect(titles.back, 'and back on your page').toBe(TITLE_OWN);
    expect(titles.groupRender, 'set where the button is shown too').toBe(TITLE_GROUP);
  });

  test('P7: a switch while the server cannot be reached still gives the button the page\'s words', async ({ page }) => {
    /* cloudRender returns early when it cannot ask (state "unknown"), before
       it shows the button; the switch sets the words itself. */
    await armStage0(page, { ws: null });
    const t = await page.evaluate(async () => {
      const b = document.getElementById('cloudclear');
      await cloudRender();
      const inner = window.fetch, render = window.cloudRender, renders = [];
      window.fetch = async (u, io) => { if (String(u).indexOf('/auth/v1/user') >= 0) throw new TypeError('Failed to fetch'); return inner(u, io); };
      window.cloudRender = async (...a) => { const v = await render(...a); renders.push(v === null ? 'could not ask' : 'asked'); return v; };
      const before = b.getAttribute('title');
      try { await wsSwitch('team7'); } finally { window.fetch = inner; window.cloudRender = render; }
      const after = b.getAttribute('title');
      return { before, after, renders };
    });
    expect(t.renders, 'the switch\'s render could not ask').toEqual(['could not ask']);
    expect(t.before).toBe(TITLE_OWN);
    expect(t.after).toBe(TITLE_GROUP);
  });

  /* ---- S15 ---------------------------------------------------------------- */
  test('S15: the "ONE AT A TIME" comment sits on clearingCloud and clearCloud, and cloudRole is above it', () => {
    const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const one = page.indexOf('/* ONE AT A TIME, taken on the first synchronous line.');
    expect(one, 'the comment is there').toBeGreaterThan(0);
    const end = page.indexOf('*/', one) + 2;
    const after = page.slice(end, end + 200).split('\n').filter(l => l.trim() !== '');
    expect(after.slice(0, 2), 'the next code is the lock and the function it describes').toEqual(['let clearingCloud=false;', 'async function clearCloud(){']);
    const role = page.indexOf('async function cloudRole(){');
    expect(role, 'cloudRole is there').toBeGreaterThan(0);
    expect(role < one, 'and above the comment').toBe(true);
  });
});
