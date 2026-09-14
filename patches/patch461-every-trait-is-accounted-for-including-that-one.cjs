/* "EVERY TRAIT IS ACCOUNTED FOR" WAS TRUE EXCEPT FOR ONE CASE.

   The last of the sweep, and the comment three lines below it says what the
   promise is: "Dropping them silently is how a collection ships short with
   nothing to point at."

   An approved trait whose stored blob cannot be read - a record with no blob,
   or one whose backing file the browser has lost - hits

     try{ bytes=new Uint8Array(await t.blob.arrayBuffer()); }catch(_){ continue; }

   and the `continue` comes before BOTH files.push and rows.push. So it is not
   in the zip, not in manifest.traits, not in counts.packaged - and not in
   notPackaged either, because that list is built from the traits whose status
   keeps them out. It leaves no trace anywhere in the package.

   That is the exact failure the comment was written against, one line above
   the comment. The collection ships one trait short and the manifest says
   nothing.

   It is now the third thing the manifest accounts for, with a reason on it,
   and the message says so - because a package quietly missing a trait is only
   discovered by whoever mints it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '  let unhashed=0;', 'the export counters');
  kit.replace(L, { start: at, end: at }, [
    '  let unhashed=0;',
    '  /* The ones whose bytes would not come back. See below - they used to',
    '     leave no trace in the package at all. */',
    '  const unreadable=[];',
  ]);
  const rd = kit.only(L, l => l === '    try{ bytes=new Uint8Array(await t.blob.arrayBuffer()); }catch(_){ continue; }',
    'the export blob read');
  kit.replace(L, { start: rd, end: rd }, [
    '    /* NAMED, NOT DROPPED. This `continue` comes before both pushes, so a',
    '       trait whose blob will not read was missing from the zip, from',
    '       manifest.traits and from counts.packaged - and from notPackaged too,',
    '       because that list is built from the ones a STATUS keeps out. It left',
    '       no trace anywhere, which is the thing the comment below this loop',
    '       was written against. */',
    '    try{ bytes=new Uint8Array(await t.blob.arrayBuffer()); }',
    '    catch(_){',
    '      unreadable.push({name:t.name, layer:t.layer||"unsorted",',
    '        status:t.status||"wip", reason:"the picture could not be read"});',
    '      continue;',
    '    }',
    '    if(!bytes){',
    '      unreadable.push({name:t.name, layer:t.layer||"unsorted",',
    '        status:t.status||"wip", reason:"the picture could not be read"});',
    '      continue;',
    '    }',
  ]);
}
{
  const at = kit.only(L, l => l === '  const held=traits.filter(t=>!inCollection(t.status))',
    'what the export holds back');
  if (L[at + 1] !== '    .map(t=>({name:t.name, layer:t.layer||"unsorted", status:t.status||"wip"}));')
    throw new Error('the held-back list is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 1 }, [
    '  const held=traits.filter(t=>!inCollection(t.status))',
    '    .map(t=>({name:t.name, layer:t.layer||"unsorted", status:t.status||"wip",',
    '      reason:"not in the collection"}))',
    '    /* AND THE ONES THAT SHOULD HAVE GONE IN AND COULD NOT. Accounted for',
    '       here rather than nowhere, which is what "every trait" means. */',
    '    .concat(unreadable);',
  ]);
}
const bytes = kit.save(doc, ({ codeLines }) => {
  const ec = kit.inFunction(codeLines, 'async function exportCollection(){');
  const b = codeLines.slice(ec.start, ec.end + 1).join('\n');
  /* NOTHING LEAVES WITHOUT A TRACE. */
  if (/catch\(_\)\{ continue; \}/.test(b))
    throw new Error('a trait can still vanish from the package silently');
  if ((b.match(/unreadable\.push\(/g) || []).length !== 2)
    throw new Error('one of the two ways a blob comes back empty is unaccounted');
  /* A null blob returns no bytes without throwing, so the catch alone would
     miss it. */
  if (!/if\(!bytes\)\{/.test(b))
    throw new Error('a record with no blob at all would still vanish');
  /* AND IT REACHES THE MANIFEST, through the list that is already written
     into it. */
  if (!/\.concat\(unreadable\);/.test(b))
    throw new Error('the unreadable traits are counted nowhere');
  if (!/traits:rows, notPackaged:held\}/.test(b))
    throw new Error('the manifest no longer carries the held-back list');
  if (!/notPackaged:held\.length/.test(b))
    throw new Error('the count does not include them');
  /* Each one says WHY, or a reader cannot tell a rejected trait from a broken
     one in the same list. */
  if (!/reason:"the picture could not be read"/.test(b))
    throw new Error('the reason is missing');
  if (!/reason:"not in the collection"/.test(b))
    throw new Error('the other reason is missing, so the list is ambiguous');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
