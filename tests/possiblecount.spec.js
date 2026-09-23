/* "POSSIBLE CHARACTERS" SAYS HOW SURE IT IS, AND READS PAST A BILLION.

   With Never-together rules the count is the product of the layers times
   the share the rules leave, and the share came from 4,000 samples - a
   dozen hits or none under restrictive rules. The fixtures here are small
   enough to count exactly: every trait of n layers in one rule leaves the
   empty character and the one-trait characters, 1 + 10n of 11^n. RUN
   AGAINST THE PAGE BEFORE THE FIX: see the commit body for each test. */
import { test, expect } from '@playwright/test';

/* n layers of ten traits, every one of them in a single rule. */
const stats = (page, n) => page.evaluate((n) => {
  const items = [], group = [];
  for (let l = 1; l <= n; l++) for (let i = 0; i < 10; i++) {
    const t = { id: 't_x' + i + '_l' + l + '_approved', kind: 'trait', name: 'x' + i, layer: 'l' + l, status: 'approved', rarity: 1 };
    items.push(t); group.push(traitKey(t));
  }
  const was = RULES;
  RULES = [group.sort()];
  legalCache = null; legalKey = '';
  const cs = comboStats(items, false);
  const label = typeof possibleLabel === 'function' ? possibleLabel(cs) : bigLabel(cs.distinct);
  RULES = was;
  return { distinct: cs.distinct, exact: 1 + 10 * n, label };
}, n);

test.describe('the possible-characters count', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof comboStats === 'function');
  });

  test('PAST A BILLION it reads in trillions, not "515373.7B"', async ({ page }) => {
    const r = await page.evaluate(() => [bigLabel(5.154e14), bigLabel(2e18)]);
    expect(r[0]).toBe('515.4T');
    expect(r[1]).toBe('2.0×10^18');
  });

  test('A RESTRICTIVE RULE SET is measured to within a fifth of the exact count', async ({ page }) => {
    const r = await stats(page, 4);
    console.log('four layers, one rule: ' + JSON.stringify(r));
    expect(Math.abs(r.distinct / r.exact - 1)).toBeLessThan(0.2);
  });

  test('A SET WHERE NO SAMPLE WAS LEGAL is not "0", it is an upper bound', async ({ page }) => {
    const r = await stats(page, 7);
    console.log('seven layers, one rule: ' + JSON.stringify(r));
    expect(r.label).not.toBe('0');
    expect(r.label).toMatch(/^fewer than /);
    const bound = +r.label.replace(/^fewer than /, '').replace(/,/g, '');
    expect(bound, 'and the bound is above the truth').toBeGreaterThan(r.exact);
    expect(bound, 'rounded up from the rule of three over 40,000 draws').toBe(2000);
  });

  test('A SET MEASURED ROUGHLY says "about", to one figure', async ({ page }) => {
    const r = await stats(page, 5);
    console.log('five layers, one rule: ' + JSON.stringify(r));
    expect(r.label).toMatch(/^about /);
  });

  test('the control: small figures and billions read as they did', async ({ page }) => {
    const r = await page.evaluate(() => [bigLabel(256), bigLabel(12345), bigLabel(1.5e9), bigLabel(9.99e11)]);
    expect(r).toEqual(['256', '12k', '1.5B', '999.0B']);
  });

  test('the control: a rule that leaves most combinations is the same number it was', async ({ page }) => {
    /* One pair forbidden in two layers of ten: 121 - 1 legal of 121. Well
       measured at 4,000 samples, so it must not move. */
    const r = await page.evaluate(() => {
      const items = [];
      for (let l = 1; l <= 2; l++) for (let i = 0; i < 10; i++)
        items.push({ id: 't_x' + i + '_l' + l + '_approved', kind: 'trait', name: 'x' + i, layer: 'l' + l, status: 'approved', rarity: 1 });
      const was = RULES;
      RULES = [['l1/x0', 'l2/x0']];
      legalCache = null; legalKey = '';
      const cs = comboStats(items, false);
      RULES = was;
      return { distinct: cs.distinct, rough: !!cs.rough };
    });
    console.log('one pair: ' + JSON.stringify(r));
    expect(r.rough).toBe(false);
    expect(Math.abs(r.distinct - 120)).toBeLessThan(3);
  });
});
