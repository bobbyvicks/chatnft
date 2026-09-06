/* PREDICTIONS for tests/paneldensity.spec.js - "a quarter shorter, and every
   control still in it".

   Declared here, BEFORE the run.

   A density spec is the easiest kind of suite to fool. Six of its seven tests
   assert an ABSENCE - no control missing, none hidden, none clipped, none too
   small - and an absence assertion passes just as well when the query behind
   it is looking at nothing at all. The seventh asserts a number that was
   chosen after the fact.

   So the question each mutant asks is not "does the pass work" but "is this
   test attached to anything". Each one breaks exactly one property and names
   the tests that must NOT move with it.

   ONE LIMIT DECLARED UP FRONT, because it changes how the first test should be
   read: 'still holds every control it did' is NOT defended below. Every id in
   its list is wired by $(id) at load, so deleting or renaming one throws
   before the editor starts and reds all seven - a result that would tell me
   nothing about that assertion. It is a change-detector on a list, not a
   behavioural test, and I am recording that rather than dressing an
   all-seven-red as a kill. What IS defended is that the second test is not a
   duplicate of it: mutant 4 hides a control without removing it.
*/
/* WHAT HAPPENED, added after the run. The predictions above stand as declared.

   Four of five as predicted. The phone mutant SURVIVED, and that was the best
   result in the file: deleting both restore rules left the phone test green,
   because it compared Math.round(height) >= 26 and the density pass leaves a
   button at 25.6px, which rounds to 26. It was also reading querySelector -
   the first control - while calling itself "every shrunken target"; the first
   button is 32px and the smallest 28. The test now takes the smallest of each
   kind and compares the raw height against 27, a bar measured from both sides,
   and the mutant kills it.

   The "six biggest density rules are reverted" mutant was flagged before the
   run as the one whose bar might be too loose to catch it. It killed. */
const { runMutants } = require('./mutrun.cjs');

const bad = runMutants({
  file: 'index.html',
  spec: 'tests/paneldensity.spec.js',
  ntests: 7,
  mutants: [
    {
      /* Puts back the pre-existing bug the density measurement found: both
         #tname and .chips are `flex:1; min-width:0`, so the row's hypothetical
         width is near zero, .savebar never wraps, and the three status buttons
         share what is left after #tlayer's cap. "approved" needed 58px and had
         18. */
      name: 'the status chips go back on the shared line',
      find: `#tstatus{flex:1 1 100%;}`,
      with: `#tstatus{flex:1;}`,
      kills: [
        'the status chips in particular are readable',
        'nothing in it is clipped',
      ],
      /* NOT the height test: putting the chips back on one line makes the
         panel SHORTER, not taller, so a suite that only measured height would
         have called this an improvement. That is exactly why the clipping
         sweep exists beside the height number. */
    },
    {
      /* The pass itself, reverted - the six scoped rules that do most of the
         work. Everything else the pass changed (the .stack gap, the field
         padding, the .cur bundle, the paired slider rows) stays, so this is a
         partial revert and the honest expectation is a partial recovery of the
         394px. */
      name: 'the six biggest density rules are reverted',
      find: `/* The single biggest line in the panel: twelve full-width buttons, each set
   by a line box of 12px x the inherited 1.5 plus 14px of padding. */
.side .btn{padding:4px 10px; line-height:1.3;}
/* A <p> keeps the UA margin-block-end of 1em - 11.5px - on four visible
   notes, under a rule that only ever set margin-top. */
.side .note{margin-bottom:0;}
/* Matched to .side .btn on purpose, so a row holding one of each lands on a
   single line rather than being set by the taller of the two. */
.side .mini{padding:4px 10px; font-size:12px; line-height:1.3;}
/* Four hairlines, each 11px tall of which 10 is margin. */
.side .rule{margin:3px 2px;}`,
      with: `/* reverted by a mutant */`,
      kills: ['it is a lot shorter than it was'],
      /* NOT the four absence tests: reverting makes every target BIGGER, so
         nothing becomes too small and nothing starts clipping. NOT the phone
         test either - these are the desktop rules the media query overrides
         anyway.

         PREDICTED KILL, and the number is the risk. The bar is 1350 against a
         measured 1186, which is 164px of slack, and this reverts perhaps 130
         of the 394px the whole pass saved. If it SURVIVES, the finding is that
         the bar is too loose to catch a revert of the largest rules in the
         pass, and the bar is what needs fixing - I will report that as a
         result, not quietly widen the mutant until it reds. */
    },
    {
      /* The control that matters most, attacked directly: on a phone the panel
         is a bottom sheet somebody draws on with a thumb. */
      name: 'the phone stops getting its touch targets back',
      find: `  .side .btn{padding:8px 11px; line-height:1.5;}
  .side .mini{padding:7px 12px; font-size:12.5px; line-height:1.5;}
  .side .tool{width:42px; height:42px;}`,
      with: `  .side .tool{width:42px; height:42px;}`,
      kills: ['a phone gets every shrunken target back'],
      /* And nothing else, because this lives inside @media (max-width:820px)
         and every other test runs at 1400px. A red anywhere else would mean
         the media query is not doing what the whole restore block assumes. */
    },
    {
      /* Not removed - HIDDEN. This is the mutant that says the second test is
         a real assertion rather than a restatement of the first: "not removing
         any traits" also means not putting one behind a reveal. */
      name: 'a control is still in the DOM but no longer on screen',
      find: `          <button class="btn ghost" id="rcnone" disabled style="flex:1"`,
      with: `          <button class="btn ghost" id="rcnone" hidden disabled style="flex:1"`,
      kills: ['and reaches all of them without an extra click'],
      /* MUST SURVIVE on the presence test: getElementById still finds it. If
         both move together, the two tests are one test written twice. */
    },
    {
      /* The touch-size floor, attacked on its own. The pass reached 25.6px
         buttons by taking the line-height down; taking it further is exactly
         the failure mode a density pass has. */
      name: 'the density pass is pushed past a usable size',
      find: `.side .btn{padding:4px 10px; line-height:1.3;}`,
      with: `.side .btn{padding:0 10px; line-height:1;}`,
      kills: ['no control is too small to hit'],
      /* NOT the height test - this makes the panel shorter still, which is the
         point: a suite that only measured height would score this as a win.
         NOT the clipping sweep either, which is horizontal. */
    },
  ],
});
process.exit(bad ? 1 : 0);
