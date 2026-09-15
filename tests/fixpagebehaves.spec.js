/* THREE THINGS ON THE FIX PIXELS PAGE.

   A SECOND BATCH STARTED MID-RUN shared the first one's state. fixBatch owns
   three module-level variables and had no re-entrancy guard, so a second call
   cleared the Stop flag the first loop re-reads every iteration, took over the
   array it was pushing into, revoked its thumbnails, and let whichever loop
   finished first hide the Stop button and enable "Download all" over a list the
   other was still writing. Opening a single image did the other half: it hides
   the batch panel, taking the Stop button away from a run still going.

   "IMPORT A FOLDER" could not be used from the keyboard. The button is nested
   inside the drop zone, whose click path is guarded and whose KEY path was not -
   so Enter on the button bubbled to the zone, opened the plain image picker, and
   preventDefault cancelled the button's own activation. The folder picker is
   where the trait category comes from, so the wrong dialog means every trait
   lands in unsorted.

   AND SIX DROPDOWNS were 21px tall on a phone, because the 30px floor was
   written as a list of containers and those six sit outside all of them.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof fixBatch === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    /* ON THE PAGE. Its controls exist in the markup at all times but have no
       size until the page is shown, and an earlier version of this file
       measured them all at zero - which made the keyboard test unable to
       focus anything and the height sweep pass by finding nothing. */
    showPage('fixer', false);
  });
  await page.waitForTimeout(120);
};

/* A small checkerboard, which is what the fixer is for. */
const png = (page, v) => page.evaluate(async (c) => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
    g.fillStyle = ((x + y) / 4) % 2 ? 'rgb(' + c + ',0,0)' : '#ffffff';
    g.fillRect(x, y, 4, 4);
  }
  const b = await new Promise(r => cv.toBlob(r, 'image/png'));
  window.__bytes = new Uint8Array(await b.arrayBuffer());
  return window.__bytes.length;
}, v);

test.describe('one folder is fixed at a time', () => {
  test('A SECOND FOLDER IS REFUSED WHILE ONE IS RUNNING', async ({ page }) => {
    await ready(page);
    await png(page, 200);
    const out = await page.evaluate(async () => {
      /* The run is held open at its own worker boundary, so the second call
         lands while the first is genuinely mid-loop. No timing guesswork. */
      let release = null;
      const held = new Promise(r => { release = r; });
      const realAsk = window.fixAsk;
      window.fixAsk = async (...a) => { await held; return realAsk.apply(this, a); };
      const mk = (n) => new File([window.__bytes], n, { type: 'image/png' });
      const said = [];
      const realSay = window.fixSay; window.fixSay = (m) => said.push(String(m));
      const first = fixBatch([mk('a.png'), mk('b.png')]);
      await new Promise(r => setTimeout(r, 120));
      const midRun = { running: fixBatchRunning, stopHidden: $('fixbatchstop').hidden };
      /* The second attempt, the way a person reaches it: the folder picker is
         still on screen while the batch runs. */
      await fixBatch([mk('c.png')]);
      const afterSecond = { stopHidden: $('fixbatchstop').hidden,
        files: fixBatchFiles.length, stopFlag: fixBatchStop };
      /* And a single image, which hides the whole panel. */
      const loaded = await fixLoad(mk('d.png'));
      const afterLoad = { panelHidden: $('fixbatch').hidden, loaded };
      release();
      await first;
      window.fixAsk = realAsk; window.fixSay = realSay;
      return { midRun, afterSecond, afterLoad, said,
        endedRunning: fixBatchRunning, endFiles: fixBatchFiles.length };
    });
    /* The precondition: the first run really was in flight. */
    expect(out.midRun.running, 'a batch was running').toBe(true);
    expect(out.midRun.stopHidden, 'and its Stop button was up').toBe(false);
    /* The second folder was refused, and said so. */
    expect(out.said.join(' | ')).toContain('still being fixed');
    expect(out.afterSecond.stopHidden, 'the first run kept its Stop button').toBe(false);
    /* Opening one image mid-run is refused the same way, so the panel stays. */
    expect(out.afterLoad.panelHidden, 'the batch panel was not taken away').toBe(false);
    expect(out.afterLoad.loaded, 'and fixLoad said it did not load it').toBe(false);
    /* And the flag clears when the run ends, or every later folder is refused. */
    expect(out.endedRunning).toBe(false);
  });

  test('and a folder after one has finished runs normally - the control',
    async ({ page }) => {
      /* The guard must not outlive the run. A flag left set would refuse
         everything for the rest of the session, which is worse than the
         defect it fixes. */
      await ready(page);
      await png(page, 200);
      const out = await page.evaluate(async () => {
        const mk = (n) => new File([window.__bytes], n, { type: 'image/png' });
        const realSay = window.fixSay; const said = [];
        window.fixSay = (m) => said.push(String(m));
        $('fixmode').value = 'scale';
        await fixBatch([mk('a.png')]);
        await fixBatch([mk('b.png')]);
        window.fixSay = realSay;
        return { said, files: fixBatchFiles.length };
      });
      /* NOTHING HERE NAMES THE NEW FLAG, deliberately. A first version read
         fixBatchRunning, which does not exist in the version this is verified
         against, so it threw rather than passing - a control that cannot run on
         the old code is not a control. That the flag clears is asserted in the
         test above, where it belongs; this one only says the second folder was
         allowed to run, which was true before and has to stay true. */
      expect(out.said.join(' | '), 'the second was not refused')
        .not.toContain('still being fixed');
      expect(out.files, 'and it produced its own file').toBe(1);
    });
});

