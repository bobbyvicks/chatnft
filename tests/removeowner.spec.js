/* REMOVE FROM SERVER IS THE GROUP OWNER'S (Task 17: design decision E3,
   "owner only", applied to today's page by controller ruling F-04).

   WHY. Until this, any member of a group could press "Clear the cloud"
   (clearCloud, then clearCloudNow), and that removes every picture and
   every row of the group's project, for everyone. The design gives that
   power to the group's owner only.

   THE RULE LIVES IN THE PAGE ONLY, not in the database. Today's ordinary
   save deletes and then inserts trait rows under the same row-level-security
   policy, so a server rule refusing members' deletes would break every
   member's save. The server-side refusal arrives with the new design's
   clear_project in a later plan. Until then a member could still clear by
   hand-crafting requests, which any member can already do today.

   On a group page clearCloud asks the role first - a plain team_members
   read, made only there and never inside cloudRender - before the stage-0
   hold (s0Refuse, in clearCloudNow) and before any confirm. The owner goes
   on exactly as today. A member, no membership row, or a read that fails
   sends nothing more, and the note says which. On the personal page there
   is no role read.

   Every test runs on armStage0's stand-in, which answers every request by
   name and records any other in window.__s0.unknown (answered 501); each
   test asserts that list is empty. */
import { test, expect } from '@playwright/test';
import { armStage0, S0_SWITCHED, S0_REFUSED } from './helpers.js';

const MEMBER = "Only this project's owner can remove it from the server. Your copy on this device is untouched.";
const UNKNOWN = 'Could not check who owns this project, so nothing was changed.';
/* SUPERSEDED by follow-up D (owner's answer 2, P7): the button is "Remove
   from server", and its hover text is the page's own. This was the one text
   for both pages; test 7 now reads the page as it opens, on your own page.
   removefromserversays.spec.js pins the group page's text and the switch. */
const TITLE = 'Removes your project from the server. Your copy on this device is kept.';
const DONE = 'The server copy is gone. 2 pictures removed from storage.';
const MOVED = 'The page moved to another project, so nothing was changed.';
/* The role read, for group team7 and account u1 (armStage0's). */
const ROLE_READ = 'GET /rest/v1/team_members?select=role&team_id=eq.team7&user_id=eq.u1';
/* Follow-up D (owner's answer 1, P6): a member's press also asks whether the
   group still has an owner, because a group whose owner has left may be
   removed by any member. armStage0 answers every team_members read with its
   role option's row, so this read gets a row, which counts as an owner: the
   member tests below are still a member of a group that has one.
   removefromserversays.spec.js covers the group with no owner. */
const OWNER_READ = 'GET /rest/v1/team_members?select=role&team_id=eq.team7&role=eq.owner&limit=1';
const isRole = (l) => l.indexOf('/rest/v1/team_members') >= 0;
const isDelete = (l) => l.startsWith('DELETE ');
const isStorage = (l) => l.indexOf('/storage/v1/') >= 0;

/* The server holds two rows and two pictures, on top of armStage0: the row
   count (count=exact) and the storage listing answer from this state, and
   the two DELETEs empty it, so the clear's read-back sees what it did.
   armStage0 answers (and logs) every request first. */
const holding = (page) => page.evaluate(() => {
  const inner = window.fetch;
  const st = { rows: 2, files: ['trait-cap-hats-wip.png', 'trait-visor-hats-wip.png'] };
  const json = (x, h) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const r = await inner(u, io);
    if (m === 'GET' && s.indexOf('/rest/v1/traits?select=id&collection_id=') >= 0) return json([], { 'Content-Range': '0-0/' + st.rows });
    if (m === 'POST' && s.indexOf('/storage/v1/object/list/traits') >= 0) {
      const off = JSON.parse((io && io.body) || '{}').offset || 0;
      return json(off > 0 ? [] : st.files.map(name => ({ name })));
    }
    if (m === 'DELETE' && s.indexOf('/storage/v1/object/traits') >= 0 && r.ok) st.files = [];
    if (m === 'DELETE' && s.indexOf('/rest/v1/traits?collection_id=') >= 0 && r.ok) st.rows = 0;
    return r;
  };
  /* What a press left behind. */
  window.__t17state = () => {
    const b = document.getElementById('cloudclear');
    return {
      log: window.__s0.log.slice(), reads: window.__s0.reads, unknown: window.__s0.unknown.slice(),
      note: document.getElementById('cloudnote').textContent,
      disabled: b.disabled, busy: clearingCloud, bar: !document.getElementById('s0bar').hidden,
    };
  };
});

