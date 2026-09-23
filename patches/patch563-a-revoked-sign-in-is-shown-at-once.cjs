/* A SIGN-IN REVOKED MID-VISIT IS SHOWN AT ONCE.

   Found 2026-09-22 by the discovery pass, ranked thirty-fourth of 39. When
   the server definitively refused this device's sign-in - a password
   changed, a sign-out elsewhere - sbAuthState and sbToken cleared the
   stored session and drew nothing. The account panel still showed the
   name and Sign out, the gate stayed down, and every action said "you are
   signed out on this device - sign in" with no sign-in control on screen
   until the person thought to open the account panel.

   sessionEnded runs where a definitive refusal clears the session, and
   only there - a failed or unanswered request is never a sign-out, as the
   comments at both places already insist. It saves the drawing in progress,
   marks the page signed out, takes down the controls that need a session,
   raises the sign-in form, and says why. Nothing is removed from this
   device; signing in again brings the page back as it was. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

{
  const fnR = () => kit.inFunction(L, 'async function sbToken(){');
  swap('  if(!s.refresh_token){ sbSaveSession(null); return null; }', [
    '  if(!s.refresh_token){ sbSaveSession(null); sessionEnded(); return null; }',
  ], 'no refresh token', fnR());
  swap('        if(r.status===400||r.status===401||r.status===403) sbSaveSession(null);', [
    '        if(r.status===400||r.status===401||r.status===403){ sbSaveSession(null); sessionEnded(); }',
  ], 'the refresh refusal', fnR());
  const f = fnR();
  kit.replace(L, { start: f.start, end: f.start }, [
    '/* THE SERVER HAS REFUSED THIS SIGN-IN, so the page stops claiming it. Called',
    '   only where a definitive refusal clears the stored session - never for a',
    '   failed or unanswered request. The session was cleared and nothing was',
    '   drawn, so the panel kept the name and Sign out while every action said',
    '   "sign in" with no way to. Local work stays on the device. */',
    'function sessionEnded(){',
    '  if(!authed) return;',
    '  try{ autosaveNow(); }catch(_){}',
    '  authed=false;',
    '  const who=$("cloudwho"); if(who) who.textContent="not signed in";',
    '  for(const id of ["cloudpush","cloudpull","cloudout","cloudclear","teaminvite","setpass","setname"]){',
    '    const e=$(id); if(e) e.hidden=true;',
    '  }',
    '  gateShow(true);',
    '  toast("You are signed out on this device - sign in again to carry on. Your work here is kept.");',
    '}',
    'async function sbToken(){',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function sbAuthState(){');
  swap('    if(r.status===401||r.status===403){ sbSaveSession(null); return {state:"out"}; }', [
    '    if(r.status===401||r.status===403){ sbSaveSession(null); sessionEnded(); return {state:"out"}; }',
  ], 'the user refusal', fn);
}

const grew = kit.save(doc, ({ code }) => {
  if (code.split('sessionEnded()').length - 1 !== 4) throw new Error('sessionEnded uses: ' + (code.split('sessionEnded()').length - 1));
});

fs.renameSync(TMP, FILE);
console.log('patch563 written, ' + grew + ' bytes');
