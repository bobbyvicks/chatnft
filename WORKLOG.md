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

- 2026-09-05 — Canvas resize said "the art is untouched" and could crop three quarters of a drawing away in silence, at both the button and the drag handles
- 2026-09-05 — The Grid download button promised "the grid size" and gave the trait's own; a 48x48 trait in a 160 collection downloaded 48x48 under that title
- 2026-09-05 — The rarity tooltip credited the weights for a number that came from running the generator; two equal-weight traits read 49% and 51% under a sentence saying each was worked out from its weight
- 2026-09-05 — "N possible characters" left the base characters out of the multiplication: three bases and two skins said 2 where the generator makes 6
- 2026-09-05 — Every size check skipped the base character, so a 200x200 base under 160x160 traits exported the whole collection at 200 with nothing said anywhere
- 2026-09-05 — "Download all" left the base character out of the zip, and dropped the status folder off any file it had to rename, so that trait came back wip
- 2026-09-05 — Renaming a trait in the editor lost its hidden state and the card came back; three of the four sites that change a trait's record key already transferred it
- 2026-09-05 — Moving a trait silently disarmed every rule that named it: a layer rename, a layer removal, a drag, a bulk move and an editor rename all changed the layer/name a rule keys on and none told the rules
- 2026-09-05 — The group heard about a layer rename, reorder, addition or removal only when somebody pressed Save to cloud; saveLayers sends the list when it actually changes and every layer message says when it did not go
- 2026-09-05 — A trait on a layer this browser had never heard of was pulled, counted and then shown nowhere and drawable by nothing; the layer list adopts the layers the records are actually on
- 2026-09-05 — One failed request for the project list threw you out of your group project and reset the layer order; wsList reports whether it could ask, and only an answer moves you
- 2026-09-04 — Save to cloud deleted a teammate's artwork out of the bucket, and the previous good copy of any trait whose upload had just failed; the sweep now has the same two guards as the row delete one line above it

## Facts worth keeping

Measured, with the date. Delete one the moment the code contradicts it.

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
  (`'\\' + 'u00d7'`) and check it with `scratchpad/checkanchors.cjs` before
  spending a mutation run.** *(09-05)*
- **`scratchpad/checkanchors.cjs <mutateNNN.cjs>`** proves every mutant anchor
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
- `node tools/mutate-patchkit.cjs` — proves that kit's tests can fail
- `npx playwright test` — the suite, about 4 minutes
- Throwaway browser probes go in `probe.spec.js` + `probe.config.js` on port
  5773; both are gitignored. Delete them when done.
