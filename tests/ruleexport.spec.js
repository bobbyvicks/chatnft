/* Handing the rules back in the format the collection launches with.

   "im going to be using LMNFT to launch so were gunna be using their
   peramiters" - so this app is a stop on the way, not the authority. A file
   goes in, people edit it here by looking at pictures, and it has to come back
   out in the same shape or the editing was for nothing.

   THE DIRECTION IS THE WHOLE DIFFICULTY. A rule here is symmetric - "at most
   one of these" - and says nothing about which side gives way. A LaunchMyNFT
   rule names a condition and a target, and the TARGET is what gets re-picked.
   The same forbidden pair written the two ways produces two different
   collections: one drops the hair, the other drops the hat. DECIDE_ORDER
   already holds that answer, so the layer decided first is the condition.

   The round trip is what makes any of this checkable: the pairs that go out
   have to be exactly the pairs that came in, and the last test does that
   against the real curated file rather than a fixture.
*/
import { test, expect } from '@playwright/test';
import fs from 'fs';

const REAL = 'E:/X content/pixel art_/trait-records/trait-combination-rules-v3-20260906/trait-rules-all-categories-v3.json';

const LAYERS = ['skins', 'costumes', 'hats', 'hair', 'glasses', 'unsorted'];

const seed = (page) => page.evaluate(async (layers) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  await dbPut({ id: 'settings.layers', kind: 'settings', layers, hidden: [], at: 1 });
  const put = (name, layer) => dbPut({ id: 't_' + layer + '_' + name, kind: 'trait', name, layer,
    status: 'approved', blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
  await put('tan', 'skins');
  for (const n of ['bob', 'curls', 'mop']) await put(n, 'hair');
  for (const n of ['cap', 'beret']) await put(n, 'hats');
  await put('specs', 'glasses');
  await put('onesie', 'costumes');
  RULES = []; DECISIONS = [];
  DECIDE_ORDER = ['skins', 'costumes', 'hats', 'hair', 'glasses', 'unsorted'];
  await saveRules(); await saveDecideOrder();
  await renderShelf();
}, LAYERS);

const exportNow = (page) => page.evaluate(async () => {
  const items = (await dbAll()).filter(i => i.kind === 'trait');
  return exportRules(items);
});

test.describe('writing the rules back out', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportRules === 'function');
    await seed(page);
  });

  test('the condition is the layer that decides first', async ({ page }) => {
    /* Written the other way round it forbids the same pair and produces a
       different collection - the hat would be dropped instead of the hair. */
    await page.evaluate(async () => {
      RULES = [['hats/cap', 'hair/bob']];
      await saveRules();
    });
    const r = await exportNow(page);
    expect(r.rules.length).toBe(1);
    expect(r.rules[0].layer, 'hats decides before hair, so hats is the condition').toBe('hats');
    expect(r.rules[0].trait, 'named as a filename').toEqual(['cap.png']);
    expect(r.rules[0].thenStatements[0].targetLayer).toBe('hair');
    expect(r.rules[0].thenStatements[0].targetTrait.sort(), 'everything but the forbidden one')
      .toEqual(['curls.png', 'mop.png']);
  });

  test('and reversing the decide order reverses the condition', async ({ page }) => {
    /* THE CONTROL. Without it the test above passes on an export that always
       picks the same side by accident of sorting. */
    await page.evaluate(async () => {
      RULES = [['hats/cap', 'hair/bob']];
      DECIDE_ORDER = ['skins', 'hair', 'hats', 'glasses', 'costumes', 'unsorted'];
      await saveRules(); await saveDecideOrder();
    });
    const r = await exportNow(page);
    expect(r.rules[0].layer, 'now hair decides first, so hair is the condition').toBe('hair');
    expect(r.rules[0].thenStatements[0].targetLayer).toBe('hats');
  });

  test('a rule against a whole layer is written as hide layer', async ({ page }) => {
    /* An empty "only pick from" can never be satisfied and their own validator
       rejects it. */
    await page.evaluate(async () => {
      RULES = [['hats/beret', 'hair/bob', 'hair/curls', 'hair/mop']];
      await saveRules();
    });
    const r = await exportNow(page);
    const s = r.rules[0].thenStatements[0];
    expect(s.action).toBe('hide layer');
    expect(s.targetTrait, 'and nothing is listed').toEqual([]);
  });

  test('a group spanning three layers becomes several correct rules', async ({ page }) => {
    /* The import never builds one; the Add button can. */
    await page.evaluate(async () => {
      RULES = [['costumes/onesie', 'hats/cap', 'glasses/specs']];
      await saveRules();
    });
    const r = await exportNow(page);
    const pairs = [];
    for (const rule of r.rules) for (const s of rule.thenStatements) {
      const all = { hair: ['bob', 'curls', 'mop'], hats: ['cap', 'beret'],
        glasses: ['specs'], costumes: ['onesie'], skins: ['tan'] }[s.targetLayer] || [];
      const allow = new Set(s.targetTrait.map(n => n.replace(/\.png$/, '')));
      const deny = s.action === 'hide layer' ? all : all.filter(n => !allow.has(n));
      for (const n of deny) {
        const a = rule.layer + '/' + rule.trait[0].replace(/\.png$/, ''), b = s.targetLayer + '/' + n;
        pairs.push(a < b ? a + '|' + b : b + '|' + a);
      }
    }
    expect(pairs.sort(), 'all three pairings survive').toEqual([
      'costumes/onesie|glasses/specs',
      'costumes/onesie|hats/cap',
      'glasses/specs|hats/cap',
    ]);
  });

  test('two traits on one layer make no rule, because they can never co-occur', async ({ page }) => {
    await page.evaluate(async () => {
      RULES = [['hair/bob', 'hair/curls']];
      await saveRules();
    });
    const r = await exportNow(page);
    expect(r.rules, 'nothing to tell LaunchMyNFT').toEqual([]);
  });

  test('a rule naming a trait that is gone is left out and counted', async ({ page }) => {
    await page.evaluate(async () => {
      RULES = [['hats/vanished', 'hair/bob']];
      await saveRules();
    });
    const r = await exportNow(page);
    expect(r.rules, 'not written').toEqual([]);
    expect(r.missing.length, 'but named').toBe(1);
  });

  test('the real curated file survives a round trip', async ({ page }) => {
    /* THE ONE THAT MATTERS FOR LAUNCHING. Import the file that will actually be
       used, write it back out, and compare the FORBIDDEN PAIRS both ways. Not
       the JSON - the direction and the grouping may legitimately differ - but
       the set of pairs that can never share a character, which is what the
       rules mean. */
    if (!fs.existsSync(REAL)) test.skip(true, 'the curated file is not on this machine');
    const doc = JSON.parse(fs.readFileSync(REAL, 'utf8'));
    const r = await page.evaluate(async (RULEDOC) => {
      try { authed = true; } catch (_) {}
      await dbClear();
      const nm = n => String(n).replace(/\.png$/i, '');
      const seen = new Set(); const layers = [];
      for (const rr of RULEDOC) {
        const add = async (layer, name) => {
          const k = layer + '/' + nm(name);
          if (seen.has(k)) return; seen.add(k);
          if (layers.indexOf(layer) < 0) layers.push(layer);
          await dbPut({ id: 't_' + k, kind: 'trait', name: nm(name), layer, status: 'approved',
            blob: new Blob([new Uint8Array([0])]), w: 160, h: 160, rarity: 1, at: 1 });
        };
        for (const t of rr.trait) await add(rr.layer, t);
        for (const s of rr.thenStatements) for (const t of s.targetTrait) await add(s.targetLayer, t);
      }
      await dbPut({ id: 'settings.layers', kind: 'settings',
        layers: layers.concat(['unsorted']), hidden: [], at: 1 });
      await renderShelf();

      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const plan = planRuleImport(RULEDOC, items);
      RULES = plan.groups.slice();
      DECIDE_ORDER = plan.order.slice();
      await saveRules(); await saveDecideOrder();

      /* Every pair the ORIGINAL file forbids. */
      const byLayer = new Map();
      for (const t of items) {
        if (!byLayer.has(t.layer)) byLayer.set(t.layer, []);
        byLayer.get(t.layer).push(t.name);
      }
      const pairsOf = (docIn) => {
        const out = new Set();
        for (const rr of docIn) for (const s of rr.thenStatements) {
          const all = byLayer.get(s.targetLayer) || [];
          const allow = new Set((s.targetTrait || []).map(nm));
          const deny = s.action === 'hide layer' ? all : all.filter(n => !allow.has(n));
          for (const n of deny) {
            const a = rr.layer + '/' + nm(rr.trait[0]), b = s.targetLayer + '/' + n;
            if (a.slice(0, a.indexOf('/')) === b.slice(0, b.indexOf('/'))) continue;
            out.add(a < b ? a + '|' + b : b + '|' + a);
          }
        }
        return out;
      };
      const before = pairsOf(RULEDOC);
      const written = exportRules(items);
      const after = pairsOf(written.rules);
      return {
        conditionsIn: RULEDOC.length, conditionsOut: written.rules.length,
        groups: RULES.length,
        before: before.size, after: after.size,
        lost: [...before].filter(p => !after.has(p)).slice(0, 5),
        gained: [...after].filter(p => !before.has(p)).slice(0, 5),
        missing: written.missing.length,
      };
    }, doc);
    expect(r.before, 'the file really forbids a lot of pairs').toBeGreaterThan(500);
    expect(r.lost, 'nothing the file forbade is allowed after the round trip').toEqual([]);
    expect(r.gained, 'and nothing new is forbidden').toEqual([]);
    expect(r.after, 'the same set, exactly').toBe(r.before);
    expect(r.missing, 'every trait it names is in the project').toBe(0);
  });
});
