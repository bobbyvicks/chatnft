/* AN ANSWER BELONGS TO THE THING THAT ASKED.

   Two places where something slow came back and was applied to whatever was
   there when it arrived rather than to what it was about.

   THE PULL. Each project is a separate IndexedDB and db() re-derives which one
   from the module-level activeWs on EVERY call. cloudPull runs eight pullers,
   each awaiting a network download per trait, and captures no handle - so
   switching project from the dropdown mid-pull sent every remaining write into
   the newly selected project's database, marked synced and carrying the source
   project's rowId. Nothing removes them, and Save to cloud there uploads them
   into that collection.

   THE FIXER. fixRun's worker writes its result into module state, and every
   consumer reads FIX.name and FIX.rel live. fixLoad replaces all of it and
   never touched the running worker - fixRun itself opens with fixStop(), so
   the guard existed one function away. Drop A, press Fix it, drop B: A's
   result arrives into B's panes, and Save to project writes A's artwork under
   B's name.

   Both are driven against stubs. The pull tests stub fetch, the way
   cloudpull.spec.js does - no credentials, no server. The fixer tests stub
   fixWorker, the way fixerscale.spec.js does, because the defect is in the
   handler rather than in the worker and a stub is the only way to control when
   the answer lands.
*/
import { test, expect } from '@playwright/test';

/* A signed-in page with two group projects and a stubbed server. ws1 holds
   three traits; ws2 holds none, so the pull that a switch kicks off finishes
   immediately and cannot itself be what writes anything. */
