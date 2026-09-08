/* THE NAME PEOPLE CHOSE WAS ASKED FOR, STORED, AND NEVER SHOWN.

   Sign-up asks for two things. An ACCOUNT NAME, which becomes the login and
   the local part of the @chatnft.invalid address - the thing you type to get
   back in. And a NAME, asked for in those words: "whatever you want people you
   share a project with to call you".

   Measured on the live project before touching anything: all three members of
   the group have both set - Bobby, Wilson, Test - and What changed listed
   every one of them by their account name, because the RPC behind it returned
   only that. The field written for exactly this purpose reached nobody.

   Two changes, and they are separate faults. The RPC now returns the chosen
   name and falls back to the account name for somebody who joined by link and
   never picked one (migration 20260908011500, verified against the catalog:
   still security definer, still gated on is_team_member, still no email
   anywhere in it, anon and public still cannot execute it).

   And there is now a way to change it. THE ACCOUNT NAME IS DELIBERATELY NOT
   TOUCHED: it is half of the address this account signs in with, so a rename
   that changed it would leave somebody typing a name the server has never
   heard of. Two things that both look like a name, and only one is safe to
   edit after the fact. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the button ------------------------------------------------- */
swap('        <button class="mini" id="setpass" hidden>Set a password</button>', block([
  '        <button class="mini" id="setpass" hidden>Set a password</button>',
  '        <button class="mini" id="setname" hidden>Change your name</button>',
]));

swap('  $("setpass").hidden=!inn;', block([
  '  $("setpass").hidden=!inn;',
  '  $("setname").hidden=!inn;',
]));

swap("$('setpass').onclick=setPassword;", block([
  "$('setpass').onclick=setPassword;",
  "$('setname').onclick=setDisplayName;",
]));

/* ---- 2. one number, in one place ----------------------------------- */
swap('const MIN_PASS=6;', block([
  'const MIN_PASS=6;',
  '/* Same reason as the line above. Sign-up wrote this out as a literal, and a',
  '   second place to change it is a second chance for the rule you are told to',
  '   differ from the rule you are held to. */',
  'const MAX_NAME=40;',
]));

swap('  if(!name || name.length>40){',
  '  if(!name || name.length>MAX_NAME){');

/* ---- 3. changing it ------------------------------------------------ */
swap('/* For anyone who got in by link and never set one. */', block([
  '/* The name your group sees.',
  '',
  '   Sign-up asks for it and then there was no way to change your mind, which',
  '   is a strange thing to be permanent about - it is the one piece of this',
  '   account that exists purely for other people to read.',
  '',
  '   THE ACCOUNT NAME IS NOT TOUCHED. It is the local part of the address this',
  '   account signs in with, so changing it here would leave somebody typing a',
  '   name the server has never heard of. Two fields that both look like a name',
  '   and only one of them is safe to edit afterwards. */',
  'async function setDisplayName(){',
  '  const h=await sbHeaders({"Content-Type":"application/json"});',
  '  if(!h){ toast("Sign in first"); return; }',
  '  const u=await sbUser();',
  '  const meta=(u&&u.user_metadata)||{};',
  '  const was=meta.name?String(meta.name):"";',
  '  /* Seeded with what it is now, so this is an edit rather than a quiz about',
  '     what you last typed. */',
  '  const typed=prompt("What should your group call you?",was);',
  '  if(typed===null) return;',
  '  const name=String(typed).trim();',
  '  if(!name){ toast("A name cannot be empty"); return; }',
  '  if(name.length>MAX_NAME){ toast("Keep it under "+MAX_NAME+" characters"); return; }',
  '  if(name===was){ toast("That is already your name"); return; }',
  '  try{',
  '    /* ONE FIELD, and the account name beside it survives. Measured against',
  '       the live server rather than assumed: an update of the metadata merges',
  '       key by key, so sending the name alone leaves the account name, and',
  '       everything else in there, exactly as it was. */',
  '    const r=await fetch(SB_URL+"/auth/v1/user",{method:"PUT",headers:h,',
  '      body:JSON.stringify({data:{name:name}})});',
  '    if(!r.ok){ const j=await r.json().catch(()=>({}));',
  '      toast(authSays(j,"Could not change your name")); return; }',
  '    /* This browser fetched who everybody is once and kept it. It is now',
  '       wrong about you, and nothing else would ever correct it. */',
  '    memberNames=null; memberNamesFor=null;',
  '    await cloudRender();',
  '    toast("Your group will see you as "+name);',
  '  }catch(_){ toast("Could not reach the server"); }',
  '}',
  '',
  '/* For anyone who got in by link and never set one. */',
]));