test.describe('the folder button answers to the keyboard', () => {
  test('ENTER ON IT OPENS THE FOLDER PICKER, NOT THE IMAGE ONE',
    async ({ page }) => {
      await ready(page);
      const out = await page.evaluate(async () => {
        /* Which hidden input was actually asked to open. */
        const opened = [];
        for (const id of ['fixfile', 'fixfolder'])
          $(id).addEventListener('click', (e) => { opened.push(id); e.preventDefault(); });
        const btn = $('fixfolderbtn');
        btn.focus();
        const focused = document.activeElement && document.activeElement.id;
        btn.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'Enter', bubbles: true, cancelable: true }));
        /* A real Enter on a button also fires its click; jsdom-free browsers
           do that natively, but a synthetic keydown does not - so the click
           the browser would send is sent here too, and the question under
           test is whether the ZONE hijacked the keydown before it. */
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return { focused, opened };
      });
      expect(out.focused, 'the button can be focused at all').toBe('fixfolderbtn');
      expect(out.opened, 'the folder picker, and not the image picker')
        .toEqual(['fixfolder']);
    });

  test('and the drop zone itself still answers to Enter - the control',
    async ({ page }) => {
      /* The guard is e.target!==d. If it were wrong in the other direction the
         zone would stop working entirely, and nothing else on the page opens
         the image picker. */
      await ready(page);
      const opened = await page.evaluate(async () => {
        const seen = [];
        for (const id of ['fixfile', 'fixfolder'])
          $(id).addEventListener('click', (e) => { seen.push(id); e.preventDefault(); });
        const d = $('fixdrop');
        d.focus();
        d.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'Enter', bubbles: true, cancelable: true }));
        return seen;
      });
      expect(opened).toEqual(['fixfile']);
    });
});

test.describe('a dropdown on a phone is big enough to press', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /* BOTH PAGES. #fixmode is on Fix pixels and the four rule and review pickers
     are on Project settings, and a control has no size until its page is shown -
     so a sweep of one page measures the other page's selects at zero and passes
     by finding nothing. An earlier version of this file did exactly that. */
  /* AND WITH TRAITS IN THE PROJECT. The rule and review pickers live inside
     panels that are hidden while the project is empty, so an unseeded settings
     page shows no selects at all - measured 0x0 for every one of them - and a
     sweep of it passes by finding nothing. */
  const onEachPage = (page) => page.evaluate(async () => {
    await dbClear();
    LAYERS = ['eyes', 'unsorted'];
    await dbPut({ id: 'settings.layers', kind: 'settings', at: 1,
      layers: ['eyes', 'unsorted'], hidden: [] });
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    cv.getContext('2d').fillRect(0, 0, 16, 16);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    for (const nm of ['one', 'two'])
      await dbPut({ id: 't_' + nm + '_eyes_approved', kind: 'trait', name: nm,
        layer: 'eyes', status: 'approved', blob, w: 16, h: 16, rarity: 1, at: 1 });
    await renderShelf();
    await new Promise(r => setTimeout(r, 250));
    const out = { seen: 0, small: [], byId: {} };
    for (const p of ['fixer', 'settings']) {
      showPage(p, false);
      await new Promise(r => setTimeout(r, 120));
      for (const s of document.querySelectorAll('select')) {
        const r = s.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        out.seen++;
        const h = Math.round(r.height);
        if (s.id) out.byId[s.id] = h;
        if (h < 30) out.small.push((s.id || s.className || 'select') + ':' + h);
      }
    }
    return out;
  });

  test('EVERY SELECT ON EITHER PAGE CLEARS 30 PIXELS', async ({ page }) => {
    await ready(page);
    const out = await onEachPage(page);
    /* The precondition, because "none is under 30px" is satisfied by measuring
       none of them. */
    expect(out.seen, 'selects were actually on screen').toBeGreaterThan(4);
    expect(out.small, 'nothing under 30px').toEqual([]);
  });

  test('and the five that were measured at 21px by name', async ({ page }) => {
    /* By id, so this still says something if a future page hides the rest. */
    await ready(page);
    const out = await onEachPage(page);
    for (const id of ['fixmode', 'rulea', 'ruleb', 'revtrait', 'revlayer']) {
      expect(out.byId[id], id + ' was never measured').toBeDefined();
      expect(out.byId[id], id + ' was 21px').toBeGreaterThanOrEqual(30);
    }
  });
});
