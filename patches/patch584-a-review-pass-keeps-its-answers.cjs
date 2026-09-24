/* A REVIEW PASS KEEPS ITS ANSWERS, AND A STEP READS ONE TRAIT.

   Load a review queue replaced the pass wholesale from the file. Answers
   given here - artwork right, name right, skipped - are never written into
   the file, so loading it again threw them all away with nothing said:
   re-pick the same queue after adding a folder, and the pass was back at
   the start. A queue for the SAME collection revision now carries the
   answers already given for its entries, and where the pass was. One for
   a DIFFERENT revision still starts a new pass - that is what the handoff
   asked for, and the entries carry over only from the file's own receipts
   - but when the pass it replaces holds answers, it asks first and says
   how many, as Clear rules does.

   And a step through the queue read the whole project - every picture -
   to find the one trait an entry names: traitForEntry ran on every Next,
   Previous, Skip and accept. The import stamps each trait it finds with
   the entry's id, and a trait's id is t_<name>_<layer>_<status>, so the
   trait is asked for by id: the one this entry found last time, then the
   four statuses its name and layer can have. The whole read is kept as
   the fall-back, with the same rule, for a trait renamed since. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const inImport = (line, label) => kit.only(L, l => l === line, label, kit.inFunction(L, 'async function importReviewQueue(f){'));
const swapIn = (line, to, label) => { const i = inImport(line, label); kit.replace(L, { start: i, end: i }, to); };

swapIn('  let items=[]; try{ items=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){}', [
  '  /* THE PASS BEING REPLACED. Its answers live only here, never in the file,',
  '     so the same revision carries them and another asks before it drops',
  '     them. */',
  '  const was=REVIEW;',
  '  const rev=(doc&&doc.collectionRevision)||null;',
  '  const sameRev=!!(was&&was.revision&&rev&&was.revision===rev);',
  '  const keep=sameRev ? new Map(was.entries.map(x=>[x.id,x])) : null;',
  '  if(was&&!sameRev){',
  '    const answered=was.entries.filter(x=>x.artworkAccepted||x.nameAccepted||x.skipped).length;',
  '    if(answered && !confirm("Load this queue? The review pass open now has "+answered+" answer"',
  '        +(answered===1?"":"s")+", and a queue for another revision starts a new pass without them.")){',
  '      say("Not loaded - the pass open now is kept.");',
  '      return false;',
  '    }',
  '  }',
  '  let items=[]; try{ items=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){}',
], 'the read');
swapIn('    const decided=reviewDecided(e);', [
  '    const decided=reviewDecided(e);',
  '    const old=keep?keep.get(e.id):null;',
], 'the receipt');
swapIn('      artworkAccepted:!!(decided&&decided.artwork),', [
  '      artworkAccepted:!!(decided&&decided.artwork)||!!(old&&old.artworkAccepted),',
], 'artwork');
swapIn('      nameAccepted:!!(decided&&decided.name),', [
  '      nameAccepted:!!(decided&&decided.name)||!!(old&&old.nameAccepted),',
], 'name');
swapIn('      approvedRevision:decided?e.approvedRevision:null,', [
  '      approvedRevision:decided?e.approvedRevision:((old&&old.approvedRevision)||null),',
], 'revision');
swapIn('      skipped:false});', ['      skipped:!!(old&&old.skipped)});'], 'skipped');
swapIn('  if(!REVIEW.entries.some(e=>e.id===REVIEW.activeId)) REVIEW.activeId=entries[0].id;', [
  '  /* Where the pass was, when it is the same pass. */',
  '  if(keep&&was.activeId&&entries.some(x=>x.id===was.activeId)) REVIEW.activeId=was.activeId;',
  '  if(!REVIEW.entries.some(e=>e.id===REVIEW.activeId)) REVIEW.activeId=entries[0].id;',
], 'the active entry');

{
  const i = kit.only(L, l => l === 'async function traitForEntry(e){', 'traitForEntry');
  if (L[i + 1] !== '  if(!e) return null;') throw new Error('traitForEntry moved');
  if (L[i + 2] !== '  let items=[]; try{ items=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){ return null; }') throw new Error('its read moved');
  kit.replace(L, { start: i, end: i + 2 }, [
    '/* The trait each entry found last, by id. */',
    'const reviewTraitIdOf=new Map();',
    'async function traitForEntry(e){',
    '  if(!e) return null;',
    '  /* BY ID FIRST. Every Next, Previous, Skip and accept came through here',
    '     and read the whole project to find one trait. The import stamps the',
    '     entry\'s id on the trait, so a stamped one is found by its own id:',
    '     the one found last, or one of the four its name and layer allow. */',
    '  const nm=reviewBase(e.currentName), ly=e.layer||"";',
    '  const tries=[reviewTraitIdOf.get(e.id)].concat(STATUSES.map(s=>"t_"+nm+"_"+ly+"_"+s));',
    '  for(const id of tries){',
    '    if(!id) continue;',
    '    let t=null; try{ t=await dbGet(id); }catch(_){ t=null; }',
    '    if(t&&t.kind==="trait"&&t.reviewId===e.id){ reviewTraitIdOf.set(e.id,t.id); return t; }',
    '  }',
    '  /* Not stamped, or renamed since: the whole read, by the rule it had. */',
    '  let items=[]; try{ items=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){ return null; }',
  ]);
}

kit.save(doc, () => {});
fs.renameSync(TMP, FILE);
console.log('patch584 written');
