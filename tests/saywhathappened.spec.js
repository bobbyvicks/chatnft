/* MESSAGES THAT COUNT WHAT HAPPENED, AND STATE THAT DOES NOT OUTLIVE IT.

   The rest of a defect sweep over the file. Three of these were reports that
   counted the ATTEMPT and called it the result, which is the one thing this
   codebase says everywhere it must not do; the others are values read long
   after the thing they described had moved on.
*/
import { test, expect } from '@playwright/test';
import { openTrait } from './helpers.js';

const landing = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bulkImport === 'function');
  await page.evaluate(() => {
    try { authed = true; } catch (_) {}
    try { gateShow(false); } catch (_) {}
    activeWs = null;
  });
  await page.waitForTimeout(250);
  await page.evaluate(async () => { try { await dbClear(); } catch (_) {} });
};

/* A PNG that decodes, and one that will not. bulkImport drops the second
   without throwing, which is what made the count wrong. */
const filesFor = (page, n, broken) => page.evaluate(async ([n, broken]) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + (20 + i * 9) + ',80,120)';
    g.fillRect(0, 0, 32, 32);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const f = new File([blob], 'Good' + i + '.png', { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath',
      { value: 'clothing/wip/Good' + i + '.png' });
    out.push(f);
  }
  if (broken) {
    const f = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'Broken.png',
      { type: 'image/png' });
    Object.defineProperty(f, 'webkitRelativePath',
      { value: 'clothing/wip/Broken.png' });
    out.push(f);
  }
  window.__files = out;
  return out.length;
}, [n, broken]);

test('THE IMPORT TELLS ITS CALLER WHAT IT WROTE', async ({ page }) => {
  await landing(page);
  await filesFor(page, 3, true);
  const r = await page.evaluate(async () => {
    const res = await bulkImport(window.__files);
    await new Promise(x => setTimeout(x, 200));
    const kept = (await dbAll()).filter(i => i.kind === 'trait').length;
    return { res, kept };
  });
  /* It returned nothing at all, so a caller with its own message to write had
     to guess - and the fixer's Save to project guessed the number of files it
     had handed over. */
  expect(r.res, 'it answers now').toBeTruthy();
  expect(r.res.ok, 'three of the four decoded').toBe(3);
  expect(r.kept, 'and three are in the project').toBe(3);
  expect(r.res.failed, 'the fourth could not be read').toBe(1);
  expect(r.res.skipped, 'and is counted as skipped').toBe(1);
});

test('and the fixer save says what was written, not what it handed over',
  async ({ page }) => {
    await landing(page);
    await filesFor(page, 3, true);
    const said = await page.evaluate(async () => {
      let msg = '';
      const n = await fixSaveFiles(window.__files, (m) => { msg = String(m); });
      await new Promise(x => setTimeout(x, 200));
      return { msg, n };
    });
    /* Four files in, one of them undecodable, three written. This said four. */
    expect(said.n, 'it returns what was written').toBe(3);
    expect(said.msg).toContain('3 sent to the project');
    expect(said.msg, 'and names what did not make it').toContain('1 could not be saved');
  });

test('and a clean save still reads exactly as it did - the control',
  async ({ page }) => {
    await landing(page);
    await filesFor(page, 3, false);
    const said = await page.evaluate(async () => {
      let msg = '';
      const n = await fixSaveFiles(window.__files, (m) => { msg = String(m); });
      return { msg, n };
    });
    /* Without this, "it names the failures" would also pass on a version that
       had started naming failures that did not happen. */
    expect(said.n).toBe(3);
    expect(said.msg).toContain('3 sent to the project');
    expect(said.msg).not.toContain('could not be saved');
    expect(said.msg).not.toContain('here only');
  });

test('AN UPLOAD THAT DID NOT ARRIVE IS SAID SO', async ({ page }) => {
  await landing(page);
  await filesFor(page, 2, false);
  const r = await page.evaluate(async () => {
    /* A group project whose uploads all fail, which is what an expired token
       or a dropped connection looks like from in here. */
    activeWs = 'team-1';
    const real = window.cloudSyncOne;
    window.cloudSyncOne = async () => null;
    let note = '';
    try {
      const res = await bulkImport(window.__files);
      await new Promise(x => setTimeout(x, 200));
      note = document.getElementById('bulknote').textContent;
      return { res, note };
    } finally { window.cloudSyncOne = real; activeWs = null; }
  });
  /* The traits ARE here - this is a wrong message rather than lost work - and
     somebody who believes the group has them finds out much later. */
  expect(r.res.ok, 'both are in this browser').toBe(2);
  expect(r.res.notShared, 'and neither reached the group').toBe(2);
  expect(r.note).toContain('saved here only');
  expect(r.note, 'and says what to do about it').toContain('Save to cloud');
});

