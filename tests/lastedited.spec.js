/* EVERY TILE ON THE FINAL PROJECT PAGE SAYS WHEN THE TRAIT WAS LAST EDITED.

   Asked for as: "can i see on each trait a (last edited) overlay on the
   trait".

   The record's `at` is what the Last edited list on the home page already
   orders by - every save writes it - so the overlay reads the same field
   and the page has one idea of "last edited", not two. Filing a trait into
   or out of the final project is not editing it, and setTraitStatus does
   not touch `at`; the third test pins that.

   THE ONE THAT MATTERS MOST IS THE LAST. A trait that came down from the
   group had `at` set to the moment it was DOWNLOADED, so on a project
   anybody else has touched - which is every group project on every second
   device - the overlay would have said "edited just now" about a trait
   drawn a month ago, and the Last edited list already said the same. The
   server row carries updated_at, maintained by a database trigger on every
   save by anyone, and the puller now writes that as `at`. RUN AGAINST THE
   PAGE BEFORE THE FIX, that test went red with `at` within a second of the
   pull. */
import { test, expect } from '@playwright/test';

const H = 3600 * 1000, D = 24 * H;

const seed = (page) => page.evaluate(async ([H, D]) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['backgrounds', 'skins', 'unsorted'];
  await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
    layers: LAYERS.slice(), hidden: [] });
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').fillRect(0, 0, 16, 16);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const put = (nm, layer, st, at, i) => {
    const rec = { id: 't_' + nm + '_' + layer + '_' + st, kind: 'trait', name: nm, layer, status: st,
      blob, w: 16, h: 16, rarity: 1, shelfOrder: i };
    if (at !== null) rec.at = at;
    return dbPut(rec);
  };
  const now = Date.now();
  await put('bac1', 'backgrounds', 'stfp', now - 3 * H, 0);
  await put('bac2', 'backgrounds', 'stfp', null, 1);
  await put('ski1', 'skins', 'stfp', now - 30 * 1000, 2);
  await put('ski2', 'skins', 'approved', now - 2 * D, 3);
  await renderShelf();
  showPage('final', false);
  await renderFinal();
}, [H, D]);

/* What every tile says, by record id: the overlay's text and its title, or
   null for a tile without one. */
const said = (page) => page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('#finallayers .item[data-key]')) {
    const s = el.querySelector('.fswhen');
    out[el.dataset.key] = s ? { text: s.textContent, title: s.title } : null;
  }
  return out;
});

const openFold = (page, layer) => page.evaluate(async (layer) => {
  const d = [...document.querySelectorAll('#finallayers details.fsadd')].find(x => x.dataset.layer === layer);
  d.open = true; d.ontoggle();
  await new Promise(r => setTimeout(r, 100));
}, layer);

test.describe('when each final trait was last edited', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderFinal === 'function' && typeof cloudPull === 'function');
  });

  test('EVERY TILE CARRIES IT, chosen and not, in the words the Last edited list uses',
    async ({ page }) => {
      await seed(page);
      await openFold(page, 'skins');
      const s = await said(page);
      expect(s['t_bac1_backgrounds_stfp'].text).toBe('edited 3 hours ago');
      expect(s['t_bac1_backgrounds_stfp'].title, 'and the exact time on hover').toMatch(/^Last edited .*\d/);
      expect(s['t_ski1_skins_stfp'].text).toBe('edited just now');
      expect(s['t_ski2_skins_approved'].text, 'the fold tiles too').toBe('edited 2 days ago');
    });

  test('a trait with no record of when carries nothing rather than 1970', async ({ page }) => {
    await seed(page);
    const s = await said(page);
    expect(Object.keys(s)).toContain('t_bac2_backgrounds_stfp');
    expect(s['t_bac2_backgrounds_stfp']).toBeNull();
  });

  test('filing it into the final project is not editing it', async ({ page }) => {
    await seed(page);
    await page.evaluate(async () => {
      const t = (await dbAll()).find(i => i.id === 't_ski2_skins_approved');
      await finalMove(t, 'stfp');
    });
    const s = await said(page);
    expect(s['t_ski2_skins_stfp'].text, 'still two days ago, not just now').toBe('edited 2 days ago');
  });

  test('A TRAIT PULLED FROM THE GROUP was edited when the group last saved it, not when it was downloaded',
    async ({ page }) => {
      /* The real cloudPull against a stubbed server, the way cloudpull.spec.js
         drives it: one row, saved on the server at a known time. */
      const r = await page.evaluate(async () => {
        try { authed = true; } catch (_) {}
        gateShow(false);
        await dbClear();
        cloudTeamId = null; activeWs = null;
        localStorage.setItem('chatnft.session', JSON.stringify({
          access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
        const SAVED = '2026-09-01T12:00:00Z';
        const row = { id: 'row1', name: 'cap', kind: 'trait', layer: 'skins', status: 'approved',
          path: 'p/1.png', w: 16, h: 16, rarity: 1, updated_at: SAVED };
        const real = window.fetch;
        const json = (o, extra) => new Response(JSON.stringify(o),
          { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
        window.fetch = (u, o) => {
          const s = String(u);
          if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
          if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
          if (s.indexOf('/rest/v1/collections') >= 0) return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
          if (s.indexOf('/rest/v1/traits?select=id') >= 0) return Promise.resolve(json([], { 'Content-Range': '0-0/1' }));
          if (s.indexOf('/rest/v1/traits?select=*') >= 0) return Promise.resolve(json([row], { 'Content-Range': '0-0/1' }));
          if (s.indexOf('/storage/v1/object/traits/') >= 0)
            return Promise.resolve(new Response(new Blob([new Uint8Array([0])]), { status: 200 }));
          return real(u, o);
        };
        const t0 = Date.now();
        try { await cloudPull({ quiet: true }); } finally { window.fetch = real; }
        const rec = (await dbAll()).find(i => i.kind === 'trait');
        return { at: rec && rec.at, saved: Date.parse(SAVED), pulledAt: t0 };
      });
      expect(r.at, 'at is the row\'s updated_at').toBe(r.saved);
      expect(Math.abs(r.at - r.pulledAt), 'and not the moment of the pull').toBeGreaterThan(24 * 3600 * 1000);
    });
});
