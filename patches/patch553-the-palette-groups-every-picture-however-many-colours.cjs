/* THE PALETTE GROUPS EVERY PICTURE, HOWEVER MANY COLOURS IT HAS.

   Found 2026-09-22 by the discovery pass, ranked thirteenth of 39.
   snapToPalette groups colours within 2.3 dE before looking them up, which
   is what stopped invisible variation turning into visible speckle. The
   grouping compared each colour with every group so far, so it was capped
   at 8,192 distinct colours; past that each colour was its own group - the
   speckling rule the grouping was written to replace - and the shades-merged
   census then compared every colour with every other on the same palette
   colour. 8,192 colours took 151 ms and 8,193 took 6,367 ms. On the real
   collection 50 of 311 traits are past the cap (every one photographic),
   and Change colours to palette on them froze the page for 3 s to 232 s
   with no way out, while the merged figure counted raw colours (8,128 for
   Utopia against 94 for a file under the cap).

   The grouping now finds candidate groups through a grid over Lab, cells
   the size of the box the scan already used to skip far groups (5 in L, 16
   in a and b), and takes the earliest-made group that passes the same box
   and the same 2.3 dE test. That is the linear scan's answer exactly -
   measured on the 261 real traits under the cap, every output pixel, group
   count, merged figure and furthest move identical - so the cap is gone
   and every picture is grouped by the one rule.

   What changes is the 50 past the cap, which now get the rule the rest
   get: a median of 16% of their opaque pixels land on a different palette
   colour than colour-by-colour gave them. Measured on those 50 with the
   harness: 88 s in total against 394 s for colour-by-colour even without
   the census (today it was worse than that), median 0.65 s, worst 14 s on
   R Place Mosaic with 867,309 colours. Their merged figure counts groups,
   as it does everywhere else. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

swap('   set, mean error to the source unchanged (8.543 -> 8.547). Past 8,192', [
  '   set, mean error to the source unchanged (8.543 -> 8.547). Past 8,192',
], 'the doc line');
swap('   distinct colours each colour is its own group, which is the old rule.', [
  '   distinct colours each colour WAS its own group, the old rule, because',
  '   the grouping compared each colour with every group; it finds them',
  '   through a grid now and every picture is grouped (patch553).',
], 'the old-rule line');
swap('const SNAP_GROUP_MAX=8192;', [
  '/* SNAP_GROUP_MAX (8192) is gone: the grouping capped itself there because',
  '   it was quadratic, and past it the photographic traits froze the page for',
  '   up to 232 s and came back speckled. See snapToPalette. */',
], 'the cap');
{
  const fnR = () => kit.inFunction(L, 'function snapToPalette(d,n){');
  swap('  const canGroup=cols.length<=SNAP_GROUP_MAX;', [
    '  /* CANDIDATE GROUPS THROUGH A GRID over Lab, cells the size of the box',
    '     below, so a colour is only compared with groups in its own cell and',
    '     the 26 around it - everything outside was skipped by the box anyway.',
    '     The earliest-made group that passes wins, which is what the scan in',
    '     creation order answered: identical on all 261 real traits under the',
    '     old 8,192 cap, and no cap. */',
    '  const grid=new Map();',
    '  const cellOf=lab=>[Math.floor(lab[0]/5),Math.floor(lab[1]/16),Math.floor(lab[2]/16)];',
  ], 'canGroup', fnR());
  const f = fnR();
  const i = at('    if(canGroup){', 'the scan', f);
  const want = [
    '    if(canGroup){',
    '      for(const g of groups){',
    '        const q=g.lab;',
    '        /* A cheap box first: 2.3 dE cannot span more than about 4 in L',
    '           or 14 in chroma, so anything outside this box is not a member',
    '           and the trigonometry is skipped. */',
    '        if(Math.abs(q[0]-lab[0])>5||Math.abs(q[1]-lab[1])>16||Math.abs(q[2]-lab[2])>16) continue;',
    '        if(deltaE2000(q[0],q[1],q[2],lab[0],lab[1],lab[2])<=SNAP_GROUP_DE){ grp=g; break; }',
    '      }',
    '    }',
    '    if(!grp){ grp={lab:lab, sumL:0, suma:0, sumb:0, px:0, members:[]}; groups.push(grp); }',
  ];
  for (let k = 0; k < want.length; k++) if (L[i + k] !== want[k]) throw new Error('the scan moved at +' + k + ': ' + L[i + k]);
  kit.replace(L, { start: i, end: i + want.length - 1 }, [
    '    {',
    '      const [x,y,z]=cellOf(lab);',
    '      let first=Infinity;',
    '      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(let dz=-1;dz<=1;dz++){',
    '        const list=grid.get((x+dx)+","+(y+dy)+","+(z+dz));',
    '        if(!list) continue;',
    '        /* Each cell lists its groups in the order they were made. */',
    '        for(const g of list){',
    '          if(g.idx>=first) break;',
    '          const q=g.lab;',
    '          /* A cheap box first: 2.3 dE cannot span more than about 4 in L',
    '             or 14 in chroma, so anything outside this box is not a member',
    '             and the trigonometry is skipped. */',
    '          if(Math.abs(q[0]-lab[0])>5||Math.abs(q[1]-lab[1])>16||Math.abs(q[2]-lab[2])>16) continue;',
    '          if(deltaE2000(q[0],q[1],q[2],lab[0],lab[1],lab[2])<=SNAP_GROUP_DE){ first=g.idx; grp=g; break; }',
    '        }',
    '      }',
    '    }',
    '    if(!grp){',
    '      grp={idx:groups.length, lab:lab, sumL:0, suma:0, sumb:0, px:0, members:[]}; groups.push(grp);',
    '      const k=cellOf(lab).join(","), l=grid.get(k);',
    '      if(l) l.push(grp); else grid.set(k,[grp]);',
    '    }',
  ]);
}

const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  if (times('SNAP_GROUP_MAX') || times('canGroup')) throw new Error('the cap is still read');
  if (times('grid.get((x+dx)') !== 1) throw new Error('the grid lookup is not there once');
});

fs.renameSync(TMP, FILE);
console.log('patch553 written, ' + grew + ' bytes');
