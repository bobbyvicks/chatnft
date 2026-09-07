/* PLAN RARITY - a slider per trait, and a set that always adds to 100%.
   ================================================================
   THE SLIDER IS NOT THE WEIGHT, and that is the whole design.

   Twenty-one eyes all at weight 3 draw at 3.1% each - identical to twenty-one
   all at weight 1 - because a share is w/Sum(w) and the scale cancels. A
   slider showing the weight would put all twenty-one thumbs at "rarest" over
   a set where nothing is rare, which is a false claim on screen and the exact
   failure this app has a test harness for.

   SO THE AXIS IS THE MULTIPLIER AGAINST AN EVEN SHARE: 1.0 is "as likely as
   any other in this set", 2.0 is twice that, 0.5 is half. It is scale-free -
   multiply every weight in a set by k and no thumb moves - and it carries the
   user's headline ask as a PHYSICAL PROPERTY rather than a caption:

     the multipliers over a set sum to n, exactly, for any weights at all

   so the mean thumb is always on the even mark. You cannot drag everything to
   rare; pushing one right pushes the others left, live, in front of you. That
   is what "the whole trait set adds up to 100% automatically" looks like, and
   it needs no maintenance, because Sum(w)/Sum(w) is an identity rather than
   something to keep true. Checked to twelve decimals over five weight vectors
   including all-1, all-14, all-99 and a lopsided one.

   RIGHT IS RARER, as asked. The track's ends depend on the number of traits in
   the set and on NOTHING ELSE, so a thumb never moves because a sibling moved
   - only the percentages do.

   WHAT IT STORES: the rarity column that already exists, and nothing else. The
   live database says `rarity integer NOT NULL CHECK (rarity >= 1 AND rarity <=
   99)`, so integers 1..99 is not a design choice, it is the store. Weight 1 is
   reserved to mean NOBODY HAS SET THIS, which is the "update rarity to finish
   project" state - and it has to ride this column rather than a settings
   record, because cloudPush only sends kind trait and ref, so a settings
   record would make "12 still need a rarity" true for one teammate and false
   for another.

   WHY THE NUMBER BESIDE THE SLIDER IS THE SHARE OF THE SET AND NOT OF ALL
   CHARACTERS. Measured on this project - 271 traits, 176 rule groups:

     one weight change, rule-aware % :  2,025 ms
     within-set share, a whole layer :      1 ms   (and it sums to exactly 1)

   traitChance runs the generator 20,000 times whenever a rule exists, and
   every weight is in its cache key, so a slider that showed that figure would
   cost two seconds a drag. The set share is the number the slider actually
   controls, it is exact, it is what totals 100%, and the of-characters figure
   is already on the shelf tile beside every trait. The layer heading says how
   often the set appears at all, so the two are related on screen rather than
   silently differing by a factor of 1/0.65.

   NORMAL = 14 is derived, not chosen: a weight's room to move is its ratio to
   the floor and to the ceiling, and those are equal at sqrt(2*99) = 14.07. */
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

/* ---- 1. CSS -------------------------------------------------------- */
swap('.lrow:last-child{border-bottom:none;}', block([
  '.lrow:last-child{border-bottom:none;}',
  '/* The rarity plan. One row per trait: name, slider, the share of its set,',
  '   and that share in words - the number is exact and the words are what',
  '   somebody skims. */',
  '#plan.folded .projfold .fold{transform:rotate(-90deg);}',
  '#plan.folded #planbody{display:none;}',
  '.plangrp{margin:0 0 16px;}',
  '.planhead{display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;',
  '  border-bottom:1px solid var(--line); padding-bottom:5px; margin-bottom:6px;}',
  '.planhead b{font-size:13px; font-weight:600;}',
  '.planhead span{font-size:11px; color:var(--muted);}',
  '.prow{display:grid; gap:8px; align-items:center; padding:3px 0;',
  '  grid-template-columns:minmax(80px,1.3fr) minmax(110px,2fr) 62px minmax(0,1.1fr);}',
  '.prow .pname{font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
  '.prow input[type=range]{width:100%; margin:0; accent-color:var(--accent);}',
  '.prow input[type=range]:disabled{opacity:.45;}',
  '/* tabular-nums so a column of shares lines up while one of them is moving. */',
  '.prow .pshare{font-size:12px; text-align:right; font-variant-numeric:tabular-nums;}',
  '.prow .psay{font-size:11px; color:var(--dim); overflow:hidden;',
  '  text-overflow:ellipsis; white-space:nowrap;}',
  '.prow.unset .pname{color:var(--muted);}',
  '.prow.unset .psay{color:var(--accent);}',
  '.plantot{font-size:11px; color:var(--dim); margin:5px 0 0;}',
  '/* The phone gets the slider its own full-width row: a range input squeezed',
  '   into a third of 375px is not draggable with a thumb. */',
  '@media (max-width:640px){',
  '  .prow{grid-template-columns:1fr 62px; gap:1px 8px;',
  '    grid-template-areas:"name share" "slider slider" "say say"; padding:6px 0;}',
  '  .prow .pname{grid-area:name;} .prow .pshare{grid-area:share;}',
  '  .prow input[type=range]{grid-area:slider; height:26px;}',
  '  .prow .psay{grid-area:say;}',
  '}',
]));

