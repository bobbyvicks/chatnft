/* Work out where every trait belongs, from the record of where they went.

   Asked for: "we should make an auto sorter that will detect where or what the
   trait is by either the name, location of the trait or something else to make
   it more streamlined".

   IT TURNS OUT NOT TO NEED DETECTING. The collection carries its own answer:
   current-trait-inventory.json lists all 251 approved traits with the layer
   they belong on, the name they used to have, and a SHA-256 of the picture.
   So this is a LOOKUP that has to run, not a classifier that has to be clever
   - and a lookup can be wrong only by being out of date, which is a thing you
   can see, rather than by being confidently mistaken, which is not.

   MEASURED against the live server, on the 116 approved traits stranded on the
   "unsorted" layer:

     matched by name or previous name   111 of 116
     of those, ALSO needing a rename     71
     not in the inventory at all          5

   and the five it cannot place are exactly the five it should refuse: Ape
   Head, Boat Head, Flame Visor with Blonde Hair v4 and Moodeng Hat are all in
   trait-archive and absent from the live inventory, meaning they were
   deliberately removed, and XRP Chain-on-base-v1-trait is one of the 982
   -on-base- proof renders. A keyword guesser would have filed Ape Head under
   hats and put deleted artwork back into the drawing set.

   THE RENAME IS NOT OPTIONAL, and this is the part that is easy to miss. 212
   of 251 traits were renamed on 09-06. A rule names a trait as layer/name, so
   the stranded row "BTC Cap" and the rule "hats/Bitcoin Cap.png" do not meet
   just because the row moves to hats. 71 of the 111 have to be renamed in the
   same operation or their rules stay dead.

   IT PROPOSES AND NOTHING ELSE. Applying is a separate patch with a separate
   gesture, because 116 of somebody's real collection is at stake and a plan
   you can read is the only honest way to move it.

   WHAT IT WILL NOT DO. A trait the inventory does not mention is left exactly
   where it is, with the reason said. The app cannot tell "deliberately
   deleted" from "brand new" - both are simply absent - so it does not guess
   between them, it reports that nothing knows about the trait. That is what
   makes the four archived ones safe.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('planSort') >= 0) throw new Error('already patched');

{
  const at = kit.only(doc.lines,
    l => l === '/* A trait name as the rules file writes it, reduced to something that can be',
    'the comment above the name reducer');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* WHERE EVERY TRAIT BELONGS, from the collection\'s own record of it.',
    '',
    '   The inventory is a list of {layer, trait, previousName, sha256}. Both',
    '   names are indexed, because 212 of 251 traits were renamed and a project',
    '   that has not been re-imported since carries the old ones.',
    '',
    '   Returns a PLAN and changes nothing. Every entry says what it would do and',
    '   why, including the ones it refuses, because a trait nothing knows about',
    '   is the case where guessing does real harm - four of the five it cannot',
    '   place in this collection are traits that were deliberately deleted, and a',
    '   keyword guesser would put them back.',
    '',
    '   A NAME COLLISION IS REFUSED, NOT RESOLVED. If two inventory rows reduce',
    '   to one key on different layers there is no answer, and picking one would',
    '   be a coin toss dressed as a lookup. Measured on the real file: 462 keys,',
    '   zero collisions. */',
    'function planSort(traits, inventory){',
    '  const out={move:[], rename:[], both:[], unknown:[], settled:[], collisions:[], layers:[]};',
    '  if(!Array.isArray(inventory)) throw new Error("That file is not a trait inventory.");',
    '  const key=n=>ruleImportName(n);',
    '  const by=new Map(), clash=new Set();',
    '  for(const r of inventory){',
    '    if(!r||!r.layer||!r.trait) continue;',
    '    const want={layer:String(r.layer), name:String(r.trait).replace(/\\.[^.]+$/,"")};',
    '    for(const n of [r.trait, r.previousName]){',
    '      if(!n) continue;',
    '      const k=key(n);',
    '      const had=by.get(k);',
    '      if(had && (had.layer!==want.layer||had.name!==want.name)){ clash.add(k); continue; }',
    '      by.set(k,want);',
    '    }',
    '  }',
    '  for(const k of clash){ by.delete(k); out.collisions.push(k); }',
    '  const wanted=new Set();',
    '  for(const t of (traits||[])){',
    '    if(!t||t.kind!=="trait") continue;',
    '    const here={layer:t.layer||"unsorted", name:String(t.name||"")};',
    '    const want=by.get(key(here.name));',
    '    if(!want){ out.unknown.push({id:t.id, name:here.name, layer:here.layer}); continue; }',
    '    const movesLayer=want.layer!==here.layer;',
    '    const movesName=key(want.name)!==key(here.name);',
    '    const row={id:t.id, name:here.name, layer:here.layer,',
    '      toLayer:want.layer, toName:want.name, status:t.status||"wip"};',
    '    if(!movesLayer&&!movesName){ out.settled.push(row); continue; }',
    '    wanted.add(want.layer);',
    '    if(movesLayer&&movesName) out.both.push(row);',
    '    else if(movesLayer) out.move.push(row);',
    '    else out.rename.push(row);',
    '  }',
    '  /* THE DESTINATIONS THAT DO NOT EXIST YET. Moving a trait to a layer the',
    '     project has never had would create it wherever the app happens to put',
    '     it, and layer order is paint order - so the traits would stop being',
    '     painted on top of everything from unsorted and start being painted on',
    '     top of everything from somewhere else. Named, so they can be made',
    '     deliberately and put in the right place first. */',
    '  out.layers=[...wanted].filter(l=>LAYERS.indexOf(l)<0).sort();',
    '  return out;',
    '}',
    doc.lines[at],
  ]);
  console.log('ok  a plan that says what it would do, and what it will not touch');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ codeLines }) => {
  const ps = kit.inFunction(codeLines, 'function planSort(traits, inventory){');
  const p = codeLines.slice(ps.start, ps.end + 1).join('\n');
  /* It must write nothing at all. */
  for (const bad of ['dbPut', 'dbDel', 'RULES', 'LAYERS.push', 'renderShelf', 'saveLayers'])
    if (p.indexOf(bad) >= 0) throw new Error('planSort changes state: ' + bad);
  /* Both names indexed, or a project that predates the rename matches nothing. */
  if (p.indexOf('for(const n of [r.trait, r.previousName]){') < 0)
    throw new Error('the previous name is not indexed, so a renamed trait cannot be found');
  /* A trait nothing knows about is reported, never guessed at. */
  if (p.indexOf('if(!want){ out.unknown.push(') < 0)
    throw new Error('a trait absent from the inventory would be guessed at');
  /* A collision is refused rather than resolved. */
  if (p.indexOf('clash.add(k)') < 0 || p.indexOf('by.delete(k)') < 0)
    throw new Error('two rows reducing to one key would silently pick one');
  /* The rename is carried, or 71 of the moves leave their rules dead. */
  if (p.indexOf('out.both.push(row)') < 0)
    throw new Error('a trait needing both a move and a rename is not planned as one');
  /* Missing destination layers are named. */
  if (p.indexOf('out.layers=[...wanted].filter(l=>LAYERS.indexOf(l)<0)') < 0)
    throw new Error('it would move traits onto layers the project does not have');
  /* It uses the SAME name reduction as the rules import, or the two disagree
     about what "the same trait" is. */
  if (p.indexOf('ruleImportName(n)') < 0)
    throw new Error('the sorter and the rules import reduce names differently');
});

