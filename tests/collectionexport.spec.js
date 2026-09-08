/* Packaging the collection: one archive, and an honest word about it.

   The handoff asks for a versioned, verifiable export - the exact approved
   PNGs in layer folders, a manifest with ids, names, hashes and canvas sizes,
   the paint order, matching rule exports, a name mapping and review progress -
   and it must report incomplete review rather than implying approval.

   Every mechanical part already existed: a store-only zip writer, a
   layer-foldered PNG dump, a versioned project export, a LaunchMyNFT rule
   writer, and a SHA-256 that had been sitting inside bulkImport. Four buttons
   making four unrelated files, none carrying a hash, a revision, a name
   mapping, or a word about whether the pass was finished.

   THE TEST THAT MATTERS IS THE ONE ABOUT NOT LOOKING FINISHED. A package made
   before any review, or half way through one, must say so - and say it
   somewhere a person opening the zip will see without parsing JSON. Getting
   that wrong is the difference between a collection and a collection that
   claims to be approved.

   THE ARCHIVE IS OPENED AND READ, not trusted. Asserting on what the function
   returned would pass just as happily against a zip that was never written
   correctly, so every check here walks the real bytes.
*/
import { test, expect } from '@playwright/test';

/* A tiny store-only ZIP reader: enough to list names and pull bytes back out.
   Runs in the page so the Blob never has to cross the boundary. */
const READER = `
async function readZip(blob){
  const buf=new Uint8Array(await blob.arrayBuffer());
  const dv=new DataView(buf.buffer);
  const out={};
  let i=0;
  while(i<buf.length-4){
    if(dv.getUint32(i,true)!==0x04034b50) break;
    const nlen=dv.getUint16(i+26,true), elen=dv.getUint16(i+28,true);
    const csize=dv.getUint32(i+18,true);
    const name=new TextDecoder().decode(buf.subarray(i+30,i+30+nlen));
    const start=i+30+nlen+elen;
    out[name]=buf.subarray(start,start+csize);
    i=start+csize;
  }
  return out;
}`;

/* Three traits: two approved on two layers, one left wip on purpose. */
const seed = (page, opts) => page.evaluate(async (o) => {
  try { authed = true; } catch (_) {}
  try { gateShow(false); } catch (_) {}
  activeWs = null;
  await dbClear();
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, 0, 8, 8);
    return new Promise(r => c.toBlob(r, 'image/png'));
  };
  const put = async (n, l, st, v) => dbPut({ id: 't_' + n + '_' + l + '_' + st,
    kind: 'trait', name: n, layer: l, status: st, blob: await png(v),
    w: 8, h: 8, at: 1 });
  await put('Sky', 'backgrounds', 'approved', 60);
  await put('Punk Eyes', 'eyes', 'approved', 120);
  await put('Half Done', 'eyes', 'wip', 180);
  LAYERS = ['backgrounds', 'eyes', 'unsorted'];
  await saveLayers();
  RULES = [['backgrounds/Sky', 'eyes/Punk Eyes']];
  await saveRules();
  if (o.queue) {
    REVIEW = { revision: 'strict-fit-v11', activeId: 'q1', entries: [
      { id: 'q1', sequence: 1, layer: 'backgrounds', originalName: 'Old Sky.png',
        currentName: 'Sky.png', finalName: 'Sky',
        artworkAccepted: !!o.finished, nameAccepted: !!o.finished, skipped: false },
      { id: 'q2', sequence: 2, layer: 'eyes', originalName: 'Punk Eyes.png',
        currentName: 'Punk Eyes.png', finalName: null,
        artworkAccepted: !!o.finished, nameAccepted: !!o.finished, skipped: false },
    ] };
    await saveReview();
    const t = (await dbAll()).find(r => r.name === 'Sky');
    await dbPut(Object.assign({}, t, { reviewId: 'q1' }));
  } else { REVIEW = null; }
  await renderShelf();
  await new Promise(r => setTimeout(r, 250));
}, opts || {});

