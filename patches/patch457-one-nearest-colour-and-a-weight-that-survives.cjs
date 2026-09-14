/* TWO ANSWERS TO "WHICH PALETTE COLOUR", AND A RARITY WEIGHT THAT DID NOT
   SURVIVE BEING APPROVED.

   Both found by a sweep over the file, and both verified by reading the code
   rather than by trusting the report.

   ONE: THE REPORT AND THE BUTTON NAMED DIFFERENT COLOURS, and that one is
   mine. patch450 moved "Change colours to palette" onto CIEDE2000 and left
   specCheck - which is what the agent panel and PB.spec print - on squared
   RGB. So the panel said "worst #002d1e -> #1c131d (distance 38)", a
   near-black, and the button beside it wrote #264943, a dark green. The
   repair named was not the repair performed.

   specCheck's comment recorded squared RGB as a decision, and it was one
   while both sides used it: "not perceptual and does not pretend to be - the
   distance is shown so an obviously wrong suggestion looks wrong". That
   reasoning is superseded rather than deleted, because what made it safe was
   the button agreeing with it.

   One function answers it now and both call it. The distance it reports is a
   dE, which is the scale the button's own message already uses.

   TWO: APPROVING A TRAIT ON DISK THREW AWAY ITS RARITY. A trait's id encodes
   its status, so moving Hoodie.png from clothing/wip into clothing/approved
   and re-importing writes a NEW record - and the import then deletes the old
   one as a file that moved. That delete is correct and is commented as such.
   What was missing is that the new record inherits nothing: the same-id
   replacement path four hundred lines above carefully carries shelfOrder,
   rarity and rowId across, and these two delete paths carried none of it.

   So: approve forty traits by moving folders, and forty rarity weights go to
   the default. The same hole is in the merge that follows it - rename
   cap.png to cap v2.png and the weight goes with the old name.

   NOT rowId, WHICH IS THE ONE THE REPLACEMENT PATH CARRIES AND THESE MUST
   NOT. A same-id replacement leaves the server row alone, so its id stays
   good. Both of these DELETE the server row on the line after - a carried
   rowId would point at a row that is being dropped, and the next push would
   write to nothing. rarity and shelfOrder are decisions made here, in this
   browser, about a trait; the row id is a fact about a row that is going. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. one nearest colour ------------------------------------------ */
{
  const at = kit.only(L, l => l === 'function snapToPalette(d,n){', 'the palette snap');
  kit.replace(L, { start: at, end: at }, [
    '/* THE NEAREST PALETTE COLOUR, in one place.',
    '',
    '   There were two. This one - CIEDE2000 over the whole palette - is what',
    '   "Change colours to palette" applies, and specCheck had its own squared',
    '   RGB loop for the colour it NAMES in the agent panel. Two rules for one',
    '   question, so the panel could say a trait should become #1c131d while',
    '   the button beside it wrote #264943.',
    '',
    '   Returns the distance as a dE, which is the scale the button already',
    '   reports: about 1 is the smallest difference anybody can see, 10 is',
    '   plainly another colour.',
    '',
    '   palLab is optional and is how snapToPalette avoids rebuilding 256 Lab',
    '   triples for every distinct colour in a trait; a caller with one colour',
    '   to look up does not need it. */',
    'function nearestPaletteColour(r,g,b,pal,palLab){',
    '  pal=pal||paletteRGB();',
    '  palLab=palLab||pal.map(p=>labOf(p.r,p.g,p.b));',
    '  const c=labOf(r,g,b);',
    '  let best=pal[0], bd=Infinity;',
    '  for(let k=0;k<pal.length;k++){',
    '    const q=palLab[k];',
    '    const dist=deltaE2000(c[0],c[1],c[2],q[0],q[1],q[2]);',
    '    if(dist<bd){ bd=dist; best=pal[k]; }',
    '  }',
    '  return {hex:best.h, r:best.r, g:best.g, b:best.b, dE:bd};',
    '}',
    'function snapToPalette(d,n){',
  ]);
}
{
  const fn = kit.inFunction(L, 'function snapToPalette(d,n){');
  const at = kit.only(L, l => l === '        const c=labOf(r,g,b);', 'the snap lookup', fn);
  if (L[at + 6] !== '        }')
    throw new Error('the snap lookup is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 6 }, [
    '        const near=nearestPaletteColour(r,g,b,pal,palLab);',
    '        const best=near, bd=near.dE;',
  ]);
}

