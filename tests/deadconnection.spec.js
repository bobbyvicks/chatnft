/* A DEAD CONNECTION STOPS THE RUN, SAYS WHY, AND SAVE CAN BE STOPPED.

   Each picture spent its own three attempts, so a server that had gone was
   discovered one picture at a time, the reason was thrown away, and the
   button could not stop it. RUN AGAINST THE PAGE BEFORE THE FIX: the push
   test went red with 180 upload attempts for 60 pictures and "60 failed";
   the stop test with the whole push run; the pull test with every download
   tried three times. The fourth is the control that missing pictures - an
   answer from the server, not a dead line - do not stop a pull. */
import { test, expect } from '@playwright/test';

const arm = (page, o) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  const N = o.n || 60;
  if (o.push) for (let i = 0; i < N; i++) await dbPut({ id: 't_x' + i + '_hats_approved', kind: 'trait', name: 'x' + i,
    layer: 'hats', status: 'approved', blob: new Blob([new Uint8Array(32)]), w: 16, h: 16, rarity: 1, at: 1 });
  const rows = o.push ? [] : Array.from({ length: N }, (_, i) => ({ id: 'row' + i, kind: 'trait', name: 'x' + i, layer: 'hats',
    status: 'approved', path: 'me/c1/x' + i + '.png', w: 16, h: 16, rarity: 1, updated_at: '2026-01-01T00:00:00Z' }));
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (x, st, extra) => new Response(JSON.stringify(x), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  const S = { uploads: 0, downloads: 0 };
  window.__S = S;
  window.__realFetch = window.fetch;
  window.fetch = async (u, io) => {
    const s = String(u), m = (io && io.method) || 'GET';
    if (s.indexOf('/auth/v1/user') >= 0) return json({ id: 'u1' });
    if (s.indexOf('/rpc/my_team') >= 0) return json('me');
    if (s.indexOf('/rest/v1/collections') >= 0) return json(m === 'GET' ? [{ id: 'c1', layers: ['hats'] }] : []);
    if (s.indexOf('/storage/v1/object/list') >= 0) return json([]);
    if (s.indexOf('/storage/v1/object/traits/') >= 0 && m === 'POST') {
      S.uploads++;
      if (o.slowUpload) await new Promise(r => setTimeout(r, o.slowUpload));
      return o.uploadFails ? json({}, 500) : json({ Key: 'ok' });
    }
    if (s.indexOf('/storage/v1/object/traits/') >= 0) {
      S.downloads++;
      if (o.downloadDead) throw new TypeError('Failed to fetch');
      const i = parseInt(s.match(/x(\d+)\.png/)[1], 10);
      if (o.missing && i < o.missing) return json({ message: 'not found' }, 404);
      return new Response(new Blob([new Uint8Array([7])]));
    }
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'POST') return json([{ id: 'new' + S.uploads, updated_at: '2026-03-03T00:00:00Z' }]);
    if (s.indexOf('/rest/v1/traits') >= 0 && m === 'DELETE') return json([]);
    if (s.indexOf('/rest/v1/traits?select=id') >= 0) return json([], { 'Content-Range': '0-0/' + rows.length });
    if (s.indexOf('/rest/v1/traits') >= 0) {
      const off = parseInt((s.match(/offset=(\d+)/) || [])[1] || '0', 10);
      return json(rows.slice(off, off + 1000));
    }
    return json([]);
  };
  const said = []; const t = window.toast; window.toast = (x) => said.push(x);
  const t0 = performance.now();
  try {
    if (o.push) {
      const run = cloudPush();
      if (o.stopAfter) { await new Promise(r => setTimeout(r, o.stopAfter)); $('cloudpush').onclick(); }
      await run;
    } else await cloudPull({ quiet: true });
  } finally { window.toast = t; window.fetch = window.__realFetch; }
  return { ms: Math.round(performance.now() - t0), said: said.join(' | '), note: document.getElementById('cloudnote').textContent,
    uploads: S.uploads, downloads: S.downloads, label: $('cloudpush').textContent, disabled: $('cloudpush').disabled };
}, o);

test.describe('a dead connection stops the run, says why, and Save can be stopped', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPush === 'function' && typeof cloudPull === 'function');
  });

  test('SAVE TO CLOUD AGAINST A SERVER ANSWERING 500 stops early and names the reason', async ({ page }) => {
    const r = await arm(page, { push: true, uploadFails: true });
    expect(r.uploads, 'upload attempts').toBeLessThan(40);
    expect(r.said).toContain('failed - the server could not be reached');
    expect(r.said).toMatch(/\d+ not tried - the server stopped answering/);
    expect(r.label, 'the button is back to itself').toBe('Save to cloud');
    expect(r.disabled).toBe(false);
  });

  test('PRESSING SAVE WHILE IT RUNS stops it, and says so', async ({ page }) => {
    const r = await arm(page, { push: true, slowUpload: 80, stopAfter: 250 });
    expect(r.uploads, 'it stopped before the end').toBeLessThan(60);
    expect(r.said).toMatch(/\d+ not tried - stopped/);
    expect(r.label).toBe('Save to cloud');
  });

  test('LOAD FROM CLOUD WITH THE CONNECTION GONE stops early and says so', async ({ page }) => {
    const r = await arm(page, { push: false, downloadDead: true });
    expect(r.downloads, 'download attempts').toBeLessThan(60);
    expect(r.note).toContain('the server stopped answering');
  });

  test('the control: pictures the server says are missing do not stop a pull', async ({ page }) => {
    const r = await arm(page, { push: false, n: 12, missing: 6 });
    expect(r.note).toContain('6 could not be read');
    expect(r.note).not.toContain('stopped answering');
    expect(r.note).toContain('Loaded 6 items');
  });
});
