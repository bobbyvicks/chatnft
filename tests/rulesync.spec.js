/* Rules, and the answers behind them, reach the group.

   Until now the only setting that left the browser was the layer list, so one
   person could curate a hundred combination rules and every teammate would
   generate without them. A rules / decisions / decide_order trio of jsonb
   columns was added to collections (additive, defaulting to '[]'), and the
   table's single RLS policy is an ALL-command rule keyed on is_team_member, so
   every teammate can already read and write them.

   THE PART THAT MATTERS IS THE MERGE. Rules are a set that only makes sense
   whole, so a pull that adopted the server's copy would discard whatever the
   person had answered since their last push - two people reviewing different
   traits would take turns destroying each other's work, silently, behind a
   green sync message. Decisions are per PAIR, so they merge per pair: the
   newest answer to a pair wins, and nobody loses an answer to a pair the other
   person never opened.

   And an EMPTY server is not an answer. Anyone whose rules predate the column
   has them locally and nothing up there; adopting [] would delete the lot.
*/
import { test, expect } from '@playwright/test';

const asTeam = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = 'team1';
  cloudTeamId = 'team1';
  await dbClear();
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  await dbPut({ id: 'settings.layers', kind: 'settings',
    layers: ['skins', 'hair', 'hats', 'unsorted'], hidden: [], at: 1 });
  const put = (name, layer) => dbPut({ id: 't_' + layer + '_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  await put('bob', 'hair');
  await put('mop', 'hair');
  await put('cap', 'hats');
  await renderShelf();
});

/* Answers every call cloudPush and shareRules need, and records the bodies. */
const withServer = (page, fn, serverCollection) => page.evaluate(async ([body, coll]) => {
  const sent = [];
  const real = window.fetch;
  const json = (o) => new Response(JSON.stringify(o), { status: 200,
    headers: { 'Content-Type': 'application/json' } });
  window.fetch = (u, o) => {
    const s = String(u);
    if (o && o.body) sent.push({ url: s, method: (o.method || 'GET'), body: String(o.body) });
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([Object.assign({ id: 'c1', layers: ['skins'] }, coll || {})]));
    return Promise.resolve(json([{ id: 'row1' }]));
  };
  let out = null;
  try { out = await (new Function('return (' + body + ')'))()(); }
  catch (e) { out = { threw: String(e) }; }
  finally { window.fetch = real; }
  return { out, sent, rules: RULES.map(g => g.join('|')), decisions: DECISIONS.length };
}, [fn, serverCollection || null]);

