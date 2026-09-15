/* THE SITE IS CALLED BuildaNFT.

   Asked for plainly: "BuildaNFT is what I want to call the site instead of
   ChatNFT".

   WHAT CHANGES IS WHAT A PERSON READS - the tab title, the three places the
   name is printed, and the two messages that name it when refusing a file.
   Plus the names of the files it hands you, because those end up in a
   Downloads folder with the old name on them.

   WHAT DOES NOT CHANGE IS EVERY STRING SOMETHING ELSE DEPENDS ON, and the
   file already holds the precedent and the reasoning, written for the LAST
   rename:

     /* Deliberately still 'pixelbench' after the rename to ChatNFT: this
        string is the key to every trait already saved in a browser. Renaming
        it would leave that data in place but unreachable, which presents as
        the project emptying itself. The name on screen is not worth
        someone's work. *\/
     const DBN='pixelbench', ...

   That note is extended rather than replaced - a second rename is more
   evidence for it, not less. The same argument covers four more things:

   THE STORAGE KEYS. chatnft.ws names which project is open, and
   'chatnft.ws.'+id IS THE DATABASE NAME of every group project - renaming it
   would hide every trait in every group behind a key nothing asks for.
   chatnft.session holds the sign-in; chatnft.wsname, chatnft.join,
   chatnft.projfold and chatnft.planfold hold smaller things the same way.

   THE LOGIN DOMAIN. asLogin turns a username into bob@chatnft.invalid, and
   that address IS the account at the auth server. Renaming it does not rename
   anybody's account; it makes a NEW one, and locks the owner and every
   teammate out of the old one with the right password. This is the one that
   would be hardest to undo, because the accounts it orphans are on a server
   rather than in a browser.

   THE FILE FORMATS. A saved project carries format:"chatnft-project" and the
   import refuses anything else; a packaged collection carries
   format:"chatnft-collection" in its manifest, which is what a minting
   service reads. Changing either makes every file already exported
   unreadable, including by the person who exported it this morning.

   THE MODULE GLOBALS, ChatNftTraitShelf and ChatNftTextOverlay. These are
   invisible to anybody using the site, so renaming them buys nothing and
   costs a diff across two extracted modules and their tests.

   And one comment that names the old project is left exactly as it is:
   "Ported from the ChatNFT project's pixel-qa-core". That is a record of
   where the code came from, and it came from there under that name. Changing
   it would make the history wrong to make the present tidy.

   THE DOMAIN IS NOT THIS COMMIT'S TO CHANGE. The site is served from
   pixelbench.vercel.app and the repo is bobbyvicks/chatnft; both are settings
   outside this file. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const NEW = 'BuildaNFT';

/* ---- 1. what a person reads ---- */
{
  const at = kit.only(L, l => l === '<title>ChatNFT — pixel art editor on the true grid</title>', 'the tab title');
  kit.replace(L, { start: at, end: at }, [
    '<title>' + NEW + ' — pixel art editor on the true grid</title>',
  ]);
}
{
  /* Three: the sign-in card, the landing page and the editor header. */
  const hits = [];
  for (let i = 0; i < L.length; i++) if (L[i].indexOf('<h1>ChatNFT</h1>') >= 0) hits.push(i);
  if (hits.length !== 3)
    throw new Error('expected the name printed in three places, found ' + hits.length);
  for (const i of hits) L[i] = L[i].split('<h1>ChatNFT</h1>').join('<h1>' + NEW + '</h1>');
}
{
  const at = kit.only(L, l => l === '    toast("That file is not a ChatNFT project"); return;',
    'the refused-project message');
  kit.replace(L, { start: at, end: at }, [
    '    toast("That file is not a ' + NEW + ' project"); return;',
  ]);
  const nv = kit.only(L, l => l === '    toast("That project was saved by a newer version of ChatNFT"); return;',
    'the newer-version message');
  kit.replace(L, { start: nv, end: nv }, [
    '    toast("That project was saved by a newer version of ' + NEW + '"); return;',
  ]);
}
{
  const at = kit.only(L, l => l === '   has ChatNFT open in a tab, and follows an invite or a reset link back to',
    'the tab-open note');
  kit.replace(L, { start: at, end: at }, [
    '   has ' + NEW + ' open in a tab, and follows an invite or a reset link back to',
  ]);
}

