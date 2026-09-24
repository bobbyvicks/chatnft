/* ONE PROJECT PER TEAM, THE SAME ONE EVERY TIME, AND A PICTURE LOOKED FOR
   WHERE IT IS.

   Reported 2026-09-24: "we just lost a bunch of traits in our project ...
   it seems like the project cloud isnt there anymore and only the new stuff
   i did today is".

   WHAT HAPPENED, measured on the server. The team had THREE projects: the
   real one (created 09-07, 382 traits, 399 pictures), one made 09-22 23:22
   and one made 09-23 11:56. cloudCollection looked the team's project up
   with "collections?team_id=eq.X&limit=1" and NO ORDER, and made a new one
   whenever that lookup was not answered with a row - including when it was
   answered with an error. Both strays were made that way, the edge logs
   show: the lookup refused with 401 about a second after a token refresh,
   and the insert half a second later succeeded. With no order, Postgres
   returns the row that
   comes first on disk, and an update moves a row. At 15:00 UTC the real
   project was updated and moved behind the 09-22 one, so from then on every
   save went into that one. At 20:30:20 a load updated THAT one, which moved
   it behind the 09-23 one, which was empty.

   The load at 20:30 then did this in groupCatchUpRun: the pull read the
   09-22 project (19 rows, so the "server came back empty" guard did not
   fire), every synced trait on the device that was not among those 19
   became a candidate for "removed by someone else", and the picture check
   that exists to stop exactly this - "every real removal takes the picture
   with it" - asked cloudCollection AGAIN, got the 09-23 project, listed ITS
   folder, and found none of the old pictures, which were all in the real
   project's folder. So it deleted every old trait from the device. The
   second lookup landing on yet another project did not matter: listing the
   09-22 project's folder would have found none of them either, because
   the check listed the CURRENT project's folder and the old pictures were
   in another. The server kept every old trait but two, Stray God Shag and
   Leopard Buzz Cut, which were edited today: each save deleted the old
   row by id and put the edited version into the 09-22 project.

   THREE CHANGES.

   The lookup is ordered, oldest first: a team's project is the one it was
   given first, whatever order the rows are stored in. Both lookups (the
   one every save and pull goes through, and the cloud panel's) use the same
   words, TEAM_PROJECT_PICK.

   A project is made only when the server ANSWERED that the team has none -
   an ok response with an empty list. An error, a refusal or an answer that
   is not a list returns null, which every caller already treats as "could
   not open your collection". Before, a 500 or a 401 made a second project.
   A 401 is asked again once, a second later with fresh headers, because
   that refusal came right after a token refresh both times it was seen.

   The catch-up looks for each candidate's picture in THE FOLDER ITS OWN
   PATH NAMES, rather than in whichever project the lookup returns now. A
   picture that is there means the trait was not removed, whatever list it
   is missing from. A folder that cannot be listed, or a path outside this
   team's folders (which this person may not be able to list at all, so an
   empty answer would mean nothing), decides nothing: the trait is kept, as
   a failed listing already kept it. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

/* The pick, beside the function that uses it. */
swap('async function cloudCollection(u){', [
  '/* THE TEAM\'S PROJECT: the one it was given first. "limit=1" with no order',
  '   returned whichever row Postgres had first on disk, and an update moves a',
  '   row - so a team with more than one project got a different one after',
  '   any of them was saved, and a load judged the device against the wrong',
  '   one (patch591). Every lookup of a team\'s project uses these words. */',
  'const TEAM_PROJECT_PICK="&order=created_at.asc,id.asc&limit=1";',
  'async function cloudCollection(u){',
], 'cloudCollection');

{
  const i = at('  let r=await fetch(SB_URL+"/rest/v1/collections?select=id,layers,rules,decisions,decide_order,empty_chance,rules_at&team_id=eq."+team+"&limit=1",{headers:h});', 'the lookup');
  if (L[i - 2] !== '  const h=await sbHeaders({"Content-Type":"application/json"});') throw new Error('the headers moved');
  if (L[i + 1] !== '  if(r.ok){ const rows=await r.json(); if(rows.length) return rows[0]; }') throw new Error('the lookup\'s answer moved');
  kit.replace(L, { start: i - 2, end: i + 1 }, [
    '  let h=await sbHeaders({"Content-Type":"application/json"});',
    L[i - 1],
    '  const ask=()=>fetch(SB_URL+"/rest/v1/collections?select=id,layers,rules,decisions,decide_order,empty_chance,rules_at&team_id=eq."+team+TEAM_PROJECT_PICK,{headers:h});',
    '  let r=await ask();',
    '  /* A REFUSED TOKEN IS ASKED ONCE MORE, a second later with the headers',
    '     built again: both times a team was given a second project, this',
    '     lookup had been refused with 401 about a second after the token was',
    '     refreshed, and the insert straight after it succeeded. */',
    '  if(r.status===401){',
    '    await new Promise(res=>setTimeout(res,1000));',
    '    h=await sbHeaders({"Content-Type":"application/json"});',
    '    if(!h) return null;',
    '    r=await ask();',
    '  }',
    '  /* ONLY A CLEAR "NONE" MAKES ONE. This used to fall through to the insert',
    '     on any answer that was not a row - a 500, a refused token - and a',
    '     team that already had a project got another (two, measured on the',
    '     server). Not knowing is not the same as having none. */',
    '  if(!r.ok) return null;',
    '  const rows=await r.json();',
    '  if(!Array.isArray(rows)) return null;',
    '  if(rows.length) return rows[0];',
  ]);
}