test('and nothing is said when there is no group - the control', async ({ page }) => {
  await landing(page);
  await filesFor(page, 2, false);
  const r = await page.evaluate(async () => {
    const res = await bulkImport(window.__files);
    await new Promise(x => setTimeout(x, 200));
    return { res, note: document.getElementById('bulknote').textContent };
  });
  expect(r.res.notShared).toBe(0);
  expect(r.note).not.toContain('here only');
});

test('SAVE TO CLOUD COMES BACK WHEN THE PUSH THROWS', async ({ page }) => {
  await landing(page);
  const r = await page.evaluate(async () => {
    const b = document.getElementById('cloudpush');
    const real = window.cloudPush;
    const realToast = window.toast; let said = '';
    window.toast = (m) => { said += String(m); };
    /* Whatever throws in there, the button is the only way back in. */
    window.cloudPush = async () => { b.disabled = true; throw new Error('link down'); };
    try {
      b.onclick();
      await new Promise(x => setTimeout(x, 300));
    } finally { window.cloudPush = real; window.toast = realToast; }
    return { disabled: b.disabled, said };
  });
  /* It disabled the button at the top and re-enabled it 120 lines later with
     no try/finally, and nothing else in the file assigns that property - so a
     throw in between left the button dead until a reload. */
  expect(r.disabled, 'the button is usable again').toBe(false);
  expect(r.said, 'and it says why').toContain('Save to cloud stopped');
});

test('A RUN IS LABELLED WITH WHAT IT MEASURED, not what was measured later',
  async ({ page }) => {
    await openTrait(page, { w: 8, h: 8, draw: () => {} });
    const r = await page.evaluate(() => {
      /* The stamp used to read the module flag when the worker replied, which
         is long after the run decided - and the Pixel size readout rewrites
         that flag on every keystroke. */
      const a = fixStampMeasured({ confidence: 'medium', consensus: 'forced' }, 5);
      /* Whatever the flag says now, this result carries its own. */
      const b = fixStampMeasured({ confidence: 'medium', consensus: 'forced' }, 0);
      return { a, b, takesBlock: /function fixStampMeasured\(r,block\)/
        .test(String(fixStampMeasured)) };
    });
    expect(r.takesBlock, 'it is told, not left to look it up').toBe(true);
    expect(r.a.consensus, 'a measured run is stamped measured').toBe('measured');
    expect(r.a.measuredBlock).toBe(5);
    /* AND THE CONTROL: a run that measured nothing is not stamped, whatever a
       later run happens to have put in the flag. */
    expect(r.b.consensus, 'and one that measured nothing is not').toBe('forced');
    expect(r.b.confidence).toBe('medium');
  });

test('and a scripted run measures its own picture', async ({ page }) => {
  await openTrait(page, { w: 8, h: 8, draw: () => {} });
  const r = await page.evaluate(async () => {
    /* Blocks of 4, so the measurement has a definite answer. */
    const S = 32, d = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, k = ((x >> 2) + (y >> 2)) % 2;
      d[i] = k ? 240 : 30; d[i + 1] = 60; d[i + 2] = k ? 30 : 200; d[i + 3] = 255;
    }
    /* A stale measurement from some earlier file. */
    FIX.native = 99;
    await PB.fix({ data: d, width: S, height: S, name: 'scripted' });
    return { native: FIX.native, srcW: FIX.src && FIX.src.width };
  });
  /* FIX.native is the cache fixNativeBlockFor short-circuits on, keyed by
     data identity - and PB.fix replaced the data and left the number, so a
     scripted run inherited the block size of whatever was last opened by
     hand. */
  expect(r.srcW, 'the picture really was replaced').toBe(32);
  expect(r.native, 'and it is not the stale 99').not.toBe(99);
  expect(r.native, 'it is this picture, measured').toBe(4);
});

