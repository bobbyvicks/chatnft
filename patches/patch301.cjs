/* WHAT THE GROUP CHANGED, IN PROJECT SETTINGS.

   There was no way to see it. The mailbox says a teammate's edit ARRIVED, once,
   and clears when read; nothing answers "what has been going on".

   THE DATA WAS ALREADY THERE, which is why this is small. traits.owner is
   written on every push - all 289 rows have one - and updated_at is maintained
   by a database trigger rather than by whichever browser wrote last, so it is
   worth ordering on.

   THE NAME WAS NOT. usernames live in auth.users, which PostgREST does not
   expose and no client may read, so a uuid was all anybody could see. There is
   now a team_member_names RPC: security definer, gated on the existing
   is_team_member so it answers only for a team you are in, granted to
   authenticated and revoked from anon and public. Verified after applying -
   anon and public cannot execute it, and a team you do not belong to returns
   nothing.

   IT RETURNS THE USERNAME AND NOTHING ELSE. Not the email, and not the part of
   the email before the @, which was the obvious fallback and would have handed
   every teammate the local part of a real address. Somebody who has not set a
   username is "someone" - a gap worth showing as a gap. */
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

/* ---- 1. the section ------------------------------------------------ */
swap('  <!-- The trait parameters. They lived inside Build a character, under the', block([
  '  <!-- What the group has been doing. First on the settings page because it',
  '       is the thing you glance at, not the thing you configure. -->',
  '  <section class="proj pg-settings" id="updates" hidden>',
  '    <div class="projhead">',
  '      <h2>What changed</h2>',
  '      <span class="count" id="updcount"></span>',
  '      <div class="acts">',
  '        <button class="mini" id="updrefresh">Check again</button>',
  '      </div>',
  '    </div>',
  '    <div id="updbody"></div>',
  '  </section>',
  '  <!-- The trait parameters. They lived inside Build a character, under the',
]));

swap('.plantot{font-size:11px; color:var(--dim); margin:5px 0 0;}', block([
  '.plantot{font-size:11px; color:var(--dim); margin:5px 0 0;}',
  '.urow{display:flex; gap:8px; align-items:baseline; padding:4px 0;',
  '  border-bottom:1px solid var(--line); font-size:12px;}',
  '.urow:last-child{border-bottom:none;}',
  '.urow .uwho{font-weight:600; min-width:88px;}',
  '.urow .uwhat{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
  '.urow .uwhen{color:var(--dim); font-variant-numeric:tabular-nums; white-space:nowrap;}',
  '.urow.mine .uwho{color:var(--accent);}',
]));

