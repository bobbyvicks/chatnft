/* The seed helpers write what they are given and nothing else - so a spec can
   write a record from before stage 0 (no stamps) and one from after (with
   them), which dbPut cannot once stage 0 stamps every write it makes. */
import { test, expect } from '@playwright/test';
import { seedTrait, findTrait, seedSettings, seedDraft } from './helpers.js';

test.describe('seed helpers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof dbAll === 'function');
    await page.evaluate(async () => { activeWs = null; dbp = null; dbpName = null; await dbClear(); });
  });

  test('a trait holds exactly the fields given, and is found by what a person calls it', async ({ page }) => {
    const id = await seedTrait(page, { name: 'cap', layer: 'hats', status: 'approved', rowId: 'row-1', synced: true });
    expect(id).toBe('t_cap_hats_approved');
    const r = await findTrait(page, 'trait', 'cap', 'hats', 'approved');
    expect(r).toEqual({ id: 't_cap_hats_approved', kind: 'trait', name: 'cap', layer: 'hats', status: 'approved',
      w: 16, h: 16, at: 1, rarity: 1, rowId: 'row-1', synced: true });
    expect(await findTrait(page, 'trait', 'cap', 'hats', 'wip'), 'the control: another status is another trait').toBeNull();
  });

  test('stamps are written only when given', async ({ page }) => {
    await seedTrait(page, { name: 'hat', layer: 'hats', by: 'u1', wk: 'person', lid: 'l_1' });
    const r = await findTrait(page, 'trait', 'hat', 'hats', 'wip');
    expect([r.by, r.wk, r.lid]).toEqual(['u1', 'person', 'l_1']);
  });

  test('a reference, a settings record and a draft', async ({ page }) => {
    await seedTrait(page, { kind: 'ref', name: 'base' });
    await seedSettings(page, 'settings.attempts', { entries: [{ at: 1 }] });
    const d = await seedDraft(page, { traitId: 't_hat_hats_wip', at: 5 });
    expect(d).toBe('autosave.t_hat_hats_wip');
    const got = await page.evaluate(async () => (await dbAll()).map(x => x.id + ':' + x.kind).sort());
    expect(got).toEqual(['autosave.t_hat_hats_wip:autosave', 'ref_base:ref', 'settings.attempts:settings']);
  });

  test('two records answering to one name are an error, never a guess', async ({ page }) => {
    await seedTrait(page, { id: 't_a', name: 'cap', layer: 'hats' });
    await seedTrait(page, { id: 't_b', name: 'cap', layer: 'hats' });
    await expect(findTrait(page, 'trait', 'cap', 'hats', 'wip')).rejects.toThrow(/2 records/);
  });
});
