/* TASK 17: "REMOVE FROM SERVER" IS THE GROUP OWNER'S (page only).

   A controller ruling (F-04), not in the plan file. The owner asked for it:
   design decision E3 is "owner only", with a yes to applying it to today's
   page.

   Why. Until this, any member of a group could press the button
   ("Clear the cloud": clearCloud, then clearCloudNow), and that removes
   every picture and every row of the group's project, for everyone. The
   design gives that power to the group's owner only.

   The rule lives in the page only, not in the database. Today's ordinary
   save deletes and then inserts trait rows under the same row-level-security
   policy, so a server rule refusing members' deletes would break every
   member's save. The server-side refusal arrives with the new design's
   clear_project in a later plan. Until then a member could still clear by
   hand-crafting requests, which any member can already do today.

   What it does. On a group page (activeWs set), clearCloud asks the role
   first, inside its existing try/finally so the button always comes back,
   and before clearCloudNow - so before the stage-0 hold (s0Refuse, the
   first line of clearCloudNow, patch602) and before any confirm:
     - owner: clearCloudNow, exactly as today;
     - member, or no membership row: nothing is sent and no confirm is
       shown; the note says it is the owner's;
     - the read fails (no session, the network, not 2xx, not a list):
       nothing is sent; the note says it could not check;
     - the page moved during the read (a switch or a sign-out bumps wsGen):
       the answer is about a project no longer shown, so nothing is sent
       and the note says it could not check. (Added beyond the ruling: a
       switch during the read would otherwise clear the project moved to
       on a verdict about the one left.)
   On the personal page there is no role read, and nothing changes.

   The role read (F-04): a plain
   team_members?select=role&team_id=eq.<t>&user_id=eq.<u>, made only here,
   never inside cloudRender - the button stays where it is, shown as today.
   <u> is the stored session's uid, whose token the read carries (as
   s0FlagSet reads it, patch602), not sbUser's: that is a GET /auth/v1/user
   of its own, and a member's press is to send the role read and nothing
   else. The live team_members allows only 'owner' and 'member'
   (team_members_role_check), and a member may read every member's row of
   their team (members_read: is_team_member(team_id)), so the uid asked
   about must be the token's own.

   The button's title says who can use it; nothing else on it changes.

   FIX ROUND 1 (review finding, measured on this patch's first page,
   0a8a489): THE WHOLE CLEAR STAYS ON THE PROJECT IT WAS PRESSED ON. The
   move guard above covered only the role read's own window. clearCloudNow
   then waits on the stage-0 read (s0Refuse) and on sbUser, and only after
   them does cloudTeam() read activeWs - so a switch in either window
   cleared the project moved to, on the owner's answer for the one left
   (team8's pictures and rows deleted, the group confirm shown); and a press
   on the personal page, with no role read at all, cleared a group moved to
   the same way. Now clearCloud takes wsGen at the press, on both pages, and
   hands it to clearCloudNow(gen), which stops with a note when the page has
   moved:
     - after cloudTeam(), before cloudCollection can make a project in the
       group moved to or anything is asked about it;
     - after the row count, before the empty-server repair writes this
       device's store and before the confirm;
     - after the pictures-left read, for the same two.
   From the confirm on, team and c are fixed, and it is the owner's project.
   Called with no gen (stage0gate calls clearCloudNow() directly), it is as
   it was.

   Anchored on the single lines F-04 names, which survive patches 600-606:
   `async function clearCloud(){` (cloudRole goes just before it) and
   `  $("cloudclear").hidden=!inn;` (finish() finds cloudRender by it); the
   check replaces clearCloud's one-line try, and the title is found by its
   button's two declaring lines. Fix round 1 adds three anchors in
   clearCloudNow, each exact-once on eaa3f75's page: its head down to
   cloudCollection (patch602's text), the row count's two lines, and the
   pictures-left read's two lines. */
const s0 = require('./stage0-common.cjs');
const kit = require(require('path').join(s0.REPO, 'tools', 'patchkit.cjs'));
const doc = s0.start([['async function s0Refuse(after){', 'patch602 is not applied (s0Refuse)']]);

