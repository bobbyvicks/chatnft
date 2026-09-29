/* CALIBRATION FOR findSecrets. The capture test asserts findSecrets finds
   nothing, which a findSecrets that matched nothing would also pass. So
   every shape it knows is built here and must be found, once, at its
   offset, named by kind and never by value. Next to each shape that must
   not be found is its twin that differs by one field: the anon JWT beside
   the service_role one, the publishable key beside another apikey value.

   Every value is assembled at runtime from pieces that match no shape
   (a prefix split from its underscore, "Bear" + "er"), so this file's own
   text scans clean, and the last test checks that it does. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findSecrets } from './secrets.mjs';

const u = '_';
const run = (c, n) => c.repeat(n);
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const jwt = (payload) => [b64({ alg: 'HS256', typ: 'JWT' }), b64(payload), 'c2lnbmF0dXJl'].join('.');

/* [the kind findSecrets names, text before, the secret-shaped part, text after]:
   the finding's offset is where the part starts. */
const SHAPES = [
  ['a Supabase secret key', 'const key = "', ['sb', 'secret', run('s', 24)].join(u), '";'],
  ['a personal or OAuth access token', 'login with ', ['sbp', run('p', 40)].join(u), ' please'],
  ['a bearer token', 'Authorization: ', 'Bear' + 'er ' + run('b', 40), '\n'],
  ['an apikey value that is not the publishable key', '{ ', 'api' + 'key: "' + run('k', 24), '" }'],
  ['a token in a URL', 'https://example.test/cb', '?access' + u + 'token=' + run('t', 24), '&x=1'],
  ['a JWT whose role is "service_role"', 'token: ', jwt({ role: 'service' + u + 'role' }), ''],
  /* Final fixes, B6: the keys this repo's own code uses beyond Supabase's
     (measured by the final review: both passed the scan in a tracked file).
     An Anthropic key - api/identify.ts's secret - and a GitHub token, the
     classic personal one and the fine-grained one. */
  ['an Anthropic API key', 'ANTHROPIC' + u + 'API' + u + 'KEY=', ['sk', 'ant', 'api03', run('a', 80) + 'AA'].join('-'), '\n'],
  ['a GitHub token', 'git remote set-url origin https://', ['ghp', run('g', 36)].join(u), '@github.com/x/y', 'a classic personal one'],
  ['a GitHub token', 'GH' + u + 'TOKEN: ', ['github', 'pat', '11' + run('G', 20), run('h', 59)].join(u), '\n', 'a fine-grained one'],
];

/* The whole finding is pinned, so it names the kind and offset and nothing
   of the value. */
/* what: told apart in the title where one kind has two shapes (B6). */
for (const [kind, before, part, after, what] of SHAPES) {
  test('finds ' + kind + (what ? ' (' + what + ')' : '') + ', once, at its offset, named by kind alone', () => {
    assert.deepEqual(findSecrets(before + part + after), [kind + ' at offset ' + before.length]);
  });
}

test('does not find the public twins: an anon JWT, a publishable key', () => {
  assert.deepEqual(findSecrets('token: ' + jwt({ role: 'anon' })), []);
  const publishable = ['sb', 'publishable', run('q', 24)].join(u);
  assert.deepEqual(findSecrets('{ ' + 'api' + 'key: "' + publishable + '" }'), []);
  assert.deepEqual(findSecrets('const key = "' + publishable + '";'), []);
});

/* Final fixes, B6: and a key named in prose, as the review's own notes
   name them, is not a key - the prefix with no body. */
test('does not find a key shape named in prose: the prefix alone', () => {
  assert.deepEqual(findSecrets('an Anthropic key (' + ['sk', 'ant', 'api03', '...'].join('-') + ')'), []);
  assert.deepEqual(findSecrets('a GitHub token (' + ['ghp', '...'].join(u) + ' and ' + ['github', 'pat', '...'].join(u) + ')'), []);
});

test('this file itself scans clean', () => {
  assert.deepEqual(findSecrets(readFileSync(new URL(import.meta.url), 'utf8')), []);
});
