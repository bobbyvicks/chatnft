/* ON AN UNPLANNED SET, DRAGGING TOWARDS RARE MADE A TRAIT COMMONER.

   Found by driving the real thing rather than by reading it. Twenty-one eyes,
   none planned, so every sibling sits at weight 1 - the store's default and
   the value that means "nobody has chosen". The rarest a PLAN can ask for is
   RAR_MIN, which is 2. So from that state:

     even share, all at 1        4.8%
     drag hard to the rare end   9.1%   and the thumb snapped back LEFT of
                                        the even mark

   because 2 against twenty 1s is twice an even share. The slider ran backwards
   over the whole first use of the feature, which is every set in the project
   today.

   THE SET HAS TO BE PLANNED BEFORE A PLAN CAN BE EXPRESSED IN IT. Weight 1 is
   below the floor by design - it is the flag for unchosen, not a weight
   somebody picked - so a set full of them has no room underneath it.

   Touching any slider therefore plans the whole set at normal first. It is one
   gesture rather than a wall in front of the control the user asked for; the
   shares it shows while dragging are the shares that will exist when it is
   released; and the toast says what else it did, because a drag that writes
   twenty other records must not do so quietly. Seeding an all-unplanned set
   moves nothing on screen - equal weights are equal weights, whatever the
   number - so the common case is a drag that simply works. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- the live map gains a seed, and O is read from it -------------- */
swap(block([
  '  const live=new Map(g.rows.map(t=>[t.id,traitWeight(t)]));',
  '  const cells=new Map();',
]), block([
  '  const live=new Map(g.rows.map(t=>[t.id,traitWeight(t)]));',
  '  const cells=new Map();',
  '',
  '  /* The siblings\' total, read from the LIVE weights rather than captured at',
  '     render time: seeding below changes it, and a captured total would solve',
  '     the drag against a set that no longer exists. */',
  '  function othersOf(id){',
  '    let s=0; for(const [k,v] of live) if(k!==id) s+=v;',
  '    return s;',
  '  }',
  '  /* Plan every unplanned trait in this set at normal, in the live map only.',
  '',
  '     WITHOUT THIS THE SLIDER RUNS BACKWARDS. An unplanned sibling is at',
  '     weight 1, which is BELOW RAR_MIN because 1 means "nobody has chosen"',
  '     rather than "as rare as possible" - so in a set of twenty-one unplanned',
  '     traits the rarest a plan can ask for, 2, is twice an even share, and',
  '     dragging towards rare measured 4.8% going to 9.1%.',
  '',
  '     Returns how many it planned so the release can say so. On a set where',
  '     nothing was planned this changes no share at all: twenty-one equal',
  '     weights are equal whatever the number, so the thumbs do not move. */',
  '  let seedDone=false;',
  '  function seedLive(){',
  '    if(seedDone) return 0;',
  '    seedDone=true;',
  '    let did=0;',
  '    for(const r of g.rows) if(!rarityPlanned(r)){ live.set(r.id,RAR_NORMAL); did++; }',
  '    if(did){',
  '      for(const c of cells.values()) c.unset=false;',
  '      wrap.querySelectorAll(".prow.unset").forEach(el=>el.classList.remove("unset"));',
  '    }',
  '    return did;',
  '  }',
]));

