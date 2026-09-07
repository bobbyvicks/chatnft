/* THE TOLERANCE IS GROWN FROM THE PICTURE, NOT INFERRED FROM ITS NEIGHBOURS.

   Two runs, two different wrong answers, same cause. The tolerance was being
   set to a fraction of the distance to the nearest OTHER colour, which is a
   statement about the rest of the picture rather than about the base. On a
   whole render that distance is 209-261 and the answer came out at the cap,
   60, and worked. On a crop the base's own outer shades are the nearest other
   colour - 12 to 24 away - so the answer came out at 12, and between 33% and
   99.4% of the base survived while the code reported success.

   Re-centring (patch256) fixed which colour was being measured and could not
   fix this, because the flaw is in what is being measured AT ALL.

   THE CLOUD'S WIDTH IS A PROPERTY OF THE CLOUD, and it was measured directly
   at the start of this work. Growing the radius around a base seed on a real
   render gives:

        r2 43.0%   r4 61.2%   r6 62.9%   r8 63.3%   r12 63.5%   r24 63.9%

   It climbs steeply, then stops. That plateau is the edge of the base, it is
   visible without knowing anything about the rest of the picture, and it is
   the same shape whether the picture is a whole render or a corner of one.

   So the radius now grows while each step still gathers a real share of the
   picture and stops when it does not. The distance to the nearest genuinely
   different colour is kept, but demoted to what it should always have been: a
   safety cap, so the ball can never swallow a colour that is actually
   something else, rather than the thing that sets the size. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

const planAt = kit.inFunction(L, 'function basePlan(){');
const gapStart = kit.only(L, l => l === '  let gap=Infinity;', 'the gap block', planAt);
const tolAt = kit.only(L,
  l => l === '  const tol=Math.min(BASE_REACH, Math.max(BASE_BALL, (gap===Infinity?BASE_REACH*2.5:gap)*0.4));',
  'the tolerance line', planAt);
if (tolAt <= gapStart) throw new Error('the tolerance does not follow the gap block');

/* The constants it will read. */
kit.only(L, l => l === 'const BASE_BALL=12;    /* the cloud around one base colour, measured */', 'BASE_BALL');
kit.only(L, l => l === 'const BASE_REACH=60;   /* the widest a derived tolerance may open */', 'BASE_REACH');
if (L.some(l => l.indexOf('BASE_STEP') >= 0)) throw new Error('BASE_STEP already exists');

kit.replace(L, { start: gapStart, end: tolAt }, [
  '  /* HOW WIDE THE CLOUD IS, grown from the seed rather than inferred from',
  '     what else is in the picture. Measured on a real render, the share',
  '     gathered as the radius opens runs',
  '',
  '       r2 43.0%   r4 61.2%   r6 62.9%   r8 63.3%   r12 63.5%   r24 63.9%',
  '',
  '     - steep, then flat. The flat part is the edge of the base and it is',
  '     there whether the picture is a whole render or a crop out of one, which',
  '     is exactly what the previous two attempts were not: both set the',
  '     tolerance from the distance to the nearest other colour, and on a crop',
  '     the nearest other colour IS the base\'s own outer shades, so the',
  '     tolerance collapsed to 12 and most of the base survived. */',
  '  let tol=BASE_BALL, held=0;',
  '  for(const q of list){',
  '    let r=2, was=0;',
  '    while(r<BASE_REACH){',
  '      let n=0;',
  '      for(const c of pal){',
  '        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2<=r*r) n+=c.n;',
  '      }',
  '      /* Still gathering something worth having, so keep opening. Below this',
  '         the increments are anti-aliased strays, not the base. */',
  '      if(r>2 && n-was < opaque*BASE_STEP) break;',
  '      was=n; r+=2;',
  '    }',
  '    if(r>tol){ tol=r; held=was; }',
  '  }',
  '  /* AND THE CAP, which is what the distance to the nearest real colour was',
  '     always for. It stops the ball reaching a colour that is genuinely',
  '     something else - the approved collection puts #EC007D, on 1984 pixels of',
  '     backgrounds/Casino Floor.png, 6.8 from this base pink - rather than',
  '     setting the size, which it was never able to do correctly. */',
  '  let gap=Infinity;',
  '  for(const c of pal){',
  '    if(c.n<opaque*0.002) continue;   /* an edge blend is not a colour in use */',
  '    let near=Infinity;',
  '    for(const q of list){',
  '      const dd=Math.sqrt((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2);',
  '      if(dd<near) near=dd;',
  '    }',
  '    if(near>tol && near<gap) gap=near;',
  '  }',
  '  if(gap!==Infinity) tol=Math.min(tol, Math.max(BASE_BALL, gap*0.6));',
  '  tol=Math.min(BASE_REACH, tol);',
]);

/* The constant, with the others. */
const ball = kit.only(L, l => l === 'const BASE_BALL=12;    /* the cloud around one base colour, measured */', 'BASE_BALL again');
kit.replace(L, { start: ball, end: ball }, [
  'const BASE_BALL=12;    /* the cloud around one base colour, measured */',
  'const BASE_STEP=0.004; /* share of the picture a wider ball must still add */',
]);

const grew = kit.save(doc, ({ lines, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if (has('const BASE_STEP=0.004; /* share of the picture a wider ball must still add */') !== 1)
    throw new Error('BASE_STEP did not land');
  if (code.indexOf('BASE_STEP') < 0) throw new Error('BASE_STEP is only in a comment');
  /* The old derivation is gone, not merely followed by a new one. */
  if (code.indexOf('(gap===Infinity?BASE_REACH*2.5:gap)*0.4') >= 0)
    throw new Error('the old tolerance line is still in code');
  /* gap is now a cap applied AFTER tol exists, so it must be read that way. */
  if (code.indexOf('tol=Math.min(tol, Math.max(BASE_BALL, gap*0.6))') < 0)
    throw new Error('the gap is not applied as a cap');
  if (has('  return {im,d,n,W,H,opaque,list,cover,gap,tol,pal,source};') !== 1)
    throw new Error('basePlan no longer returns what the harness reads');
});

console.log('index.html grew by ' + grew + ' bytes');
