/* PREDICTIONS for Plan rarity.

   FIVE OF SIX PREDICTIONS IN THE FIRST RUN WERE WRONG, and the corrections are
   worth more than the kills. In every case the code did the right thing and my
   model of my own tests did not. Two of the five were real gaps and are now
   closed by tests; the other three are recorded below where they happened,
   because "which test defends this" is the thing being claimed, and being
   confidently wrong about it is how a suite comes to defend nothing.

   The three claims that carry this feature, and how each can look kept:

   1. THE SLIDER IS A MULTIPLIER, NOT A WEIGHT. Both put a thumb somewhere and
      both move when dragged. The difference shows only on a set whose weights
      are all equal at something other than the neutral value - which is the
      state the whole collection is in today.
   2. RIGHT IS RARER. A slider running the other way still moves, still totals
      100%, and still writes records.
   3. THE SET TOTALS 100% BECAUSE IT IS AN IDENTITY, not because anything
      maintains it.
*/
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/rarityplan.spec.js tests/rarity.spec.js tests/rarityreload.spec.js '
    + 'tests/raritytip.spec.js tests/drift.spec.js',
  ntests: 56,
  mutants: [
    {
      /* The axis becomes the weight, which is what it looks like it ought to
         be. Every share is still right; what breaks is where the thumb SITS. */
      name: 'the slider shows the weight instead of the multiplier',
      find: `    sl.value=String(posOfMult(n*(w0/tot),n));`,
      with: `    sl.value=String(POS_MAX-Math.round(POS_MAX*(w0-RAR_MIN)/(RAR_MAX-RAR_MIN)));`,
      kills: ['rendering and letting go without moving writes nothing'],
      /* PREDICTED THE WRONG TEST. I said "the thumb never rests on a weight the
         store cannot hold" would catch it. It does not, and the reason is
         worth having: that test DRAGS, and a drag recomputes the thumb through
         posOfMult in the input handler - so it lands back on the multiplier
         axis whatever the initial render did. Only the RENDERED position is
         mutated, so only the test that reads a rendered position and commits
         it untouched can see this.

         Which makes the round-trip test load-bearing for more than the slider
         resolution it was written for: it is the one thing standing between a
         later "simplify the axis to the weight" and a screen where twenty-one
         equal traits all read as rarest. */
    },
    {
      /* Right becomes commoner. */
      name: 'the track runs the other way',
      find: `  return hi*Math.pow(lo/hi, Math.max(0,Math.min(POS_MAX,s))/POS_MAX);`,
      with: `  return lo*Math.pow(hi/lo, Math.max(0,Math.min(POS_MAX,s))/POS_MAX);`,
      kills: [
        'the position and the multiplier are inverses of each other',
        'dragging towards rare makes it RARER, on a set nobody has planned',
        'and dragging the other way makes it commoner',
        'moving one moves everything else, and the set still totals 100%',
        'the thumb never rests on a weight the store cannot hold',
        'rendering and letting go without moving writes nothing',
        'the end of the track says what to do to go further',
      ],
      /* AND THE SCREEN-SUM TEST IS NOT IN THAT LIST, having been put there
         once and measured out again. It cannot see an inverted track: the
         column is every live weight over their total, so it adds to 100
         whichever weight the drag happened to pick. It sees a wrong
         DENOMINATOR, which is the next mutant, and nothing else. A kill list
         is a claim about what each test can see, and that one was wrong.

         PREDICTED 8, GOT 6, AND THE TWO THAT SURVIVED FOUND A REAL GAP.
         "letting go writes the weight" and "the tile agrees with the slider"
         both drag to the rare end and assert the STORED weight is 2 - and they
         stayed green over an inverted track.

         The reason is the snap. posOfMult is not mutated, so the input handler
         computes a weight from the inverted multOfPos, writes the thumb back
         through the correct posOfMult, and the release reads that corrected
         position: a round trip through the disagreement that lands on the
         right answer. The store was right for the wrong reason, and nothing
         asserted that the two functions were still inverses.

         tests/rarityplan.spec.js now asserts exactly that, and it is the first
         kill listed above. */
    },
    {
      /* THE DEFECT AS FOUND. Without the seed an unplanned sibling sits at
         weight 1, below the floor a plan may ask for, so the set has no room
         underneath and dragging towards rare made a trait commoner. */
      name: 'a set is no longer planted at normal when a slider is touched',
      find: `        seedLive();\n        const O=othersOf(t.id);`,
      with: `        const O=othersOf(t.id);`,
      kills: [
        'dragging towards rare makes it RARER, on a set nobody has planned',
        'moving one moves everything else, and the set still totals 100%',
        'the thumb never rests on a weight the store cannot hold',
        'the end of the track says what to do to go further',
      ],
      /* FOUR, not the three I predicted - I missed the thumb test, and it is
         the clearest statement of the defect there is: unseeded, the rarest
         weight the store allows is 2 against twenty 1s, which is nearly TWICE
         an even share, so the thumb lands LEFT of the even mark after a drag
         towards rare. The test asserts it lands right of it.

         And "letting go writes the weight" still survives, as predicted: the
         release seeds the siblings itself, so the committed state is right and
         only what the screen showed DURING the drag was wrong. That is the
         original defect's shape exactly - the store was always going to end up
         correct, and the control lied about which way it was going. */
    },
    {
      /* The shares stop being shares of the set. Each row still shows a
         plausible number and the column no longer adds to 100. */
      name: 'a share is measured against the whole project, not its set',
      find: `      const w=live.get(id), share=w/sum;`,
      with: `      const w=live.get(id), share=w/(sum*2);`,
      kills: [
        'the percentages ON SCREEN add up to 100, not only the weights',
        'dragging towards rare makes it RARER, on a set nobody has planned',
        'and dragging the other way makes it commoner',
        'moving one moves everything else, and the set still totals 100%',
        'a set of one says so and has nothing to drag',
      ],
      /* THE OTHER REAL GAP. I predicted "an even set is 21 equal shares that
         add to exactly 100%" would catch this. It cannot: it checks that the
         shares are EQUAL (still true when all are halved), that the footer says
         they total 100% (computed from the store, not from the repaint), and
         that the exact sum off the store is one (also not the repaint). A
         screen showing twenty-one 2.4% rows under a line reading "these add up
         to 100%" would have passed every assertion in it.

         Nothing read the numbers actually printed in the column. The first
         kill above is the test written for that, and it is now the only thing
         defending the figure a person actually reads. */
    },
    {
      /* Weight 1 stops meaning "nobody has chosen". */
      name: 'every trait counts as planned',
      find: `  return !!rec && typeof rec.rarity==="number" && rec.rarity!==RAR_UNSET;`,
      with: `  return true;`,
      kills: [
        'a fresh project says how many still need a rarity',
        'the plan is the population the generator draws from, and no other',
        'letting go writes the weight, and plans the siblings it needed to',
        'one press sets everything that is still unplanned',
        'and Download all says it too, because that is the finish',
        'dragging towards rare makes it RARER, on a set nobody has planned',
        'moving one moves everything else, and the set still totals 100%',
        'the thumb never rests on a weight the store cannot hold',
        'a set of one says so and has nothing to drag',
      ],
      /* PREDICTED 4, GOT 8, and the four extras are a dependency I had not
         written down: rarityPlanned feeds seedLive, so "everything is already
         planned" means the seed plants nothing, which brings the backwards
         drag straight back. One predicate carries both the finish-project
         count AND the direction of the control.

         "and says so no longer once every one is set" must SURVIVE - it
         asserts the finished sentence, which this mutant makes true always -
         and that is precisely why it is worthless without its pair. */
    },
    {
      /* The write stops reaching the group, which is the defect that was in
         the app before this section existed. */
      name: 'a weight change no longer patches the row',
      find: `  const sent=await cloudRarity(next);`,
      with: `  const sent=true;`,
      kills: [],
      /* PREDICTED TO SURVIVE, and it did. Declared rather than left out,
         because the gap is the point: every test here runs with activeWs null,
         so cloudRarity returns false before it reaches the network and nothing
         in this file can see the sync path at all. The reason to believe that
         path works is the live policy read off the database - traits_team
         covers ALL commands - and not a green test. */
    },
  ],
});
process.exit(bad ? 1 : 0);
