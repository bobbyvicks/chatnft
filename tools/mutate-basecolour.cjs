/* PREDICTIONS for tests/basecolour.spec.js.

   Declared here, BEFORE the run.

   Seven tests over an image operation, which is the worst kind of thing to
   have a green suite about: it cannot throw, it cannot log, and a version
   that removes a third of what it should looks exactly like one that removes
   all of it unless somebody counts. Four versions of this feature were built
   and run against the real files, and THREE OF THEM REPORTED SUCCESS WHILE
   BEING WRONG:

     - the first removed 79% of a finished trait when the button was pressed
     - the second left up to 92.4% of the base behind on a crop
     - the third left 99.4% behind on one file and cleared another completely

   None of that is visible without measuring, so the question here is not
   whether these tests pass. It is whether they can tell those versions apart
   from this one.

   The claims worth defending, in order of what they cost if wrong:

   1. A finished trait is never cleared without being asked. This is the one
      that can quietly ruin a collection - it is 264 files against one button.
   2. A remembered base is recognised across the re-encoding. The base is
      never the same value twice, and this is the whole crop case.
   3. The button refuses rather than guesses.
   4. A render is learnt from, or nothing later works at all.

   === WHAT HAPPENED, SECOND ROUND ===

   Six of seven behaved as predicted. The seventh - disabling the palette by
   dropping its tolerance to 1 - killed one test where I predicted three, and
   the note on it says why: the fixtures paint the trait as a single exact
   colour, which survives a mutation that would take a real trait with it.
   Recorded rather than corrected quietly, because a kill list edited to match
   the outcome teaches nobody what the tests actually cover.

   The NOT lists are where the value is. Three of these five mutants should
   leave four or more tests standing, and a mutant that reds everything would
   mean the tests are measuring "the picture changed" rather than the rule. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/basecolour.spec.js',
  ntests: 8,
  mutants: [
    {
      /* THE DEFECT THAT ACTUALLY HAPPENED, restored. Recognising a remembered
         colour at the cloud's own radius rather than across the spread the
         renders really show. This is what left five of sixteen crops dirty. */
      name: 'a remembered colour is only recognised at the width of its own cloud',
      find: `        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2>BASE_FIND*BASE_FIND) continue;`,
      with: `        if((c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2>BASE_BALL*BASE_BALL) continue;`,
      kills: [
        'a remembered base is found again although it re-encoded',
        'a remembered base does NOT clear itself on open',
      ],
      /* Two, because both tests shift the second render's colours by about 25
         and both then ask what basePlan made of it - one that it was cleaned,
         the other that it was recognised and left alone. NOT the render test:
         a render is detected by coverage and never consults the memory. NOT
         the finished-trait tests, which have nothing remembered at all. */
    },
    {
      /* The re-centring, undone: measure from the remembered value rather than
         from the shade actually in front of you. Recognition still works, so
         this is invisible to anything that only asks whether the base was
         FOUND. */
      name: 'the ball is grown from the remembered value, not the shade in the picture',
      find: `      here.push({r:seed.r,g:seed.g,b:seed.b,n});`,
      with: `      here.push({r:q.r,g:q.g,b:q.b,n});`,
      kills: ['a remembered base is found again although it re-encoded'],
      /* ONE. NOT 'a remembered base does NOT clear itself on open', which
         asserts that the source is remembered and that nothing was removed -
         both still true when the ball is centred wrongly, because a badly
         centred ball removes even less. That is the shape of the real defect:
         it broke the removal and left every recognition test green. */
    },
    {
      /* The line between a render and a trait, moved down past the highest
         real trait. 79.1% is hats/Coinbase Cap.png, two blues. */
      name: 'the render threshold drops below the most two-coloured real trait',
      find: `const BASE_COVER=88;   /* percent of the picture a real base pair covers */`,
      with: `const BASE_COVER=70;   /* percent of the picture a real base pair covers */`,
      kills: [
        'but a finished trait is never touched without being asked',
        'and the button refuses when it does not know what the base is',
      ],
      /* Two, because the fixture for both is that same 79% two-blue trait: one
         asks that it is not cleared, the other that the button will not act on
         it. NOT the render tests, which are at 95% and stay a render either
         way, and NOT the remembered tests, whose second picture is 30% and
         nowhere near even the lowered line. */
    },
    {
      /* The refusal. */
      name: 'the button acts on a guess instead of refusing',
      find: `  if(pl.source==="guess"){`,
      with: `  if(false){`,
      kills: ['and the button refuses when it does not know what the base is'],
      /* ONE, and it is the only test that presses the button on something
         unknown. NOT the finished-trait test, which never presses anything -
         it is about what happens on OPEN, and the two are separate because the
         first version of this was safe on open and a footgun in the hand. */
    },
    {
      /* Learning, removed. Everything after the first render depends on it. */
      name: 'a render is cleared but its colours are not written down',
      find: `      if(r.plan.source==="render") saveBaseColours(r.plan.list);`,
      with: `      ;`,
      kills: [
        'a render clears itself on open, and is remembered',
        'a remembered base is found again although it re-encoded',
        'a remembered base does NOT clear itself on open',
      ],
      /* Three, and this is the one mutant that should take out most of the
         file - the memory is the feature, and two of the three tests exist
         only because it is there. NOT the finished-trait tests, which never
         learn anything, and NOT the cloud test, which is a single render. */
    },
    {
      /* THE PALETTE IS THE JUDGEMENT. At tolerance 1 it stops collapsing the
         cloud: the 64 slots fill with individual base shades, so nearly every
         pixel finds a base entry nearest and the trait goes with it. */
      name: `the palette stops collapsing the cloud`,
      find: `     colours is a separate decision and stays on its own button. */
  const pal=palette(d,n,CLEAN_TOL,64).list;`,
      with: `     colours is a separate decision and stays on its own button. */
  const pal=palette(d,n,1,64).list;`,
      kills: [`is decided by the palette, and does not eat the trait`],
      /* PREDICTED THREE, MEASURED ONE, AND THE PREDICTION WAS WRONG RATHER
         THAN THE CODE. I expected the 64 slots to fill with base shades and
         take the trait with them. They do fill with base shades - but the
         trait in those two fixtures is painted as ONE EXACT COLOUR, with the
         jitter deliberately switched off for the artwork, so it is a single
         very popular value that keeps its own slot and survives.

         That is a fixture weakness worth naming: a real trait is dozens of
         shades and would not be so lucky. The edge fixture, whose trait is
         also flat but whose BLEND is not, is the one that catches this - and
         it catches it through the blend rather than through the trait. So the
         suite does detect the palette being disabled, by one test rather than
         three, and it detects it for a reason I had not predicted. */
      /* Anchored on the comment line above it because the same call appears in
         cleanPlan, which this must not touch - the button and the judgement
         share CLEAN_TOL on purpose and only one of them is being mutated.
         NOT the cloud test: it asks that little SURVIVES, and a mutant that
         removes everything satisfies that. Worth knowing - that test cannot
         see over-removal, which is why the edge test exists. */
    },
    {
      /* The old ball, restored: judge each pixel by its distance to the base
         rather than by which real colour it is nearest. */
      name: `a pixel is judged by distance to the base, not by the palette`,
      find: `    if(baseEntry[k]){ d[i+3]=0; gone++; }`,
      with: `    if(list.some(q=>(d[i]-q.r)*(d[i]-q.r)+(d[i+1]-q.g)*(d[i+1]-q.g)+(d[i+2]-q.b)*(d[i+2]-q.b)<=t2)){ d[i+3]=0; gone++; }`,
      kills: [`is decided by the palette, and does not eat the trait`],
      /* ONE, and only its last assertion: the blend row nearest the base sits
         24.3 away and the tolerance is 12, so a ball leaves it behind. That
         row IS the halo. NOT the solid-trait assertion in the same test - a
         ball is too timid here, not too greedy - and NOT any test that only
         asks whether the flat base went, because a ball removes that fine. */
    },
  ],
});
process.exit(bad ? 1 : 0);