/* ---- 1. the role read ----------------------------------------------------- */
doc.swap('async function clearCloud(){', [
  '/* TASK 17 (design E3, controller ruling F-04): REMOVE FROM SERVER IS THE',
  '   GROUP OWNER\'S. This account\'s role in the group shown: "owner",',
  '   "member" (a member, or no membership row at all), or null when it could',
  '   not be read - no group, no session, the network, an answer that is not',
  '   2xx or not a list. A plain team_members read, made only by clearCloud',
  '   on a group page and never inside cloudRender. The uid asked about is the',
  '   stored session\'s, whose token the read carries (as s0FlagSet reads it):',
  '   a member may read every member\'s row of the group (members_read), so it',
  '   must be the token\'s own; sbUser would be a request of its own. */',
  'const CLOUD_OWNER_ONLY="Only this project\'s owner can remove it from the server. Your copy on this device is untouched.";',
  'const CLOUD_OWNER_UNKNOWN="Could not check who owns this project, so nothing was changed.";',
  '/* Said by clearCloudNow when the page moved after the press (fix round 1). */',
  'const CLOUD_MOVED="The page moved to another project, so nothing was changed.";',
  'async function cloudRole(){',
  '  const team=activeWs;',
  '  if(!team) return null;',
  '  const h=await sbHeaders();',
  '  if(!h) return null;',
  '  const uid=s0SessionUid(sbLoadSession());',
  '  if(!uid) return null;',
  '  try{',
  '    const r=await fetch(SB_URL+"/rest/v1/team_members?select=role&team_id=eq."+encodeURIComponent(team)',
  '      +"&user_id=eq."+encodeURIComponent(uid),{headers:h});',
  '    if(!r.ok) return null;',
  '    const rows=await r.json();',
  '    if(!Array.isArray(rows)) return null;',
  '    return (rows[0]&&rows[0].role==="owner") ? "owner" : "member";',
  '  }catch(_){ return null; }',
  '}',
  'async function clearCloud(){',
]);

/* ---- 2. the check, at the top of clearCloud's try ------------------------- */
doc.swap('  try{ await clearCloudNow(); }', [
  '  try{',
  '    /* TASK 17 (E3, F-04): on a group page, the owner\'s only. Asked first -',
  '       before the stage-0 hold (s0Refuse, clearCloudNow\'s first line) and',
  '       before any confirm - so a member is told the one thing that applies',
  '       to them, and nothing else is sent. Inside the try, so the finally',
  '       below always gives the button back. The personal page asks nothing. */',
  '    /* The project this press is for, on either page: a switch or a',
  '       sign-out bumps wsGen. The owner\'s answer below is for it, and',
  '       clearCloudNow is held to it too (fix round 1). */',
  '    const gen=wsGen;',
  '    if(activeWs){',
  '      const role=await cloudRole();',
  '      const note=$("cloudnote");',
  '      const say=m=>{ if(note) note.textContent=m; };',
  '      /* The page moved during the read: the answer is about a project no',
  '         longer shown, and going on would clear the one moved to. */',
  '      if(!wsStill(gen)){ say(CLOUD_OWNER_UNKNOWN); return; }',
  '      if(role===null){ say(CLOUD_OWNER_UNKNOWN); return; }',
  '      if(role!=="owner"){ say(CLOUD_OWNER_ONLY); return; }',
  '    }',
  '    await clearCloudNow(gen);',
  '  }',
]);

