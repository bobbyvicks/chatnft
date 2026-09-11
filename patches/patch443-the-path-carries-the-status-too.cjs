/* A TRAIT CAME BACK FROM THE FIXER AS WIP, AND THE ORIGINAL WAS DELETED.

   "the path seems broken when i try to save"

   patch440 sends a trait from the shelf into the fixer as a File carrying
   `layer + "/" + name + ".png"`, because the fixer's Save to project goes in
   through bulkImport and bulkImport reads a trait's category out of its
   path. The layer was in that path. The status was not.

   A path with no status folder means wip - that is what an import of a
   folder with no wip/approved/rejected level in it means, and it is right
   there. But a trait off the shelf HAS a status, and the file the fixer
   builds is the only thing carrying it. So an approved trait went through
   the fixer and came back wip.

   AND THE OLD RECORD WENT WITH IT. A trait's id is
   t_<name>_<layer>_<status>, so the save wrote a NEW record rather than
   replacing the old one - and then bulkImport's move check saw the same
   name on the same layer under a status this import did not supply, decided
   the file had been moved on disk, and deleted the approved one. Measured
   before this patch, one approved Hoodie sent to the fixer and saved back:

     before  t_Hoodie_clothing_approved | approved | rarity=7
     after   t_Hoodie_clothing_wip      | wip      | rarity=undefined

   The rarity is the second half of the damage. Everything the project
   decided about a trait - its rarity weight, its place on the shelf, the
   server row it is - is carried across a replacement by id. A new id
   carries none of it, so the weight somebody set in the rarity plan was
   gone too. Same measurement for stfp, which is worse: a trait in the final
   set quietly stopped being in the collection at all.

   So the path carries the status as well: layer/status/name.png, which is
   the shape the real collection has on disk. readPath matches whole
   segments, so it reads the same as an imported folder does, the id comes
   out identical, and the save is a replacement again.

   CHECKED AGAINST STATUSES rather than passed through. A record carrying
   some other string would put an unknown segment in the path, which is not
   a status to readPath and would then be the FOLDER - a made-up category.
   Anything unrecognised means wip, which is what it meant before. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const fn = kit.inFunction(L, 'async function fixFromRecords(recs){');
  const at = kit.only(L, l => l === '    files.push(fileWithPath(bytes,layer+"/"+name+".png"));',
    'the path a trait is sent on', fn);
  kit.replace(L, { start: at, end: at }, [
    '    /* THE STATUS TOO, or the trait comes back wip and takes the record it',
    '       came from with it. The id is t_name_layer_status, so a save under a',
    '       different status is a new record - and bulkImport then reads the old',
    '       one as a file that moved on disk and deletes it. Measured: an',
    '       approved Hoodie with a rarity of 7 came back as wip with none.',
    '',
    '       Against STATUSES, not passed through: an unrecognised segment is not',
    '       a status to readPath, it is a FOLDER, and that invents a category.',
    '       Anything it does not know means wip, which is what it meant before. */',
    '    const st=String(r.status||"wip");',
    '    const status=STATUSES.indexOf(st)>=0?st:"wip";',
    '    files.push(fileWithPath(bytes,layer+"/"+status+"/"+name+".png"));',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const fn = kit.inFunction(codeLines, 'async function fixFromRecords(recs){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');
  /* THE PATH CARRIES ALL THREE. */
  if (!/files\.push\(fileWithPath\(bytes,layer\+"\/"\+status\+"\/"\+name\+"\.png"\)\);/.test(body))
    throw new Error('the path still does not carry the status');
  /* AND THE OLD SHAPE IS GONE, not sitting beside it. */
  if (/layer\+"\/"\+name\+"\.png"/.test(body))
    throw new Error('a trait is still sent on a path with no status in it');
  /* A STATUS THE PATH READER KNOWS, or the segment becomes a made-up folder. */
  if (!/const status=STATUSES\.indexOf\(st\)>=0\?st:"wip";/.test(body))
    throw new Error('an unknown status would be written into the path as a folder');
  /* STATUSES is what readPath matches against, so it has to be the same list -
     a private copy here would drift from the one the reader uses. */
  if (!/const STATUSES=\["approved","wip","rejected","stfp"\];/.test(codeLines.join('\n')))
    throw new Error('the status list is not where this expects it');

  /* EVERY NAME THIS CALLS IS REAL. */
  for (const nm of ['fileWithPath', 'readPath']) {
    if (codeLines.join('\n').indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);
  }

  /* The reader still skips a status segment when it works out the folder, or
     layer/status/name.png would file the trait under its own status. */
  const rp = kit.inFunction(codeLines, 'function readPath(rel){');
  const rpb = codeLines.slice(rp.start, rp.end + 1).join('\n');
  if (!/if\(STATUSES\.indexOf\(s\)>=0\|\|isBaseSeg\(s\)\) continue;/.test(rpb))
    throw new Error('the folder would be read as the status folder');
  if (!/if\(STATUSES\.indexOf\(s\)>=0\) status=s;/.test(rpb))
    throw new Error('the reader no longer reads a status out of the path');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
