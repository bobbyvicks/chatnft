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

1. **A number the app shows that nothing measures.** Three separate defects this
   week were a confident figure computed from a formula that had drifted from
   the code it described. Ask of every number on screen: what would make this
   wrong, and would anything notice?
2. **A promise in a tooltip or button title.** They are written once and outlive
   the behaviour. Check each against what the function actually does.
3. **A control the tests always bypass.** `openAllSections` force-unfolds every
   panel, so nothing pins that a panel can be reached by clicking. The resize
   complaint of 2026-09-04 lived exactly there.
4. **`git log` for a fix that names a class.** If a fix was applied at one call
   site, grep for the other call sites. `paintTrait` had three.

## Done recently

Newest first. Delete the oldest when this passes 12.

- 2026-09-04 — A trait set (a layer) can be turned off, so nothing in it is drawn; persisted, and the cards stay on screen dimmed
- 2026-09-04 — A rule holds any number of traits and each row can be widened; `ruleId` read only the first two members, so `{a,b,c}` and `{a,b,d}` were one rule
- 2026-09-04 — `ruleMisses` no longer counts the rarity estimator's 20,000 draws as the collection's failures (was reporting 20,200 for a 1-character set)
- 2026-09-04 — Resize says what it will do before you press it; keep-shape fixed to keep the trait's shape rather than the canvas's with snap off
- 2026-09-04 — Mixed-size traits scale by whole numbers and are centred, instead of stretching to a fractional scale (48px into 160px gave pixels 3 and 4 wide)
- 2026-09-04 — The built collection is measured against the tiles and traits that came out far from their stated share are named
- 2026-09-04 — `tools/patchkit.cjs`: shared anchoring for patch scripts, so a duplicate anchor, a CRLF multi-line no-op, and a check that reads prose are all refused
- 2026-09-04 — A cornered draw is retried rather than emitted, so a forbidden pair no longer reaches the zip; `ruleMisses` is finally displayed
- 2026-09-04 — `traitChance` simulates when a rule exists, instead of printing a closed form that ignores `RULES`

## Facts worth keeping

Measured, with the date. Delete one the moment the code contradicts it.

- **The default grid makes most sizes unreachable.** `projectGrid` is 160, so
  snap allows only its whole divisors and multiples — 1 2 4 5 8 10 16 20 32 40
  80 160 320. Between 41 and 140 there is exactly one legal size, 80. *(09-04)*
- **`cPools()` reads the DOM, not `cItems`.** It builds pools from the `#crows`
  `<select>` **options**. Assigning to `cItems` and calling anything downstream
  measures nothing — it returns `{}` and every draw comes back empty, which
  reads exactly like "no bug here". *(09-04)*
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
