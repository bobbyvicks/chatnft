/* "ACCEPTED" HAS TO MEAN THESE PIXELS, NOT A TICK IN A BOX.

   Four of the five modules read out of the ChatNFT project independently
   proposed the same idea, which is why this is the one built first: bind an
   acceptance to a fingerprint of the artwork, so it stops being true the
   moment the artwork changes.

   The hole it closes is specific and it is a launch hole. The pass accepts
   artwork and name separately and both are booleans that know nothing about
   the picture. Over 317 traits you will accept one, come back later, nudge two
   pixels, and the tick stays green - so "284 finished" is a number that cannot
   be trusted at exactly the moment it is being used to decide the collection
   is done.

   WHERE IT IS CHECKED IS THE WHOLE DESIGN. Verifying 317 traits means decoding
   317 PNGs, about ten seconds, so it cannot happen on a render. It happens at
   the one moment a trait's pixels can change: saveTrait. One hash per save,
   and the count is right from then on without ever sweeping.

   AND THE FLAG IS NOT SILENTLY CLEARED. An acceptance that no longer matches
   reads "accepted, then edited" rather than reverting to unaccepted, because
   which traits drifted is the thing worth seeing - and an entry that quietly
   un-ticks itself looks like the tool lost your work.

   FNV-1a, NOT SHA-256. This is a change detector with no adversary. The site's
   sha256Of goes through crypto.subtle, which is async and returns null on an
   insecure origin - and a fingerprint that can be null is one that has to be
   treated as a match or a mismatch by a caller who cannot tell which. A sync
   hash can never do that. Two passes with different offset bases give 64 bits.
*/
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the fingerprint -------------------------------------------------- */
swap(block([
  'async function traitForEntry(e){',
]), block([
  '/* A fingerprint of what is actually on the canvas.',
  '',
  '   FNV-1a twice, with different offset bases, joined into sixteen hex',
  '   characters. Synchronous on purpose: sha256Of returns null when',
  '   crypto.subtle is missing, and a fingerprint that can be null has to be',
  '   read as a match or a mismatch by a caller with no way to tell which.',
  '',
  '   Over the RGBA, not the stored PNG bytes, so re-encoding the same picture',
  '   cannot read as an edit. Costs about 20ms on a 1280 trait, which is why',
  '   nothing calls it in a render. */',
  'function artFingerprint(data){',
  '  if(!data||!data.length) return null;',
  '  let a=0x811c9dc5, b=0x01000193;',
  '  for(let i=0;i<data.length;i++){',
  '    const v=data[i];',
  '    a=(Math.imul(a^v,0x01000193))>>>0;',
  '    b=(Math.imul(b^v,0x01000193))>>>0;',
  '  }',
  '  return (a>>>0).toString(16).padStart(8,"0")+(b>>>0).toString(16).padStart(8,"0");',
  '}',
  '/* The fingerprint of a stored trait, decoded the way the editor would. */',
  'async function traitFingerprint(t){',
  '  if(!t||!t.blob) return null;',
  '  try{',
  '    const bm=await createImageBitmap(t.blob);',
  '    const c=document.createElement("canvas"); c.width=t.w||bm.width; c.height=t.h||bm.height;',
  '    const g=c.getContext("2d",{willReadFrequently:true});',
  '    g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '    const d=g.getImageData(0,0,c.width,c.height);',
  '    return {hash:artFingerprint(d.data), w:c.width, h:c.height};',
  '  }catch(_){ return null; }',
  '}',
  '/* Accepted, and still true. An entry with no fingerprint behind its',
  '   acceptance is from before this existed and is taken at its word - the',
  '   alternative is invalidating work somebody really did. */',
  'function artworkStale(e){',
  '  return !!(e&&e.artworkAccepted&&e.artHash&&e.artHashNow&&e.artHash!==e.artHashNow);',
  '}',
  'async function traitForEntry(e){',
]));

/* ---- 2. finished means it still matches --------------------------------- */
swap(block([
  'const reviewDone=e=>!!(e&&e.artworkAccepted&&e.nameAccepted);',
]), block([
  '/* AND NOT EDITED SINCE. Without this clause the count says a trait is',
  '   finished on the strength of a tick that stopped being true. */',
  'const reviewDone=e=>!!(e&&e.artworkAccepted&&e.nameAccepted&&!artworkStale(e));',
]));