/* Presses it, as the button does, with the confirm answered by a dialog
   handler that accepts, and says what happened. */
const press = async (page) => {
  const asked = [];
  const on = (d) => { asked.push(d.message()); d.accept().catch(() => {}); };
  page.on('dialog', on);
  try {
    const out = await page.evaluate(async () => {
      const toasts = [], shown = window.toast;
      window.toast = (m) => { toasts.push(String(m)); try { shown(m); } catch (_) {} };
      try { await clearCloud(); } finally { window.toast = shown; }
      return Object.assign(window.__t17state(), { toasts });
    });
    return Object.assign(out, { asked });
  } finally { page.off('dialog', on); }
};

/* Nothing but the role read went out: no confirm, no DELETE, no storage
   call, no protocol read; the note says why and the button is back. */
const onlyTheRoleRead = (r, note, reads = [ROLE_READ]) => {
  expect(r.unknown, 'every request was one the stand-in names').toEqual([]);
  /* SUPERSEDED IN PART by follow-up D (P6): for a member, the role read and
     then the owner read (`reads`); for a failed read or no membership row,
     the role read alone, as before. */
  expect(r.log, 'exactly the role read (and, for a member, the owner read)').toEqual(reads);
  expect(r.asked, 'no confirm').toEqual([]);
  expect(r.log.filter(isDelete), 'no DELETE').toEqual([]);
  expect(r.log.filter(isStorage), 'no storage call').toEqual([]);
  expect(r.note).toBe(note);
  expect(r.disabled, 'the button is enabled again').toBe(false);
  expect(r.busy, 'and can be pressed again').toBe(false);
};

/* ---- Fix round 1: the whole clear stays on the project it was pressed on ----

   The owner's answer is for the project shown at the press. clearCloudNow
   then waits on the stage-0 read (s0Refuse) and on sbUser before it reads
   the team, so a move in either window aimed the whole clear at the project
   moved to (measured by the review on 0a8a489: team8's three pictures and
   its rows deleted on team7's owner answer; the same from the personal
   page). These tests hold one request unanswered, move the page to team8,
   and let it go.

   Two projects on the server, on top of armStage0 (which answers and logs
   every request first): team7's collection c1 (u1 its owner; 2 rows and 2
   pictures by default) and team8's c8 (u1 a member; 3 rows, 3 pictures).
   The team8 reads are answered by name, and the row count, the listing and
   both DELETEs from this state per collection, so a clear that reaches
   either project shows as that project emptied. Options: rows7 and files7
   (team7's state); no8 (team8 has no project yet: its collections read
   answers [], and a POST makes an empty c8). */