const arm = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  await dbClear();
  activeWs = null; cloudTeamId = null;
  localStorage.setItem('chatnft.session', JSON.stringify({
    access_token: 'not-a-real-token', refresh_token: 'not-a-real-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } }));
  const json = (o, extra) => new Response(JSON.stringify(o),
    { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
  window.__real_fetch = window.fetch;
  window.fetch = (u) => {
    const s = String(u);
    if (s.indexOf('/auth/v1/user') >= 0) return Promise.resolve(json({ id: 'u1' }));
    if (s.indexOf('/rpc/my_team') >= 0) return Promise.resolve(json('team1'));
    if (s.indexOf('/rest/v1/collections') >= 0)
      return Promise.resolve(json([{ id: 'c1', layers: ['skins'] }]));
    /* BOTH PROJECTS HAVE TO EXIST. wsRender reads this list and puts
       activeWs back to null when the selected project is not in it - so with
       an empty answer the switch undid itself and the precondition below
       caught a test that was measuring nothing. */
    if (s.indexOf('/rest/v1/teams') >= 0)
      return Promise.resolve(json([
        { id: 'ws1', name: 'One', personal: false },
        { id: 'ws2', name: 'Two', personal: false }]));
    /* Only the project the pull started in has anything to send. */
    const mine = activeWs === 'ws2' ? [] : [0, 1, 2].map(i => ({
      id: 'row' + i, kind: 'trait', name: 'trait' + i, layer: 'skins',
      status: 'approved', path: 'p/' + i + '.png', w: 16, h: 16, rarity: 1,
      updated_at: '2026-01-01T00:00:00Z' }));
    if (s.indexOf('/rest/v1/traits?select=id') >= 0)
      return Promise.resolve(json([], { 'Content-Range': '0-0/' + mine.length }));
    if (s.indexOf('/rest/v1/traits?select=*') >= 0)
      return Promise.resolve(json(mine,
        { 'Content-Range': '0-' + Math.max(0, mine.length - 1) + '/' + mine.length }));
    return Promise.resolve(json([]));
  };
  window.__realPullBlob = window.pullBlob;
});

/* What is actually in a given project's database, read by name so a stray
   settings row cannot pad the count. */
const traitsIn = (page, ws) => page.evaluate(async (w) => {
  const was = activeWs;
  activeWs = w; dbp = null; dbpName = null;
  let out = [];
  try { out = (await dbAll()).filter(r => r.kind === 'trait').map(r => r.id).sort(); }
  catch (_) {}
  activeWs = was; dbp = null; dbpName = null;
  return out;
}, ws);

test.describe('an answer belongs to the thing that asked', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof cloudPull === 'function');
    await arm(page);
  });

  test('A PROJECT SWITCH MID-PULL WRITES NOTHING INTO THE NEW PROJECT',
    async ({ page }) => {
      const out = await page.evaluate(async () => {
        activeWs = 'ws1'; dbp = null; dbpName = null;
        /* The switch happens where a person's would: while a download is in
           flight. wsSwitch is called for real rather than simulated - it is
           the gesture, and setting activeWs by hand would only be testing the
           guard against itself. Not awaited, because a click is not awaited. */
        let n = 0;
        window.pullBlob = async () => {
          n++;
          if (n === 1) { wsSwitch('ws2'); }
          await new Promise(r => setTimeout(r, 30));
          return new Blob([new Uint8Array(8)]);
        };
        const realToast = window.toast; window.toast = () => {};
        try { await cloudPull({ quiet: true }); }
        finally { window.toast = realToast; window.pullBlob = window.__realPullBlob; }
        await new Promise(r => setTimeout(r, 400));
        return { downloads: n, endedIn: activeWs };
      });
      /* The precondition. If the switch did not happen, or no download ran,
         this test proves nothing about where writes land. */
      expect(out.endedIn, 'the switch really happened').toBe('ws2');
      expect(out.downloads, 'and a download really was in flight').toBeGreaterThan(0);
      expect(await traitsIn(page, 'ws2'), 'ws2 got none of ws1 traits').toEqual([]);
    });

  test('and an uninterrupted pull still writes all of them - the control',
    async ({ page }) => {
      /* Without this the test above passes just as well against a pull that
         writes nothing at all. */
      await page.evaluate(async () => {
        activeWs = 'ws1'; dbp = null; dbpName = null;
        window.pullBlob = async () => {
          await new Promise(r => setTimeout(r, 30));
          return new Blob([new Uint8Array(8)]);
        };
        const realToast = window.toast; window.toast = () => {};
        try { await cloudPull({ quiet: true }); }
        finally { window.toast = realToast; window.pullBlob = window.__realPullBlob; }
      });
      expect(await traitsIn(page, 'ws1')).toEqual(
        ['t_trait0_skins_approved', 't_trait1_skins_approved', 't_trait2_skins_approved']);
    });

  test('AND LOAD FROM CLOUD IS STILL PRESSABLE AFTERWARDS', async ({ page }) => {
    /* The bail returns past the line that re-enables the button. cloudPush had
       exactly this shape and it cost a whole session's Save to cloud, so a new
       early return without the same care would have rebuilt it. */
    const disabled = await page.evaluate(async () => {
      activeWs = 'ws1'; dbp = null; dbpName = null;
      window.pullBlob = async () => { wsSwitch('ws2'); await new Promise(r => setTimeout(r, 30));
        return new Blob([new Uint8Array(8)]); };
      const realToast = window.toast; window.toast = () => {};
      try { await cloudPull({ quiet: true }); }
      finally { window.toast = realToast; window.pullBlob = window.__realPullBlob; }
      await new Promise(r => setTimeout(r, 300));
      return { disabled: $('cloudpull').disabled, endedIn: activeWs };
    });
    /* The same precondition as the test above, for the same reason: with no
       switch there is no bail, and this would assert that an ordinary pull
       re-enables its own button - which it always did. */
    expect(disabled.endedIn, 'the switch really happened').toBe('ws2');
    expect(disabled.disabled).toBe(false);
  });

  test('A SECOND IMAGE IN THE FIXER REFUSES THE FIRST ONE ANSWER',
    async ({ page }) => {
      const out = await page.evaluate(async () => {
        /* A worker under this test's control. The defect is in the handler,
           and a real worker cannot be made to answer at the exact moment
           after another image has been loaded. */
        const real = window.fixWorker;
        window.fixWorker = function () {
          const w = { _url: 'stub', postMessage() {}, terminate() { w.__gone = true; } };
          window.__w = w; return w;
        };
        const png = async (v) => {
          const c = document.createElement('canvas'); c.width = 64; c.height = 64;
          const g = c.getContext('2d');
          for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
            g.fillStyle = ((x + y) / 4) % 2 ? 'rgb(' + v + ',0,0)' : '#ffffff';
            g.fillRect(x, y, 4, 4);
          }
          return new Promise(r => c.toBlob(r, 'image/png'));
        };
        await fixLoad(new File([await png(200)], 'A.png', { type: 'image/png' }));
        const running = fixRun();
        const workerA = window.__w;
        /* B arrives while A is still being worked on. */
        await fixLoad(new File([await png(40)], 'B.png', { type: 'image/png' }));
        const stoppedOnLoad = !!(workerA && workerA.__gone);
        /* And A answers anyway, which is what a message already dispatched
           does whatever happened to the worker afterwards. */
        const d = new Uint8ClampedArray(16 * 16 * 4);
        for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 3] = 255; }
        workerA.onmessage({ data: { done: { data: d, width: 16, height: 16,
          stepX: 4, stepY: 4, confidence: 'high', consensus: 'agreed' } } });
        const got = await running;
        window.fixWorker = real;
        return { stoppedOnLoad, got, out: FIX.out, name: FIX.name,
          acts: $('fixacts').hidden };
      });
      expect(out.stoppedOnLoad, 'loading B stops the run that was for A').toBe(true);
      expect(out.name, 'B is the loaded picture').toBe('B');
      expect(out.out, 'A result did not become the thing that saves').toBe(null);
      expect(out.got, 'and the run resolved with nothing rather than A').toBe(null);
      expect(out.acts, 'and Save to project did not appear for it').toBe(true);
    });

  test('and a run nobody interrupted still lands - the control',
    async ({ page }) => {
      /* The same path with no second load. If this went red the guard would be
         refusing every answer, which passes the test above for the worst
         possible reason. */
      const out = await page.evaluate(async () => {
        const real = window.fixWorker;
        window.fixWorker = function () {
          const w = { _url: 'stub', postMessage() {}, terminate() { w.__gone = true; } };
          window.__w = w; return w;
        };
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
          g.fillStyle = ((x + y) / 4) % 2 ? 'rgb(200,0,0)' : '#ffffff';
          g.fillRect(x, y, 4, 4);
        }
        const b = await new Promise(r => c.toBlob(r, 'image/png'));
        await fixLoad(new File([b], 'A.png', { type: 'image/png' }));
        const running = fixRun();
        const d = new Uint8ClampedArray(16 * 16 * 4);
        for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 3] = 255; }
        window.__w.onmessage({ data: { done: { data: d, width: 16, height: 16,
          stepX: 4, stepY: 4, confidence: 'high', consensus: 'agreed' } } });
        const got = await running;
        window.fixWorker = real;
        return { got: !!got, width: got && got.width, hasOut: !!FIX.out,
          acts: $('fixacts').hidden };
      });
      expect(out.got).toBe(true);
      expect(out.width).toBe(16);
      expect(out.hasOut).toBe(true);
      expect(out.acts, 'and Save to project appeared').toBe(false);
    });
});
