import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';

const SECRET = 'whsec_test_secret';
let n = 0;
async function load(env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_WEBHOOK_SECRET: SECRET }) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k];
  Object.assign(process.env, env);
  return import('../api/stripe-webhook.ts?v=' + (++n));
}
const sign = (body, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  't=' + t + ',v1=' + createHmac('sha256', secret).update(t + '.' + body).digest('hex');

/* The request as the platform hands it over with bodyParser off: a stream
   of the raw bytes, no req.body. */
function streamReq(raw, sig) {
  const r = Readable.from([Buffer.from(raw, 'utf8')]);
  r.method = 'POST'; r.headers = { 'stripe-signature': sig };
  return r;
}
function fakeRes() { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }
function stub(rowsForPatch = [{ id: 'row-1' }]) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body, headers: init.headers });
    return new Response(JSON.stringify(rowsForPatch), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const completed = (over = {}) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: 'CH-ABC234', payment_intent: 'pi_1', payment_status: 'paid', ...over } } });

test('the signature check: right secret passes, wrong secret and stale timestamp fail', async () => {
  const { verifyStripeSignature } = await load();
  const body = '{"a":1}';
  assert.equal(verifyStripeSignature(body, sign(body), SECRET), true);
  assert.equal(verifyStripeSignature(body, sign(body, 'other'), SECRET), false);
  assert.equal(verifyStripeSignature(body + ' ', sign(body), SECRET), false, 'one byte changed');
  assert.equal(verifyStripeSignature(body, sign(body, SECRET, Math.floor(Date.now() / 1000) - 600), SECRET), false, 'ten minutes old');
  assert.equal(verifyStripeSignature(body, '', SECRET), false);
  assert.equal(verifyStripeSignature(body, 't=abc,v1=zz', SECRET), false);
  /* Several v1 signatures (a secret rolled over): any one matching passes. */
  const t = Math.floor(Date.now() / 1000);
  const good = createHmac('sha256', SECRET).update(t + '.' + body).digest('hex');
  assert.equal(verifyStripeSignature(body, 't=' + t + ',v1=' + 'f'.repeat(64) + ',v1=' + good, SECRET), true);
});

test('a signed checkout.session.completed marks the pending row paid, by code, over the raw body', async () => {
  const { default: handler } = await load();
  const calls = stub();
  const raw = completed();
  const res = fakeRes();
  await handler(streamReq(raw, sign(raw)), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.outcome, 'paid');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.match(calls[0].url, /cornhole_orders\?code=eq\.CH-ABC234&status=eq\.pending$/);
  const patch = JSON.parse(calls[0].body);
  assert.equal(patch.status, 'paid');
  assert.equal(patch.stripe_session_id, 'cs_1');
  assert.equal(patch.stripe_payment_intent, 'pi_1');
  assert.ok(patch.paid_at);
});

test('a bad signature is refused and nothing is written', async () => {
  const { default: handler } = await load();
  const calls = stub();
  const raw = completed();
  const res = fakeRes();
  await handler(streamReq(raw, sign(raw, 'wrong')), res);
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
});

test('other events are acknowledged and ignored; a second delivery finds no pending row and still answers 200', async () => {
  const { default: handler } = await load();
  let calls = stub();
  const raw = JSON.stringify({ type: 'payment_intent.created', data: { object: {} } });
  let res = fakeRes();
  await handler(streamReq(raw, sign(raw)), res);
  assert.equal(res.code, 200); assert.equal(res.body.ignored, 'payment_intent.created'); assert.equal(calls.length, 0);

  calls = stub([]);
  res = fakeRes();
  const again = completed();
  await handler(streamReq(again, sign(again)), res);
  assert.equal(res.code, 200); assert.equal(res.body.outcome, 'unknown');
});

test('a store failure answers 502 so Stripe retries', async () => {
  const { default: handler } = await load();
  globalThis.fetch = async () => new Response('down', { status: 503 });
  const raw = completed();
  const res = fakeRes();
  await handler(streamReq(raw, sign(raw)), res);
  assert.equal(res.code, 502);
});

test('unconfigured, it refuses with 503', async () => {
  const { default: handler } = await load({});
  const res = fakeRes();
  await handler(streamReq('{}', 't=1,v1=x'), res);
  assert.equal(res.code, 503);
});
