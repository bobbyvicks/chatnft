/* api/order.ts, driven as the platform drives it, with fetch replaced by a
   stand-in Supabase and Stripe that record what they were asked.

   Environment variables are read when the module loads, so they are set
   before the dynamic import, and the module is imported once per
   configuration through a cache-busting query. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../lib/price.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function goodOrder() {
  const board = () => ({ base: { kind: 'paint', color: '#1f3a93', stain: 'walnut' }, pattern: { kind: 'stripes', color: '#ffffff', size: 3 }, elements: [
    { type: 'text', id: 'e1', text: 'HELLO', font: 'Anton', size: 4, color: '#ffffff', outline: '#000000', outlineWidth: 0.1, x: 12, y: 30, rotation: 0 },
    { type: 'image', id: 'e2', src: PNG, width: 8, x: 12, y: 20, rotation: 10, opacity: 1 },
  ] });
  return {
    options: { product: 'set', quantity: 2, finish: 'gloss', bags: 'regulation', bagColors: ['#c8102e', '#1f3a93'], rush: true },
    design: { version: 1, same: true, a: board(), b: board() },
    previews: [PNG],
    customer: { name: 'Pat Example', email: 'pat@example.com', phone: '555-0100' },
    shipping: { line1: '1 Main St', line2: '', city: 'Austin', state: 'tx', postal: '78701', country: 'US' },
    notes: 'Leave at the side door.',
  };
}

function fakeRes() {
  const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
}
const req = (body, extra = {}) => ({ method: 'POST', headers: { host: 'shop.test', 'x-forwarded-for': extra.ip || '10.0.0.' + Math.floor(Math.random() * 250) }, body, query: {}, ...extra });

let n = 0;
async function load(env) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'SITE_URL']) delete process.env[k];
  Object.assign(process.env, env);
  return (await import('../api/order.ts?v=' + (++n))).default;
}

/* The stand-in: answers Supabase inserts with the row plus an id, Stripe
   with a session, and records every call. */
function stub({ stripeStatus = 200, sbStatus = 201 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers, body: init.body });
    const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('https://api.stripe.com/v1/checkout/sessions'))
      return stripeStatus === 200 ? json({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) : json({ error: { message: 'nope' } }, stripeStatus);
    if (u.includes('/rest/v1/cornhole_orders')) {
      if (init.method === 'POST') return sbStatus === 201 ? json([{ id: 'row-1', ...JSON.parse(init.body) }], 201) : json({ code: '23514', message: 'check' }, sbStatus);
      if (init.method === 'PATCH') return json([{ id: 'row-1' }]);
      return json([{ code: 'CH-ABC234', status: 'paid', product: 'set', quantity: 1, amount_cents: 30800, currency: 'usd', created_at: 'now' }]);
    }
    return json({ error: 'unrouted ' + u }, 501);
  };
  return calls;
}

test('with no store configured, an order is refused with 503, not acknowledged', async () => {
  const handler = await load({});
  const calls = stub();
  const res = fakeRes();
  await handler(req(goodOrder()), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.error, 'not_configured');
  assert.equal(calls.length, 0, 'nothing was called');
});

test('a good order is priced on the server, stored, sent to Stripe, and the Checkout URL comes back', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', STRIPE_SECRET_KEY: 'sk_test_x', SITE_URL: 'https://boards.example/' });
  const calls = stub();
  const res = fakeRes();
  const body = goodOrder();
  await handler(req(body), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.match(res.body.code, /^CH-[A-Z0-9]{6}$/);
  assert.equal(res.body.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.equal(res.body.payment, 'stripe');
  const expected = quote(body.options);
  assert.equal(res.body.total, expected.total);

  const insert = calls.find((c) => c.url.endsWith('/rest/v1/cornhole_orders') && c.method === 'POST');
  assert.ok(insert, 'the order was inserted');
  assert.equal(insert.headers.apikey, 'service-key');
  assert.equal(insert.headers.Prefer, 'return=representation');
  const row = JSON.parse(insert.body);
  assert.equal(row.amount_cents, expected.total, 'the stored amount is the server quote');
  assert.equal(row.status, 'pending');
  assert.equal(row.shipping.state, 'TX', 'the state is upper-cased');
  assert.equal(row.customer.email, 'pat@example.com');
  assert.deepEqual(row.options.bagColors, ['#c8102e', '#1f3a93']);
  assert.equal(row.options.lines.length, expected.lines.length);

  const stripe = calls.find((c) => c.url.startsWith('https://api.stripe.com'));
  assert.ok(stripe, 'Stripe was asked for a session');
  assert.equal(stripe.headers.Authorization, 'Bearer sk_test_x');
  const p = new URLSearchParams(stripe.body);
  assert.equal(p.get('mode'), 'payment');
  assert.equal(p.get('client_reference_id'), res.body.code);
  assert.equal(p.get('customer_email'), 'pat@example.com');
  assert.equal(p.get('success_url'), 'https://boards.example/?order=success&code=' + res.body.code);
  assert.equal(p.get('cancel_url'), 'https://boards.example/?order=cancelled&code=' + res.body.code);
  /* Every quote line is a Stripe line item, and their sum is the total. */
  let sum = 0;
  for (let i = 0; i < expected.lines.length; i++) {
    const unit = Number(p.get('line_items[' + i + '][price_data][unit_amount]')), qty = Number(p.get('line_items[' + i + '][quantity]'));
    assert.equal(unit, expected.lines[i].unit); assert.equal(qty, expected.lines[i].qty);
    assert.equal(p.get('line_items[' + i + '][price_data][product_data][name]'), expected.lines[i].label);
    sum += unit * qty;
  }
  assert.equal(sum, expected.total);
  assert.equal(p.get('line_items[' + expected.lines.length + '][quantity]'), null, 'no extra line items');

  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch && patch.url.includes('code=eq.' + res.body.code), 'the session id is written back to the row');
  assert.equal(JSON.parse(patch.body).stripe_session_id, 'cs_test_1');
});