/* The cloud panel's lookup. */
{
  const i = at('    const cr=await fetch(SB_URL+"/rest/v1/collections?select=id,updated_at&team_id=eq."+(await cloudTeam())+"&limit=1",{headers:h});', 'the panel lookup');
  L[i] = '    const cr=await fetch(SB_URL+"/rest/v1/collections?select=id,updated_at&team_id=eq."+(await cloudTeam())+TEAM_PROJECT_PICK,{headers:h});';
}

/* The catch-up's picture check. */
{
  const s = at('        let files=null;', 'the picture check');
  const want = [
    '        let files=null;',
    '        if(cand.some(it=>it.path)){',
    '          try{',
    '            const u=await sbUser(), team=await cloudTeam();',
    '            const c=u ? await cloudCollection(u) : null;',
    '            if(team && c){ const b=await bucketPaths(team,c); if(b.ok) files=b.paths; }',
    '          }catch(_){ files=null; }',
    '        }',
    '        let gone=0, kept=0;',
    '        for(const it of cand){',
    '          if(!wsStill(gen)) break;',
    '          if(it.path && (files===null || files.has(it.path))){ kept++; continue; }',
    '          await dbDel(it.id); gone++;',
    '        }',
  ];
  for (let k = 0; k < want.length; k++) if (L[s + k] !== want[k]) throw new Error('the picture check changed at line ' + k + ': ' + L[s + k]);
  kit.replace(L, { start: s, end: s + want.length - 1 }, [
    '        /* EACH PICTURE IS LOOKED FOR WHERE ITS OWN PATH SAYS IT IS.',
    '',
    '           SUPERSEDED: this listed the folder of the project cloudCollection',
    '           returned NOW. On 2026-09-24 that was a different project from',
    '           the one the pull had just read, and not the one the device\'s',
    '           traits were saved in, so none of their pictures was "there" and',
    '           every old trait on the device was deleted as removed by someone',
    '           else. A picture present in its own folder means the trait was',
    '           not removed, whichever list it is missing from.',
    '',
    '           Only this team\'s folders are asked: a folder this person cannot',
    '           read lists as empty, which would read as "every picture gone".',
    '           A path in no folder of this team, or a folder that cannot be',
    '           listed, decides nothing and the trait is kept - the rule a failed',
    '           listing already had. */',
    '        const inFolders=new Map();',
    '        let team=null;',
    '        try{ team=await cloudTeam(); }catch(_){ team=null; }',
    '        const folderOf=p=>{',
    '          if(!team||typeof p!=="string") return null;',
    '          const parts=p.split("/");',
    '          return parts.length===3&&parts[0]===String(team)&&parts[1]&&parts[2] ? parts[1] : null;',
    '        };',
    '        for(const it of cand){',
    '          const f=folderOf(it.path);',
    '          if(!f||inFolders.has(f)) continue;',
    '          inFolders.set(f,null);',
    '          try{ const b=await bucketPaths(team,{id:f}); if(b.ok) inFolders.set(f,b.paths); }catch(_){ }',
    '        }',
    '        let gone=0, kept=0;',
    '        for(const it of cand){',
    '          if(!wsStill(gen)) break;',
    '          if(it.path){',
    '            const files=inFolders.get(folderOf(it.path))||null;',
    '            if(files===null || files.has(it.path)){ kept++; continue; }',
    '          }',
    '          await dbDel(it.id); gone++;',
    '        }',
  ]);
}

kit.save(doc, ({ code }) => {
  if (code.split('TEAM_PROJECT_PICK').length - 1 !== 3) throw new Error('the pick: its definition and two lookups');
  if (/collections\?select=[^"]*&team_id=eq\.[^;]*"&limit=1"/.test(code)) throw new Error('an unordered team lookup is left');
  if (code.indexOf('const c=u ? await cloudCollection(u) : null;\n            if(team && c){ const b=await bucketPaths(team,c)') >= 0) throw new Error('the old picture check is left');
});
fs.renameSync(TMP, FILE);
console.log('patch591 written');