const twoProjects = (page, o = {}) => page.evaluate((o) => {
  const inner = window.fetch;
  const st = window.__two = {
    c1: { rows: o.rows7 === undefined ? 2 : o.rows7, files: o.files7 || ['cap.png', 'visor.png'] },
    c8: o.no8 ? { rows: 0, files: [] } : { rows: 3, files: ['x.png', 'y.png', 'z.png'] },
    made8: !o.no8,
  };
  window.__two0 = JSON.parse(JSON.stringify(st));
  const json = (x, h) => new Response(JSON.stringify(x), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) });
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    const r = await inner(u, io);
    const t8 = s.indexOf('team_id=eq.team8') >= 0;
    if (t8 && s.indexOf('/rest/v1/team_members?select=role&') >= 0) return json([{ role: 'member' }]);
    if (t8 && m === 'GET' && s.indexOf('/rest/v1/collections') >= 0) {
      if (!st.made8) return json([]);
      if (s.indexOf('select=id,protocol,switching_at') >= 0) return json([{ id: 'c8', protocol: 1, switching_at: null }]);
      return json([{ id: 'c8', layers: ['hats', 'unsorted'] }]);
    }
    if (m === 'POST' && s.indexOf('/rest/v1/collections') >= 0 && JSON.parse(io.body).team_id === 'team8') {
      st.made8 = true;
      return json([{ id: 'c8', layers: ['hats', 'unsorted'] }], 201);
    }
    const count = s.match(/\/rest\/v1\/traits\?select=id&collection_id=eq\.([^&]+)/);
    if (m === 'GET' && count && st[count[1]]) return json([], { 'Content-Range': '0-0/' + st[count[1]].rows });
    if (m === 'POST' && s.indexOf('/storage/v1/object/list/traits') >= 0) {
      const b = JSON.parse((io && io.body) || '{}'), c = st[String(b.prefix || '').split('/')[1]];
      return json((b.offset || 0) > 0 || !c ? [] : c.files.map(name => ({ name })));
    }
    if (m === 'DELETE' && s.indexOf('/storage/v1/object/traits') >= 0 && r.ok) {
      for (const p of JSON.parse(io.body).prefixes || []) {
        const [, id, name] = String(p).split('/');
        if (st[id]) st[id].files = st[id].files.filter(f => f !== name);
      }
    }
    const del = s.match(/\/rest\/v1\/traits\?collection_id=eq\.([^&]+)/);
    if (m === 'DELETE' && del && st[del[1]] && r.ok) st[del[1]].rows = 0;
    return r;
  };
  window.__twoState = () => {
    const b = document.getElementById('cloudclear');
    return {
      log: window.__s0.log.slice(), bodies: window.__s0.bodies.slice(), unknown: window.__s0.unknown.slice(),
      note: document.getElementById('cloudnote').textContent,
      disabled: b.disabled, busy: clearingCloud,
      two: JSON.parse(JSON.stringify(window.__two)), two0: window.__two0,
    };
  };
}, o);

/* Presses it and, while the first request whose path holds `on` is held
   unanswered, moves the page to team8: 'hand' as wsSwitch moves it
   (activeWs, wsGen, cloudTeamId - test 8's move), 'switch' with wsSwitch
   itself, 'none' not at all (the control). The confirm, if any, is
   accepted. `after` is what went out once the page had moved. */
const pressAndMove = async (page, on, how) => {
  await page.evaluate((on) => {
    const inner = window.fetch;
    window.__held = null;
    window.__gate = new Promise(res => { window.__release = res; });
    window.fetch = async (u, io) => {
      const mine = window.__held === null && String(u).indexOf(on) >= 0;
      if (mine) window.__held = 'asked';
      const r = await inner(u, io);
      if (mine) { window.__held = 'held'; await window.__gate; }
      return r;
    };
  }, on);
  const asked = [];
  const onDialog = (d) => { asked.push(d.message()); d.accept().catch(() => {}); };
  page.on('dialog', onDialog);
  try {
    const r = await page.evaluate(async (how) => {
      const p = clearCloud();
      const t0 = Date.now();
      while (window.__held !== 'held' && Date.now() - t0 < 3000) await new Promise(res => setTimeout(res, 20));
      const reached = window.__held === 'held';
      const at = window.__s0.log.length;
      const gen = wsGen;
      let sw = null;
      if (how === 'switch') sw = wsSwitch('team8');
      else if (how === 'hand') { activeWs = 'team8'; wsGen++; cloudTeamId = null; }
      const moved = activeWs === 'team8' && wsGen !== gen;
      window.__release();
      await p;
      if (sw) await sw;
      const out = window.__twoState();
      return Object.assign(out, { reached, moved, after: out.log.slice(at) });
    }, how);
    return Object.assign(r, { asked });
  } finally { page.off('dialog', onDialog); }
};

/* The held request was made and the page moved while it was held; then no
   confirm, no DELETE, and the server holds what it held, in both projects.
   `after` (when given) is exactly what may go out after the move. */
