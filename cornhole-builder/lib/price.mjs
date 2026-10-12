/* THE PRICE LIST, AND THE ONE FUNCTION THAT TURNS AN ORDER INTO A TOTAL.

   Plain ES module on purpose: the page imports it to show a live quote, and
   api/order.ts imports the same file to work out what to charge. One
   implementation means the number a customer sees is the number Stripe is
   asked for - the server never trusts a total sent by the browser, it
   recomputes from the options and this table.

   Every amount is in cents, as integers, because 0.1 + 0.2 is not 0.3 and a
   checkout that charges a cent off the quote looks dishonest. */

export const PRICING = Object.freeze({
  currency: 'usd',
  products: Object.freeze({
    set: Object.freeze({ label: 'Set of 2 boards', cents: 24900, boards: 2 }),
    single: Object.freeze({ label: 'Single board', cents: 13900, boards: 1 }),
  }),
  finishes: Object.freeze({
    satin: Object.freeze({ label: 'Satin polyurethane', cents: 0 }),
    gloss: Object.freeze({ label: 'High-gloss clear coat', cents: 4000 }),
  }),
  bags: Object.freeze({
    none: Object.freeze({ label: 'No bags', cents: 0 }),
    regulation: Object.freeze({ label: '8 regulation bags (4 + 4), your colours', cents: 4500 }),
  }),
  rush: Object.freeze({ label: 'Rush build, ships in 5 business days', cents: 5000 }),
  /* Flat for the first unit, less for each one after: boards ship on one
     pallet past the first, and the price should say so. */
  shipping: Object.freeze({ first: 5900, additional: 2500 }),
  maxQuantity: 10,
  leadTimeDays: 15,
});

const isKey = (table, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(table, k);

/* Options the page and the API both read. Throws on anything outside the
   table, naming the field, so a bad request is refused with a reason and a
   page bug shows up as a thrown error rather than a quote of NaN. */
export function normalise(o) {
  if (!o || typeof o !== 'object') throw new Error('options: not an object');
  const product = o.product;
  if (!isKey(PRICING.products, product)) throw new Error('product: unknown');
  const quantity = Number(o.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > PRICING.maxQuantity)
    throw new Error('quantity: must be a whole number from 1 to ' + PRICING.maxQuantity);
  const finish = o.finish === undefined ? 'satin' : o.finish;
  if (!isKey(PRICING.finishes, finish)) throw new Error('finish: unknown');
  const bags = o.bags === undefined || o.bags === null ? 'none' : o.bags;
  if (!isKey(PRICING.bags, bags)) throw new Error('bags: unknown');
  const rush = o.rush === true;
  return { product, quantity, finish, bags, rush };
}

/* The quote: a list of lines a receipt can print, and the totals. Each line
   carries its unit amount and quantity separately because Stripe wants them
   that way, and a receipt reads better as "2 x Set of 2 boards" than as one
   doubled number. */
export function quote(options) {
  const o = normalise(options);
  const lines = [];
  const add = (label, unit, qty) => { if (unit > 0 && qty > 0) lines.push({ label, unit, qty, cents: unit * qty }); };
  add(PRICING.products[o.product].label, PRICING.products[o.product].cents, o.quantity);
  add(PRICING.finishes[o.finish].label, PRICING.finishes[o.finish].cents, o.quantity);
  add(PRICING.bags[o.bags].label, PRICING.bags[o.bags].cents, o.quantity);
  if (o.rush) add(PRICING.rush.label, PRICING.rush.cents, 1);
  const subtotal = lines.reduce((n, l) => n + l.cents, 0);
  const shipping = PRICING.shipping.first + PRICING.shipping.additional * (o.quantity - 1);
  lines.push({ label: 'Shipping (contiguous US)', unit: shipping, qty: 1, cents: shipping });
  return { options: o, lines, subtotal, shipping, total: subtotal + shipping, currency: PRICING.currency };
}

export const money = (cents) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
