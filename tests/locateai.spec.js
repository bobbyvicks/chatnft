/* ASKING CLAUDE HAS A DEADLINE, A SIZE, AND THE PROJECT'S OWN LAYERS.

   "No reference? Let Claude find it" on the page, with /api/identify
   stubbed - nothing real is called, and the session is a placeholder. RUN
   AGAINST THE PAGE BEFORE THE FIX, the first four went red: a project that
   renamed hats got "Found" and a blank layer picker, a noisy 1280 picture
   went as an 8.7 MB body, a reply the platform sent instead of the function
   read "bad_json", and an answer that never came kept the button disabled.
   The last is the control: an ordinary answer fills the name and layer. */
import { test, expect } from '@playwright/test';

/* A submission, a stubbed endpoint, and what was sent and said. */
const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const W = o.side || 96;
  const d = new ImageData(W, W);
  for (let p = 0; p < W * W; p++) {
    const i = p * 4;
    if (o.noise) { d.data[i] = Math.random() * 256; d.data[i + 1] = Math.random() * 256; d.data[i + 2] = Math.random() * 256; d.data[i + 3] = 255; }
    else { d.data[i] = 150; d.data[i + 1] = 90; d.data[i + 2] = 40; d.data[i + 3] = 255; }
  }
  subData = d; refData = null;
  if (o.rename) await renameLayer('hats', 'headwear');
  const S = { bodies: [] };
  window.__S = S;
  const answer = { name: 'bucket-hat', layer: o.layer || 'hats', description: 'A hat.', confidence: 'high',
    box: { x0: 0.25, y0: 0.1, x1: 0.75, y1: 0.4 }, reliable: true };
  const realFetch = window.fetch;
  window.fetch = async (u, io) => {
    if (String(u).indexOf('/api/identify') < 0) return realFetch(u, io);
    S.bodies.push(String(io.body || ''));
    if (o.reply === 'text413') return new Response('Request Entity Too Large', { status: 413 });
    if (o.reply === 'never') return new Promise((_, rej) => {
      if (io.signal) io.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  if (o.deadline) { try { ASK_DEADLINE_MS = o.deadline; } catch (_) {} }
  const said = []; const t = window.toast; window.toast = (x) => said.push(String(x));
  const b = $('locateai'); b.hidden = false;
  const run = b.onclick();
  const done = await Promise.race([run.then(() => 'done'), new Promise(r => setTimeout(() => r('still waiting'), o.wait || 5000))]);
  window.toast = t; window.fetch = realFetch;
  let body = null; try { body = JSON.parse(S.bodies[0] || 'null'); } catch (_) {}
  return { done, said: said.join(' | '), disabled: b.disabled, sent: S.bodies.length,
    bodyChars: (S.bodies[0] || '').length, layers: body && body.layers, picked: $('tlayer').value, name: $('tname').value };
}, o);

test.describe('asking Claude to find the trait', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renameLayer === 'function' && !!document.getElementById('locateai'));
  });

  test('A PROJECT THAT RENAMED A LAYER is sent its layers, and a layer it lacks is said, not left blank', async ({ page }) => {
    const r = await arm(page, { rename: true, layer: 'hats' });
    expect(r.layers, 'the project\'s own list went with the request').toContain('headwear');
    expect(r.said).toContain('which this project does not have');
    expect(r.said).not.toMatch(/^Found bucket-hat —/);
  });

  test('A PICTURE TOO BIG TO SEND is halved until it fits, and still sent', async ({ page }) => {
    const r = await arm(page, { side: 1280, noise: true, wait: 20000 });
    console.log('noisy 1280 picture: body ' + r.bodyChars + ' characters');
    expect(r.sent).toBe(1);
    expect(r.bodyChars).toBeLessThan(4500000);
    expect(r.name, 'and the answer was used').toBe('bucket-hat');
  });

  test('A REPLY THE PLATFORM SENT INSTEAD OF THE FUNCTION is said by its status, not "bad_json"', async ({ page }) => {
    const r = await arm(page, { reply: 'text413' });
    expect(r.said).not.toContain('bad_json');
    expect(r.said).toContain('too big');
  });

  test('AN ANSWER THAT NEVER COMES gives the button back, and says so', async ({ page }) => {
    const r = await arm(page, { reply: 'never', deadline: 300, wait: 3000 });
    expect(r.done, 'the press finished').toBe('done');
    expect(r.disabled).toBe(false);
    expect(r.said).toContain('did not answer');
  });

  test('the control: an ordinary answer fills the name and the layer', async ({ page }) => {
    const r = await arm(page, {});
    expect(r.name).toBe('bucket-hat');
    expect(r.picked).toBe('hats');
    expect(r.said).toContain('Found bucket-hat');
  });
});
