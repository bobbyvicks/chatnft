import { test, expect } from '@playwright/test';

/* The key-colour bridge.

   The extractor differences a "wearing" render against a bare reference, so
   the two have to match almost exactly. An AI-generated wearing shot never
   does, the diff keeps the whole character, and the page correctly says "Most
   of the character is green" - and there the user stops. That is the core
   loop breaking on its most common input.

   "Make a key-coloured character" already flattens the reference to two flat
   colours so a diff CAN be exact. What was missing is the sentence in
   between: nothing told you what to ask the model for, and a model handed a
   picture with no instructions re-renders the character, which is precisely
   what breaks the diff.

   What these tests can and cannot show: they assert the prompt carries the
   same colours the flattener paints with, which catches the two drifting
   apart. They cannot prove the values are DERIVED rather than typed - both
   would read the same at runtime. That guarantee is static, in patch134,
   which fails if any hex literal other than white appears in keyPrompt. */

const landing = async page => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof keyPrompt === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
  });
};

/* A bare character in the reference slot, the way loading one would leave it. */
const loadReference = page => page.evaluate(() => {
  const n = 64, d = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    const inside = x > 12 && x < 52 && y > 12 && y < 52;
    const edge = inside && (x < 15 || x > 49 || y < 15 || y > 49);
    if (!inside) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255; }
    else if (edge) { d[i + 3] = 255; }                      // dark -> becomes KEY_INK
    else { d[i] = 200; d[i + 1] = 120; d[i + 2] = 60; d[i + 3] = 255; }
  }
  refData = new ImageData(d, n, n);
  document.getElementById('mkkey').disabled = false;
});

test.describe('the key-colour prompt', () => {
  test('the prompt row is hidden until there is a file to attach it to', async ({ page }) => {
    await landing(page);
    expect(await page.evaluate(() =>
      document.getElementById('keyrow').hidden), 'no file yet, no prompt').toBe(true);
  });

  test('making the key-coloured character reveals it', async ({ page }) => {
    await landing(page);
    await loadReference(page);
    await page.evaluate(() => document.getElementById('mkkey').click());
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('keyrow').hidden), { timeout: 8000 }).toBe(false);
  });

  test('the prompt names the colours the flattener actually paints', async ({ page }) => {
    /* The failure this guards is silent and total: a prompt naming the wrong
       hexes produces a render whose base does not match, so the diff keeps
       everything and the user is back where they started - with no sign that
       the prompt was the problem. */
    await landing(page);
    const r = await page.evaluate(() => {
      const hx = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      return { prompt: keyPrompt('a gold cuban chain'), fill: hx(KEY_FILL), ink: hx(KEY_INK) };
    });
    expect(r.prompt, 'the body colour').toContain(r.fill);
    expect(r.prompt, 'the outline colour').toContain(r.ink);
    expect(r.fill, 'and it is the value keyCharacter paints with').toBe('#3CFFB4');
    expect(r.ink).toBe('#00FF00');
  });

  test('it carries the item through, everywhere it matters', async ({ page }) => {
    await landing(page);
    const p = await page.evaluate(() => keyPrompt('a gold cuban chain'));
    expect((p.match(/a gold cuban chain/g) || []).length,
      'named in the opening line, the draw rule, and the refusal clause').toBe(3);
    expect(p, 'and it tells the model not to guess').toContain('say so instead of guessing');
    expect(p, 'and to leave the character alone').toContain('Do not move, resize, rotate');
  });

  test('an empty box still produces a usable prompt - not a broken one', async ({ page }) => {
    /* Someone will press Copy before typing anything. A prompt reading "Add
       exactly one thing to it: ." is worse than one with a placeholder. */
    await landing(page);
    const r = await page.evaluate(() => [keyPrompt(''), keyPrompt('   '), keyPrompt(null)]);
    for (const p of r) {
      expect(p).toContain('the item');
      expect(p, 'never a dangling colon').not.toContain('to it: .');
    }
  });

  test('the copy button puts the prompt somewhere reachable', async ({ page, context }) => {
    /* Clipboard access is not guaranteed - it needs a secure context and a
       gesture. When it fails the text has to land on screen, because a button
       that silently does nothing is the worst of the three outcomes. */
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await landing(page);
    await loadReference(page);
    await page.evaluate(() => document.getElementById('mkkey').click());
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('keyrow').hidden), { timeout: 8000 }).toBe(false);

    await page.fill('#keyitem', 'a solana cap');
    await page.click('#keycopy');
    await page.waitForTimeout(400);

    const landed = await page.evaluate(async () => {
      let clip = '';
      try { clip = await navigator.clipboard.readText(); } catch (_) {}
      return clip || document.getElementById('exerr').textContent;
    });
    expect(landed, 'on the clipboard, or on the page').toContain('a solana cap');
    expect(landed).toContain('#3CFFB4');
  });

  test('and when the clipboard refuses, the prompt lands on the page instead', async ({ page }) => {
    /* The test above grants clipboard permission, so it never exercises the
       fallback - removing that fallback would not have failed anything. The
       refusal is forced here, which is the only way this branch is real. */
    await landing(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await loadReference(page);
    await page.evaluate(() => document.getElementById('mkkey').click());
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('keyrow').hidden), { timeout: 8000 }).toBe(false);

    await page.fill('#keyitem', 'a wif hat');
    await page.click('#keycopy');
    await expect.poll(() => page.textContent('#exerr'), { timeout: 5000 }).toContain('a wif hat');
    expect(await page.textContent('#exerr'), 'the whole prompt, not a shrug').toContain('#3CFFB4');
  });
});
