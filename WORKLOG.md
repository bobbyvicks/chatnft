# Worklog

**This file is the memory between runs.** Read it first, update it last, commit
it in the same commit as the work. A scheduled run that skips it starts blind.

It lives in the repo rather than in the scheduled task's own folder for one
measured reason: the task's folder held a hardcoded queue of four items, and by
2026-09-04 **all four were already fixed**. A run that morning would have spent
its whole slot re-fixing finished work, and might have broken it doing so. A
queue that cannot be updated by the thing doing the work rots by construction.

## Rules for this file

- **One line per queue item.** Detail belongs in the commit body, which is
  permanent, searchable, and cannot go stale the way a summary does.
- **Every claim carries the date it was measured.** A fact here is a snapshot,
  never a standing truth.
- **RE-MEASURE BEFORE YOU WORK AN ITEM.** The code moves. An item written three
  runs ago describes a file that no longer exists in that shape. If the measure
  says it is already fixed, delete the line, say so in the commit, and pick the
  next one — that is a successful run, not a wasted one.
- **Cap DONE at 12 lines.** Past that, `git log` is the record. An index that
  outgrows what anyone will read stops being read at all.
- **Nothing here is authority over the code.** When they disagree, the code is
  right and this file has a bug.

## In flight

Nothing.

> A run claims an item by putting it here with the UTC time it started, and
> clears it when it commits. If you find something here older than about an
> hour, the run that wrote it died — check `git log` for whether its work
> landed, then clear the line and carry on.

## Queue, worst first