/* ---- 3. accepting records what was accepted ----------------------------- */
swap(block([
  "$('revart').onclick=async()=>{",
  '  if(!REVIEW) return;',
  '  const e=REVIEW.entries[reviewIndex()];',
  '  e.artworkAccepted=!e.artworkAccepted;',
  '  await saveReview(); await renderReview();',
  '};',
]), block([
  "$('revart').onclick=async()=>{",
  '  if(!REVIEW) return;',
  '  const e=REVIEW.entries[reviewIndex()];',
  '  e.artworkAccepted=!e.artworkAccepted;',
  '  /* WHAT WAS ACCEPTED, not just that something was. Taken here rather than',
  '     at save time because this is the moment somebody looked at it. */',
  '  if(e.artworkAccepted){',
  '    const t=await traitForEntry(e);',
  '    const fp=await traitFingerprint(t);',
  '    if(fp){ e.artHash=fp.hash; e.artHashNow=fp.hash; e.artAt=Date.now(); }',
  '  }else{ e.artHash=null; e.artHashNow=null; e.artAt=null; }',
  '  await saveReview(); await renderReview();',
  '};',
]));

/* ---- 4. the one moment the pixels can change ---------------------------- */
swap(block([
  '    await dbPut(rec);',
  '    /* Everything a move has to carry with it, in one place. */',
]), block([
  '    await dbPut(rec);',
  '    /* THE ONE MOMENT A TRAIT\'S PIXELS CHANGE, which is why the check lives',
  '       here and not in a render. Sweeping 317 traits means decoding 317 PNGs',
  '       and about ten seconds; one fingerprint per save costs 20ms and keeps',
  '       the count right without ever sweeping.',
  '',
  '       The acceptance is NOT cleared. "Accepted, then edited" is the thing',
  '       worth seeing, and a tick that un-ticks itself reads as lost work. */',
  '    try{',
  '      if(REVIEW&&rec.reviewId){',
  '        const e=REVIEW.entries.find(x=>x.id===rec.reviewId);',
  '        if(e&&e.artworkAccepted&&e.artHash){',
  '          const fp=await traitFingerprint(rec);',
  '          if(fp&&fp.hash){ e.artHashNow=fp.hash; await saveReview(); }',
  '        }',
  '      }',
  '    }catch(_){ }',
  '    /* Everything a move has to carry with it, in one place. */',
]));

/* ---- 5. and it is on the panel ------------------------------------------ */
swap(block([
  '  $("revwas").className="note"+(reviewDone(e)?" revdone":"");',
]), block([
  '  $("revwas").className="note"+(reviewDone(e)?" revdone":"")',
  '    +(artworkStale(e)?" revstale":"");',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function artFingerprint(data){', 'async function traitFingerprint(t){',
  'function artworkStale(e){', 'e.artHash=fp.hash; e.artHashNow=fp.hash;'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* SYNCHRONOUS, AND NEVER NULL FOR REAL DATA. The whole reason it is not
   sha256Of, whose crypto.subtle path returns null on an insecure origin. */
const fStart = code.indexOf('function artFingerprint(data){');
/* BOUNDED AT THE NEXT FUNCTION, not by a character count. A 600-character
   window ran straight into traitFingerprint, which is async by design, and the
   "did it become asynchronous" check fired on its neighbour's await. */
const fEnd = code.indexOf('async function traitFingerprint(t){', fStart);
if (fStart < 0 || fEnd < 0) throw new Error('could not bound artFingerprint');
const fp = code.slice(fStart, fEnd);
if (fp.indexOf('await ') >= 0) throw new Error('the fingerprint became asynchronous');
if (fp.indexOf('crypto') >= 0) throw new Error('the fingerprint went back through crypto.subtle');
if (fp.indexOf('Math.imul') < 0) throw new Error('the mixing step is gone');

/* FINISHED MEANS STILL TRUE. */
if (code.indexOf('const reviewDone=e=>!!(e&&e.artworkAccepted&&e.nameAccepted&&!artworkStale(e));') < 0)
  throw new Error('finished no longer checks that the acceptance still holds');

/* AN OLD ENTRY IS TAKEN AT ITS WORD rather than invalidated wholesale. */
const sStart = code.indexOf('function artworkStale(e){');
const stale = code.slice(sStart, sStart + 260);
if (stale.indexOf('e.artHash&&e.artHashNow') < 0)
  throw new Error('an acceptance with no fingerprint is now treated as stale');

/* THE CHECK IS AT THE SAVE, NOT IN A RENDER. A sweep on every paint is ten
   seconds of decoding per render. */
const rStart = code.indexOf('async function renderReview(){');
const render = code.slice(rStart, rStart + 3000);
if (render.indexOf('traitFingerprint(') >= 0)
  throw new Error('the fingerprint is computed during a render');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