/* ---- 2b. fix round 1: clearCloudNow stays on the project of the press ----- */
doc.swap([
  'async function clearCloudNow(){',
  '  /* STAGE 0 (D1): removing from the server waits while this project is held. */',
  '  if(await s0Refuse()) return;',
  '  const note=$("cloudnote");',
  '  const say=m=>{ if(note) note.textContent=m; };',
  '  const u=await sbUser();',
  '  if(!u){ toast("Sign in first"); return; }',
  '  const team=await cloudTeam();',
  '  const c=team?await cloudCollection(u):null;',
], [
  'async function clearCloudNow(gen){',
  '  /* STAGE 0 (D1): removing from the server waits while this project is held. */',
  '  if(await s0Refuse()) return;',
  '  const note=$("cloudnote");',
  '  const say=m=>{ if(note) note.textContent=m; };',
  '  /* TASK 17, fix round 1: THE CLEAR STAYS ON THE PROJECT IT WAS PRESSED',
  '     ON. gen is wsGen at the press (clearCloud), the project the owner\'s',
  '     answer was for. The team is read only after s0Refuse\'s read and',
  '     sbUser\'s, so a switch in either aimed the whole clear at the project',
  '     moved to, on the answer for the one left (measured: the group moved',
  '     to lost its pictures and rows; from the personal page too, with no',
  '     role read at all). So it stops, and says so, before anything is asked',
  '     about the project moved to or made there (cloudCollection makes one',
  '     when there is none), and before the empty-server repair or the',
  '     confirm; from the confirm on, team and c are fixed. With no gen',
  '     (stage0gate calls this directly) it goes on as it did. */',
  '  const moved=()=>{',
  '    if(gen===undefined||wsStill(gen)) return false;',
  '    say(CLOUD_MOVED);',
  '    return true;',
  '  };',
  '  const u=await sbUser();',
  '  if(!u){ toast("Sign in first"); return; }',
  '  const team=await cloudTeam();',
  '  if(moved()) return;',
  '  const c=team?await cloudCollection(u):null;',
]);
doc.swap([
  '  const rows=await cloudRowCount(c);',
  '  if(rows===null){ say("Could not ask the server what it has, so nothing was changed."); return; }',
], [
  '  const rows=await cloudRowCount(c);',
  '  if(moved()) return;',
  '  if(rows===null){ say("Could not ask the server what it has, so nothing was changed."); return; }',
]);
doc.swap([
  '    const left=await cloudFilesLeft(team,c);',
  '    if(!left){',
], [
  '    const left=await cloudFilesLeft(team,c);',
  '    if(moved()) return;',
  '    if(!left){',
]);

/* ---- 3. the button's title ------------------------------------------------ */
doc.swap([
  '        <button class="mini" id="cloudclear" hidden',
  '          title="Remove this project from the server: every trait row and every picture in storage. Your own copy on this device is kept, and every other member of the group keeps theirs. It only clears what is on the server.">Clear the cloud</button>',
], [
  '        <button class="mini" id="cloudclear" hidden',
  '          title="Removes this project from the server for everyone. On a group page only the owner can.">Clear the cloud</button>',
]);

