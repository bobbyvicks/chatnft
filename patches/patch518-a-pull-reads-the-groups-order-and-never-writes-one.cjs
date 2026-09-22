/* A PULL READS THE GROUP'S ORDER AND NEVER WRITES ONE.

   saveLayers declares this browser's layer list to the group whenever it
   differs from the last list it sent - that is what the declaration is for,
   and its own comment says the order is what a new member is meant to
   INHERIT. cloudPull ended in saveLayers. So a browser that had just merged
   the group's layer NAMES into its own default ORDER wrote the merged list
   back to the server as the group's order, in this browser's sequence, and
   nothing said so.

   INVISIBLE UNTIL NOW, because every old team's declared list is the old
   default list and the merge found nothing to add, so saveLayers was never
   reached. patch516 changes the default list, and the refuter that ran that
   change measured what follows: a fresh browser joining a team whose
   collection declared the old thirteen sent one PATCH carrying sixteen names
   in the browser's order, and after one pull each two members of one team
   painted 40 of 120 layer pairs the opposite way round. The rewrite would run
   from groupCatchUp on every page load. patch516 does not ship without this.

   THE RULE. A browser with no order of its own for this project takes the
   group's declaration as it stands. One that has an order keeps it and adopts
   the names it lacks, before the catch-all (patch517). Either way the list is
   recorded locally and the server is not written from a pull: the two things
   that declare an order are the Layers panel and Save to cloud, both of
   which a person pressed. sharedLayerSig is set to what the server is known
   to hold, so an unchanged list is not sent back by the next saveLayers and
   a changed one still is.

   NOT CHANGED, and said so it is not read as overlooked: a personal project
   with no stored layer record whose traits sit on the two retired names has
   them adopted before the catch-all by applyLayers on its next render, where
   the old default list had them in the middle. That is the retired names
   becoming unrecognised, which they are; the remedy is Sort by inventory or
   a drag in Layers, either of which records the list. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function cloudPull(opts){');
const block = kit.run(L,
  l => l === '  let newLayers=0;',
  l => l === '    if(newLayers) await saveLayers();',
  'the pull\'s layer merge', fn);
if (L[block.end + 1] !== '  }') throw new Error('the merge block does not close where expected');
if (L[block.start + 1] !== '  if(Array.isArray(c.layers)){') throw new Error('the merge block does not open as expected');
kit.replace(L, { start: block.start, end: block.end + 1 }, [
  '  /* THE GROUP\'S ORDER IS READ HERE AND NEVER WRITTEN FROM HERE.',
  '',
  '     saveLayers declares this browser\'s list to the group when it differs',
  '     from the last one it sent, and this used to end in saveLayers - so a',
  '     browser that had just merged the group\'s NAMES into its own default',
  '     ORDER wrote that merged list back as the group\'s order. The',
  '     declaration\'s own comment says the order is what a new member is meant',
  '     to inherit. Measured 2026-09-21 with the collection\'s thirteen as the',
  '     default list: a fresh browser joining a team declared on the old',
  '     vocabulary sent one PATCH of sixteen names in its own sequence, and two',
  '     members of one team then painted 40 of 120 layer pairs the opposite',
  '     way round. It would have run from groupCatchUp on every page load.',
  '',
  '     A browser with no order of its own for this project takes the',
  '     declaration as it stands. One that has an order keeps it and adopts',
  '     the names it lacks, before the catch-all. Either way the list is',
  '     recorded locally and the server is not written from here: the Layers',
  '     panel and Save to cloud declare, because a person pressed them. */',
  '  let newLayers=0, tookOrder=0;',
  '  if(Array.isArray(c.layers)&&c.layers.length){',
  '    const declared=[...new Set(c.layers.map(String))].filter(Boolean);',
  '    let mine=null; try{ mine=await dbGet(LAYERS_ID); }catch(_){ mine=null; }',
  '    const own=!!(mine&&Array.isArray(mine.layers)&&mine.layers.length);',
  '    if(!own){',
  '      LAYERS=declared.slice();',
  '      if(LAYERS.indexOf("unsorted")<0) LAYERS.push("unsorted");',
  '      tookOrder=LAYERS.filter(l=>l!=="unsorted").length;',
  '    } else {',
  '      for(const l of declared) if(LAYERS.indexOf(l)<0){',
  '        const u=LAYERS.indexOf("unsorted");',
  '        if(u>=0) LAYERS.splice(u,0,l); else LAYERS.push(l);',
  '        newLayers++;',
  '      }',
  '    }',
  '    /* Recorded, not declared. sharedLayerSig is what the server is known to',
  '       hold, which after a pull is the declared list - so the next saveLayers',
  '       sends nothing for an unchanged list and still sends a changed one. */',
  '    try{ await dbPut({id:LAYERS_ID, kind:"settings", layers:LAYERS.slice(),',
  '      hidden:[...HIDDEN_LAYERS].sort(), at:Date.now()}); }catch(_){}',
  '    sharedLayerSig=declared.join("\\u0000");',
  '  }',
]);

/* the note says which of the two happened */
{
  const fn2 = kit.inFunction(L, 'async function cloudPull(opts){');
  const i = kit.only(L, l => l === '  if(newLayers) bits.push(newLayers+" new layer"+(newLayers===1?"":"s"));', 'the new-layers note', fn2);
  kit.replace(L, { start: i, end: i }, [
    '  if(tookOrder) bits.push("the group\'s paint order ("+tookOrder+" layer"+(tookOrder===1?"":"s")+")");',
    '  else if(newLayers) bits.push(newLayers+" new layer"+(newLayers===1?"":"s"));',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const need = (s) => { if (code.indexOf(s) < 0) throw new Error('missing: ' + s); };
  const never = (s) => { if (code.indexOf(s) >= 0) throw new Error('still present: ' + s); };
  never('if(newLayers) await saveLayers();');
  /* THE PULL NEVER REACHES saveLayers OR A PATCH. Bounded to cloudPull's own
     text, comments stripped. */
  const a = code.indexOf('async function cloudPull(opts){');
  const b = code.indexOf('\nasync function ', a + 10);
  const body = code.slice(a, b);
  if (/saveLayers\(/.test(body)) throw new Error('cloudPull still calls saveLayers');
  if (/method:"PATCH"/.test(body)) throw new Error('cloudPull PATCHes something');
  for (const s of ['let mine=null; try{ mine=await dbGet(LAYERS_ID); }catch(_){ mine=null; }',
    'LAYERS=declared.slice();', 'sharedLayerSig=declared.join("\\u0000");',
    'tookOrder=LAYERS.filter(l=>l!=="unsorted").length;',
    'if(tookOrder) bits.push("the group\'s paint order ("']) need(s);
  /* saveLayers ITSELF STILL DECLARES - the Layers panel and Save to cloud
     are untouched. */
  need('  if(sig===sharedLayerSig) return true;');
  need('        headers:h, body:JSON.stringify({layers:LAYERS})});');
  need('      body:JSON.stringify({layers:LAYERS})});');
});

fs.renameSync(TMP, FILE);
console.log('patch518 written, ' + grew + ' bytes');