/* RUN it on the real inventory against the real stranded names. */
{
  const fs = require('fs');
  const INV = 'E:/X content/pixel art_/trait-records/trait-names-and-layer-order-20260906/current-trait-inventory.json';
  const NAMES = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/stranded.txt';
  if (!fs.existsSync(INV) || !fs.existsSync(NAMES)) {
    console.log('    (the real inventory is not on this machine - skipping the live check)');
  } else {
    const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
    const key = n => String(n).replace(/\.(png|jpe?g|webp|gif)$/i, '').trim().toLowerCase();
    const by = new Map(), clash = new Set();
    for (const r of inv) {
      const want = { layer: r.layer, name: String(r.trait).replace(/\.[^.]+$/, '') };
      for (const n of [r.trait, r.previousName]) {
        if (!n) continue;
        const k = key(n), had = by.get(k);
        if (had && (had.layer !== want.layer || had.name !== want.name)) { clash.add(k); continue; }
        by.set(k, want);
      }
    }
    for (const k of clash) by.delete(k);
    if (clash.size) throw new Error(clash.size + ' colliding keys in the real inventory');
    const names = fs.readFileSync(NAMES, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
    let both = 0, move = 0, unknown = 0;
    const dest = {};
    for (const n of names) {
      const want = by.get(key(n));
      if (!want) { unknown++; continue; }
      dest[want.layer] = (dest[want.layer] || 0) + 1;
      if (key(want.name) !== key(n)) both++; else move++;
    }
    if (names.length !== 116) throw new Error('expected 116 stranded names, got ' + names.length);
    if (unknown !== 5) throw new Error('expected 5 the inventory cannot place, got ' + unknown);
    if (both !== 71) throw new Error('expected 71 needing a rename too, got ' + both);
    if (both + move + unknown !== 116) throw new Error('the plan does not account for every trait');
    /* The four it refuses are traits that were deliberately deleted - the whole
       reason it refuses rather than guesses. */
    for (const gone of ['Ape Head', 'Boat Head', 'Moodeng Hat'])
      if (by.get(key(gone))) throw new Error(gone + ' is in the inventory, so this premise is wrong');
    console.log('    116 stranded: ' + (both + move) + ' placed, ' + unknown + ' left alone');
    console.log('    ' + both + ' of them need renaming as well, or their rules stay dead');
    console.log('    into ' + Object.entries(dest).sort((a, b) => b[1] - a[1])
      .map(e => e[0] + ' ' + e[1]).join(', '));
  }
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
