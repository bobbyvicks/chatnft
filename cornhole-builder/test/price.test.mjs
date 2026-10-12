import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICING, quote, normalise, money } from '../lib/price.mjs';

test('a plain set is the set price plus first-unit shipping', () => {
  const q = quote({ product: 'set', quantity: 1 });
  assert.equal(q.subtotal, PRICING.products.set.cents);
  assert.equal(q.shipping, PRICING.shipping.first);
  assert.equal(q.total, PRICING.products.set.cents + PRICING.shipping.first);
  assert.deepEqual(q.options, { product: 'set', quantity: 1, finish: 'satin', bags: 'none', rush: false });
});

test('every option adds its own line, per unit, and rush once', () => {
  const q = quote({ product: 'single', quantity: 3, finish: 'gloss', bags: 'regulation', rush: true });
  const by = Object.fromEntries(q.lines.map((l) => [l.label, l]));
  assert.equal(by[PRICING.products.single.label].cents, 3 * PRICING.products.single.cents);
  assert.equal(by[PRICING.finishes.gloss.label].cents, 3 * PRICING.finishes.gloss.cents);
  assert.equal(by[PRICING.bags.regulation.label].cents, 3 * PRICING.bags.regulation.cents);
  assert.equal(by[PRICING.rush.label].cents, PRICING.rush.cents);
  assert.equal(by[PRICING.rush.label].qty, 1);
  assert.equal(q.shipping, PRICING.shipping.first + 2 * PRICING.shipping.additional);
  assert.equal(q.total, q.lines.reduce((n, l) => n + l.cents, 0));
  for (const l of q.lines) assert.equal(l.cents, l.unit * l.qty, l.label + ' line does not equal unit x qty');
});

test('free options do not produce a zero line', () => {
  const labels = quote({ product: 'set', quantity: 1, finish: 'satin', bags: 'none' }).lines.map((l) => l.label);
  assert.ok(!labels.includes(PRICING.finishes.satin.label));
  assert.ok(!labels.includes(PRICING.bags.none.label));
});

test('anything outside the table is refused by name', () => {
  assert.throws(() => normalise({ product: 'triple', quantity: 1 }), /product/);
  assert.throws(() => normalise({ product: 'set', quantity: 0 }), /quantity/);
  assert.throws(() => normalise({ product: 'set', quantity: 1.5 }), /quantity/);
  assert.throws(() => normalise({ product: 'set', quantity: PRICING.maxQuantity + 1 }), /quantity/);
  assert.throws(() => normalise({ product: 'set', quantity: 1, finish: 'matte' }), /finish/);
  assert.throws(() => normalise({ product: 'set', quantity: 1, bags: 'twelve' }), /bags/);
  assert.throws(() => normalise(null), /options/);
  /* And a prototype key is not a product. */
  assert.throws(() => normalise({ product: 'toString', quantity: 1 }), /product/);
});

test('rush is a boolean true and nothing else', () => {
  assert.equal(normalise({ product: 'set', quantity: 1, rush: 'yes' }).rush, false);
  assert.equal(normalise({ product: 'set', quantity: 1, rush: 1 }).rush, false);
  assert.equal(normalise({ product: 'set', quantity: 1, rush: true }).rush, true);
});

test('money formats cents as dollars with thousands separators', () => {
  assert.equal(money(0), '$0.00');
  assert.equal(money(24900), '$249.00');
  assert.equal(money(1234567), '$12,345.67');
  assert.equal(money(-500), '-$5.00');
});
