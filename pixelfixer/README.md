# Pixel Art Fixer, ported to JavaScript

The detector and reconstructor from
[Retro-Diffusion/pixel-art-fixer](https://github.com/Retro-Diffusion/pixel-art-fixer)
(commit `ef376e5`), ported from Python to dependency-free JavaScript so the
Fix pixels tab can run it in the browser, in a Worker, with nothing leaving
the device.

`tools/build.js` concatenates `src/pf-*.js` into `pixelfixer.bundle.js`, which
`patches/patch371-fixer.cjs` inlines into `index.html` as a
`<script type="text/plain">`. The page never executes that text; the tab reads
it and starts a Worker from it.

## What is ported, and what is not

**Both modes.** `core.detect` runs `mode:"fast"` - the three cheap detectors
(autocorrelation, run-length combs, shift self-similarity) and the size they
agree on, with the reference's calibrated early exit - and `mode:"full"`, the
reference's default, which adds the arbitration stage that resolves genuine
disagreement (`fusion`, `varcontrast`, `channels`, `reconsearch`, and the
rest of `core.py` after the early exits).

Measured 2026-09-27 by `tools/test-oracle-full.cjs` against the Python
reference's own `detect()` in both modes on 360 real trait images
(`modes/modes.jsonl`, each produced in its own python process; one node
process per image here, fast then full, the same order as the reference
run). Compared: cols, rows, step to 4 dp, consensus label.

| | images |
|---|---|
| fast exact | 359 |
| fast differs | 0 |
| full exact | 359 |
| full differs | 0 |
| errors | 0 |

The 360th image (2048x2048) is outside the input limit and is skipped by
both sides. Of the 359, full mode left through the early exit on 275; the
other 84 exercised arbitration (78 `arbitrated`, 6 with the fused fourth
voter) and all 84 agree. Before any detector result is read, the PNG decoder
is checked to hand the detector PIL's exact RGBA bytes (sha256, 360 of 360),
and the comparison is shown able to fail: one arbitration weight changed
(0.6 to 0.5) turns 2 of the 78 arbitrated images red while fast stays 78 of
78 (see the header of `tools/test-oracle-full.cjs`).

What this does not show: the population is square traits of 1024-1280px, so
other sizes and aspect ratios are unmeasured; and it compares the grid, not
reconstructed pixels in full mode.

**Cost.** Node, 6 images at a time on a 16-core machine, seconds per image:
fast mean 1.57, max 5.32 (fast runs first, so this includes JIT warm-up);
full mean 2.51, max 11.93 - 0.76 mean on images that take the early exit,
8.13 mean / 11.93 max on the 78 that arbitrate. A browser Worker will be no
faster. The Python reference's own timings, recorded in the oracle (its
driver also ran 6 at a time): fast 0.76 / 3.68, full 2.07 / 10.91.

**The tab is not changed by this.** This work did not touch the site. This
README said the Fix pixels tab offers only fast mode; that has not been
re-checked here. Whether to offer full, given up to ~12 s per image, is a
decision for whoever owns the tab, not something this port settles.
`tools/build.cjs`'s bundle header still says "FAST MODE ONLY" and is stale.

Reconstruction is `two_stage_pack`, the reference's default: quantise only to
decide which label wins each cell, then colour that cell from the **original**
pixels carrying the winning label.

## How the parity is measured

The Python reference runs locally in a venv, so every claim here is a
comparison against it rather than a reading of it.

- `tools/test-detect.js` - the detected grid, consensus and step for every
  fixture and example image against `pixelfixer.core.detect(mode="fast")`.
  **7 of 7 agree exactly**, zero step drift.
- `tools/test-oracle-full.cjs` - both modes against the reference's saved
  answers on 360 real traits, one process per image (table above).
- `tools/test-endtoend.js` - `PF.process` against `pixelfixer.api.process`,
  pixels included. **Byte-identical** on every image with a reference.
- Per-module: `test-core-array`, `test-fft`, `test-scipy`, `test-cv2`,
  `test-colorspace`, `test-quantize`, `test-runlengths`, `test-core`, with
  `mutants-*` / `mutation-*` proving those tests can fail.

### One process per image, or you measure OpenCV's RNG

The reference's k-means goes through `cv2.kmeans` on OpenCV's **process-global**
RNG, and `quantize.py` never seeds it - so the reconstruction depends on how
many random numbers were drawn before it. Measured in Python, one process:

| comparison | bytes differing of 57,408 | max | mean |
|---|---|---|---|
| 1st call vs a saved earlier run | 9,052 (15.8%) | 228 | 4.07 |
| 1st call vs 2nd call | 13,837 (24.1%) | 228 | 3.57 |
| after a `detect()` vs 1st call | 13,533 (23.6%) | 228 | 3.96 |

So "byte-identical" is only a question you can ask of two runs that have drawn
the same random numbers. Ask it that way - one image per process, through the
same entry point on both sides - and the answer is exact, which is also what
proves the port consumes the RNG in the reference's order. `test-endtoend.js`
forks per image for that reason; its first version did not, and reported three
false failures.

## Where it departs on purpose

Measured on the collection's 311 working traits at 8px cells (2026-09-18),
and changed in `two_stage_pack` by default; `PF.process(..., {reference: true})`
runs the reference's own rule and is what `tools/test-endtoend.cjs` compares.

- **Only visible pixels vote and colour.** The reference weights every
  pixel; a browser canvas hands the engine `(0,0,0)` under every alpha-0
  pixel, so half-covered edge cells came out black on 116 of 311 files
  (chains/Cross Chain: 8 of 106 opaque cells). Alpha-0 pixels now have
  zero weight in the label vote and the colour. The k-means sample still
  includes them: restricting it re-rolls 83,837 cells on 196 files with no
  directional gain.
- **The cell colour is the weighted mode of the exact visible colours
  carrying the winning label, not their mean.** The mean invented colours
  on 141 of 311 files (94,926 in total; one file went from 115 colours to
  952). The mode invents none, keeps the silhouette identical on 311 of
  311 and leaves art already on the grid byte-identical (42 of 42).
- **`PF.process` resets the k-means generator per image.** The reference
  never seeds it, so in a Worker that outlives one image the result
  depended on what ran before (8 of 9 real traits differed between two
  folder orders). A fresh engine starts at the same state, so single runs
  are unchanged and a batch now equals them.

## Where it is not faithful

- `src/pf-05-mathshim.js` - `PF.exp` and `PF.log` are the platform's, not
  numpy's, and differ in the last bit on roughly 9% and 5% of arguments. The
  last-bit-sensitive path was already handled by the autocorr port, which
  bakes the 72 comb weights as a table of numpy's exact values. Whether the
  approximation moves any **answer** is measured by `test-detect.js`: it does
  not, on any image here.
- `argsort` ties, signed zeros and FFT last bits - see the header of each
  module; each says what was measured and why it does not reach the result.

## Regenerating the fixtures

The parity dumps are ~283MB and are not in the repo. To rebuild them:

```
python -m venv pafenv && pafenv/Scripts/python -m pip install numpy scipy opencv-python-headless Pillow
pafenv/Scripts/python -m pip install -e <pixel-art-fixer>/python
pafenv/Scripts/python tools/parity-<module>.py     # writes fixtures/<module>-parity.json
node tools/test-<module>.js
```
