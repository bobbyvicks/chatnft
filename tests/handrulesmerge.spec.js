/* A RULE MADE BY HAND IS AN ANSWER, AND MERGES LIKE ONE.

   Answers merge pair by pair; the rule list was sent whole and pulled whole,
   and a pull rebuilds from answers only. A rule made with Add, or taken away
   with remove, had no answer behind it. RUN AGAINST THE PAGE BEFORE THE FIX:
   the first test went red (a hand rule whose send failed was gone after the
   next open), the second went red (a teammate's stale send carried no trace
   of your rule), and the third went red (a rule removed while offline came
   back on the next open). The fourth is the control that a teammate's
   removal still arrives; the fifth that a send which cannot read the
   server's answers writes nothing. */
import { test, expect } from '@playwright/test';

const CAP = 'hats/cap', VEIL = 'masks/veil', WINK = 'eyes/wink';

/* A group; three local synced traits; a stub collection holding `rules` and
   `decisions`. `failPatch` fails that many PATCHes first; `failRead` fails
   the answers read. Every PATCH body is kept. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = 'team7'; cloudTeamId = null; dbp = null; dbpName = null; groupCaughtUp = true;
  sharedRuleSig = null;
  await dbClear();
  LAYERS = ['hats', 'masks', 'eyes', 'unsorted'];
  const blob = new Blob([new Uint8Array(16)]);
  const rows = [];
  for (const [n, l] of [['cap', 'hats'], ['veil', 'masks'], ['wink', 'eyes']]) {
    const p = 'team7/c1/trait-' + n + '-' + l + '-approved.png';
    await dbPut({ id: 't_' + n + '_' + l + '_approved', kind: 'trait', name: n, layer: l, status: 'approved', blob,
      w: 16, h: 16, rarity: 1, at: 1, rowId: 'row-' + n, rowAt: '2026-01-01T00:00:00Z', path: p, synced: true });
    rows.push({ id: 'row-' + n, kind: 'trait', name: n, layer: l, status: 'approved', path: p, w: 16, h: 16, rarity: 1,
      updated_at: '2026-01-01T00:00:00Z' });
  }
  RULES = (o.localRules || []).map(ruleGroup);
  DECISIONS = mergeDecisions(o.localDecisions || [], []);
  rulesAt = 1;
  /* Written the way saveRules writes them, so this runs on the page before
     the change too. */
  await dbPut({ id: RULES_ID, kind: 'settings', at: 1, groups: RULES.map(g => g.slice()), rulesAt: 1 });
  await dbPut({ id: DECISIONS_ID, kind: 'settings', at: 1, decisions: DECISIONS.slice() });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
  const S = { col: { id: 'c1', layers: ['hats', 'masks', 'eyes'], rules: o.serverRules || [], decisions: o.serverDecisions || [],
    rules_at: 5, decide_order: [] }, patches: [], failPatch: o.failPatch || 0 };
  window.__S = S;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('team7');
    if (s.indexOf('/rest/v1/teams') >= 0) return json([{ id: 'team7', name: 'Seven', personal: false }]);
    if (s.indexOf('/rest/v1/collections') >= 0 && m === 'PATCH') {
      const body = JSON.parse(io.body);
      if (body.rules !== undefined && S.failPatch > 0) { S.failPatch--; return json({}, 503); }
      if (body.rules !== undefined) S.patches.push(body);
      Object.assign(S.col, body);
      return json([]);
    }
    if (s.indexOf('/rest/v1/collections?select=decisions') >= 0) {
      if (o.failRead) return json({}, 503);
      return json([{ decisions: S.col.decisions }]);
    }
    if (s.indexOf('/rest/v1/collections') >= 0) return json([S.col]);
    if (s.indexOf('/storage/v1/object/list/traits') >= 0) return json(rows.map(r => ({ name: r.path.split('/').pop() })));
    if (s.indexOf('/storage/') >= 0) return new Response(new Blob([new Uint8Array([9])]));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      const lim = parseInt((s.match(/limit=(\d+)/) || [])[1] || '1000', 10);
      return json(rows.slice(off, off + lim));
    }
    return json([]);
  };
  await renderShelf();
}, o);

const state = (page) => page.evaluate(() => ({
  rules: RULES.map(g => g.join('+')).sort(),
  server: (window.__S.col.rules || []).map(g => ruleGroup(g).join('+')).sort(),
  lastPatch: window.__S.patches.length ? window.__S.patches[window.__S.patches.length - 1] : null,
  patches: window.__S.patches.length,
}));

const openAgain = (page) => page.evaluate(async () => {
  const t = window.toast; window.toast = () => {};
  try { await groupCatchUp(); } finally { window.toast = t; }
});

const FILE_NO = { a: CAP, b: VEIL, ok: false, src: 'file', at: 1000 };
const has = (list, a, b) => (list || []).some(d => [d.a, d.b].sort().join() === [a, b].sort().join());

