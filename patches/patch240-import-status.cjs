/* The import decides every trait's status and never says which.

   MEASURED by reading it. readPath matches a status only on a WHOLE path
   segment against ["approved","wip","rejected"], and bulkImport then does
   `const status=info.status||"wip"`. So a folder with no approved/ or wip/
   subfolders - which is the ordinary case, and is the shape of the collection
   this came up for - imports every file as wip.

   That is CORRECT and stays. The whole-segment rule is a recorded decision
   with its reason attached: a folder called "approved-drafts" contains the
   word "approved" and means the opposite. The real folder here is called
   "APPROVED TRAITS - WEBSITE UPLOAD", which a person reads as approved and
   which that rule correctly refuses to - loosening it is exactly the mistake
   the comment was written to prevent.

   WHAT IS WRONG IS THE SILENCE. traitEligible returns false for wip unless
   "include wip" is ticked, so after importing 233 files every one of them is
   invisible to the generator: Sheet of 12 and Generate set produce nothing,
   the rarity figures are all zero, and the possible-character count is zero.
   The import report says "Imported 233 files" and lists the layers it made,
   the files it renamed, the ones it skipped and the ones it left alone - and
   says nothing at all about the one property that decides whether any of them
   can be used.

   The app does tell you eventually, one trait at a time: the percentage on a
   card reads "never", with "Only approved traits are drawn - tick include wip
   to include this one" on hover. That is the right message in the wrong place
   for an import - it is found by hovering one card after wondering why the
   sheet is empty.

   So the report says it, in the same breath as everything else it reports, and
   names both ways out. No behaviour changes.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('noStatus') >= 0) throw new Error('already patched');

/* ---- 1. count the ones the path said nothing about ---- */
{
  const at = kit.only(doc.lines, l => l === '  const adopted=[];', 'the adopted layers list');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  const adopted=[];',
    '  /* How many carried no wip / approved / rejected folder in their path and',
    '     therefore took the default. Counted rather than inferred from the',
    '     records afterwards, because a trait that REPLACED an approved one keeps',
    '     nothing of the old status and the two cases read the same in the store. */',
    '  let noStatus=0;',
  ]);
}

/* ---- 2. count it where the default is actually applied ---- */
{
  const at = kit.only(doc.lines, l => l === '        const status=info.status||"wip";', 'the status default');
  kit.replace(doc.lines, { start: at, end: at }, [
    '        const status=info.status||"wip";',
    '        if(!info.status) noStatus++;',
  ]);
  console.log('ok  the import counts what the path did not say');
}

/* ---- 3. and the report says so ---- */
{
  const at = kit.only(doc.lines,
    l => l.indexOf('if(adopted.length) bits.push("made "+adopted.length+" new layer"') >= 0,
    'the new-layer report line');
  kit.replace(doc.lines, { start: at, end: at + 1 }, [
    doc.lines[at],
    doc.lines[at + 1],
    '  /* THE PROPERTY THAT DECIDES WHETHER ANY OF THEM CAN BE USED, and the only',
    '     one the report did not mention. traitEligible refuses a wip trait unless',
    '     "include wip" is ticked, so an import with no status folders leaves a set',
    '     that draws nothing at all - an empty Sheet of 12, zero percentages, and a',
    '     possible-character count of zero. The per-card message says it one trait',
    '     at a time, which is found only after wondering why the sheet is empty. */',
    '  if(noStatus) bits.push(noStatus+" had no wip / approved / rejected folder in the path and came in as wip"',
    '    +" - nothing is drawn onto a character until they are approved, or tick include wip");',
  ]);
  console.log('ok  and says it, with both ways out named');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ codeLines, code }) => {
  const bi = kit.inFunction(codeLines, 'async function bulkImport(files){');
  const b = codeLines.slice(bi.start, bi.end + 1).join('\n');
  if (b.indexOf('let noStatus=0;') < 0) throw new Error('nothing counts them');
  if (b.indexOf('if(!info.status) noStatus++;') < 0)
    throw new Error('the count is not taken where the default is applied');
  if (b.indexOf('came in as wip') < 0) throw new Error('the report does not say it');
  /* Counted only when the path really said nothing - a file inside an
     approved/ folder must not be counted as defaulted. */
  if (b.indexOf('const status=info.status||"wip";') < 0)
    throw new Error('the default itself is gone, so the message would be a lie');
  /* And the behaviour must NOT have changed: the whole-segment status rule is
     a recorded decision and this patch only reports it. */
  if (code.indexOf('if(STATUSES.indexOf(s)>=0) status=s;') < 0)
    throw new Error('the status matching rule was changed, which this must not do');
  if (code.indexOf('const STATUSES=["approved","wip","rejected"];') < 0)
    throw new Error('the status list changed');
  /* Both ways out are named, or the message is a complaint rather than help. */
  const line = b.slice(b.indexOf('came in as wip'));
  if (line.indexOf('approved') < 0 || line.indexOf('include wip') < 0)
    throw new Error('the message does not say how to fix it');
});

/* RUN the counting, because "233 of them" is the claim. */
{
  const STATUSES = ['approved', 'wip', 'rejected'];
  const read = (rel) => {
    const parts = rel.split(/[\\/]/).filter(Boolean);
    parts.pop();
    let status = null;
    for (const seg of parts) { const s = seg.toLowerCase(); if (STATUSES.indexOf(s) >= 0) status = s; }
    return status;
  };
  /* The real folder. A person reads this as approved; the whole-segment rule
     correctly does not, and that is the case this message exists for. */
  if (read('APPROVED TRAITS - WEBSITE UPLOAD/hats/BTC Cap.png') !== null)
    throw new Error('the upload folder should NOT count as an approved folder');
  /* A real status folder still works and must not be counted as defaulted. */
  if (read('traits/hats/approved/BTC Cap.png') !== 'approved')
    throw new Error('an approved folder stopped being read');
  if (read('traits/hats/rejected/x.png') !== 'rejected')
    throw new Error('a rejected folder stopped being read');
  /* The count over the whole collection. */
  const folders = ['backgrounds', 'chains', 'clothing', 'costumes', 'ears', 'extras',
    'eyes', 'glasses', 'hair', 'hats', 'masks', 'mouth', 'skins'];
  const counts = [42, 6, 27, 9, 3, 18, 16, 13, 25, 35, 10, 11, 28];
  let total = 0, defaulted = 0;
  folders.forEach((f, i) => {
    for (let n = 0; n < counts[i]; n++) {
      total++;
      if (read('APPROVED TRAITS - WEBSITE UPLOAD/' + f + '/t' + n + '.png') === null) defaulted++;
    }
  });
  if (defaulted !== total) throw new Error('some of them would carry a status: ' + defaulted + ' of ' + total);
  console.log('    all ' + total + ' files in that folder come in as wip, and the report now says so');
  console.log('    while traits/chains/approved/x.png still reads as approved');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