/* ---- 2. and the report asks the same question ----------------------- */
{
  const at = kit.only(L, l => l === '    /* NAMED WITH A WAY OUT. A count sends somebody hunting; a nearest',
    'the spec nearest comment');
  if (L[at + 3] !== '       so an obviously wrong suggestion looks wrong. */')
    throw new Error('the spec comment is not shaped the way this expects');
  const lo = at + 4;
  if (L[lo] !== '    const r=(k>>16)&255, g=(k>>8)&255, b=k&255;')
    throw new Error('the spec lookup does not start where this expects');
  const end = kit.only(L, l => l === '    off.push({hex:h, pixels:n, nearest:best, distance:Math.round(Math.sqrt(bestD))});',
    'what the report names');
  kit.replace(L, { start: at, end: end }, [
    '    /* NAMED WITH A WAY OUT. A count sends somebody hunting; a nearest',
    '       colour and its distance is the start of a repair.',
    '',
    '       SUPERSEDES "Squared RGB, which is not perceptual and does not',
    '       pretend to be - the distance is shown so an obviously wrong',
    '       suggestion looks wrong." That was true while the BUTTON used',
    '       squared RGB too: the report and the repair agreed, and the distance',
    '       let you see when the pair was silly. Once Change colours to palette',
    '       moved to CIEDE2000 the two stopped agreeing, and a report that',
    '       names a colour the button will not write is worse than no report -',
    '       measured on #002d1e, this said #1c131d and the button wrote',
    '       #264943.',
    '',
    '       The distance is a dE now, on the same scale the button reports. */',
    '    const r=(k>>16)&255, g=(k>>8)&255, b=k&255;',
    '    const near=nearestPaletteColour(r,g,b);',
    '    off.push({hex:h, pixels:n, nearest:near.hex, distance:Math.round(near.dE)});',
  ]);
}

/* ---- 3. what a trait keeps when its file moves ---------------------- */
{
  const at = kit.near(L, '      try{ await dbDel(rec.id); }catch(_){ continue; }', -1,
    'if(!moves) continue;', 'the moved-file delete');
  if (L[at + 1] !== '      /* The server copy too, or the next pull brings it back. */')
    throw new Error('the moved-file delete is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '      /* WHAT THE TRAIT KEEPS. The id carries the status, so a file moved',
    '         from wip into approved writes a NEW record and this deletes the',
    '         old one - correctly, it is gone from the disk. But the new record',
    '         inherited nothing, so approving forty traits by moving folders',
    '         sent forty rarity weights back to the default.',
    '',
    '         The same-id replacement above carries exactly these across, and',
    '         this is the same trait by a different route.',
    '',
    '         NOT rowId, WHICH THAT PATH DOES CARRY. A replacement leaves the',
    '         server row alone so its id stays good; this drops the row on the',
    '         line below, and a carried id would point at nothing. */',
    '      const to=supplied.find(s=>s.name===rec.name&&s.layer===rec.layer',
    '        &&s.status!==(rec.status||"wip"));',
    '      if(to) await carryDecided(rec,to.id);',
    '      try{ await dbDel(rec.id); }catch(_){ continue; }',
  ]);
}
{
  const at = kit.only(L, l => l === '      if(!onto) continue;', 'the merge target');
  if (L[at + 1] !== '      try{ await dbDel(rec.id); }catch(_){ continue; }')
    throw new Error('the merge delete is not shaped the way this expects');
  kit.replace(L, { start: at, end: at }, [
    '      if(!onto) continue;',
    '      /* AND THE SAME WHERE A RENAME IS MERGED. cap.png renamed to',
    '         cap v2.png is one trait under a new name, and the weight somebody',
    '         set belongs to the trait rather than to the filename. */',
    '      await carryDecided(rec,onto.id);',
  ]);
}

