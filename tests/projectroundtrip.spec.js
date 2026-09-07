/* Export project, then import it, and see what came back.

   "Export project" exists because Download all loses things - its own comment
   says so: "the layer order or the rarities at all, which is exactly what the
   existing Download all loses". It is the button a person presses to take
   their work somewhere else, and it is the only backup this page offers.

   It writes { format, version, savedAt, layers, items }.

   The project keeps SIX settings records - layers, grid, rules, decisions,
   decide order, base colours - and exportProject filters the store down to
   `kind==="trait" || kind==="ref"` before it starts, so five of the six are
   dropped on the floor. The rules are the largest body of work in a
   collection: a hundred-odd combination rules and every yes/no a team gave
   while reviewing them.

   These tests are written from the OUTSIDE - export to a doc, wipe the
   browser, import the doc, and ask what survived - because that is what the
   person actually does and it is the only view that can see an omission. A
   test that checked the doc's shape would agree with whatever the exporter
   happened to write. */
import { test, expect } from '@playwright/test';

/* A project with something in every settings record, so a dropped one shows
   up as a specific missing thing rather than as a smaller number. */
const fill = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const blob = new Blob([new Uint8Array([0])]);
  const put = (name, layer) => dbPut({ id: 't_' + name + '_' + layer + '_approved',
    kind: 'trait', name, layer, status: 'approved', blob, w: 160, h: 160, rarity: 3, at: 1 });
  await put('cap', 'hats');
  await put('bob', 'hair');
  await put('mop', 'hair');

  LAYERS = ['skins', 'hair', 'hats', 'unsorted'];
  /* HIDDEN_LAYERS is a const Set, so it is emptied and refilled rather than
     replaced - assigning to it throws, which is how this fixture first failed. */
  HIDDEN_LAYERS.clear(); HIDDEN_LAYERS.add('skins');
  await saveLayers();

  projectGrid = 128;
  await saveGrid();

  RULES = [['hats/cap', 'hair/bob']];
  DECISIONS = [{ a: 'hair/bob', b: 'hats/cap', ok: false, at: 5, src: 'you' }];
  await saveRules();

  DECIDE_ORDER = ['hats', 'hair', 'skins'];
  await saveDecideOrder();

  await saveBaseColours([{ r: 230, g: 3, b: 124 }, { r: 6, g: 214, b: 1 }]);
  await renderShelf();
});

/* Export to a document, wipe everything the browser knows, import it back. */
const roundTrip = (page) => page.evaluate(async () => {
  /* exportProject downloads a file, so the download is caught rather than
     performed - the bytes it would have written are what gets imported. */
  const realCreate = URL.createObjectURL;
  let doc = null;
  URL.createObjectURL = (b) => { doc = b; return 'blob:stub'; };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {};
  try { await exportProject(); }
  finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
  if (!doc) return { exported: false };
  const text = await doc.text();

  /* Everything forgotten, exactly as a fresh browser would have it. */
  await dbClear();
  LAYERS = ['backgrounds', 'skins', 'unsorted'];
  HIDDEN_LAYERS.clear();
  RULES = []; DECISIONS = []; DECIDE_ORDER = []; BASE_KEEP = [];
  projectGrid = 160;

  await importProject(new File([text], 'p.json', { type: 'application/json' }));

  return {
    exported: true,
    keys: Object.keys(JSON.parse(text)).sort(),
    traits: (await dbAll()).filter(i => i.kind === 'trait').length,
    rarity: ((await dbAll()).find(i => i.kind === 'trait') || {}).rarity,
    layers: LAYERS.slice(),
    hidden: [...HIDDEN_LAYERS].sort(),
    grid: projectGrid,
    rules: RULES.map(g => g.slice().sort().join('|')),
    decisions: DECISIONS.length,
    order: DECIDE_ORDER.slice(),
    base: BASE_KEEP.map(q => hex(q.r, q.g, q.b)),
  };
});

test.describe('exporting a project and importing it back', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportProject === 'function'
      && typeof importProject === 'function');
    await fill(page);
  });

  test('brings the traits back, with their layer and rarity', async ({ page }) => {
    /* THE CONTROL. This part already worked, and it has to keep working or
       everything below is being measured against a broken export. */
    const r = await roundTrip(page);
    expect(r.exported, 'the export produced a file').toBe(true);
    expect(r.traits, 'all three traits came back').toBe(3);
    expect(r.rarity, 'and their rarity with them').toBe(3);
    expect(r.layers, 'and the layers the file knew about').toContain('hats');
    expect(r.layers).toContain('hair');
  });

  test('brings the combination rules back', async ({ page }) => {
    /* THE ONE THAT MATTERS. A collection carries a hundred-odd of these and
       every one is a decision somebody made about which traits may appear
       together. Losing them on a restore is losing the review, silently,
       behind a message that says how many items were imported. */
    const r = await roundTrip(page);
    expect(r.rules, 'the rule survived the round trip').toEqual(['hair/bob|hats/cap']);
  });

  test('and the answers behind them', async ({ page }) => {
    /* The rules can be rebuilt by re-importing a rules file. The answers a
       team gave cannot: they are the record of what people decided, and a
       fresh import stamps its own timestamps over anything newer. */
    const r = await roundTrip(page);
    expect(r.decisions, 'the yes/no answers came back').toBe(1);
  });

  test('and the order traits are picked in', async ({ page }) => {
    /* Not the same as the layer order, which is paint order. This one decides
       which layer yields when two traits clash, so losing it changes what the
       generator produces rather than how it looks. */
    const r = await roundTrip(page);
    expect(r.order, 'the decide order came back').toEqual(['hats', 'hair', 'skins']);
  });

  test('and the cell grid the collection is drawn on', async ({ page }) => {
    /* projectGrid drives every resize preset and the warning that a trait is
       "not the collection's N by N". Restoring at the default 160 when the
       collection is 128 makes both of those quietly wrong. */
    const r = await roundTrip(page);
    expect(r.grid, 'the grid came back').toBe(128);
  });

  test('and which layers were turned off', async ({ page }) => {
    /* A layer being off is part of the layer list - saveLayers writes both
       into one record on purpose - but only the order is exported. */
    const r = await roundTrip(page);
    expect(r.hidden, 'the hidden layer came back').toEqual(['skins']);
  });

  test('and the base colour it learnt', async ({ page }) => {
    const r = await roundTrip(page);
    expect(r.base, 'the base colours came back').toEqual(['#e6037c', '#06d601']);
  });
});

