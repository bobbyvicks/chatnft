/* The Load v6 button, pressed in a real browser.

   test/curated-v6.test.cjs covers the logic well - five tests including 10,000
   native draws - but it builds a FAKE DOM to do it:

     const els={rulev6:{disabled:false},ruleimportnote:{hidden:true,textContent:''}};
     c.document={getElementById:id=>els[id]};
     ...
     await els.rulev6.onclick();

   so it calls a handler it attached to an object it made. That is the right
   way to test the decisions, and it is structurally unable to notice the
   button being dead: a renamed id, a 404 on curated-rules-v6.js, a helper the
   IIFE needs that is not actually global, or the script running before the
   element exists would all leave those five tests green and the button inert.

   WORKLOG.md names this shape as its third lens - "an unwired button leaves a
   dead feature and a green suite" - and it is why every cloud test calling
   cloudPush() rather than clicking is listed there as a hazard.

   So this presses the real button on the real page and reads what actually
   happened to RULES and LAYERS. It is the complement of the node tests, not a
   replacement: they own the semantics, this owns the wiring.
*/
import { test, expect } from '@playwright/test';

const start = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planRuleImport === 'function');
};

test.describe('the Load v6 button', () => {
  test('exists, and something wired a handler onto it', async ({ page }) => {
    /* The cheapest possible catch for the whole class: if curated-rules-v6.js
       fails to load, or its getElementById misses, this is what notices. */
    await start(page);
    const r = await page.evaluate(() => {
      const b = document.getElementById('rulev6');
      return { there: !!b, wired: !!(b && typeof b.onclick === 'function'),
        label: b ? b.textContent : null };
    });
    expect(r.there, 'the button is in the page').toBe(true);
    expect(r.wired, 'and curated-rules-v6.js reached it').toBe(true);
    expect(r.label).toContain('v6');
  });

  test('and the bundle it fetches is actually served', async ({ page }) => {
    /* A 404 here is invisible to a test that never makes the request. */
    await start(page);
    const r = await page.evaluate(async () => {
      const res = await fetch('rules/strict-fit-v6-collection.json');
      if (!res.ok) return { ok: false, status: res.status };
      const b = await res.json();
      return { ok: true, revision: b.revision, rules: b.rules.length,
        names: Object.values(b.names).reduce((a, v) => a + v.length, 0) };
    });
    expect(r.ok, 'the file is served next to the page').toBe(true);
    expect(r.revision, 'and is the revision the button checks for').toBe('strict-fit-v6');
    expect(r.rules).toBeGreaterThan(0);
    expect(r.names, 'it names the whole collection').toBe(249);
  });

  test('refuses, and changes nothing, when the traits are not here', async ({ page }) => {
    /* The ordinary state of a fresh project. It must say what to do rather
       than half-loading rules that name traits nobody has. */
    await start(page);
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      activeWs = null;
      await dbClear();
      RULES = []; DECISIONS = [];
      await saveRules();
      await renderShelf();
      const before = LAYERS.slice();
      document.getElementById('rulev6').click();
      await new Promise(x => setTimeout(x, 2500));
      return { note: document.getElementById('ruleimportnote').textContent,
        rules: RULES.length, layersChanged: LAYERS.join() !== before.join() };
    });
    expect(r.note, 'it says the traits have to come first').toContain('Missing');
    expect(r.rules, 'and wrote no rules').toBe(0);
    expect(r.layersChanged, 'and did not touch the draw order').toBe(false);
  });

  test('loads the rules and sets the draw order when the traits are here', async ({ page }) => {
    /* THE WHOLE PATH, through the button. Every trait the bundle names is
       seeded from the bundle itself, so this cannot drift from the file. */
    await start(page);
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      activeWs = null;
      await dbClear();
      const bundle = await (await fetch('rules/strict-fit-v6-collection.json')).json();
      const blob = new Blob([new Uint8Array([0])]);
      for (const [layer, names] of Object.entries(bundle.names)) {
        for (const n of names) {
          const name = String(n).replace(/\.png$/i, '');
          await dbPut({ id: 't_' + name + '_' + layer + '_approved', kind: 'trait',
            name, layer, status: 'approved', blob, w: 160, h: 160, rarity: 1, at: 1 });
        }
      }
      await dbPut({ id: 'settings.layers', kind: 'settings',
        layers: Object.keys(bundle.names).concat(['unsorted']), hidden: [], at: 1 });
      RULES = []; DECISIONS = [];
      await saveRules();
      await renderShelf();

      document.getElementById('rulev6').click();
      await new Promise(x => setTimeout(x, 6000));
      return { note: document.getElementById('ruleimportnote').textContent,
        rules: RULES.length, decisions: DECISIONS.length,
        layers: LAYERS.join(' > '), wantOrder: bundle.order.join(' > ') };
    });
    expect(r.rules, 'rules were actually written').toBeGreaterThan(0);
    expect(r.note, 'and it says the order was saved').toContain('V6 draw order saved');
    /* The order it promises: eyes, then glasses, then hats, with masks last. */
    const L = r.layers.split(' > ');
    expect(L.indexOf('eyes'), 'eyes under glasses').toBeLessThan(L.indexOf('glasses'));
    expect(L.indexOf('glasses'), 'glasses under hats').toBeLessThan(L.indexOf('hats'));
    expect(L[L.length - 1] === 'unsorted' ? L[L.length - 2] : L[L.length - 1],
      'masks on top').toBe('masks');
  });

  test('and a person answer still outranks what the file says', async ({ page }) => {
    /* The button feeds the same importer as the file picker, so the precedence
       that protects a reviewer's answer has to survive this route too. If it
       did not, pressing Load v6 would quietly undo the team's review. */
    await start(page);
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      activeWs = null;
      await dbClear();
      const bundle = await (await fetch('rules/strict-fit-v6-collection.json')).json();
      const blob = new Blob([new Uint8Array([0])]);
      for (const [layer, names] of Object.entries(bundle.names))
        for (const n of names) {
          const name = String(n).replace(/\.png$/i, '');
          await dbPut({ id: 't_' + name + '_' + layer + '_approved', kind: 'trait',
            name, layer, status: 'approved', blob, w: 160, h: 160, rarity: 1, at: 1 });
        }
      await dbPut({ id: 'settings.layers', kind: 'settings',
        layers: Object.keys(bundle.names).concat(['unsorted']), hidden: [], at: 1 });
      RULES = []; DECISIONS = [];
      await saveRules();
      await renderShelf();
      /* Load once so there is something to disagree with. */
      document.getElementById('rulev6').click();
      await new Promise(x => setTimeout(x, 6000));
      /* Find a pair the file forbids, and allow it by hand. */
      const g = RULES.find(x => x.length >= 2);
      const a = g[0], b = g[1];
      await decidePair(a, b, true);
      const freed = !RULES.some(x => x.indexOf(a) >= 0 && x.indexOf(b) >= 0);
      /* Load again - the file still forbids it, the person still allowed it. */
      document.getElementById('rulev6').click();
      await new Promise(x => setTimeout(x, 6000));
      const stillFreed = !RULES.some(x => x.indexOf(a) >= 0 && x.indexOf(b) >= 0);
      return { a, b, freed, stillFreed };
    });
    expect(r.freed, 'the answer took').toBe(true);
    expect(r.stillFreed, 'and survived loading the file again').toBe(true);
  });
});