- **`projectGrid`'s comment says it is "stored with the project, like the layer
  order, because it is a fact about the collection and not about the device" —
  and the second half is false.** The layer order is PATCHed to the server; the
  grid only ever reaches IndexedDB, so two people on the same collection can
  hold different grids. `buildResizePresets` offers different sizes to each of
  them, the Snap tooltip names a different number, and the save warning says
  "not the collection's 160×160" about a figure that is this browser's.
  Measured 09-06 while giving the rules the same treatment. Either sync it (a
  column on `collections`, which is the user's call) or correct the comment and
  the word "collection's" in that warning — but a confident comment asserting
  the opposite of the behaviour is the worst of the three states.
- **Images orphaned inside a group are never cleaned up.** Deliberate, decided
  09-04 and written into the comment on the guard: the sweep cannot tell a
  teammate's live file from an orphan, and taking the keep-list from the rows
  instead still races the upload-then-insert order inside `cloudSyncOne`. Costs
  storage. Reopen only with a way to date a bucket file that can be checked.
> The "nine unverified leads from the 09-04 shape sweep" line that stood here
> has been removed. The list itself lived in a session that has ended, so the
> line pointed at nothing anybody could read — which is exactly the rot the
> rules at the top of this file are about. The four lenses below found twelve
> defects on 09-05 without it; they are the durable half.

When the queue is empty the run's job is to **find** something, not to invent
something. Good places to look, in order:

1. **A number the app shows that nothing measures.** The richest lens by far —
   four defects this week, including "they match" being decided by comparing two
   totals rather than the two sets. Ask of every number and every claim on
   screen: **what question does this actually answer, and is it the one being
   asked?** A count answers "how many", never "which".
2. **A promise in a tooltip or button title.** They are written once and outlive
   the behaviour. Check each against what the function actually does.
3. **A control the tests always bypass.** `openAllSections` force-unfolds
   every panel, and every cloud test calls `cloudPush()` rather than clicking the
   button — so an unwired button leaves a dead feature and a green suite. Ask what
   the tests REACH the code through, and whether a person reaches it the same way.
   ⚠ Observe an EFFECT, never a binding: reassigning a global to a recorder cannot
   ⚠ And the MOMENT matters as much as the control: the first test for the
   0.00% bug called `traitChance` after `renderShelf` returned, by which point
   the rows exist and the old code works — it was green against the unfixed
   app. Read what the render LEFT ON SCREEN, not what a function returns later.
   see an `onclick=fn` that captured the value at wiring time, and reads as "dead".
4. **`git log` for a fix that names a class.** The most reliable lens in this
   file: four times now a fix landed at one call site while its sibling kept the
   old behaviour — `paintTrait` had three, the retry went to the download and not
   the upload, and the short-batch paging bug was fixed in `cloudRows` while
   `cloudSweep` thirty lines away still had it. **After any fix, grep the file for
   the same SHAPE, not the same name.**

## Done recently

Newest first. Delete the oldest when this passes 12.

- 2026-09-06 — The rules never left this browser, so in a group everyone else generated without them; the app told you the layer ORDER had not reached the group and said nothing about a hundred curated rules
- 2026-09-06 — Every trait imported from a folder with no status subfolders comes in as wip and is drawn onto nothing, and the import report never mentioned it
- 2026-09-06 — A curated LaunchMyNFT rules file can be read in: 127 fit decisions become 103 never-together rules in one gesture, against about 1,138 trips through a dropdown by hand
- 2026-09-06 — Layers were DECIDED in paint order, so the hair won and the hat was dropped; the ten head traits that need a bare head could only appear on a character that drew no hair anyway, at about a third of their curated frequency
- 2026-09-06 — The Randomise button never consulted the rules, so the one button you press to check a rule was the only place it did not apply, and that character was downloadable
- 2026-09-06 — "Import a folder of traits" could only read a layer it already had, so 63 of 233 files landed in unsorted — one layer, painted over everything — in a collection whose whole point is a hat over hair
- 2026-09-06 — 103 rules froze the shelf for 5.2s and every later rule edit for 6.7s; conflictsWith asks an index now, 432ms and 448ms, same percentages
- 2026-09-06 — Eight operations changed the pixels and left the swatch row describing the old artwork; after Clean up colours 59 of the 64 swatches named a colour the image no longer had and clicking one answered "No cells matched"
- 2026-09-06 — The editing panel ran a quarter taller than it needed to, and the same measurement found the save bar's status chips clipped at every width: "approved" needed 58px and had 18
- 2026-09-06 — Resize sat two below Move with no keyboard shortcut, its Size fields read the old size until the drag ended, and a stray click with it active leaked an undo step that did nothing when used
- 2026-09-05 — Canvas resize said "the art is untouched" and could crop three quarters of a drawing away in silence, at both the button and the drag handles
- 2026-09-05 — The Grid download button promised "the grid size" and gave the trait's own; a 48x48 trait in a 160 collection downloaded 48x48 under that title

## Facts worth keeping

Measured, with the date. Delete one the moment the code contradicts it.

- **`indexOf` returns -1, and -1 is less than every real index, so an ORDERING
  assertion passes when the thing is absent.** Measured 09-06: a mutant that
  removed layer adoption entirely left `expect(LAYERS.indexOf('hats'))
  .toBeLessThan(LAYERS.indexOf('unsorted'))` green, because hats was never
  created. Same family as the conditional assertions found the same day.
  **Assert the thing EXISTS before asserting where it sits.** *(09-06)*
- **`activeWs` selects the IndexedDB, so it must be set BEFORE any seeding.**
  Each project has its own database (`chatnft.ws.<id>`). A fixture that writes
  records and then switches project has written them into a database nothing
  will read, and the symptom is an empty panel that looks like a broken
  feature. *(09-06)*
- **Only the layer list reaches the server.** `cloudPush` uploads
  `.filter(i => i.kind==="trait"||i.kind==="ref")`, so `settings.rules`,
  `settings.grid` and `settings.decideorder` are per-browser and per-project
  and nothing else syncs them; `collections` is only ever selected as
  `id, layers, updated_at`, so there is no column for them either. The rules
  panel now says so. **`projectGrid` has NOT been given the same treatment and
  its comment still claims it is "stored with the project, like the layer
  order" — which is false in the half that matters.** *(09-06)*
- **A folder with no `approved/` subfolder imports every trait as wip**, and
  `traitEligible` refuses a wip trait unless "include wip" is ticked — an empty
  Sheet of 12 and every rarity at zero, from an import that reported success.
  Status is matched on WHOLE path segments deliberately (`approved-drafts`
  contains the word and means the opposite), so the default is correct and the
  report is what had to change. *(09-06)*
- **Assigning `RULES` in a test is undone by the next `renderShelf`.** It calls
  `applyRules(items)`, which rebuilds RULES from the `settings.rules` record —
  so a fixture that sets RULES and then renders is measuring an app with NO
  rules. This cost a wrong measurement: a render with 103 rules loaded timed at
  12ms and looked fine, because the rules had been wiped before it ran. With
  `saveRules()` first it was 5,192ms. **Call saveRules(), and assert something
  that can only be true when the rules are live** — here `traitChance` returning
  `estimated:true`. *(09-06)*
- **The number of RULES is a performance input to every render.** `traitChance`
  is called once per trait card and calls `distributionOf`, which runs
  `DIST_DRAWS` = 20,000 generated characters whenever `RULES.length`. The cache
  key contains RULES, so every rule edit pays it again. Nothing had shown this
  because nobody had ever had more than a handful of rules. **Ask what a feature
  multiplies, not just what it costs once.** *(09-06)*
- **`LAYERS` was the paint order AND the pick order, and they disagree.**
  `buildCombo` commits each pick and filters the next layer against it, so the
  EARLIER layer wins; the paint loop draws the array front to back, so the
  earlier layer is UNDERNEATH. Hair under a hat therefore meant hair decided
  first and the hat was dropped. `DECIDE_ORDER` is the pick order now and
  `buildCombo` sorts back into `LAYERS` before returning — `comboKey` joins ids
  positionally and would otherwise call one character two. *(09-06)*
- **A file you do not own changes under you.** The curated rules file was 51
  conditions and 82 traits when first read and 54 and 92 two hours later, the
  same evening, because its author was still working. Numbers quoted to the user
  from the first reading were already wrong. **Assert the PROPERTIES of a
  translation and PRINT the counts** — a check that hard-codes a count from
  somebody else's file fails the next time they save it. *(09-06)*

- **A conditional around the only assertion in a test is a test that can
  assert nothing.** `if (kept.survives)` carried the whole surviving-pick test
  in `cleanpalette.spec.js`: a mutant flipping repalette's keep flag to
  `rcPick.clear()` — the exact defect it exists to catch — SURVIVED, because on
  that fixture the picked colour did not survive the merge and the assertion
  was skipped. The same shape sat in `cloudpull.spec.js`. **Assert the
  precondition, or make BOTH branches assert.** *(09-06)*
- **A rounded height compared with `>=` can be satisfied by the very value the
  test exists to reject.** The phone test asked for `Math.round(h) >= 26`; the
  density pass leaves a button at 25.6px, which rounds to 26. Deleting both
  phone restore rules left it green. **Compare the raw number, and take the bar
  from a measurement of BOTH sides** — here 25.6 without the restore against 28
  with it. And `querySelector` is the FIRST control, not the smallest: the
  first button was 32px and the smallest 28. *(09-06)*
- **`repalette()` costs follow the DISTINCT COLOUR count, not the pixel
  count.** 0.6ms on a 160x160 of 8 colours, 1.2ms at 40 colours, 1.7ms at
  320x320, and 52.7ms on a 48x48 gradient of 2,304. I measured the gradient
  first, concluded it was too expensive per stroke, and began designing a
  debounce for a case pixel art does not have. **Measure on the artwork the
  feature is for.** *(09-06)*
- **`fitPanel` writes an inline width and `display:grid` onto `.side`** from
  inside `fitZoom`, so above 1520px the panel is two columns and a saving in
  CONTENT height divides by the column count before it becomes screen height:
  394px off the content was 96px off the screen at 1700px wide. Paper
  arithmetic about panel height overstates what anyone sees. It still pays,
  because `foldDefaults` opens as many sections as fit. *(09-06)*
- **`flex-basis:auto` on a range input makes its row TALLER.** A range keeps its
  intrinsic width as its hypothetical size, so pairing a slider into its label
  row came out THREE lines and 56px — taller than the two rows and 36px it
  replaced. `flex:1 1 0; min-width:60px` gives a 16px single-line row. Found by
  measuring the rows after the panel got taller, not by reading the rule.
  *(09-06)*

- **The base character (`kind:"ref"`) is drawn into every generated character**
  and written into its metadata, but had zero test coverage until 09-04 — which
  is how it shipped labelled `"unsorted"`. When adding a fixture, ask whether it
  covers the BASE as well as the traits. *(09-04)*
- **Settings live in the same IndexedDB store as the traits** —
  `settings.rules`, `settings.layers`, `settings.grid` and `autosave.working`.
  Anything reaching for `dbClear()` takes all four with it. The rules are the
  irrecoverable ones: traits re-import from a folder, a Never-together rule
  exists nowhere else. *(09-04)*
- **A trait id is name + layer + status, and `dbPut` overwrites.** Changing any
  of the three moves the record to a new id; if something is already there it is
  destroyed. The file has two conventions for this — RENAME (duplicateTrait,
  importProject, retagLayer, cloudPull) or REFUSE (planShelfMove) — and any new
  write path must pick one deliberately. *(09-04)*
- **Two guards that cover each other cannot be mutation-tested one at a time.**
  `idHolder` checked the self case twice; each single-line mutation SURVIVED
  because the other still caught it, which reads as missing coverage and is not.
  Remove both to see what the pair is worth — and then check which CALLER the
  behaviour actually matters to, because that is where the test belongs. *(09-04)*
- **The default grid makes most sizes unreachable.** `projectGrid` is 160, so
  snap allows only its whole divisors and multiples — 1 2 4 5 8 10 16 20 32 40
  80 160 320. Between 41 and 140 there is exactly one legal size, 80. *(09-04)*
- **`cPools()` reads the DOM, not the records.** It builds pools from the
  `#crows` `<select>` options, so anything calling it before the compose panel
  is built gets `{}` and every draw comes back empty — which reads exactly like
  "no bug here". This was recorded as a TESTING trap on 09-04 and turned out to
  be a PRODUCT bug the same day: `renderShelf` asks each tile for its share at
  line 2387 and builds the rows at 2471, so a fresh load cached an empty
  distribution and every tile read 0.00%. `distributionOf` now falls back to the
  records. **A fact you record about a test hazard is worth re-asking about the
  app.** *(09-04)*
- **The shelf only draws traits whose `layer` is in `LAYERS`.** Measured 09-04:
  a single trait on layer `hats` with the default layer list rendered
  "No traits saved yet". A fixture on a non-default layer measures nothing, and
  every chip test in the first draft of `cloudmove.spec.js` was silently
  pressing a button that did not exist. Seed on a default layer, and ASSERT the
  card is there before pressing it. *(09-04)*
- **A record key is `rowId || id`, so the SAME gesture moves it or does not,
  depending on whether the trait has been to a server.** A rename moves the key
  of a local trait and leaves a synced one's alone. Any test about a key moving
  needs both, and any fix has to be a no-op in the second case rather than a
  delete. *(09-05)*
- **Predicting a mutant will SURVIVE is worth writing down and is easy to get
  wrong.** Three predicted survivors on 09-05 all died, because the reasoning
  was about the one seeded case rather than about every save the mutant
  touches. **Ask what the mutant does on the OTHER rows in the fixture**, not
  only on the one the test is named after. *(09-05)*
- **Two guards that cover each other hide one another from mutation, again.**
  `retargetRules` keeps a rule that a rename would leave naming one trait; a
  mutant dropping that branch SURVIVED, because with only that rule in the set
  nothing was touched and the `!touched` early return kept the whole set
  anyway. The case needs a SECOND rule that genuinely moves. Same shape as the
  `idHolder` pair on 09-04 — **when a mutant survives, ask which OTHER guard
  is standing in front of it.** *(09-05)*
- **`applyRules` re-dedupes RULES on every render, so an in-memory assertion
  cannot see a duplicate that was written to the record.** A mutant keeping two
  identical rules survived a test that read `RULES` 350ms later. **Assert the
  settings record for anything about what was PERSISTED.** *(09-05)*
- **The shelf's status chip is not saveTrait.** It writes the records directly.
  A test meaning to exercise saveTrait's status path through the chip runs none
  of saveTrait at all — and passes, because nothing ran. It needs no rule
  retarget of its own: a rule key is layer/name and carries no status. *(09-05)*
- **A test can pass against the very mutant it was written to kill.** The
  retry-a-failed-send test renamed a layer and then ADDED one, so the list
  differed from the failed one and would have been re-sent by code that
  wrongly remembered the failure too. It measured nothing and the suite could
  not tell. **When pinning "this is retried", the second action must leave the
  input IDENTICAL** — otherwise the retry is indistinguishable from an ordinary
  first send. Found by mutation, 09-05. *(09-05)*
- **`traitEligible` requires status `"approved"`** when wip is not included.
  A fixture written with `status:'ok'` is invisible to every rarity function
  and every count comes back 0. *(09-04)*
- **A test written against behaviour that is already correct proves nothing
  until a mutant shows it can fail.** "The base is never part of the artwork"
  held by construction on 09-05 and had no coverage; the test for it was worth
  writing, and its mutation run — compositing the base into `traitCanvas` —
  was the whole point rather than a formality. **A green run on an unchanged
  product is indistinguishable from a test asserting nothing.** *(09-05)*
- **A mutant can be a no-op dressed as a mutation.** Sizing `traitCanvas` to
  the `#base` CANVAS survived, because `drawBase` already sizes that canvas to
  the art's own footprint. It had to read the base BITMAP to change anything.
  **When a mutant survives, check it changed something before concluding the
  test is weak.** *(09-05)*
- **A canvas round trip ZEROES the colour of a fully transparent pixel.** A
  fixture that paints RGB everywhere and varies only alpha does NOT distinguish
  an alpha count from a red count in the transparent region — they agree there.
  Measured 09-05 while predicting the wrong test would catch a red-channel
  mutant. *(09-05)*
- **A mutant must move a call past the thing it protects, not just past a few
  lines.** Moving `snapshot()` below `resizeOp` was EQUIVALENT — resizeOp is
  pure and never touches the canvas — so the snapshot still happened before
  anything changed. It had to go below `restoreImage`. *(09-05)*
- **index.html writes `—` and `×` as ESCAPE SEQUENCES in its own source** —
  the six characters, not the character. An anchor typed as the character
  matches nothing. Four attempts went into one of them on 09-05, each losing a
  backslash to a different layer. **Build such a string by concatenation
  (`'\\' + 'u00d7'`) and check it with `tools/checkanchors.cjs` before
  spending a mutation run.** *(09-05)*
- **`node tools/checkanchors.cjs <mutateNNN.cjs>`** proves every mutant anchor
  matches the tree exactly once, in a second, by stubbing the runner and
  reading the real `find` expressions. The runner only finds a bad anchor
  after the baseline and the earlier mutants have run — minutes per attempt.
  *(09-05)*
- **`distributionOf` runs on a FIXED seed**, so a sampled rarity figure is the
  same wrong-by-a-point number every time rather than a wobble somebody might
  notice. Measured 09-05: two equal-weight skins showed 49% and 51% on every
  load, against 50.2/49.8 from 40,000 fresh draws. Estimates are marked with a
  "~" and now say so in the tooltip. *(09-05)*
- **The in-app browser pane's screenshot came back blank over a shelf that was
  demonstrably painting** (8 card canvases, every pixel opaque). Playwright's
  `locator.screenshot()` captured it correctly. **When a screenshot disagrees
  with the DOM, get a capture from a different runner before believing either.**
  *(09-05)*
- **`traitEligible` opens with `if(!t||t.kind!=="trait") return false;`**, so
  every walk that goes through it is blind to base characters — which is how
  the possible-character count missed a whole factor of the draw. **Ask of any
  function that filters by kind whether the base belongs in its population.**
  Three defects from that one question on 09-05. *(09-05)*
- **`cPools()` builds a `__base` pool and `buildCombo` puts a base record
  FIRST in every combo**, so anything walking combos is walking `kind:"ref"`
  records as well as traits. `cChosen` includes the base row the same way.
  Measured 09-05, which is how the size census turned out to be receiving the
  base at two of its three call sites and dropping it internally. *(09-05)*
- **A guard the callers already make redundant can only be tested directly.**
  All three `sizeCensus` call sites filter to traits and refs before calling,
  so removing the census's own kind check changes nothing on any screen — only
  the unit test can red it. That is where a defensive check belongs, and it
  needs a test of its own or it is invisible. *(09-05)*
- **`comboStats` and `cPools` enumerate different populations.** `comboStats`
  groups by whatever `layer` string a trait carries; `cPools` only builds pools
  for layers in `LAYERS`. They agree today because every UI path keeps traits in
  real layers, but nothing checks it. *(09-04)*
- **Only `skins` is in `ALWAYS_PRESENT`.** Rules that corner the draw need a
  required layer; a rule against an optional layer is just skipped, so
  `ruleMisses` stays 0 and a fixture built to exercise it measures nothing.
  Setting `emptyChance = 0` is what forces the corner. *(09-04)*
- **Do not write test code through a shell string.** A regex written via
  `node -e` inside bash lost its backslash - `(\d+)` became `(d+)` - so a stub
  could not read the offset out of the request it was answering, paged forever,
  and asked for 25,000 downloads of 50 files. Three tests failed and none of it
  was the app. Use the Write tool for code. *(09-04)*
- **A hidden tab clamps `setTimeout` to ~1s.** Measured: `setTimeout(r,20)`
  took 953ms with `document.hidden`. Any wall-clock measurement using timer-
  based fake latency is void, and two runs taken under different visibility
  are not comparable. Measure REQUEST COUNTS and CONCURRENCY instead. *(09-04)*
- **`collection_id=eq.` contains `id=eq.`** — a substring test for "does this
  delete name a row" classified the destructive whole-collection delete as a
  targeted one, so a mutation restoring it SURVIVED. Match query parameters on
  their boundary (`[?&]id=eq.`), never by substring. *(09-04)*
- **PostgREST caps rows per response and says so in `Content-Range`.** Any
  `select` that can return many rows must page, ordered, stopping on an EMPTY
  batch - not a short one, because the server cap can be lower than the page
  size. `cloudSweep` had this right for storage; the row select did not. *(09-04)*
- **`sbUser()` returns null for two different facts** — "the server says no" and
  "could not ask it". `sbAuthState()` is the one that tells them apart; use it
  anywhere the answer decides what to SAY or whether to take something away.
  All five callers have now been read: `cloudPush` and `cloudPull` were turning
  a hiccup into "Sign in first" and are fixed; the per-trait save, the reorder
  and `cloudDropOne` were already honest and were deliberately left alone.
  `sbUser` itself is fine as a primitive. *(09-04, measured)*
- **Subagents will write into this repo.** A verifier fan-out left 13 throwaway
  spec files in `tests/` and repointed the port in `playwright.config.js`, which
  made a full run report 182 passed instead of 247. `tests/zz*.spec.js` and
  `pw.*.config.js` are gitignored now, but check `git status` after any fan-out.
  *(09-04)*
- **`index.html` is CRLF throughout.** A multi-line search built with `\n`
  matches nothing, writes the file back unchanged, and reports success. Use
  `tools/patchkit.cjs`. *(09-04)*
- **Trait mode loses up to a pixel.** `scaleInside` takes the factor through the
  canvas and back, so the trait can come out one short of the number reported.
  The canvas modes are exact. *(09-04)*

## The tools

- `node tools/patchkit.cjs` — self-tests for the patch anchoring kit
- `tools/mutrun.cjs` — the mutation runner. A mutate script declares its
  PREDICTIONS and calls `runMutants({file, spec, ntests, mutants})`; the runner
  refuses an ambiguous or unchanged anchor, requires a green baseline of the
  right size, restores by tree-hash identity, and reports an UNPREDICTED red as
  loudly as a survivor. It defaults to the repo it lives in.
- `node tools/checkanchors.cjs <mutate script>` — proves every anchor in one
  matches exactly once, in about a second, before any of them costs a suite run.
  **Run it first, every time.** Both were in a session scratchpad until 09-05,
  which is a path nobody else has.
- `node tools/mutate-patchkit.cjs` — proves that kit's tests can fail
- `tools/mutate-<spec>.cjs` — the PREDICTIONS for one spec, named after it:
  `cleanpalette`, `paneldensity`, `resizetool`. They live in the repo and not
  in a scratchpad for the reason the top of this file gives: a pointer into a
  session nobody else has is a pointer at nothing. Each carries what the
  mutants should red AND what they must not, plus a note added after the run
  saying which predictions were wrong — the predictions themselves are never
  rewritten to match their result.
- `npx playwright test` — the suite, about 4 minutes
- Throwaway browser probes go in `probe.spec.js` + `probe.config.js` on port
  5773; both are gitignored. Delete them when done.
