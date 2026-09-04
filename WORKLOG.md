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

Nothing measured and open right now. The four items that stood here through
early September were all shipped on 2026-09-04 and are listed under Done.

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

- 2026-09-04 — Approving a wip trait destroyed the finished one of the same name, with a success toast; both write paths now refuse a collision and name it
- 2026-09-04 — Every rarity percentage read 0.00% after a reload once a rule was saved: an EMPTY distribution was cached because the tiles run before the compose rows are built
- 2026-09-04 — The base character had NO tests at all; it shipped in every metadata file as trait_type "unsorted", the internal bucket name
- 2026-09-04 — The storage sweep pages like its sibling: it stopped on a SHORT batch and capped at 2,000 files, leaving orphans nothing would ever list
- 2026-09-04 — The cloud buttons are pinned to their functions; every cloud test called the function, so an unwired button would have gone unnoticed
- 2026-09-04 — A forbidden pair reached the collection about once in 40,000 draws on a SATISFIABLE set; the retry bound was too low, now 64
- 2026-09-04 — Two tooltips corrected: "Skins is always drawn" was false once a set could be turned off, and snap also uses divisors, not only multiples
- 2026-09-04 — "N possible characters" counts the rules now; it was a product of pool sizes that said 4 where the generator could make 3
- 2026-09-04 — The account panel compares the two collections instead of subtracting their sizes; "they match" was true of ten-vs-ten with three different
- 2026-09-04 — The upload retries a dropped file three times like the download does, and the stale check stops selecting every column
- 2026-09-04 — Save to cloud: 308 requests to 189 on a first push and 8 on a repeat; stopped emptying the server before re-uploading
- 2026-09-04 — Save/Load to cloud no longer tell a signed-in person to sign in when the network hiccups

## Facts worth keeping

Measured, with the date. Delete one the moment the code contradicts it.

- **The base character (`kind:"ref"`) is drawn into every generated character**
  and written into its metadata, but had zero test coverage until 09-04 — which
  is how it shipped labelled `"unsorted"`. When adding a fixture, ask whether it
  covers the BASE as well as the traits. *(09-04)*
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
- **`traitEligible` requires status `"approved"`** when wip is not included.
  A fixture written with `status:'ok'` is invisible to every rarity function
  and every count comes back 0. *(09-04)*
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