doc.finish(({ text, code, must }) => {
  const NL = s0.NL;
  must('"/rest/v1/team_members?select=role&team_id=eq."', 'the role read is not there');
  must('+"&user_id=eq."+encodeURIComponent(uid),{headers:h});', 'the role read does not name the account');
  must('return (rows[0]&&rows[0].role==="owner") ? "owner" : "member";', 'the role is not read as owner or not');
  must('    const gen=wsGen;' + NL + '    if(activeWs){' + NL + '      const role=await cloudRole();', 'clearCloud does not take wsGen at the press, then ask the role on a group page');
  /* Fix round 1: clearCloudNow is held to the press's project. */
  must('    await clearCloudNow(gen);', 'clearCloud does not hand the press\'s wsGen to clearCloudNow');
  must('const CLOUD_MOVED="The page moved to another project, so nothing was changed.";', 'the moved note is not there');
  must('  const moved=()=>{' + NL + '    if(gen===undefined||wsStill(gen)) return false;' + NL + '    say(CLOUD_MOVED);' + NL + '    return true;' + NL + '  };',
    'clearCloudNow has no move check');
  must('  const team=await cloudTeam();' + NL + '  if(moved()) return;' + NL + '  const c=team?await cloudCollection(u):null;',
    'a move before the team is read is not stopped before cloudCollection');
  must('  const rows=await cloudRowCount(c);' + NL + '  if(moved()) return;', 'a move during the row count is not stopped');
  must('    const left=await cloudFilesLeft(team,c);' + NL + '    if(moved()) return;', 'a move during the pictures-left read is not stopped');
  must('      if(!wsStill(gen)){ say(CLOUD_OWNER_UNKNOWN); return; }', 'a move during the role read is not stopped');
  must('      if(role===null){ say(CLOUD_OWNER_UNKNOWN); return; }', 'a failed role read is not stopped');
  must('      if(role!=="owner"){ say(CLOUD_OWNER_ONLY); return; }', 'a member is not stopped');
  if (text.indexOf('title="Removes this project from the server for everyone. On a group page only the owner can.">Clear the cloud</button>') < 0)
    throw new Error('the button\'s title is not set');
  const lines = kit.lines(code);
  /* NEVER INSIDE cloudRender (F-04), checked before anything below so that a
     read put there is named as such. Found by the ruling's own anchor. */
  const cr = kit.inFunction(lines, 'async function cloudRender(){');
  const body = lines.slice(cr.start, cr.end + 1);
  if (body.filter(l => l === '  $("cloudclear").hidden=!inn;').length !== 1)
    throw new Error('cloudRender is not the function that shows the button');
  if (body.some(l => l.indexOf('team_members') >= 0 || l.indexOf('cloudRole') >= 0))
    throw new Error('the role read is inside cloudRender (F-04: never)');
  /* And made nowhere else: one read, and one call of it (clearCloud's). */
  const count = (s) => code.split(s).length - 1;
  if (count('/rest/v1/team_members') !== 1) throw new Error('expected one team_members read, found ' + count('/rest/v1/team_members'));
  if (count('cloudRole(') !== 2) throw new Error('expected cloudRole defined once and called once, found ' + count('cloudRole('));
  /* THE ORDER, in clearCloud: wsGen at the press (before any await), the
     role, then clearCloudNow, whose first line is s0Refuse - so the owner
     check comes before the stage-0 hold. */
  const cc = kit.inFunction(lines, 'async function clearCloud(){');
  const at = (pred, r) => { for (let i = r.start; i <= r.end; i++) if (pred(lines[i])) return i; return -1; };
  const genAt = at(l => l === '    const gen=wsGen;', cc);
  const roleAt = at(l => l.indexOf('await cloudRole()') >= 0, cc);
  const nowAt = at(l => l === '    await clearCloudNow(gen);', cc);
  const tryAt = at(l => l === '  try{', cc);
  const firstAwait = at(l => l.indexOf('await ') >= 0, cc);
  if (genAt < 0 || roleAt < 0 || nowAt < 0 || tryAt < 0 || !(tryAt < genAt && genAt < roleAt && roleAt < nowAt) || !(genAt < firstAwait))
    throw new Error('clearCloud does not take wsGen, then ask the role, inside its try, before clearCloudNow');
  const now = kit.inFunction(lines, 'async function clearCloudNow(gen){');
  const firstNow = lines.slice(now.start + 1, now.end).find(l => l.trim() !== '');
  if (firstNow !== '  if(await s0Refuse()) return;')
    throw new Error('clearCloudNow does not begin with the stage-0 hold, so "before s0Refuse" is not what clearCloud\'s order says: ' + firstNow);
  /* Fix round 1: the three move checks, all before the confirm, and the one
     caller that hands a gen is clearCloud (stage0gate's direct calls hand
     none). */
  const checks = [];
  for (let i = now.start; i <= now.end; i++) if (lines[i].trim() === 'if(moved()) return;') checks.push(i);
  const confirmAt = at(l => l.indexOf('if(!confirm("Remove this project from the server?"') >= 0, now);
  if (checks.length !== 3 || confirmAt < 0 || !(checks[2] < confirmAt))
    throw new Error('clearCloudNow does not check for a move three times before its confirm: ' + checks.length + ' check(s), confirm at ' + confirmAt);
  if (count('clearCloudNow(gen)') !== 2) throw new Error('expected clearCloudNow(gen) defined once and called once, found ' + count('clearCloudNow(gen)'));
});