/* ---- 4. the panel shows the chosen name ---------------------------- */
swap('   auth.users is not readable by a client, so without the RPC a uuid is all'
  + NL + '   anybody could see. It returns the username and NOTHING else - not the'
  + NL + '   email, and not the part before the @, which was the obvious fallback and'
  + NL + '   would have handed every teammate the local part of a real address.',
block([
  '   auth.users is not readable by a client, so without the RPC a uuid is all',
  '   anybody could see. It returns the name a person CHOSE, falling back to',
  '   their account name when they never picked one - and NOTHING else. Not the',
  '   email, and not the part before the @, which was the obvious fallback and',
  '   would have handed every teammate the local part of a real address.',
  '',
  '   It used to return the account name only, so three people who had all',
  '   chosen a name were listed by the handle they type to sign in.',
]));

swap('        for(const row of await r.json()) m.set(row.user_id, row.username||null);',
  '        for(const row of await r.json()) m.set(row.user_id, row.display_name||null);');

swap(block([
  '    /* "you" for your own, the username for a teammate, and "someone" when',
  '       they have not chosen one - which is a gap worth showing as a gap',
  '       rather than filling with an email nobody agreed to share. */',
]), block([
  '    /* "you" for your own, the name a teammate chose for themselves, and',
  '       "someone" when they have neither that nor an account name - a gap',
  '       worth showing as a gap rather than filling with an email nobody',
  '       agreed to share. */',
]));

/* ---- 5. Check again means go and ask ------------------------------- */
swap('  if(again) again.onclick=()=>renderUpdates();', block([
  '  /* THE NAMES TOO, not just the rows. They are cached for the life of the',
  '     page - the right call while it is read once per row - but that makes a',
  '     teammate who renames themselves keep their old name until somebody',
  '     reloads. This button is the press that means go and ask. */',
  '  if(again) again.onclick=()=>{',
  '    memberNames=null; memberNamesFor=null;',
  '    renderUpdates();',
  '  };',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function setDisplayName(){', 'const MAX_NAME=40;',
  "$('setname').onclick=setDisplayName;", '  $("setname").hidden=!inn;',
  'row.display_name||null'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="setname"').length !== 2)
  throw new Error('the button is not in the markup exactly once');

/* THE ACCOUNT NAME IS NOT WRITTEN BY THIS. The whole point of the split is
   that a rename cannot touch the thing you sign in with, and the check has to
   be able to fail: it reads the body actually sent. */
const fnStart = code.indexOf('async function setDisplayName(){');
const fnEnd = code.indexOf('\r\nasync function setPassword(){', fnStart);
if (fnStart < 0 || fnEnd < 0) throw new Error('could not bound setDisplayName');
const fn = code.slice(fnStart, fnEnd);
if (fn.length > 2000) throw new Error('the slice is too big to be one function: ' + fn.length);
if (fn.indexOf('username') >= 0)
  throw new Error('the rename touches the account name, which is half the login');
if (fn.indexOf('body:JSON.stringify({data:{name:name}})') < 0)
  throw new Error('the request does not send exactly the one field');
/* And it must not be possible to save an empty name, which would put a person
   back to "someone" with no way to tell why. */
if (fn.indexOf('if(!name){') < 0) throw new Error('an empty name would be saved');

/* The stale-name cache is cleared in BOTH places that can learn a name is
   wrong: your own rename, and an explicit press of Check again. */
if (code.split('memberNames=null; memberNamesFor=null;').length !== 3)
  throw new Error('expected the name cache to be cleared in exactly two places');

/* No leftover reference to the column the RPC no longer returns. */
if (code.indexOf('row.username') >= 0)
  throw new Error('still reading a column the function does not return');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
