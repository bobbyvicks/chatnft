/* A DROP ON YOUR OWN PAGE IS ONE WRITE, AND A REFUSED DRAG SAYS WHY.

   Reordering a layer of 39 synced traits on your own page marked each one
   unsent with its own read and write after the shelf was redrawn, holding
   the lock that refuses a new drag - and the refusal was silent. RUN
   AGAINST THE PAGE BEFORE THE FIX: the first two went red - 39 reads after
   the drop, and a drag refused with nothing said. The last is the control
   that every renumbered trait still ends up marked the way markUnsent
   marks it: not sent, the picture's path kept, the change named meta. */
import { test, expect } from '@playwright/test';

const seed = (page) => page.evaluate(async () => {
  try { authed = true; } catch (_) {}
  gateShow(false);
  activeWs = null; cloudTeamId = null; dbp = null; dbpName = null;
  await dbClear();
  LAYERS = ['hats', 'unsorted'];
  for (let i = 0; i < 39; i++) {
    const rec = { id: 't_h' + i + '_hats_approved', kind: 'trait', name: 'h' + i, layer: 'hats', status: 'approved',
      blob: new Blob([new Uint8Array(8)]), w: 16, h: 16, rarity: 1, at: 1, shelfOrder: i, synced: true, rowId: 'row' + i };
    rec.path = 'me/c1/' + cloudTail(rec);
    await dbPut(rec);
  }
  try { showPage('project', false); } catch (_) {}
  await renderShelf();
});

test.describe('a drop on your own page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof commitShelfMove === 'function');
    await seed(page);
  });

  test('A DROP IN A LAYER OF 39 reads nothing back one trait at a time', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const key = t => shelfCore.recordKey(items.find(i => i.name === t));
      let reads = 0;
      const real = dbGet;
      dbGet = async (id) => { reads++; return real(id); };
      const t = window.toast; window.toast = () => {};
      let ok;
      try { ok = await commitShelfMove({ recordKey: key('h5'), toLayer: 'hats', beforeKey: key('h0') }); }
      finally { dbGet = real; window.toast = t; }
      return { ok, reads };
    });
    expect(r.ok).toBe(true);
    expect(r.reads).toBe(0);
  });

  test('A DRAG WHILE A MOVE IS FINISHING is refused out loud', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const handle = document.querySelector('#projbody .item .draghandle');
      const said = []; const t = window.toast; window.toast = (x) => said.push(String(x));
      shelfMoveBusy = true;
      try {
        const b = handle.getBoundingClientRect();
        handle.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true,
          clientX: b.left + 2, clientY: b.top + 2, pointerId: 1 }));
      } finally { shelfMoveBusy = false; window.toast = t; }
      return { handle: !!handle, said: said.join(' | ') };
    });
    expect(r.handle, 'there is a handle to press').toBe(true);
    expect(r.said).toContain('Still moving');
  });

  test('the control: every renumbered trait ends up marked as markUnsent marks it', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const items = (await dbAll()).filter(i => i.kind === 'trait');
      const key = t => shelfCore.recordKey(items.find(i => i.name === t));
      const t = window.toast; window.toast = () => {};
      try { await commitShelfMove({ recordKey: key('h5'), toLayer: 'hats', beforeKey: key('h0') }); }
      finally { window.toast = t; }
      const after = (await dbAll()).filter(i => i.kind === 'trait');
      return {
        order: after.slice().sort((a, b) => a.shelfOrder - b.shelfOrder).slice(0, 3).map(i => i.name),
        unsent: after.filter(i => i.synced === false && i.unsent === 'meta' && i.path).length,
        total: after.length,
      };
    });
    expect(r.order, 'the move happened').toEqual(['h5', 'h0', 'h1']);
    expect(r.unsent, 'and every renumbered trait waits for Save to cloud, its picture path kept').toBe(r.total);
  });
});
