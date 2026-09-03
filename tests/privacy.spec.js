import { test, expect } from '@playwright/test';

/* The landing page says "Nothing leaves your device". This is the test that
   makes that a fact rather than a sentence.

   It used to be false in a small way: three <link> tags fetched Archivo and
   JetBrains Mono from Google, so every visitor's IP and User-Agent reached a
   third party on load. The fonts are served from the repo now, and this stops
   anything from creeping back - a CDN script, an analytics beacon, an icon
   font, a Supabase call on a page that has not been asked to do anything.

   These tests attach the listener BEFORE navigating, so nothing on the boot
   path can slip past. */

const local = u => u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:');

test.describe('nothing leaves your device', () => {
  test('opening the page makes no off-origin request', async ({ page, baseURL }) => {
    const off = [];
    page.on('request', r => { if (!local(r.url())) off.push(r.url()); });
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    expect(off, 'the page must not talk to anyone on load').toEqual([]);
    expect(baseURL).toContain('127.0.0.1');
  });

  test('and neither does opening a trait and working on it', async ({ page }) => {
    const off = [];
    page.on('request', r => { if (!local(r.url())) off.push(r.url()); });
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof startEditor === 'function');
    await page.evaluate(() => { try { gateShow(false); } catch (_) {} });
    await page.evaluate(() => {
      const w = 120, d = new Uint8ClampedArray(w * w * 4);
      for (let i = 0; i < w * w; i++) { d[i * 4] = 200; d[i * 4 + 1] = 120; d[i * 4 + 3] = 255; }
      fileName = 'private.png';
      startEditor(d, w, w, w, w, palette(d, w * w, 24, 64), false);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      try { gateShow(false); } catch (_) {}
      selectTool('pencil'); setColor('#00ff00'); snapshot();
      dab(40, 40, [0, 255, 0], 255);
      fillInteriorHoles();
    });
    await page.waitForTimeout(800);
    expect(off, 'drawing and editing must not talk to anyone either').toEqual([]);
  });

  test('the typefaces load from here and are actually in use', async ({ page }) => {
    /* Serving them locally is only worth doing if they still render. A page
       that silently falls back to the system stack would pass the two tests
       above while looking wrong, so this measures the rendered width against a
       deliberately missing family. */
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].map(f => `${f.family} ${f.status}`);
      const probe = document.createElement('span');
      probe.textContent = 'Handgloves 0123';
      probe.style.cssText = 'position:absolute;visibility:hidden;font-size:40px;white-space:nowrap;';
      document.body.appendChild(probe);
      const widthOf = fam => { probe.style.fontFamily = fam; return Math.round(probe.getBoundingClientRect().width); };
      const out = {
        loaded,
        archivo: widthOf('Archivo'),
        mono: widthOf('"JetBrains Mono"'),
        missing: widthOf('NoSuchFamilyAnywhere'),
      };
      probe.remove();
      return out;
    });
    expect(r.loaded.filter(f => f.startsWith('Archivo') && f.endsWith('loaded'))).not.toHaveLength(0);
    expect(r.loaded.filter(f => f.startsWith('JetBrains Mono') && f.endsWith('loaded'))).not.toHaveLength(0);
    expect(r.archivo, 'Archivo must render differently from a missing family').not.toBe(r.missing);
    expect(r.mono, 'JetBrains Mono must render differently from a missing family').not.toBe(r.missing);
    expect(r.mono, 'and differently from Archivo').not.toBe(r.archivo);
  });

  test('no third-party host is named anywhere in the file', async ({ page }) => {
    /* The tests above watch what the page DOES on the paths they walk. This
       one reads the file, so a fetch on a path nobody exercised still shows up. */
    const html = await (await page.request.get('/index.html')).text();
    const hosts = [...html.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)]
      .map(m => m[1].toLowerCase())
      .filter(h => h !== 'www.w3.org');           // the SVG namespace, not a request
    const unique = [...new Set(hosts)];
    /* Supabase is configured at runtime and only contacted when you sign in or
       press Save to cloud, so a reference is expected; a font or CDN host is not. */
    const bad = unique.filter(h => /fonts\.|gstatic|cdn|googleapis|jsdelivr|unpkg|analytics|gtag/.test(h));
    expect(bad, 'no font or CDN host may be named in the page').toEqual([]);

    /* POSITIVE CONTROL: the same filter must catch one when it is there, or its
       silence is about the regex rather than about the file. */
    const probe = [...(html + '<link href="https://fonts.googleapis.com/css2?x">')
      .matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase())
      .filter(h => /fonts\.|gstatic|cdn|googleapis/.test(h));
    expect(probe.length, 'the scan must be able to see a font host').toBeGreaterThan(0);
  });
});