test('a total sent by the browser is ignored', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk' });
  const calls = stub();
  const res = fakeRes();
  const body = goodOrder(); body.total = 1; body.options.total = 1; body.amount_cents = 1;
  await handler(req(body), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const row = JSON.parse(calls.find((c) => c.method === 'POST' && c.url.includes('cornhole_orders')).body);
  assert.equal(row.amount_cents, quote(goodOrder().options).total);
});

test('without a Stripe key the order is stored and answered as an invoice', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
  const calls = stub();
  const res = fakeRes();
  await handler(req(goodOrder()), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.url, null);
  assert.equal(res.body.payment, 'invoice');
  assert.ok(!calls.some((c) => c.url.startsWith('https://api.stripe.com')));
});

test('when Stripe fails the row is kept and the customer is told nothing was charged, with the code', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk' });
  stub({ stripeStatus: 500 });
  const res = fakeRes();
  await handler(req(goodOrder()), res);
  assert.equal(res.code, 502);
  assert.equal(res.body.error, 'checkout');
  assert.match(res.body.code, /^CH-/);
  assert.match(res.body.message, /Nothing was charged/);
});

test('when the store refuses, nothing goes to Stripe', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk' });
  const calls = stub({ sbStatus: 400 });
  const res = fakeRes();
  await handler(req(goodOrder()), res);
  assert.equal(res.code, 502);
  assert.equal(res.body.error, 'store');
  assert.ok(!calls.some((c) => c.url.startsWith('https://api.stripe.com')));
});

test('bad orders are refused with the field named, before anything is stored', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk' });
  const cases = [
    [(o) => { o.options.quantity = 11; }, /options\.quantity/],
    [(o) => { o.options.product = 'triple'; }, /options\.product/],
    [(o) => { o.customer.email = 'not-an-email'; }, /customer\.email/],
    [(o) => { o.shipping.state = 'ZZ'; }, /shipping\.state/],
    [(o) => { o.shipping.postal = '1234'; }, /shipping\.postal/],
    [(o) => { o.shipping.country = 'CA'; }, /shipping\.country/],
    [(o) => { o.design.a.elements[0].text = 'x'.repeat(61); }, /design\.a\.elements\.0\.text/],
    [(o) => { o.design.a.elements[1].src = 'https://evil.example/x.png'; }, /design\.a\.elements\.1\.src/],
    [(o) => { o.design.a.base.color = 'blue'; }, /design\.a\.base\.color/],
    [(o) => { o.previews = []; }, /previews/],
    [(o) => { delete o.options.bagColors; }, /bagColors/],
    [(o) => { o.design.same = false; }, /previews/],
    [(o) => { o.design.a.elements = Array.from({ length: 5 }, (_, i) => ({ type: 'image', id: 'i' + i, src: PNG, width: 4, x: 12, y: 12, rotation: 0, opacity: 1 })); }, /too many images/],
  ];
  for (const [mutate, re] of cases) {
    const calls = stub();
    const res = fakeRes();
    const o = goodOrder(); mutate(o);
    await handler(req(o), res);
    assert.equal(res.code, 400, 'expected 400 for ' + re + ', got ' + res.code + ' ' + JSON.stringify(res.body));
    assert.match(res.body.message, re);
    assert.equal(calls.length, 0, 'nothing was stored for ' + re);
  }
});

test('GET by code answers status and amount, never the customer', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
  const calls = stub();
  const res = fakeRes();
  await handler({ method: 'GET', headers: {}, query: { code: 'ch-abc234' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.status, 'paid');
  assert.ok(!('customer' in res.body) && !('shipping' in res.body));
  assert.match(calls[0].url, /select=code,status,product,quantity,amount_cents,currency,created_at&code=eq\.CH-ABC234/);
  const bad = fakeRes();
  await handler({ method: 'GET', headers: {}, query: { code: 'CH-ABC234; drop' } }, bad);
  assert.equal(bad.code, 400);
});

test('one address is held to ten orders a minute', async () => {
  const handler = await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
  stub();
  let last;
  for (let i = 0; i < 11; i++) { last = fakeRes(); await handler(req(goodOrder(), { ip: '203.0.113.9' }), last); }
  assert.equal(last.code, 429);
});
