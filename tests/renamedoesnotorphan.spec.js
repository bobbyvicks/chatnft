/* THE SITE IS CALLED BuildaNFT, AND THE RENAME REACHED NOTHING IT SHOULD NOT.

   Renaming what is printed is easy. The risk is everything ELSE spelled with
   the old name, because those strings are not labels - they are the keys to
   somebody's work:

     the personal database is named 'pixelbench', from the rename BEFORE this
     one, and holds every trait saved in this browser

     a group project's database is 'chatnft.ws.'+id, so renaming that prefix
     hides every trait in every group behind a key nothing asks for

     a username becomes bob@chatnft.invalid, and that address IS the account at
     the auth server - a new domain does not rename an account, it makes a
     different one and locks the owner out of the old

     a saved project and a packaged manifest carry format strings that are
     checked on the way back in

   So half of this file is about what changed and half is about what must not,
   and the second half is the half worth having. Every test here drives the
   real function rather than reading the source, because a string can be right
   in the file and wrong in the path that uses it.
*/
import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof importProject === 'function');
};

test.describe('the site is called BuildaNFT', () => {
  test('THE NAME ON SCREEN', async ({ page }) => {
    await ready(page);
    expect(await page.title()).toContain('BuildaNFT');
    const heads = await page.evaluate(() =>
      [...document.querySelectorAll('h1')].map(h => h.textContent.trim()));
    /* The sign-in card, the landing page and the editor header. */
    expect(heads.filter(t => t === 'BuildaNFT')).toHaveLength(3);
    expect(heads.filter(t => t === 'ChatNFT')).toHaveLength(0);
  });

  test('and the files it hands you', async ({ page }) => {
    await ready(page);
    /* Through the real export, with the download intercepted - the name in a
       Downloads folder is the whole point of this one. */
    const name = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      activeWs = null;
      await dbClear();
      /* Something to export: exportProject refuses an empty project, and an
         earlier version of this test cleared the store and then asserted on
         the name of a file that was never written. */
      await dbPut({ id: 't_One_eyes_approved', kind: 'trait', name: 'One',
        layer: 'eyes', status: 'approved', blob: new Blob([new Uint8Array(8)]),
        w: 16, h: 16, at: 1 });
      let asked = null;
      const realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = () => 'blob:probe';
      HTMLAnchorElement.prototype.click = function () { asked = this.download; };
      const realToast = window.toast; window.toast = () => {};
      try { await exportProject(); }
      finally {
        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        window.toast = realToast;
      }
      return asked;
    });
    expect(name).toBe('buildanft-project.json');
  });
});

test.describe('and the rename reached nothing it should not', () => {
  test('A TRAIT SAVED BEFORE THE RENAME IS STILL THERE', async ({ page }) => {
    /* The one that matters most, driven through the database rather than
       through a constant: written under the name the app has always used,
       then read back by the app's own reader. If the rename had reached DBN,
       this would come back empty - which is what "the project emptied itself"
       looks like from the outside. */
    await ready(page);
    const found = await page.evaluate(async () => {
      await new Promise((res, rej) => {
        const r = indexedDB.open('pixelbench', 1);
        r.onupgradeneeded = () => { const d = r.result;
          if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' }); };
        r.onsuccess = () => {
          const d = r.result;
          const t = d.transaction('items', 'readwrite');
          t.objectStore('items').put({ id: 't_FromBefore_eyes_approved', kind: 'trait',
            name: 'FromBefore', layer: 'eyes', status: 'approved',
            blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, at: 1 });
          t.oncomplete = () => { d.close(); res(); };
          t.onerror = () => rej(t.error);
        };
        r.onerror = () => rej(r.error);
      });
      activeWs = null; dbp = null; dbpName = null;
      return (await dbAll()).filter(x => x.kind === 'trait').map(x => x.name);
    });
    expect(found, 'the app reads the database it has always written to')
      .toContain('FromBefore');
  });

  test('and a group project still looks in the database it filled',
    async ({ page }) => {
      /* Same shape, for the per-project databases: 'chatnft.ws.'+id. A rename
         of that prefix is silent - the traits stay on disk and the project
         opens empty. */
      await ready(page);
      const found = await page.evaluate(async () => {
        await new Promise((res, rej) => {
          const r = indexedDB.open('chatnft.ws.team7', 1);
          r.onupgradeneeded = () => { const d = r.result;
            if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' }); };
          r.onsuccess = () => {
            const d = r.result;
            const t = d.transaction('items', 'readwrite');
            t.objectStore('items').put({ id: 't_Shared_eyes_approved', kind: 'trait',
              name: 'Shared', layer: 'eyes', status: 'approved',
              blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, at: 1 });
            t.oncomplete = () => { d.close(); res(); };
            t.onerror = () => rej(t.error);
          };
          r.onerror = () => rej(r.error);
        });
        activeWs = 'team7'; dbp = null; dbpName = null;
        const out = (await dbAll()).filter(x => x.kind === 'trait').map(x => x.name);
        activeWs = null; dbp = null; dbpName = null;
        return out;
      });
      expect(found).toContain('Shared');
    });

  test('A USERNAME STILL SIGNS IN TO THE SAME ACCOUNT', async ({ page }) => {
    /* The hardest one to undo, because the accounts it would orphan live on a
       server rather than in a browser. asLogin is what turns what somebody
       types into the address the auth server knows them by. */
    await ready(page);
    const addr = await page.evaluate(() => asLogin('bob'));
    expect(addr).toBe('bob@chatnft.invalid');
  });

  test('and a project exported before the rename still opens', async ({ page }) => {
    /* Through importProject, with a file carrying the tag it has always
       carried. The message it would refuse with says BuildaNFT now, which is
       the point: the words changed and the check did not. */
    await ready(page);
    const out = await page.evaluate(async () => {
      try { authed = true; } catch (_) {}
      gateShow(false);
      activeWs = null;
      await dbClear();
      const said = [];
      const realToast = window.toast; window.toast = (m) => said.push(String(m));
      const doc = { format: 'chatnft-project', version: 1, items: [] };
      const file = new File([JSON.stringify(doc)], 'old.json', { type: 'application/json' });
      try { await importProject(file); } finally { window.toast = realToast; }
      return said;
    });
    expect(out.join(' | '), 'it was not refused as somebody else\'s file')
      .not.toContain('not a BuildaNFT project');
  });

  test('and a packaged manifest still says what a minting service reads',
    async ({ page }) => {
      await ready(page);
      expect(await page.evaluate(() => COLLECTION_FORMAT)).toBe('chatnft-collection');
    });
});