test.describe('importing a file into a project that is already being worked in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportProject === 'function'
      && typeof importProject === 'function');
    await fill(page);
  });

  /* Export the filled project, then set the browser up as somebody ELSE with
     their own traits, their own rule and their own grid, and import. */
  const intoLive = (page) => page.evaluate(async () => {
    const realCreate = URL.createObjectURL;
    let doc = null;
    URL.createObjectURL = (b) => { doc = b; return 'blob:stub'; };
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    try { await exportProject(); }
    finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
    const text = await doc.text();

    await dbClear();
    const blob = new Blob([new Uint8Array([0])]);
    await dbPut({ id: 't_mine_skins_approved', kind: 'trait', name: 'mine',
      layer: 'skins', status: 'approved', blob, w: 160, h: 160, rarity: 1, at: 1 });
    LAYERS = ['skins', 'hair', 'hats', 'unsorted'];
    HIDDEN_LAYERS.clear();
    RULES = [['skins/mine', 'hair/mop']];
    DECISIONS = [{ a: 'hair/mop', b: 'skins/mine', ok: false, at: 9, src: 'you' }];
    await saveRules();
    DECIDE_ORDER = ['skins', 'hair', 'hats'];
    await saveDecideOrder();
    projectGrid = 64;
    await saveGrid();

    await importProject(new File([text], 'p.json', { type: 'application/json' }));
    return {
      rules: RULES.map(g => g.slice().sort().join('|')).sort(),
      decisions: DECISIONS.length,
      order: DECIDE_ORDER.slice(),
      grid: projectGrid,
      hidden: [...HIDDEN_LAYERS].sort(),
    };
  });

  test('their rules are added to mine, not swapped for them', async ({ page }) => {
    /* The importer's own rule for traits - "Someone importing a friend's
       traits should not lose their own" - has to hold for the rules too, and
       a rule is the more expensive thing to lose. */
    const r = await intoLive(page);
    expect(r.rules, 'both rules are here').toEqual(['hair/bob|hats/cap', 'hair/mop|skins/mine']);
    expect(r.decisions, 'and both answers').toBe(2);
  });

  test('but my grid and my draw order are left alone', async ({ page }) => {
    /* THE CONTROL, and the thing that makes the restore case safe to be so
       generous. A grid belongs to the collection already open; a file arriving
       from somewhere else does not get to redraw it. If this ever reds, the
       restore path is overwriting live projects. */
    const r = await intoLive(page);
    expect(r.grid, 'my 64 cell grid survived their 128').toBe(64);
    expect(r.order, 'and my draw order survived theirs').toEqual(['skins', 'hair', 'hats']);
    expect(r.hidden, 'and nothing of mine was hidden').toEqual([]);
  });

  test('and a file from before any of this still imports', async ({ page }) => {
    /* Version 2 wrote layers and items and nothing else. Every new field is
       read behind a guard, so an old backup has to come through with its
       traits and simply bring no settings - not throw, and not be refused for
       being the wrong version. */
    const r = await page.evaluate(async () => {
      const old = { format: 'chatnft-project', version: 2,
        savedAt: '2026-01-01T00:00:00.000Z', layers: ['skins', 'gloves'],
        items: [{ id: 't_old_skins_approved', kind: 'trait', name: 'old',
          layer: 'skins', status: 'approved', rarity: 2, w: 160, h: 160,
          png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }] };
      await dbClear();
      RULES = []; DECISIONS = []; DECIDE_ORDER = []; BASE_KEEP = [];
      projectGrid = 160;
      LAYERS = ['skins', 'unsorted'];
      let threw = null;
      try {
        await importProject(new File([JSON.stringify(old)], 'old.json',
          { type: 'application/json' }));
      } catch (e) { threw = String(e); }
      return { threw, traits: (await dbAll()).filter(i => i.kind === 'trait').length,
        layers: LAYERS.slice(), grid: projectGrid, rules: RULES.length,
        note: document.getElementById('toast').textContent };
    });
    expect(r.threw, 'an old backup does not throw').toBeNull();
    expect(r.traits, 'and its trait arrives').toBe(1);
    expect(r.layers, 'and the layer it named').toContain('gloves');
    expect(r.grid, 'it carried no grid, so nothing changed the grid').toBe(160);
    expect(r.rules, 'and no rules appeared from nowhere').toBe(0);
  });
});