/* ---- 2. and the names of the files it hands you ---- */
{
  const zip = kit.only(L, l => l === "  a.href=u; a.download='chatnft-project.zip';", 'the project zip name');
  kit.replace(L, { start: zip, end: zip }, [
    "  a.href=u; a.download='buildanft-project.zip';",
  ]);
  const json = kit.only(L, l => l === '  a.href=u; a.download="chatnft-project.json";', 'the project json name');
  kit.replace(L, { start: json, end: json }, [
    '  a.href=u; a.download="buildanft-project.json";',
  ]);
  const rules = kit.only(L, l => l === '  a.href=u; a.download="trait-rules-from-chatnft.json";', 'the rules file name');
  kit.replace(L, { start: rules, end: rules }, [
    '  a.href=u; a.download="trait-rules-from-buildanft.json";',
  ]);
  const col = kit.only(L, l => l === '  a.download="chatnft-collection"+((REVIEW&&REVIEW.revision)?"-"+safe(REVIEW.revision):"")+".zip";',
    'the collection zip name');
  kit.replace(L, { start: col, end: col }, [
    '  a.download="buildanft-collection"+((REVIEW&&REVIEW.revision)?"-"+safe(REVIEW.revision):"")+".zip";',
  ]);
  const made = kit.only(L, l => l === '    a.href=u; a.download="chatnft-collection-"+r.made+".zip";',
    'the generated collection zip name');
  kit.replace(L, { start: made, end: made }, [
    '    a.href=u; a.download="buildanft-collection-"+r.made+".zip";',
  ]);
}

/* ---- 3. and the note that says why the rest stays ---- */
{
  const at = kit.only(L, l => l === "/* Deliberately still 'pixelbench' after the rename to ChatNFT: this string is",
    'the database name note');
  if (L[at + 3] !== '   itself. The name on screen is not worth someone\'s work. */')
    throw new Error('the database name note is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 3 }, [
    "/* STILL 'pixelbench', THROUGH TWO RENAMES NOW - pixelbench, then ChatNFT,",
    '   then ' + NEW + '. This string is the key to every trait already saved in a',
    '   browser. Renaming it would leave that data in place but unreachable,',
    '   which presents as the project emptying itself.',
    '',
    '   The same argument covers everything else in this file still spelled',
    '   chatnft: the localStorage keys, the per-project database names',
    "   ('chatnft.ws.'+id), the login domain that IS the account at the auth",
    '   server, and the format strings written into every exported project and',
    '   collection manifest. A rename is a thing to read, not a thing to break.',
    '',
    "   The name on screen is not worth someone's work. */",
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* WHAT A PERSON READS SAYS THE NEW NAME. */
  if (!/<title>BuildaNFT — pixel art editor on the true grid<\/title>/.test(text))
    throw new Error('the tab still says the old name');
  if ((text.match(/<h1>BuildaNFT<\/h1>/g) || []).length !== 3)
    throw new Error('the name is not printed in all three places');
  if (/<h1>ChatNFT<\/h1>/.test(text))
    throw new Error('one of the three still says the old name');
  if (/not a ChatNFT project|newer version of ChatNFT/.test(text))
    throw new Error('a message still names the old site');
  if (/download='chatnft|download="chatnft|from-chatnft/.test(text))
    throw new Error('a file it hands you still carries the old name');

  /* AND EVERYTHING SOMETHING ELSE DEPENDS ON IS UNTOUCHED. Named one at a
     time rather than counted, because a count passes with the right total and
     the wrong members - and the wrong member here is somebody's account or
     somebody's traits. */
  const code = codeLines.join('\n');
  for (const [needle, why] of [
    ["const DBN='pixelbench'", 'the personal database'],
    ['localStorage.getItem("chatnft.ws")', 'which project is open'],
    ["'chatnft.ws.'+activeWs", 'the database name of every group project'],
    ['const SB_SESSION="chatnft.session"', 'the sign-in'],
    ['const WS_KEY="chatnft.ws"', 'the project key'],
    ['const WS_NAME_KEY="chatnft.wsname"', 'the project name'],
    ['const JOIN_KEY="chatnft.join"', 'a pending invite'],
    ['const PROJ_KEY="chatnft.projfold"', 'the project folder'],
    ['const PLAN_KEY="chatnft.planfold"', 'the plan folder'],
    ['const USER_DOMAIN="@chatnft.invalid"', 'the login domain, which IS the account'],
    ['const PROJECT_FORMAT="chatnft-project"', 'what every saved project says it is'],
    ['const COLLECTION_FORMAT="chatnft-collection"', 'what every packaged manifest says it is'],
  ]) {
    if (code.indexOf(needle) < 0)
      throw new Error('the rename reached ' + why + ' (' + needle + '), which would orphan it');
  }
  /* The extracted modules keep their names: invisible to anyone using the
     site, and renaming them is a diff across two modules and their tests for
     nothing. */
  if (!/ChatNftTraitShelf/.test(code) || !/ChatNftTextOverlay/.test(code))
    throw new Error('an extracted module was renamed, which buys nothing and costs a sweep');
  /* And the provenance note stays true. */
  if (!/Ported from the ChatNFT project's pixel-qa-core/.test(text))
    throw new Error('a record of where code came from was rewritten to match the present');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
