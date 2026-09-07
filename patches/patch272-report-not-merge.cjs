/* REPORT THE DUPLICATE, DO NOT DELETE IT.

   patch271 treated a byte match in the same layer as a rename and removed the
   old record. The first test of it destroyed a trait: re-importing an
   UNCHANGED folder went from two traits to one, because the fixture held two
   files with identical bytes and the first deleted the second before the loop
   reached it.

   The fixture was artificial. The mechanism is not. Within a single batch one
   file can delete a record that a later file is about to supply, and
   beforeTraits is a snapshot taken before any of them ran. That is guardable -
   collect the ids the batch will produce first - but being wrong about it
   deletes artwork, and the case does not need deleting to be solved.

   MEASURED: the real collection has 272 approved files and 419 in the working
   folder, and ZERO byte-identical pairs among either. There is nothing to
   merge today. The worry is about what a future import might stack up, and
   being told "cap v2 is the same picture as cap" answers that completely,
   costs nothing when it is wrong, and leaves the decision with the person who
   knows which of the two they meant to keep.

   This is the rule the absent-check twenty lines further down already keeps,
   in its own words: guessing throws away work, being told costs nothing. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function bulkImport(files){');
const at = kit.only(L, l => l === '        const sig=await fileSig(f);', 'the match block', fn);
const want = [
  '        const sig=await fileSig(f);',
  '        if(sig){',
  '          for(const old of beforeTraits){',
  '            if(old.id===trec.id) continue;',
  '            if((old.layer||"unsorted")!==layer) continue;',
  '            if(movedIds.has(old.id)) continue;',
  '            if(await recSig(old)!==sig) continue;',
  '            try{ await dbDel(old.id); }catch(_){}',
  '            movedIds.add(old.id);',
  /* The file holds the literal six characters \u2192, not the arrow. Writing
     the escape here gets read by JS when THIS script is parsed, so it has to
     be escaped again - which is what the mismatch message showed. */
  '            renames.push(old.name+" \\u2192 "+info.name);',
  '            break;',
  '          }',
  '        }',
];
for (let i = 0; i < want.length; i++)
  if (L[at + i] !== want[i])
    throw new Error('line ' + (i + 1) + ' is not what patch271 wrote:\n  want ' + want[i] + '\n  got  ' + L[at + i]);
if (L[at + want.length] !== '        await dbPut(trec);')
  throw new Error('the write does not follow the block');

kit.replace(L, { start: at, end: at + want.length - 1 }, [
  '        /* SAID, NOT DONE. This deleted the old record on a byte match, and',
  '           the first test of it destroyed a trait: re-importing an unchanged',
  '           folder went from two traits to one, because two files in it had',
  '           identical bytes and the first deleted the second before the loop',
  '           reached it.',
  '',
  '           Within one batch a file can delete a record a later file is about',
  '           to supply, and beforeTraits is a snapshot from before any of them',
  '           ran. Guardable - but being wrong deletes artwork, and there is',
  '           nothing here to merge: measured over the real collection, 272',
  '           approved files and 419 in the working folder, zero byte-identical',
  '           pairs among either.',
  '',
  '           So it says so. The person importing knows which of the two they',
  '           meant to keep, and the absent-check below already settles this the',
  '           same way: guessing throws away work, being told costs nothing. */',
  '        const sig=await fileSig(f);',
  '        if(sig){',
  '          for(const old of beforeTraits){',
  '            if(old.id===trec.id) continue;',
  '            if((old.layer||"unsorted")!==layer) continue;',
  '            if(await recSig(old)!==sig) continue;',
  '            sameArt.push(old.name+" and "+info.name);',
  '            break;',
  '          }',
  '        }',
]);

/* The list is named for what it holds now. */
const decl = kit.only(L, l => l === '  const renames=[];', 'the list', fn);
kit.replace(L, { start: decl, end: decl }, [
  '  /* Named rather than counted: "3 duplicates" is a number to worry about,',
  '     and "Retro Jazz Cup Skin and Retro Jazz Cup Skin v2" is a pair somebody',
  '     can recognise as right or wrong at a glance. */',
  '  const sameArt=[];',
]);

const rep = kit.only(L, l => l.indexOf('  if(renames.length) bits.push(') === 0, 'the report line', fn);
kit.replace(L, { start: rep, end: rep }, [
  '  if(sameArt.length) bits.push(sameArt.length+" the same picture twice ("',
  '    +sameArt.slice(0,3).join("; ")+(sameArt.length>3?" and "+(sameArt.length-3)+" more":"")+")");',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  /* Nothing in bulkImport deletes on a byte match any more. dbDel is still
     used by the move-detection below, which is a different rule and stays. */
  if (code.indexOf('if(await recSig(old)!==sig) continue;\n            try{ await dbDel') >= 0)
    throw new Error('the deletion is still there');
  if (has('            try{ await dbDel(old.id); }catch(_){}') !== 0)
    throw new Error('a byte-match delete survived');
  if (code.indexOf('sameArt.push(old.name+" and "+info.name);') < 0)
    throw new Error('the report did not land');
  if (has('  const renames=[];') !== 0) throw new Error('the old list name survived');
  if (code.indexOf('sameArt.length+" the same picture twice ("') < 0)
    throw new Error('the message did not land');
  /* And the match is still made - a feature that reports nothing is not a
     retreat from deleting, it is a deletion of the feature. */
  if (code.indexOf('const sig=await fileSig(f);') < 0) throw new Error('nothing hashes the file');
});

console.log('index.html grew by ' + grew + ' bytes');