test.describe('a rule made by hand is an answer, and merges like one', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof shareRules === 'function' && typeof groupCatchUp === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { if (window.__realFetch) window.fetch = window.__realFetch; activeWs = null; });
  });

  test('A HAND RULE WHOSE SEND FAILED survives the next open, and reaches the group after it', async ({ page }) => {
    await arm(page, { localRules: [[CAP, VEIL]], localDecisions: [FILE_NO],
      serverRules: [[CAP, VEIL]], serverDecisions: [FILE_NO], failPatch: 1 });
    await page.evaluate(async ([a, b]) => { $('rulea').value = a; $('ruleb').value = b; await $('ruleadd').onclick(); }, [VEIL, WINK]);
    expect((await state(page)).patches, 'the send failed').toBe(0);
    await openAgain(page);
    const s = await state(page);
    expect(s.rules, 'still here after the open').toContain([WINK, VEIL].sort().join('+'));
    expect(s.server, 'and the group has it now').toContain([WINK, VEIL].sort().join('+'));
    expect(has(s.lastPatch.decisions, VEIL, WINK), 'with the answer behind it').toBe(true);
  });

  test('A TEAMMATE WHOSE COPY PREDATES YOUR RULE carries it in their next send, not over it', async ({ page }) => {
    /* This page is the teammate: their answers lack yours, the server has it. */
    const yours = { a: VEIL, b: WINK, ok: false, src: 'you', at: 2000 };
    await arm(page, { localRules: [[CAP, VEIL]], localDecisions: [FILE_NO],
      serverRules: [[CAP, VEIL], [VEIL, WINK]], serverDecisions: [FILE_NO, yours] });
    await page.evaluate(async ([a, b]) => { await decidePair(a, b, false); }, [CAP, WINK]);
    const s = await state(page);
    expect(s.patches).toBe(1);
    expect(has(s.lastPatch.decisions, VEIL, WINK), 'your answer is in their send').toBe(true);
    expect(has(s.lastPatch.decisions, CAP, WINK), 'and theirs').toBe(true);
    expect(s.server, 'and your rule is in the rules they sent').toContain([WINK, VEIL].sort().join('+'));
  });

  test('A RULE REMOVED WHILE THE SEND FAILED stays removed after the next open', async ({ page }) => {
    /* A rule with no answer behind it, as every hand rule made before this. */
    await arm(page, { localRules: [[CAP, WINK]], serverRules: [[CAP, WINK]], failPatch: 1 });
    await page.evaluate(async () => {
      const x = document.querySelector('#rulelist button[aria-label^="Remove the rule"]');
      await x.onclick();
    });
    expect((await state(page)).rules).toEqual([]);
    await openAgain(page);
    const s = await state(page);
    expect(s.rules, 'not put back by the pull').toEqual([]);
    expect(s.server, 'and the group has it removed').toEqual([]);
  });

  test('A RULE WIDENED WHILE THE SEND FAILED keeps its new member after the next open', async ({ page }) => {
    await arm(page, { localRules: [[CAP, VEIL]], localDecisions: [FILE_NO],
      serverRules: [[CAP, VEIL]], serverDecisions: [FILE_NO], failPatch: 1 });
    await page.evaluate(async (k) => {
      /* Reached for first, as a person does (patch547 fills it on press). */
      const sel = $('rulelist').querySelector('select'); sel.dispatchEvent(new Event('mousedown')); sel.value = k; await sel.onchange();
    }, WINK);
    await openAgain(page);
    const s = await state(page);
    const wink = s.rules.filter(r => r.indexOf(WINK) >= 0);
    expect(wink.length, 'wink is still kept apart from the others').toBeGreaterThan(0);
    expect(has(s.lastPatch.decisions, CAP, WINK) && has(s.lastPatch.decisions, VEIL, WINK), 'as answers the group now has').toBe(true);
  });

  test('the control: a teammate\'s removal still arrives here', async ({ page }) => {
    const theirYes = { a: CAP, b: VEIL, ok: true, src: 'you', at: 3000 };
    await arm(page, { localRules: [[CAP, VEIL]], localDecisions: [FILE_NO],
      serverRules: [], serverDecisions: [FILE_NO, theirYes] });
    await openAgain(page);
    expect((await state(page)).rules).toEqual([]);
  });

  test('and a send that cannot read the server\'s answers writes nothing', async ({ page }) => {
    await arm(page, { localRules: [[CAP, VEIL]], localDecisions: [FILE_NO],
      serverRules: [[CAP, VEIL]], serverDecisions: [FILE_NO], failRead: true });
    const sent = await page.evaluate(async ([a, b]) => { $('rulea').value = a; $('ruleb').value = b; await $('ruleadd').onclick(); return sharedRuleSig; }, [VEIL, WINK]);
    const s = await state(page);
    expect(s.patches, 'no blind write').toBe(0);
    expect(sent, 'and it is not remembered as sent').toBeNull();
    expect(s.rules).toContain([WINK, VEIL].sort().join('+'));
  });
});
