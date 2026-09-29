/* SECRET SHAPES, for the guards on what this repo publishes: the site
   serves every file, and the GitHub repository is public.

   A JWT is decoded, not just matched: Supabase's legacy anon key is a JWT
   too, and is public by design, so only a payload whose role is not
   "anon" is a finding - a legacy service_role key is exactly that. A
   finding names its kind and offset, never the value, so a test failure
   does not print half a secret into a log. Each pattern is written so its
   own source text does not match it (the character after each prefix is
   "[" or "\"), so this file and the tests that import it do not find
   themselves. The one test fixture token in the repo today,
   tests/identifyserver.spec.js's "Bearer not-a-real-token", is under the
   32-character bearer length (checked 2026-09-27 over all 823 tracked
   files: that was the only hit of any shape at 16 characters). */
const SHAPES = [
  ['a Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['a personal or OAuth access token', /sbp_[A-Za-z0-9_]{20,}/],
  ['a bearer token', /Bearer\s+[A-Za-z0-9._~+/-]{32,}/i],
  ['an apikey value that is not the publishable key', /apikey["']?\s*[:=]\s*["'](?!sb_publishable_)[A-Za-z0-9._-]{16,}/i],
  ['a token in a URL', /[?&](access_token|refresh_token|token|apikey|key)=[A-Za-z0-9._-]{16,}/i],
  /* Final fixes, B6: not only Supabase's shapes. The final review put two
     other secrets this repo's own work uses in a tracked file and both
     passed: an Anthropic key (api/identify.ts's secret) and a GitHub
     token. A GitHub token is a classic personal one or a fine-grained
     one. A prefix alone, as prose names them, is not a key: each needs
     its body. */
  ['an Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['a GitHub token', /ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}/],
];
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]*/g;

export function findSecrets(text) {
  const t = String(text), found = [];
  for (const [name, re] of SHAPES) { const m = re.exec(t); if (m) found.push(name + ' at offset ' + m.index); }
  for (const m of t.matchAll(JWT)) {
    let role;
    try { role = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role || null; } catch (_) { role = 'undecodable'; }
    if (role !== 'anon') found.push('a JWT whose role is ' + JSON.stringify(role) + ' at offset ' + m.index);
  }
  return found;
}