/* ---- 2. markup ----------------------------------------------------- */
swap('    <p class="note">Top of the list draws in front. Removing a layer sends its traits to unsorted.</p>'
  + NL + '  </section>', block([
  '    <p class="note">Top of the list draws in front. Removing a layer sends its traits to unsorted.</p>',
  '  </section>',
  '  <section class="proj" id="plan" hidden>',
  '    <div class="projhead">',
  '      <h2><button class="projfold" id="planfold" type="button" aria-controls="planbody"',
  '        aria-expanded="true" title="Hide the rarity plan">Plan rarity<span class="fold" aria-hidden="true">\u25be</span></button></h2>',
  '      <span class="count" id="plancount"></span>',
  '      <div class="acts">',
  '        <button class="mini" id="planseedall">Set the rest to normal</button>',
  '      </div>',
  '    </div>',
  '    <div id="planbody"></div>',
  '  </section>',
]));

/* ---- 3. the arithmetic and the section ----------------------------- */
swap(block([
  '    row.appendChild(inp); row.appendChild(cnt);',
  '    row.appendChild(up); row.appendChild(dn); row.appendChild(del);',
  '    body.appendChild(row);',
  '  }',
  '}',
]), block([
  '    row.appendChild(inp); row.appendChild(cnt);',
  '    row.appendChild(up); row.appendChild(dn); row.appendChild(del);',
  '    body.appendChild(row);',
  '  }',
  '}',
  '',
  '/* ================= plan rarity ===================================',
  '   THE BOUNDS ARE THE DATABASE\'S, not a preference. The live column is',
  '   `rarity integer NOT NULL CHECK (rarity >= 1 AND rarity <= 99)`, and a',
  '   value outside it fails the insert, which surfaces as "could not reach the',
  '   group" because nothing reads the Postgres error body. So the solver\'s',
  '   only output is a clamped, rounded integer.',
  '',
  '   RAR_UNSET is 1 and is reserved: it is the column default, so a trait',
  '   nobody has planned reads 1 whether it was created here or arrived from a',
  '   teammate. That is what makes "still needs a rarity" a fact about the',
  '   collection rather than a fact about this browser.',
  '',
  '   RAR_NORMAL is DERIVED. A weight\'s room to move is its ratio to the floor',
  '   and its ratio to the ceiling, and those are equal at sqrt(RAR_MIN*RAR_MAX)',
  '   = 14.07. Seeding anywhere else would give a set more travel in one',
  '   direction than the other for no reason.',
  '',
  '   POS_MAX is 20,000 and that is measured, not round. The slider has to',
  '   invert exactly - position to weight and back must be the identity, or a',
  '   drag that goes nowhere rewrites the weight. At 1,000 steps two',
  '   consecutive weights collide at the common end of a small set and 802 of',
  '   the cases checked came back wrong; at 20,000 it is exact for every set',
  '   size 2..60 at every sibling level. */',
  'const RAR_MIN=2, RAR_MAX=99, RAR_UNSET=1, POS_MAX=20000;',
  'const RAR_NORMAL=Math.round(Math.sqrt(RAR_MIN*RAR_MAX));',
  '',
  '/* The commonest and rarest a trait can be made in a set of n, expressed as a',
  '   multiple of an even share. This trait at the ceiling and every sibling at',
  '   the floor, and the other way round. Both depend on n ALONE, so the track',
  '   is fixed while the set is - a thumb never moves because a sibling moved. */',
  'function multHi(n){ return n*RAR_MAX/(RAR_MAX+RAR_MIN*(n-1)); }',
  'function multLo(n){ return n*RAR_MIN/(RAR_MIN+RAR_MAX*(n-1)); }',
  '/* Log spacing, so a given distance along the track is the same RATIO',
  '   wherever you are on it. Right is rarer, which falls out of multLo landing',
  '   at POS_MAX - not from reversing the input, so the arrow keys agree with',
  '   the pixels for free. */',
  'function posOfMult(m,n){',
  '  if(!(n>1)) return 0;',
  '  const hi=multHi(n), lo=multLo(n);',
  '  const p=Math.round(POS_MAX*Math.log(m/hi)/Math.log(lo/hi));',
  '  return Math.max(0,Math.min(POS_MAX, isFinite(p)?p:0));',
  '}',
  'function multOfPos(s,n){',
  '  if(!(n>1)) return 1;',
  '  const hi=multHi(n), lo=multLo(n);',
  '  return hi*Math.pow(lo/hi, Math.max(0,Math.min(POS_MAX,s))/POS_MAX);',
  '}',
  '/* The weight that gives share r against siblings totalling O. r = w/(w+O),',
  '   so w = rO/(1-r). Clamped to the store, which is why a position at the very',
  '   end of the track can ask for a weight the set cannot hold - the reachable',
  '   band is drawn from these same numbers rather than discovered by a snap. */',
  'function weightForShare(r,O){',
  '  if(!(r>0) || !(r<1)) return RAR_NORMAL;',
  '  return Math.max(RAR_MIN,Math.min(RAR_MAX,Math.round(r*O/(1-r))));',
  '}',
  '/* Has anybody actually chosen this? Weight 1 is the column default and',
  '   arrives on every unplanned trait from the server too, so this is a fact',
  '   about the collection and not about this browser. */',
  'function rarityPlanned(rec){',
  '  return !!rec && typeof rec.rarity==="number" && rec.rarity!==RAR_UNSET;',
  '}',
  '/* The share in words. Read off the MULTIPLIER, never off the slider',
  '   position: the position is a drawing of the multiplier and the two would',
  '   drift the moment the track changed. */',
  'function multWords(m){',
  '  if(m>=3) return "turns up a lot more than the rest";',
  '  if(m>=1.5) return "turns up more than the rest";',
  '  if(m>=0.67) return "about the same as the rest";',
  '  if(m>=0.33) return "turns up less than the rest";',
  '  return "hardly ever";',
  '}',
  '/* Every trait the generator would draw from this layer, which is the only',
  '   population a share may be computed over - traitEligible is the same rule',
  '   buildCompose uses, and asking it here rather than filtering by hand is',
  '   what stops the two answering differently. */',
  'function planRows(items,layer,wip){',
  '  return (items||[]).filter(t=>t.kind==="trait" && (t.layer||"unsorted")===layer',
  '    && traitEligible(t,wip));',
  '}',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['const RAR_MIN=2, RAR_MAX=99, RAR_UNSET=1, POS_MAX=20000;',
  'function multHi(n){', 'function multLo(n){', 'function posOfMult(m,n){',
  'function multOfPos(s,n){', 'function weightForShare(r,O){',
  'function rarityPlanned(rec){', 'function multWords(m){', 'function planRows(items,layer,wip){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['plan', 'planfold', 'plancount', 'planseedall', 'planbody'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* The population rule must be asked for, never copied. */
if (code.indexOf('function planRows(items,layer,wip){\r\n  return (items||[]).filter(t=>t.kind==="trait" && (t.layer||"unsorted")===layer\r\n    && traitEligible(t,wip));') < 0)
  throw new Error('planRows does not defer to traitEligible');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
