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

**Fast mode only.** `core.detect` runs the three cheap detectors - autocorrelation,
run-length combs, shift self-similarity - and takes the size they agree on,
with the reference's calibrated early exit. It **throws by name** on
`mode:"full"`: the arbitration stage that resolves genuine disagreement
(`fusion`, `varcontrast`, `channels`, `reconsearch` - about 3,300 of the
reference's 5,455 lines) is not ported. The tab offers only the mode that
works, rather than a menu whose default fails.

Reconstruction is `two_stage_pack`, the reference's default: quantise only to
decide which label wins each cell, then colour that cell from the **original**
pixels carrying the winning label.

## How the parity is measured

The Python reference runs locally in a venv, so every claim here is a
comparison against it rather than a reading of it.

- `tools/test-detect.js` - the detected grid, consensus and step for every
  fixture and example image against `pixelfixer.core.detect(mode="fast")`.
  **7 of 7 agree exactly**, zero step drift.
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