/* Runs the real export, intercepts the download, and reads the archive. */
const packageIt = (page) => page.evaluate(async (readerSrc) => {
  eval(readerSrc);
  let grabbed = null;
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = (b) => { grabbed = b; return 'blob:probe'; };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {};
  let name = null;
  const realAppend = document.body.appendChild.bind(document.body);
  document.body.appendChild = function (el) {
    if (el && el.tagName === 'A' && el.download) name = el.download;
    return realAppend(el);
  };
  try { await exportCollection(); }
  finally {
    URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
    document.body.appendChild = realAppend;
  }
  if (!grabbed) return { none: true, note: document.getElementById('reviewnote').textContent };
  // eslint-disable-next-line no-undef
  const entries = await readZip(grabbed);
  const dec = (n) => entries[n] ? new TextDecoder().decode(entries[n]) : null;
  return {
    fileName: name,
    names: Object.keys(entries).sort(),
    manifest: JSON.parse(dec('manifest.json')),
    status: dec('review-status.txt'),
    namesCsv: dec('names.csv'),
    pngBytes: Object.keys(entries).filter(n => n.endsWith('.png'))
      .reduce((a, n) => (a[n] = entries[n].length, a), {}),
    note: document.getElementById('reviewnote').textContent,
  };
}, READER);