/* ---- the handlers ------------------------------------------------- */
swap(block([
  '    if(n>1){',
  '      /* WHILE DRAGGING: nothing is written and nothing is re-rendered. A',
  '         dbPut and a renderShelf per tick would cost seconds a pixel. */',
  '      sl.oninput=()=>{',
  '        const nw=weightForShare(multOfPos(+sl.value,n)/n, O);',
  '        /* THE THUMB SNAPS TO THE WEIGHT THAT WILL ACTUALLY BE STORED. The',
  '           store holds 98 integers and the track has 20,000 positions, so',
  '           most positions round to a weight some neighbour also reaches -',
  '           without this the thumb rests somewhere the collection cannot be,',
  '           and lets go onto a different number than it showed. */',
  '        sl.value=String(posOfMult(n*(nw/(nw+O)),n));',
  '        live.set(t.id,nw);',
  '        /* The row stops being unset the moment it is dragged, so the words',
  '           beside it stop saying it needs one. */',
  '        const c=cells.get(t.id); if(c) c.unset=false;',
  '        row.classList.remove("unset");',
  '        repaint();',
  '      };',
  '      /* ON RELEASE: one record, one PATCH, then the panels that show this',
  '         number redraw so nothing on screen disagrees with the store. */',
  '      sl.onchange=async()=>{',
  '        const nw=weightForShare(multOfPos(+sl.value,n)/n, O);',
  '        if(await setRarity(t,nw)) await afterRarity();',
  '      };',
  '    }',
]), block([
  '    if(n>1){',
  '      /* WHILE DRAGGING: nothing is written and nothing is re-rendered. A',
  '         dbPut and a renderShelf per tick would cost seconds a pixel. */',
  '      sl.oninput=()=>{',
  '        /* First, so the set has room underneath this trait - see seedLive. */',
  '        seedLive();',
  '        const O=othersOf(t.id);',
  '        const nw=weightForShare(multOfPos(+sl.value,n)/n, O);',
  '        /* THE THUMB SNAPS TO THE WEIGHT THAT WILL ACTUALLY BE STORED. The',
  '           store holds 98 integers and the track has 20,000 positions, so',
  '           most positions round to a weight some neighbour also reaches -',
  '           without this the thumb rests somewhere the collection cannot be,',
  '           and lets go onto a different number than it showed. */',
  '        sl.value=String(posOfMult(n*(nw/(nw+O)),n));',
  '        live.set(t.id,nw);',
  '        repaint();',
  '      };',
  '      /* ON RELEASE: the seeded siblings and this trait, then the panels that',
  '         show this number redraw so nothing on screen disagrees with the',
  '         store. The siblings are written FIRST, so that if anything fails',
  '         half way the set is never left with this trait planned against',
  '         weights the plan does not consider valid. */',
  '      sl.onchange=async()=>{',
  '        const O=othersOf(t.id);',
  '        const nw=weightForShare(multOfPos(+sl.value,n)/n, O);',
  '        let also=0;',
  '        for(const r of g.rows)',
  '          if(r.id!==t.id && !rarityPlanned(r) && await setRarity(r,RAR_NORMAL)) also++;',
  '        await setRarity(t,nw);',
  '        await afterRarity();',
  '        if(also) toast("Planned the other "+also+" in "+g.layer+" at normal,"',
  '          +" so this set has room to make one rare. Nothing else changed.");',
  '      };',
  '    }',
]));

/* ---- and the group says so before it is touched -------------------- */
swap(block([
  '  const missing=g.rows.filter(t=>!rarityPlanned(t)).length;',
  '  if(missing && n>1){',
]), block([
  '  const missing=g.rows.filter(t=>!rarityPlanned(t)).length;',
  '  if(missing && n>1){',
  '    /* Said before it happens, not only in the toast afterwards. A drag that',
  '       writes twenty other records is worth knowing about in advance. */',
  '    const warn=document.createElement("p");',
  '    warn.className="plantot";',
  '    warn.textContent = missing===n',
  '      ? "Nothing here has a rarity yet, so they are all equally likely."',
  '        +" Moving any slider plans the whole set at normal first."',
  '      : missing+" here still "+(missing===1?"needs a rarity":"need a rarity")',
  '        +". Moving a slider plans "+(missing===1?"it":"them")+" at normal first.";',
  '    wrap.appendChild(warn);',
  '  }',
  '  if(missing && n>1){',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  function othersOf(id){', '  function seedLive(){',
  '        seedLive();', '        const O=othersOf(t.id);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The captured sibling total must be gone from the handlers: it is what made
   the drag solve against a set the seed had already changed. */
if (code.indexOf('const nw=weightForShare(multOfPos(+sl.value,n)/n, O);\r\n        /* THE THUMB') >= 0)
  throw new Error('a handler still uses the captured total');
const reads = code.split('othersOf(t.id)').length - 1;
if (reads !== 2) throw new Error('expected both handlers to read the live total, found ' + reads);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