test.describe('rules reaching the group', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof shareRules === 'function');
    await asTeam(page);
  });

  test('an answer is sent, with the decisions and the decide order', async ({ page }) => {
    const r = await withServer(page, `async () => {
      await decidePair('hats/cap', 'hair/bob', false);
      return true;
    }`);
    const patch = r.sent.find(s => s.method === 'PATCH' && s.url.indexOf('/collections') >= 0);
    expect(patch, 'the collection was patched').toBeTruthy();
    const body = JSON.parse(patch.body);
    /* FOUR NOW, and the list is asserted exactly rather than loosened to
       "contains", because the point of it is that this PATCH sends the whole
       shared bundle and nothing else - a field creeping in unnoticed is what
       an exact list is for, and it did its job when the fourth arrived.

       empty_chance rides here on purpose: shareRules already knows whether
       there is a group and already carries a signature so an unchanged
       project sends nothing, and a second sender would be a second copy of
       both decisions. */
    expect(Object.keys(body).sort(), 'all four travel together')
      .toEqual(['decide_order', 'decisions', 'empty_chance', 'rules']);
    expect(typeof body.empty_chance, 'the empty chance goes as a number')
      .toBe('number');
    expect(JSON.stringify(body.rules), 'the rule is in it').toContain('hair/bob');
    expect(body.decisions.length, 'and so is the answer behind it').toBe(1);
    expect(body.decisions[0].ok, 'recorded as a no').toBe(false);
  });

  test('and nothing is sent on your own page', async ({ page }) => {
    await page.evaluate(() => { activeWs = null; });
    const r = await withServer(page, `async () => {
      await decidePair('hats/cap', 'hair/bob', false);
      return true;
    }`);
    const patch = r.sent.find(s => s.method === 'PATCH' && s.url.indexOf('/collections') >= 0);
    expect(patch, 'no collection patch when there is no group').toBeFalsy();
    expect(r.rules, 'but the rule is still made locally').toContain('hair/bob|hats/cap');
  });

  test('a send that failed is not remembered as done', async ({ page }) => {
    /* Otherwise the next change sees an unchanged signature, skips the send,
       and the group never gets either of them. */
    const r = await page.evaluate(async () => {
      const real = window.fetch;
      const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200,
        headers: { 'Content-Type': 'application/json' } });
      window.fetch = (u) => {
        const s = String(u);
        if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
        if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
        if (s.indexOf('/rest/v1/collections') >= 0 && s.indexOf('id=eq.') < 0)
          return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
        /* The PATCH fails. */
        return Promise.resolve(json({}, 500));
      };
      let sig;
      try { await decidePair('hats/cap', 'hair/bob', false); sig = sharedRuleSig; }
      finally { window.fetch = real; }
      return { sig, rules: RULES.length };
    });
    expect(r.rules, 'the rule was still made here').toBe(1);
    expect(r.sig, 'but nothing is remembered as shared').toBeNull();
  });

  test('two people answering different pairs keep both answers', async ({ page }) => {
    /* THE ONE THAT MATTERS. A whole-list adopt loses whichever half arrived
       second, and neither person is told. */
    const r = await page.evaluate(() => {
      const mine = [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 10 }];
      const theirs = [{ a: 'hats/cap', b: 'hair/mop', ok: true, at: 11 }];
      const merged = mergeDecisions(mine, theirs);
      return { n: merged.length, pairs: merged.map(d => d.a + '+' + d.b).sort() };
    });
    expect(r.n, 'both survive').toBe(2);
    expect(r.pairs).toEqual(['hair/bob+hats/cap', 'hair/mop+hats/cap']);
  });

  test('and the same pair keeps the newer answer, from either side', async ({ page }) => {
    const r = await page.evaluate(() => {
      const older = [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 10 }];
      const newer = [{ a: 'hair/bob', b: 'hats/cap', ok: true, at: 20 }];
      return { one: mergeDecisions(older, newer), two: mergeDecisions(newer, older) };
    });
    expect(r.one.length, 'one pair, not two, however it was written').toBe(1);
    expect(r.one[0].ok, 'the newer answer wins').toBe(true);
    expect(r.two[0].ok, 'and the merge does not depend on the order of the lists').toBe(true);
  });

  test('a person answer beats the file, even when the file is newer', async ({ page }) => {
    /* THE PRECEDENCE THAT PROTECTS A REVIEW, and it had no test until a
       mutation run said so. Removing the "you beats file" branch left every
       merge test green, because both fixtures default to "you" and neither
       branch of the precedence is ever reached.

       It matters because the whole workflow is regenerate-and-reimport: a
       tighter file arrives with a fresh timestamp on every pair it settles, so
       newest-wins alone would revert every answer the team gave since the last
       import, silently, on the press of a button. */
    const r = await page.evaluate(() => {
      const you = [{ a: 'hats/cap', b: 'hair/bob', ok: true, at: 10, src: 'you' }];
      const file = [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 999, src: 'file' }];
      return { fileLast: mergeDecisions(you, file), youLast: mergeDecisions(file, you) };
    });
    expect(r.fileLast.length, 'one pair either way').toBe(1);
    expect(r.fileLast[0].ok, 'the person wins although the file is far newer').toBe(true);
    expect(r.fileLast[0].src, 'and it is still recorded as theirs').toBe('you');
    expect(r.youLast[0].ok, 'and it does not depend on the order of the lists').toBe(true);
  });

  test('but a newer file still supersedes an older file', async ({ page }) => {
    /* THE CONTROL. Without it, "you always wins" would pass the test above
       while breaking the thing re-importing exists for - a regenerated file
       taking back what an older version of itself said. */
    const r = await page.evaluate(() => mergeDecisions(
      [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 10, src: 'file' }],
      [{ a: 'hats/cap', b: 'hair/bob', ok: true, at: 20, src: 'file' }]));
    expect(r.length).toBe(1);
    expect(r[0].ok, 'the newer generation wins between two files').toBe(true);
  });

  test('and an answer with no source recorded counts as a person', async ({ page }) => {
    /* Everything answered before the source field existed was made by hand in
       the review sheet. Treating those as the file's would let the next import
       overwrite the whole history of the review. */
    const r = await page.evaluate(() => mergeDecisions(
      [{ a: 'hats/cap', b: 'hair/bob', ok: true, at: 1 }],
      [{ a: 'hats/cap', b: 'hair/bob', ok: false, at: 999, src: 'file' }]));
    expect(r[0].ok, 'the old hand-made answer survives').toBe(true);
    expect(r[0].src).toBe('you');
  });

  test('a yes takes the pair out without dissolving the rule', async ({ page }) => {
    /* An import builds one condition trait plus everything it forbids on one
       layer. Allowing one of them must free THAT pair, not all of them. */
    const r = await page.evaluate(() => {
      RULES = [['hats/apehead', 'hair/a', 'hair/b', 'hair/c']];
      applyDecision('hats/apehead', 'hair/b', true);
      return RULES.map(g => g.slice().sort().join('|'));
    });
    expect(r.length, 'the rule survives').toBe(1);
    expect(r[0], 'without the pair that was allowed').toBe('hair/a|hair/c|hats/apehead');
  });

  test('and a two-member rule goes entirely when its pair is allowed', async ({ page }) => {
    const r = await page.evaluate(() => {
      RULES = [['hats/cap', 'hair/bob']];
      applyDecision('hats/cap', 'hair/bob', true);
      return RULES.length;
    });
    expect(r, 'nothing is left to say').toBe(0);
  });

  test('an empty server does not delete rules made before it existed', async ({ page }) => {
    /* THE DATA-LOSS GUARD. 103 rules imported before the column existed, a
       teammate presses Load, the server says []. Adopting that empties them. */
    const r = await withServer(page, `async () => {
      RULES = [['hats/cap','hair/bob'], ['hats/cap','hair/mop']];
      await saveRules();
      return true;
    }`, { rules: [], decisions: [], decide_order: [] });
    expect(r.rules.length, 'the local rules are still here').toBe(2);
    const patch = r.sent.find(s => s.method === 'PATCH' && s.url.indexOf('/collections') >= 0);
    expect(patch, 'and were sent up rather than overwritten').toBeTruthy();
    expect(JSON.parse(patch.body).rules.length, 'both of them').toBe(2);
  });
});