test.describe('packaging the collection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof exportCollection === 'function');
  });

  test('the archive holds the approved PNGs in layer folders, and nothing else',
    async ({ page }) => {
      await seed(page, { queue: true, finished: true });
      const r = await packageIt(page);
      expect(r.names).toContain('traits/backgrounds/Sky.png');
      expect(r.names).toContain('traits/eyes/Punk Eyes.png');
      /* The wip one is not in the image tree. */
      expect(r.names.filter(n => n.startsWith('traits/')).length).toBe(2);
      /* And the image tree holds images only - the handoff asks for it clean. */
      expect(r.names.filter(n => n.startsWith('traits/') && !n.endsWith('.png')))
        .toEqual([]);
      expect(r.names).toContain('manifest.json');
      expect(r.names).toContain('review-status.txt');
      expect(r.names).toContain('names.csv');
    });

  test('and the manifest carries an id, a hash and a size for each one',
    async ({ page }) => {
      await seed(page, { queue: true, finished: true });
      const r = await packageIt(page);
      const sky = r.manifest.traits.find(t => t.name === 'Sky');
      expect(sky.id, 'the queue id, which survives a rename').toBe('q1');
      expect(sky.layer).toBe('backgrounds');
      expect([sky.w, sky.h]).toEqual([8, 8]);
      expect(sky.sha256, 'a real hash').toMatch(/^[0-9a-f]{64}$/);
      expect(sky.path).toBe('traits/backgrounds/Sky.png');
      expect(r.manifest.order, 'the paint order').toEqual(['backgrounds', 'eyes', 'unsorted']);
      expect(r.manifest.format).toBe('chatnft-collection');
      expect(r.manifest.revision).toBe('strict-fit-v11');
    });

  test('AND A HALF-DONE REVIEW IS SAID, NOT IMPLIED', async ({ page }) => {
    /* THE ONE THAT MATTERS. A package that looks approved when it is not is
       the difference between a collection and a claim. */
    await seed(page, { queue: true, finished: false });
    const r = await packageIt(page);
    expect(r.manifest.reviewComplete).toBe(false);
    expect(r.manifest.review.finished).toBe(0);
    expect(r.manifest.review.total).toBe(2);
    expect(r.status, 'in words, beside the manifest').toContain('REVIEW INCOMPLETE');
    expect(r.status).toContain('NOT a finally approved collection');
    expect(r.note, 'and on screen').toContain('NOT complete');
  });

  test('and a package made before any review says that instead',
    async ({ page }) => {
      /* "Never started" is not "unfinished" and neither is "complete". A zero
         of zero that reported itself finished would be the worst of the three. */
      await seed(page, { queue: false });
      const r = await packageIt(page);
      expect(r.manifest.reviewComplete).toBe(false);
      expect(r.manifest.review.started).toBe(false);
      expect(r.status).toContain('NO REVIEW PASS HAS BEEN STARTED');
      expect(r.note).toContain('no review pass has been started');
    });

  test('and a finished one says so', async ({ page }) => {
    /* The control for the two above. Without it, "always say incomplete"
       passes both and the statement means nothing. */
    await seed(page, { queue: true, finished: true });
    const r = await packageIt(page);
    expect(r.manifest.reviewComplete).toBe(true);
    expect(r.status).toContain('REVIEW COMPLETE');
    expect(r.note).toContain('the review is complete');
  });

  test('a trait that is not approved is listed, not silently dropped',
    async ({ page }) => {
      /* Leaving it out of the image tree is right; leaving it out of the
         record is how a collection ships short with nothing to point at. */
      await seed(page, { queue: true, finished: true });
      const r = await packageIt(page);
      expect(r.manifest.counts.packaged).toBe(2);
      expect(r.manifest.counts.notPackaged).toBe(1);
      expect(r.manifest.notPackaged).toEqual([
        { name: 'Half Done', layer: 'eyes', status: 'wip' }]);
      expect(r.note).toContain('not approved');
    });

  test('the rules travel in both shapes', async ({ page }) => {
    await seed(page, { queue: true, finished: true });
    const r = await packageIt(page);
    expect(r.names).toContain('rules/launchmynft.json');
    expect(r.names).toContain('rules/never-together.json');
  });

  test('and the name mapping records what was renamed', async ({ page }) => {
    await seed(page, { queue: true, finished: true });
    const r = await packageIt(page);
    expect(r.namesCsv).toContain('layer,original,final');
    expect(r.namesCsv, 'Sky was Old Sky in the queue').toContain('"Old Sky"');
    expect(r.namesCsv).toContain('"Sky"');
  });

  test('the hash in the manifest is the hash of the bytes in the archive',
    async ({ page }) => {
      /* The whole word "verifiable" rests on this. A manifest hash computed
         from anything other than what was packaged is worse than none. */
      await seed(page, { queue: true, finished: true });
      const ok = await page.evaluate(async (readerSrc) => {
        eval(readerSrc);
        let grabbed = null;
        const realCreate = URL.createObjectURL;
        URL.createObjectURL = (b) => { grabbed = b; return 'blob:probe'; };
        const realClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};
        try { await exportCollection(); }
        finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
        // eslint-disable-next-line no-undef
        const entries = await readZip(grabbed);
        const man = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
        const out = [];
        for (const t of man.traits) {
          const bytes = entries[t.path];
          if (!bytes) { out.push([t.name, 'missing from the archive']); continue; }
          const h = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(
            bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          const hex = [...new Uint8Array(h)].map(v => v.toString(16).padStart(2, '0')).join('');
          out.push([t.name, hex === t.sha256]);
        }
        return out;
      }, READER);
      /* Sorted, because the order traits come out of the store in is not part
         of the claim - the claim is that every manifest hash is the hash of
         the bytes actually in the archive. Pinning the order made this fail
         with both hashes verifying, which is a test asserting the wrong thing. */
      expect(ok.length, 'both approved traits were checked').toBe(2);
      expect(ok.slice().sort((a, b) => (a[0] < b[0] ? -1 : 1)))
        .toEqual([['Punk Eyes', true], ['Sky', true]]);
    });

  test('and nothing approved means nothing is packaged', async ({ page }) => {
    await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      try { gateShow(false); } catch (_) {}
      activeWs = null;
      await dbClear();
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      c.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await dbPut({ id: 't_A_eyes_wip', kind: 'trait', name: 'A', layer: 'eyes',
        status: 'wip', blob, w: 8, h: 8, at: 1 });
      REVIEW = null;
      await renderShelf();
    });
    const r = await packageIt(page);
    expect(r.none, 'no archive was written').toBe(true);
    expect(r.note).toContain('No trait is approved');
  });
});