test('A DRAFT IS SAVED WITH ITS OWN DIMENSIONS', async ({ page }) => {
  await openTrait(page, { w: 32, h: 32, draw: (set) => { set(1, 1, [10, 20, 30]); } });
  const r = await page.evaluate(async () => {
    /* Hold the encode open, so the window between starting an autosave and
       it landing is a window a test can stand in. That window is real: on a
       phone a toBlob of a 1280 canvas is not instant. */
    let fire = null;
    const realToBlob = art.toBlob.bind(art);
    art.toBlob = (cb) => { realToBlob(b => { fire = () => cb(b); }); };
    snapshot();
    const p = autosaveNow();
    for (let i = 0; i < 40 && !fire; i++) await new Promise(x => setTimeout(x, 25));
    const was = art.width;
    /* Another trait opened while the first one's encode is in flight. */
    art.width = 64; art.height = 64;
    fileName = 'somethingelse.png';
    fire();
    await p;
    art.toBlob = realToBlob;
    const d = (await dbAll()).filter(i => i.kind === 'autosave');
    return { was, saved: d.length ? { w: d[0].w, h: d[0].h, name: d[0].name } : null };
  });
  /* The comment above autosaveNow says values are captured before the encode
     because what they describe can change underneath - and it captured the
     draft key and the open record that way while reading the size and the
     name inside the callback. The draft then described a picture it did not
     contain, and restoring it gives the wrong canvas. */
  expect(r.was, 'the trait was 32 when the encode started').toBe(32);
  expect(r.saved, 'a draft was written').toBeTruthy();
  expect(r.saved.w, 'and it is 32, the picture it actually holds').toBe(32);
  expect(r.saved.h).toBe(32);
  expect(r.saved.name, 'under the name it had then').not.toBe('somethingelse.png');
});

test('AND A TRAIT THE EXPORT COULD NOT READ IS NAMED IN THE MANIFEST',
  async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportCollection === 'function');
    const r = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false); activeWs = null; await dbClear();
      const S = 32, c = document.createElement('canvas');
      c.width = S; c.height = S; c.getContext('2d').fillRect(0, 0, S, S);
      const blob = await new Promise(x => c.toBlob(x, 'image/png'));
      c.width = 1; c.height = 1;
      await dbPut({ id: 't_Good_hats_approved', kind: 'trait', name: 'Good',
        layer: 'hats', status: 'approved', blob, w: S, h: S, at: Date.now() });
      /* A record whose picture will not come back - the shape of an evicted
         blob, or one whose backing file the browser has lost. */
      await dbPut({ id: 't_Broken_hats_approved', kind: 'trait', name: 'Broken',
        layer: 'hats', status: 'approved', blob: null, w: S, h: S, at: Date.now() });
      await dbPut({ id: 'settings.layers', kind: 'settings',
        layers: ['hats', 'unsorted'], hidden: [], at: 1 });
      await renderShelf();
      let grabbed = null;
      const realZip = window.zip;
      window.zip = (files) => { grabbed = files; return realZip(files); };
      const realToast = window.toast; window.toast = () => {};
      try { await exportCollection(); } finally {
        window.zip = realZip; window.toast = realToast;
      }
      if (!grabbed) return { noZip: true };
      const m = grabbed.find(f => f.name === 'manifest.json');
      const j = JSON.parse(new TextDecoder().decode(m.data));
      return {
        packaged: j.traits.map(t => t.name),
        notPackaged: j.notPackaged.map(t => t.name + ':' + (t.reason || '')),
        counts: j.counts,
      };
    });
    expect(r.noZip, 'the export really did build a package').toBeFalsy();
    /* "EVERY TRAIT IS ACCOUNTED FOR" is the comment three lines below the
       skip that broke it: the continue came before both pushes, so a trait
       whose blob would not read was absent from the zip, from traits, from
       counts.packaged AND from notPackaged. It left no trace at all, and the
       collection shipped one short with nothing to point at. */
    expect(r.packaged, 'the readable one is in').toEqual(['Good']);
    expect(r.notPackaged.length, 'and the other is accounted for').toBe(1);
    expect(r.notPackaged[0]).toContain('Broken');
    expect(r.notPackaged[0], 'with a reason, so it is not confused with a rejected one')
      .toContain('could not be read');
    expect(r.counts.notPackaged).toBe(1);
  });
