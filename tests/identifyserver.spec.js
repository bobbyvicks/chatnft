/* THE LOCATE FUNCTION ON THE SERVER: WHAT IT ASKS, HOW LONG IT WAITS, AND
   WHAT IT SAYS WHEN THE ANSWER DOES NOT ARRIVE WHOLE.

   The real handler in api/identify.ts, run in node against a local mock of
   the model endpoint and of the sign-in check - nothing real is called, and
   the key and token here are placeholders. RUN AGAINST THE HANDLER BEFORE
   THE FIX, the first four went red: a thinking-only answer cut off by
   max_tokens came back as "unparsed", one cut off mid-answer as "Could not
   reach Claude", a layer the project had renamed could not be answered at
   all, and a sign-in check that never answered held the handler past 8 s.
   A model that never answers is given up on at 45 s, one attempt, inside
   the minute the page waits.
   The last two are controls: a whole answer comes back whole, and a
   refusal is still a refusal. */
import { test, expect } from '@playwright/test';
import http from 'node:http';

let server, port, mode = 'ok', seen = [];

const message = (content, stop) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5',
  content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 20 } });
const answer = (layer) => JSON.stringify({ name: 'bucket-hat', layer, description: 'A hat.', confidence: 'high',
  box: { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.4 }, reliable: true });

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.url.indexOf('/auth/v1/user') >= 0) {
        if (mode === 'auth-stall') return; /* never answers */
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: 'u1' }));
      }
      seen.push(JSON.parse(body || '{}'));
      if (mode === 'model-stall') return; /* accepts, never answers */
      const send = (m) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(m)); };
      if (mode === 'think-cut') return send(message([{ type: 'thinking', thinking: 'hmm', signature: 'sig' }], 'max_tokens'));
      if (mode === 'answer-cut') return send(message([{ type: 'text', text: answer('hats').slice(0, 40) }], 'max_tokens'));
      if (mode === 'refuse') return send(message([], 'refusal'));
      if (mode === 'renamed') return send(message([{ type: 'text', text: answer('headwear') }], 'end_turn'));
      return send(message([{ type: 'text', text: answer('hats') }], 'end_turn'));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  process.env.ANTHROPIC_API_KEY = 'not-a-real-key';
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:' + port;
  process.env.SUPABASE_URL = 'http://127.0.0.1:' + port;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });

const call = async (body) => {
  const { default: handler } = await import('../api/identify.ts');
  const out = { code: 0, body: null };
  const res = { status(n) { out.code = n; return this; }, json(o) { out.body = o; return this; } };
  const t0 = Date.now();
  await handler({ method: 'POST', headers: { authorization: 'Bearer not-a-real-token' },
    body: Object.assign({ mode: 'locate', image: 'data:image/png;base64,iVBORw0KGgo=' }, body || {}) }, res);
  return Object.assign(out, { ms: Date.now() - t0 });
};

test.describe('the locate function on the server', () => {
  test.beforeEach(() => { seen = []; });

  test('A THINK CUT OFF BY THE TOKEN LIMIT is said to be cut off', async () => {
    mode = 'think-cut';
    const r = await call();
    expect(r.body.message).toMatch(/cut off/);
  });

  test('AN ANSWER CUT OFF HALFWAY is said to be cut off, not "Could not reach Claude"', async () => {
    mode = 'answer-cut';
    const r = await call();
    expect(r.body.message).toMatch(/cut off/);
  });

  test('A PROJECT THAT RENAMED A LAYER can be answered with its own name', async () => {
    mode = 'renamed';
    const layers = ['backgrounds', 'skins', 'headwear', 'unsorted'];
    const r = await call({ layers });
    expect(r.code).toBe(200);
    expect(r.body.layer).toBe('headwear');
    const sent = JSON.stringify(seen[0].output_config);
    expect(sent, 'the model was offered the project\'s layers').toContain('headwear');
    expect(sent).not.toContain('"hats"');
    expect(seen[0].max_tokens, 'with room to think').toBeGreaterThanOrEqual(8000);
  });

  test('A SIGN-IN CHECK THAT NEVER ANSWERS is given up on', async () => {
    test.setTimeout(30000);
    mode = 'auth-stall';
    const r = await Promise.race([call(), new Promise(res => setTimeout(() => res({ code: 'still waiting', ms: 8000 }), 8000))]);
    expect(r.code).toBe(401);
    expect(r.ms).toBeLessThan(8000);
  });

  test('A MODEL THAT NEVER ANSWERS is given up on inside the page\'s minute, and said so', async () => {
    test.setTimeout(90000);
    mode = 'model-stall';
    const r = await Promise.race([call(), new Promise(res => setTimeout(() => res({ code: 'still waiting', ms: 58000 }), 58000))]);
    expect(r.code).toBe(504);
    expect(r.body.message).toMatch(/did not answer in time/);
    expect(seen.length, 'asked once, not retried past the page').toBe(1);
  });

  test('the control: a whole answer comes back whole, on the default layers', async () => {
    mode = 'ok';
    const r = await call();
    expect(r.code).toBe(200);
    expect(r.body.layer).toBe('hats');
    expect(r.body.box.x1).toBe(0.8);
  });

  test('the control: a refusal is still a refusal', async () => {
    mode = 'refuse';
    const r = await call();
    expect(r.code).toBe(422);
  });
});