const stayed = (r, after) => {
  expect(r.reached, 'the held request was made').toBe(true);
  expect(r.moved, 'and the page moved while it was held').toBe(true);
  expect(r.unknown, 'every request was one the stand-in names').toEqual([]);
  expect(r.bodies.filter(b => b.m === 'DELETE').map(b => b.body), 'no storage DELETE (its prefixes)').toEqual([]);
  expect(r.log.filter(isDelete), 'no DELETE').toEqual([]);
  expect(r.two, 'the server holds what it held, in both projects').toEqual(r.two0);
  expect(r.asked, 'no confirm').toEqual([]);
  if (after) expect(r.after, 'what went out after the move').toEqual(after);
  expect(r.disabled, 'the button is enabled again').toBe(false);
  expect(r.busy, 'and can be pressed again').toBe(false);
};
const S0_READ = 'select=id,protocol,switching_at';
const USER = '/auth/v1/user';
const COUNT = '/rest/v1/traits?select=id&collection_id=';
const LISTING = '/storage/v1/object/list/traits';

test.describe('Remove from server is the group owner\'s', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof clearCloud === 'function' && typeof s0Refuse === 'function');
  });

  test('1. group page, owner: the role is read once, first, and the clear goes on as today', async ({ page }) => {
    await armStage0(page);
    await holding(page);
    const r = await press(page);
    expect(r.unknown).toEqual([]);
    expect(r.log.filter(isRole), 'one role read, for this group and this account').toEqual([ROLE_READ]);
    expect(r.log[0], 'before anything else').toBe(ROLE_READ);
    expect(r.asked.length, 'the confirm is shown').toBe(1);
    expect(r.asked[0], 'the group confirm, as today').toContain('everyone');
    const files = r.log.indexOf('DELETE /storage/v1/object/traits');
    const rows = r.log.indexOf('DELETE /rest/v1/traits?collection_id=eq.c1');
    expect(files, 'the storage sweep went out').toBeGreaterThan(-1);
    expect(rows, 'and the rows DELETE, after it').toBeGreaterThan(files);
    expect(r.note, 'today\'s success text').toBe(DONE);
    expect(r.disabled).toBe(false);
  });

  test('2. group page, member: only the role read goes out, and the note says whose it is', async ({ page }) => {
    await armStage0(page, { role: 'member' });
    await holding(page);
    onlyTheRoleRead(await press(page), MEMBER, [ROLE_READ, OWNER_READ]);
  });

  test('3. group page, the role read answers 500: nothing more goes out, and the note says it could not check', async ({ page }) => {
    await armStage0(page, { roleStatus: 500 });
    await holding(page);
    onlyTheRoleRead(await press(page), UNKNOWN);
  });

  test('4. group page, no membership row ([]): not the owner', async ({ page }) => {
    await armStage0(page, { role: 'none' });
    await holding(page);
    onlyTheRoleRead(await press(page), MEMBER);
  });

  test('5. personal page: no role read, and the clear goes on as today', async ({ page }) => {
    await armStage0(page, { ws: null });
    await holding(page);
    const r = await press(page);
    expect(r.unknown).toEqual([]);
    expect(r.log.filter(isRole), 'no role read on the personal page').toEqual([]);
    expect(r.asked.length, 'the confirm is shown').toBe(1);
    expect(r.asked[0], 'the personal confirm').not.toContain('everyone');
    const files = r.log.indexOf('DELETE /storage/v1/object/traits');
    const rows = r.log.indexOf('DELETE /rest/v1/traits?collection_id=eq.c1');
    expect(files).toBeGreaterThan(-1);
    expect(rows).toBeGreaterThan(files);
    expect(r.note).toBe(DONE);
  });

  test('6. the owner check comes before the stage-0 hold: a member on a held project is told it is the owner\'s', async ({ page }) => {
    await armStage0(page, { role: 'member', protocol: 2 });
    await holding(page);
    const r = await press(page);
    onlyTheRoleRead(r, MEMBER, [ROLE_READ, OWNER_READ]);
    expect(r.reads, 'no protocol read').toBe(0);
    expect(r.toasts, 'not the held text').not.toContain(S0_SWITCHED);
    /* Final fixes, ruling B3: a refused Remove from server now says it was
       not done in its own sentence, so the line above alone could no longer
       fail; this is the held text now. */
    expect(r.toasts, 'not the refusal text').not.toContain(S0_REFUSED);
    expect(r.bar, 'and no held bar').toBe(false);
  });

  test('6. control: the owner on the held project is told it is held, after the role read', async ({ page }) => {
    await armStage0(page, { protocol: 2 });
    await holding(page);
    const r = await press(page);
    expect(r.unknown).toEqual([]);
    expect(r.log[0], 'the role read first').toBe(ROLE_READ);
    const proto = r.log.findIndex(l => l.indexOf('select=id,protocol,switching_at') >= 0);
    expect(proto, 'then the protocol read').toBeGreaterThan(0);
    /* Final fixes, ruling B3: the refusal sentence. This expected D1's
       protocol-2 sentence, which says what is kept, and a refused Remove
       from server keeps nothing. */
    expect(r.toasts, 'the held text').toContain(S0_REFUSED);
    expect(r.bar, 'and the bar').toBe(true);
    expect(r.asked, 'held before the confirm').toEqual([]);
    expect(r.log.filter(isDelete)).toEqual([]);
    expect(r.note, 'not the member text').not.toBe(MEMBER);
  });

  test('7. the button\'s title says who can use it, and nothing else on it changed', async ({ page }) => {
    const b = await page.evaluate(() => {
      const el = document.getElementById('cloudclear');
      return { title: el.getAttribute('title'), text: el.textContent, cls: el.className, hidden: el.hasAttribute('hidden') };
    });
    expect(b.title).toBe(TITLE);
    /* SUPERSEDED by follow-up D (P7): renamed from "Clear the cloud". */
    expect(b.text).toBe('Remove from server');
    expect(b.cls).toBe('mini');
    expect(b.hidden).toBe(true);
  });

  test('8. the page moves to another project during the role read: nothing is cleared there', async ({ page }) => {
    /* The owner's answer was for team7. A switch (or a sign-out) while it
       was being read moves activeWs and wsGen; going on would clear the
       project moved to, on a verdict about the one left. The move below
       is wsSwitch's own (activeWs, wsGen, cloudTeamId), made while the
       stand-in holds the role read's answer. */
    await armStage0(page);
    await holding(page);
    await page.evaluate(() => {
      const inner = window.fetch;
      window.__roleGate = new Promise(res => { window.__releaseRole = res; });
      window.fetch = async (u, io) => {
        const r = await inner(u, io);
        if (String(u).indexOf('/rest/v1/team_members?') >= 0) await window.__roleGate;
        return r;
      };
    });
    const asked = [];
    const on = (d) => { asked.push(d.message()); d.accept().catch(() => {}); };
    page.on('dialog', on);
    let r;
    try {
      r = await page.evaluate(async () => {
        const p = clearCloud();
        const t0 = Date.now();
        while (!window.__s0.log.some(l => l.indexOf('/rest/v1/team_members') >= 0) && Date.now() - t0 < 3000)
          await new Promise(res => setTimeout(res, 20));
        const roleAsked = window.__s0.log.some(l => l.indexOf('/rest/v1/team_members') >= 0);
        activeWs = 'team8'; wsGen++; cloudTeamId = null;
        window.__releaseRole();
        await p;
        return Object.assign(window.__t17state(), { roleAsked });
      });
    } finally { page.off('dialog', on); }
    expect(r.roleAsked, 'the role read was made').toBe(true);
    expect(r.unknown).toEqual([]);
    expect(r.log, 'nothing after the role read').toEqual([ROLE_READ]);
    expect(asked, 'no confirm').toEqual([]);
    expect(r.note).toBe(UNKNOWN);
    expect(r.disabled).toBe(false);
    expect(r.busy).toBe(false);
  });

  /* Fix round 1. Test 8 is the move during the role read itself; these are
     the moves after the owner's answer, while clearCloudNow reads. */
  test('9. owner, a move to another group during the stage-0 read: nothing is asked of it or cleared there', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page);
    const r = await pressAndMove(page, S0_READ, 'hand');
    expect(r.log[0], 'the owner answer was for team7').toBe(ROLE_READ);
    stayed(r, ['GET ' + USER]);
    expect(r.note).toBe(MOVED);
  });

  test('10. owner, a move to another group during sbUser: nothing is asked of it or cleared there', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page);
    const r = await pressAndMove(page, USER, 'hand');
    expect(r.log[0], 'the owner answer was for team7').toBe(ROLE_READ);
    stayed(r, []);
    expect(r.note).toBe(MOVED);
  });

  test('11. owner, a move during sbUser to a group with no project yet: none is made there', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page, { no8: true });
    const r = await pressAndMove(page, USER, 'hand');
    expect(r.log.filter(l => l.startsWith('POST /rest/v1/collections')), 'no project made in the group moved to').toEqual([]);
    stayed(r, []);
    expect(r.note).toBe(MOVED);
  });

  test('12. owner, a real switch (wsSwitch) during the stage-0 read: nothing is cleared there', async ({ page }) => {
    /* wsSwitch renders and catches up the group it moves to, so what goes
       out after it is its own; only the clear's part is asserted. */
    await armStage0(page);
    await twoProjects(page);
    const r = await pressAndMove(page, S0_READ, 'switch');
    expect(r.log[0], 'the owner answer was for team7').toBe(ROLE_READ);
    stayed(r);
  });

  test('13. personal page, a move to a group during the stage-0 read: the group is not cleared', async ({ page }) => {
    await armStage0(page, { ws: null });
    await twoProjects(page);
    const r = await pressAndMove(page, S0_READ, 'hand');
    expect(r.log.filter(isRole), 'no role read on the personal page').toEqual([]);
    stayed(r, ['GET ' + USER]);
    expect(r.note).toBe(MOVED);
  });

  test('14. owner, a move during the row count: no confirm, and nothing cleared', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page);
    const r = await pressAndMove(page, COUNT, 'hand');
    stayed(r, []);
    expect(r.note).toBe(MOVED);
  });

  test('15. owner, rows gone and pictures left, a move during the pictures read: no confirm, and nothing cleared', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page, { rows7: 0 });
    const r = await pressAndMove(page, LISTING, 'hand');
    stayed(r, []);
    expect(r.note).toBe(MOVED);
  });

  test('16. owner, nothing on the server, a move during the pictures read: no repair here and no word about the project left', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page, { rows7: 0, files7: [] });
    const r = await pressAndMove(page, LISTING, 'hand');
    stayed(r, []);
    expect(r.note).toBe(MOVED);
  });

  test('17. control: the same hold with no move clears the owner\'s project, and only it, as today', async ({ page }) => {
    await armStage0(page);
    await twoProjects(page);
    const r = await pressAndMove(page, S0_READ, 'none');
    expect(r.reached, 'the held request was made').toBe(true);
    expect(r.moved, 'and the page stayed').toBe(false);
    expect(r.unknown).toEqual([]);
    expect(r.log[0]).toBe(ROLE_READ);
    expect(r.asked.length, 'the confirm is shown').toBe(1);
    expect(r.asked[0], 'the group confirm').toContain('everyone');
    const files = r.log.indexOf('DELETE /storage/v1/object/traits');
    const rows = r.log.indexOf('DELETE /rest/v1/traits?collection_id=eq.c1');
    expect(files, 'the storage sweep went out').toBeGreaterThan(-1);
    expect(rows, 'and the rows DELETE, after it').toBeGreaterThan(files);
    expect(r.bodies.filter(b => b.m === 'DELETE').map(b => b.body), 'team7\'s pictures, and only them')
      .toEqual([JSON.stringify({ prefixes: ['team7/c1/cap.png', 'team7/c1/visor.png'] })]);
    expect(r.two.c1, 'team7 emptied').toEqual({ rows: 0, files: [] });
    expect(r.two.c8, 'team8 untouched').toEqual(r.two0.c8);
    expect(r.note).toBe(DONE);
    expect(r.disabled).toBe(false);
    expect(r.busy).toBe(false);
  });
});