/* ---- 2. the code --------------------------------------------------- */
swap('/* ---- the section ------------------------------------------------- */', block([
  '/* How long ago, in words somebody reads rather than a timestamp.',
  '',
  '   Deliberately coarse. "3 minutes ago" and "4 minutes ago" are the same',
  '   fact, and a list that reflows every time it is redrawn reads as activity',
  '   rather than as a record. */',
  'function agoWords(iso){',
  '  const t=Date.parse(iso||"");',
  '  if(!isFinite(t)) return "";',
  '  const secs=Math.max(0,(Date.now()-t)/1000);',
  '  if(secs<90) return "just now";',
  '  const mins=Math.round(secs/60);',
  '  if(mins<60) return mins+" minutes ago";',
  '  const hrs=Math.round(mins/60);',
  '  if(hrs<24) return hrs===1?"an hour ago":hrs+" hours ago";',
  '  const days=Math.round(hrs/24);',
  '  return days===1?"yesterday":days+" days ago";',
  '}',
  '',
  '/* Who the people in this group are, by the only name they have chosen.',
  '',
  '   auth.users is not readable by a client, so without the RPC a uuid is all',
  '   anybody could see. It returns the username and NOTHING else - not the',
  '   email, and not the part before the @, which was the obvious fallback and',
  '   would have handed every teammate the local part of a real address.',
  '',
  '   Cached per team: the answer changes only when somebody joins or leaves,',
  '   and this is read once per row otherwise. A failure caches nothing, so a',
  '   dropped request does not turn into a permanent list of "someone".  */',
  'let memberNames=null, memberNamesFor=null;',
  'async function teamNames(team){',
  '  if(memberNamesFor===team && memberNames) return memberNames;',
  '  let m=null;',
  '  try{',
  '    const h=await sbHeaders({"Content-Type":"application/json"});',
  '    if(h){',
  '      const r=await fetch(SB_URL+"/rest/v1/rpc/team_member_names",',
  '        {method:"POST", headers:h, body:JSON.stringify({t:team})});',
  '      if(r.ok){',
  '        m=new Map();',
  '        for(const row of await r.json()) m.set(row.user_id, row.username||null);',
  '      }',
  '    }',
  '  }catch(_){ m=null; }',
  '  if(m){ memberNames=m; memberNamesFor=team; }',
  '  return m||new Map();',
  '}',
  '',
  '/* What the group has changed lately.',
  '',
  '   Ordered on updated_at, which a database trigger maintains rather than',
  '   whichever browser wrote last - the one column here worth deciding on.',
  '   owner is who last WROTE the row, which for a re-upload is the last person',
  '   to save it rather than whoever drew it, and the heading says so. */',
  'const UPDATE_ROWS=25;',
  'async function renderUpdates(){',
  '  const sec=$("updates"); if(!sec) return;',
  '  const body=$("updbody"), count=$("updcount");',
  '  if(!activeWs){',
  '    sec.hidden=false;',
  '    count.textContent="";',
  '    body.innerHTML="";',
  '    const p=document.createElement("p"); p.className="note";',
  '    p.textContent="This is your own page, so there is nobody else to hear from."',
  '      +" Open a group project to see what your team has changed.";',
  '    body.appendChild(p);',
  '    return;',
  '  }',
  '  sec.hidden=false;',
  '  count.textContent="asking the group\\u2026";',
  '  let rows=null, me=null;',
  '  try{',
  '    const u=await sbUser(); me=u&&u.id;',
  '    const c=u?await cloudCollection(u):null;',
  '    const h=c?await sbHeaders():null;',
  '    if(c&&h){',
  '      const r=await fetch(SB_URL+"/rest/v1/traits?select=name,layer,status,owner,updated_at"',
  '        +"&collection_id=eq."+c.id+"&order=updated_at.desc&limit="+UPDATE_ROWS,{headers:h});',
  '      if(r.ok) rows=await r.json();',
  '    }',
  '  }catch(_){ rows=null; }',
  '  body.innerHTML="";',
  '  if(!rows){',
  '    count.textContent="";',
  '    const p=document.createElement("p"); p.className="note";',
  '    p.textContent="Could not reach the group just now. Nothing here is out of date -"',
  '      +" it simply has not been read yet.";',
  '    body.appendChild(p);',
  '    return;',
  '  }',
  '  const names=await teamNames(activeWs);',
  '  count.textContent = rows.length',
  '    ? "the last "+rows.length+", most recent first"',
  '    : "nothing has been changed yet";',
  '  for(const row of rows){',
  '    const el=document.createElement("div");',
  '    el.className="urow"+(row.owner&&row.owner===me?" mine":"");',
  '    const who=document.createElement("span"); who.className="uwho";',
  '    /* "you" for your own, the username for a teammate, and "someone" when',
  '       they have not chosen one - which is a gap worth showing as a gap',
  '       rather than filling with an email nobody agreed to share. */',
  '    who.textContent = (row.owner&&row.owner===me) ? "you"',
  '      : (names.get(row.owner) || "someone");',
  '    const what=document.createElement("span"); what.className="uwhat";',
  '    what.textContent=(row.name||"a trait")+" in "+(row.layer||"unsorted")',
  '      +(row.status&&row.status!=="approved"?" ("+row.status+")":"");',
  '    what.title=what.textContent;',
  '    const when=document.createElement("span"); when.className="uwhen";',
  '    when.textContent=agoWords(row.updated_at);',
  '    when.title=String(row.updated_at||"");',
  '    el.appendChild(who); el.appendChild(what); el.appendChild(when);',
  '    body.appendChild(el);',
  '  }',
  '}',
  '',
  '/* ---- the section ------------------------------------------------- */',
]));

/* ---- 3. shown when you walk into settings -------------------------- */
swap(block([
  '  /* Back to the top: these are pages, and arriving halfway down one is what',
  '     made the single scroll hard to use in the first place. */',
  '  if(push) window.scrollTo(0,0);',
]), block([
  '  /* Back to the top: these are pages, and arriving halfway down one is what',
  '     made the single scroll hard to use in the first place. */',
  '  if(push) window.scrollTo(0,0);',
  '  /* Asked when you arrive rather than on every render: it is a request to',
  '     the server, and the page it is on is the only one that shows it. */',
  '  if(want==="settings") renderUpdates();',
]));

swap("  const seed=$(\"planseedall\");", block([
  '  const again=$("updrefresh");',
  '  if(again) again.onclick=()=>renderUpdates();',
  '  const seed=$("planseedall");',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function agoWords(iso){', 'async function teamNames(team){',
  'async function renderUpdates(){', '  if(want==="settings") renderUpdates();',
  '  if(again) again.onclick=()=>renderUpdates();'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['updates', 'updcount', 'updrefresh', 'updbody'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* NO EMAIL REACHES THIS PANEL. The RPC does not return one, and the client
   must not invent one from anywhere else either.

   BOUNDED BY THE NEXT FUNCTION, not by a comment. The first version ended the
   slice at a comment marker, and kit.code has already stripped the comments -
   so indexOf returned -1, the slice ran to the end of the file, and the check
   reported an email that was three thousand lines away. It failed loudly,
   which is the only reason the bad bounds were noticed rather than the
   assertion being weakened to make them pass. */
const updStart = code.indexOf('async function renderUpdates(){');
if (updStart < 0) throw new Error('renderUpdates went');
const updEnd = code.indexOf('\r\nfunction ', updStart);
if (updEnd < 0) throw new Error('could not find the end of renderUpdates');
const upd = code.slice(updStart, updEnd);
if (upd.length > 4000) throw new Error('the slice is too big to be one function: ' + upd.length);
if (/email/i.test(upd)) throw new Error('the updates panel mentions an email');
if (upd.indexOf('"someone"') < 0)
  throw new Error('somebody without a username has no name to show');

/* A failed lookup must not be cached, or one dropped request makes every row
   read "someone" for the rest of the session. */
if (code.indexOf('  if(m){ memberNames=m; memberNamesFor=team; }') < 0)
  throw new Error('a failed name lookup would be cached');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
