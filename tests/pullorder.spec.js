/* A PULL READS THE GROUP'S ORDER. IT NEVER WRITES ONE.

   saveLayers declares this browser's layer list to the group whenever it
   differs from the last list it sent, and cloudPull ended in saveLayers. So a
   browser that had just merged the group's layer NAMES into its own default
   ORDER wrote that merged list back to the server as the group's order, and
   nothing said so. The declaration's own comment says the order is what a new
   member is meant to inherit; the code did the opposite.

   Today that was invisible, because every old team's declared list IS the old
   default list and the merge found nothing. The moment the default list
   changed (patch516) a fresh browser joining any team on the old vocabulary
   would have sent one PATCH with sixteen names in its own order - measured by
   the refuter that found this, 40 of 120 layer pairs painted the opposite way
   round on two members of one team after one pull each.

   RUN AGAINST THE PAGE BEFORE THE FIX, the first test went red on both counts:
   one PATCH sent, and LAYERS in the browser's default order with the group's
   names merged in, not the group's order. That is the positive control, and
   it is recorded here because once fixed it cannot be recovered.

   The rule now: a browser with no order of its own for this project takes the
   group's declaration as it stands; one that has an order keeps it and adopts
   the names it lacks, before the catch-all; either way the list is recorded
   locally and the server is not written. The two things that still declare an
   order are the ones a person presses - the Layers panel and Save to cloud -
   and the last test proves that still happens. */
import { test, expect } from '@playwright/test';

const OLD = ['backgrounds', 'skins', 'clothing', 'costumes', 'chains', 'accessories',
  'extras', 'ears', 'mouth', 'eyes', 'hair-headwear', 'masks', 'unsorted'];

/* The real cloudPull against a stubbed server, in a group, with or without a
   layer record of this browser's own. Returns every PATCH the server saw. */
const pull = (page, o) => page.evaluate(async ({ declared, own }) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  cloudTeamId = null; sharedLayerSig = null;
  activeWs = 'team1';
  try { if (dbp) { (await dbp).close(); } } catch (_) {}
  dbp = null; dbpName = null;
  await dbClear();
  /* A browser with an order of its own has it in BOTH places, the record and
     the live list - applyLayers loads one from the other on every render. A
     first draft seeded only the record and left LAYERS on the defaults, which
     no real session ever has, and the merge went into the wrong list. */
  LAYERS = own ? own.slice() : DEFAULT_LAYERS.slice();
  if (own) await dbPut({ id: LAYERS_ID, kind: 'settings', layers: own.slice(), hidden: [], at: 1 });
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const patches = [];
  const real = window.fetch;
  const json = (x, extra) => new Response(JSON.stringify(x),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const row = { id: 'row1', name: 'thing', kind: 'trait', layer: declared[0], status: 'approved',
    path: 'p/1.png', w: 160, h: 160, rarity: 1 };
  window.__stub = (u, opt) => {
    const s = String(u), m = (opt && opt.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0) {
      if (m === 'PATCH') { patches.push(JSON.parse(opt.body)); return Promise.resolve(json([])); }
      return Promise.resolve(json([{ id: 'c1', layers: declared }]));
    }
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return Promise.resolve(json([], { 'Content-Range': '0-0/1' }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0) return Promise.resolve(json([row], { 'Content-Range': '0-0/1' }));
    if (s.indexOf('/storage/v1/object/traits/') >= 0)
      return Promise.resolve(new Response(new Blob([new Uint8Array([0])]), { status: 200 }));
    return real(u, opt);
  };
  window.fetch = window.__stub;
  await cloudPull({ quiet: true });
  window.__patches = patches;
  const rec = await dbGet(LAYERS_ID);
  return { patches: patches.map(p => (p.layers || []).join(',')), layers: LAYERS.slice(),
    recorded: rec ? rec.layers.slice() : null,
    note: document.getElementById('cloudnote').textContent };
}, o);

/* After a pull: a saveLayers with the list unchanged, then one with it
   changed. Says how many PATCHes each sent. */
const thenSave = (page, reorder) => page.evaluate(async (reorder) => {
  const before = window.__patches.length;
  await saveLayers();
  const unchanged = window.__patches.length - before;
  if (reorder) { const a = LAYERS.shift(); LAYERS.splice(LAYERS.length - 1, 0, a); }
  await saveLayers();
  const changed = window.__patches.length - before - unchanged;
  const last = window.__patches[window.__patches.length - 1];
  window.fetch = window.fetch; /* the stub stays for the whole test */
  return { unchanged, changed, sent: last ? last.layers.join(',') : null, layers: LAYERS.slice() };
}, reorder);

test.describe('a pull reads the group order and never writes one', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function' && typeof saveLayers === 'function');
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { activeWs = null; sharedLayerSig = null; });
  });

  test('A BROWSER WITH NO ORDER OF ITS OWN TAKES THE GROUP\'S, and sends nothing back',
    async ({ page }) => {
      const r = await pull(page, { declared: OLD, own: null });
      expect(r.patches, 'the pull wrote nothing to the server').toEqual([]);
      expect(r.layers, 'and the group order is the order, as declared').toEqual(OLD);
      expect(r.recorded, 'recorded locally so the next render keeps it').toEqual(OLD);
      expect(r.note).toContain('the group\'s paint order (12 layers)');
    });

  test('a browser with its own order keeps it and adopts the names it lacks, before the catch-all',
    async ({ page }) => {
      const r = await pull(page, { declared: ['skins', 'backgrounds', 'visors'],
        own: ['backgrounds', 'skins', 'unsorted'] });
      expect(r.patches, 'still nothing written').toEqual([]);
      expect(r.layers, 'own order first, the new name before unsorted')
        .toEqual(['backgrounds', 'skins', 'visors', 'unsorted']);
      expect(r.recorded).toEqual(['backgrounds', 'skins', 'visors', 'unsorted']);
      expect(r.note).toContain('1 new layer');
    });

  test('and an unchanged list after a pull is not sent back, while a changed one is',
    async ({ page }) => {
      /* The half that keeps declarations alive: the Layers panel goes through
         saveLayers, and an edit there must still reach the group. */
      await pull(page, { declared: OLD, own: null });
      const r = await thenSave(page, true);
      expect(r.unchanged, 'nothing changed, nothing sent').toBe(0);
      expect(r.changed, 'a reorder is a declaration').toBe(1);
      expect(r.sent, 'carrying the new order').toBe(r.layers.join(','));
    });

  test('a group that declares nothing leaves the default list alone', async ({ page }) => {
    /* The control for the first test: with no declaration there is nothing to
       take, so a fresh browser keeps its defaults - and still writes nothing. */
    const r = await pull(page, { declared: [], own: null });
    expect(r.patches).toEqual([]);
    const d = await page.evaluate(() => DEFAULT_LAYERS.slice());
    expect(r.layers).toEqual(d);
  });
});