/* ---- 4. the one helper both of them use ----------------------------- */
{
  const at = kit.only(L, l => l === 'async function bulkImport(files){', 'the folder import');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT A TRAIT KEEPS WHEN ITS RECORD IS REPLACED BY ANOTHER ID.',
    '',
    '   A trait id encodes name, layer and status, so moving a file between',
    '   status folders - or renaming it - writes a new record and deletes the',
    '   old one. The picture changed hands; the DECISIONS did not. Rarity is a',
    '   number somebody chose in the rarity plan and shelfOrder is a place',
    '   somebody dragged a tile to, and neither can be worked out again from',
    '   the file.',
    '',
    '   Only when the new record does not already have one: the import may have',
    '   just written a deliberate value, and this must not overwrite it with an',
    '   older one.',
    '',
    '   rowId is deliberately not here - see the callers. */',
    'async function carryDecided(from,toId){',
    '  if(!from||!toId) return false;',
    '  let rec=null;',
    '  try{ rec=(await dbAll()).find(i=>i.id===toId); }catch(_){ return false; }',
    '  if(!rec||rec.kind!=="trait") return false;',
    '  let changed=false;',
    '  if(typeof from.rarity==="number"&&typeof rec.rarity!=="number"){',
    '    rec.rarity=from.rarity; changed=true;',
    '  }',
    '  /* shelfOrder WITHOUT that guard, because a new record always has one',
    '     and it is never a decision: the import fills it with nextShelfOrder,',
    '     which means "the end of the layer". The old value is where somebody',
    '     dragged the tile to. The same-id replacement path prefers the old one',
    '     over a fresh default for exactly this reason. */',
    '  if(typeof from.shelfOrder==="number"&&from.shelfOrder!==rec.shelfOrder){',
    '    rec.shelfOrder=from.shelfOrder; changed=true;',
    '  }',
    '  if(!changed) return false;',
    '  try{ await dbPut(rec); }catch(_){ return false; }',
    '  return true;',
    '}',
    'async function bulkImport(files){',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  for (const nm of ['nearestPaletteColour', 'carryDecided', 'snapToPalette',
    'specCheck', 'labOf', 'deltaE2000', 'paletteRGB', 'dbAll', 'dbPut'])
    if (code.indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);

  /* ONE ANSWER TO THE NEAREST COLOUR, and both askers use it. */
  if ((code.match(/nearestPaletteColour\(/g) || []).length < 3)
    throw new Error('something is still working out its own nearest colour');
  const sc = kit.inFunction(codeLines, 'function specCheck(data,W,H,layer){');
  const scb = codeLines.slice(sc.start, sc.end + 1).join('\n');
  if (/\(r-pr\)\*\(r-pr\)/.test(scb))
    throw new Error('the report still picks by squared RGB');
  if (!/const near=nearestPaletteColour\(r,g,b\);/.test(scb))
    throw new Error('the report does not ask the one question');
  const sp = kit.inFunction(codeLines, 'function snapToPalette(d,n){');
  const spb = codeLines.slice(sp.start, sp.end + 1).join('\n');
  if (!/const near=nearestPaletteColour\(r,g,b,pal,palLab\);/.test(spb))
    throw new Error('the button does not ask the one question');
  /* AND THE BUTTON STILL PASSES ITS CACHE, or every distinct colour in a
     trait rebuilds 256 Lab triples. */
  if (!/const palLab=pal\.map\(p=>labOf\(p\.r,p\.g,p\.b\)\);/.test(spb))
    throw new Error('the per-call palette cache is gone');

  /* THE WEIGHT SURVIVES BOTH DELETES. */
  const bi = kit.inFunction(codeLines, 'async function bulkImport(files){');
  const bib = codeLines.slice(bi.start, bi.end + 1).join('\n');
  if ((bib.match(/await carryDecided\(/g) || []).length !== 2)
    throw new Error('one of the two delete paths still drops the weight');
  /* BEFORE the delete, not after - the record it reads from is the one being
     removed. */
  if (bib.indexOf('if(to) await carryDecided(rec,to.id);')
    > bib.indexOf('try{ await dbDel(rec.id); }catch(_){ continue; }'))
    throw new Error('the weight is read after the record holding it is deleted');

  /* AND NOT THE SERVER ROW ID, which both of these drop on the next line. */
  const cd = kit.inFunction(codeLines, 'async function carryDecided(from,toId){');
  const cdb = codeLines.slice(cd.start, cd.end + 1).join('\n');
  if (/rowId/.test(cdb))
    throw new Error('a dropped server row id is being carried onto a live record');
  /* RARITY only into an empty field: the import may have just written a
     deliberate value, and this must not walk back over it. */
  if (!/typeof rec\.rarity!=="number"/.test(cdb))
    throw new Error('this would overwrite a rarity the import just decided');
  /* SHELF ORDER is the opposite case, and guarding it the same way was the
     first version of this: a fresh record ALWAYS has a shelfOrder, so an
     absence guard never fires and the old place was never carried. Measured -
     a tile dragged to 300 came back at -724, which is nextShelfOrder. */
  if (/typeof rec\.shelfOrder!=="number"/.test(cdb))
    throw new Error('the shelf position would never be carried');
  if (!/from\.shelfOrder!==rec\.shelfOrder/.test(cdb))
    throw new Error('the shelf position is not carried at all');
  /* And it writes nothing when there is nothing to carry. */
  if (!/if\(!changed\) return false;/.test(cdb))
    throw new Error('it rewrites records it has no reason to touch');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
