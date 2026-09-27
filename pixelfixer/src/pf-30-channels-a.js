/* pf-30-channels-a.js -- port of pixelfixer/channels.py, FIRST HALF:
 * reference lines 1-825 (the module docstring down to the end of
 * _evidence_refine_step). The second half (_chain_energy_z at line 829
 * onwards: estimate_period_ev, estimate_axis_ev, _exclusive_slot_occupancy,
 * estimate_axis, lattice_dp, _axis_chain, chain_to_cuts, band_profiles,
 * refine_positions_per_band, GridFit, _rasterise_cuts,
 * _index_map_from_cuts, _knot_cuts_per_band, fit_grid,
 * render_grid_overlay) lives in pf-31-channels-b.js.
 *
 * The reference's module docstring, kept because it says what every piece
 * below is for:
 *
 *   Flexible pixel-grid detection.
 *
 *   Fits a (possibly warped, non-uniform, non-square) grid to an image that
 *   is supposed to be pixel art rendered at a larger-than-native resolution.
 *
 *   1. Two edge signals per axis:
 *        E1 (edge profile)      - sum of |first difference|. Sharp (nearest
 *                                 neighbour) upscales put peaks exactly on
 *                                 the cut lines between pseudo-pixels.
 *        E2 (curvature profile) - sum of |second difference|. Smooth
 *                                 (bilinear / bicubic) upscales have *no* E1
 *                                 peaks (the ramp spreads gradient evenly
 *                                 across a cell) but the piecewise-linear
 *                                 knots at cell centres put sharp peaks in E2.
 *      Each axis independently picks whichever signal is more periodic and
 *      remembers whether it locates cuts ("cut" mode) or centres ("knot").
 *   2. Comb scoring with bias-corrected z-scores: for every candidate cell
 *      size we lay a regular comb over the profile (best phase wins) and
 *      measure how many standard errors its mean energy sits above chance,
 *      minus the inflation expected from trying many phases. This makes
 *      small and large steps statistically comparable and gives a
 *      scale-free confidence value. Profiles are max-pooled proportionally
 *      to the candidate step so wobbly (jittered) grids still register.
 *   3. Cut placement by an elastic-chain dynamic program (second half).
 *   4. Warp refinement (second half).
 *
 * WHO CALLS WHAT (read, not assumed):
 *   core.detect(mode="full") -> fusion.build_evidence(rgba, lean=True) uses
 *     axis_profiles, _jpeg_lattice_strength, _notch_jpeg, _grad_maps,
 *     _tile_peaks, _axis_spectrum, _spectral_background; its channel_matrix
 *     with ACTIVE_CHANNELS then calls _rayleigh_score (ray_e1),
 *     _tiles_ray_z (tile_e1, tile_e2) and _spectral_z (spec_e1).
 *   fusion (non-lean, and fusion.detect) also uses _PooledProfile,
 *     _comb_score, _lattice_refine, is_jpeg_suspect, is_jpeg_lattice.
 *   channels.fit_grid (second half; not called by core or api) uses
 *     _AxisEvidence and everything it reaches.
 *   estimate_period / _refine_step / _spacing_candidates are reached only
 *     through estimate_axis, which nothing in the reference calls; ported
 *     because they are in this half and pf-31 may port estimate_axis.
 *
 * DOES THIS MODULE REACH KMEANS? NO. Nothing here calls cv2.kmeans or
 * PF.kmeans. The `quantized` argument of _grad_maps / axis_profiles is made
 * by the CALLER (fusion.build_evidence and fit_grid call kmeans_quantize);
 * this module only consumes it. So its results depend on OpenCV's
 * process-global RNG only through that argument.
 *
 * ---------------------------------------------------------------------------
 * PORT NOTES - each one MEASURED against numpy 2.5.3 / scipy 1.18.1 /
 * python 3.12.10 in the reference venv (tools/parity-channels-a.py +
 * tools/test-channels-a.cjs), not inferred:
 *
 *  dtypes. _flatten_channels is float32 (rgba.astype(np.float32); alpha
 *  premultiply a/255.0 and v*a are float32 ops under NEP 50), and so is
 *  every gradient/curvature map built from it: (a-b)**2 summed over the
 *  channel axis left to right from 0, np.sqrt in float32. The PROFILES are
 *  float64 only because axis_profiles assigns those float32 sums into
 *  np.zeros(...) arrays. _tile_peaks' prof and _axis_spectrum's prof stay
 *  float32 (np.percentile / .mean() in float32); seg = prof * np.hanning()
 *  is float64.
 *
 *  Reduction ORDER follows memory layout (PF.sumAxes' model): dx.sum(axis=0)
 *  on a C array is a SEQUENTIAL row accumulation, dy.sum(axis=1) is
 *  numpy's PAIRWISE sum per row; in _tile_peaks / _axis_spectrum the
 *  axis=1 case sums a TRANSPOSED view, so there the reduced axis is the
 *  contiguous one and the sum is pairwise.
 *
 *  Python round(x, 4) depends on the TYPE of x. On a Python float it is
 *  CPython's correctly rounded decimal round (PF.pyRound); on an np.float64
 *  it is numpy's rint(x * 1e4) / 1e4. They differ on 6603 of 180000
 *  measured values - and systematically on step/2 of a 4-decimal step,
 *  which is exactly what estimate_period's divisor loop feeds back in. The
 *  reference hands _refine_step both kinds (np.float64 from steps[idx],
 *  Python floats from _spacing_candidates, step/div inheriting its
 *  numerator's type), so the step's type travels with it here as an
 *  explicit `isNp` flag: _refine_step and _evidence_refine_step take it as
 *  a last argument and return it as element [3] of the tuple.
 *
 *  Python set iteration order. `{round(step, 4), round(refined, 4)}` is
 *  iterated and the FIRST strictly-best score wins, so on a score tie the
 *  set's hash-table order picks the step. pySetIter reproduces CPython
 *  3.12's float hash (_Py_HashDouble) and set_add_entry probing for the
 *  8-slot table a small set lives in.
 *
 *  np.log(len(phases)) in _comb_score's multiple-phase penalty: numpy calls
 *  the UCRT log, which differs from Math.log on k = 3, 48, 74, 185, 196, 299
 *  of 2..300 (11 of 2..512: also 308, 334, 343, 346, 362 - re-measured by
 *  the verifier, which found the earlier "5 of 2..300" list missed 299).
 *  The comb's phase count is ceil(step/0.25), so the reference's
 *  own values for k = 2..512 (steps up to 128 px) are baked below.
 *
 *  Transcendentals that cannot be exact: np.exp of an imaginary array
 *  (UCRT cos/sin), np.angle (UCRT atan2), np.log10 (UCRT log10) and the
 *  numpy scalar h.sum() ** 2 (UCRT pow, which differs from x*x on 100 of
 *  200000 measured values). They all go through C._libm, whose default is
 *  Math.*; tools/test-channels-a.cjs swaps in numpy's own outputs for the
 *  exact arguments this code asks for, and with that swap every channel
 *  value is bit-exact - so the remaining difference is the C runtime's
 *  last bit, measured and printed by that test, not the port's logic.
 *  np.hanning (Math.cos in PF.hanning) and np.fft.rfft (PF.rfft,
 *  radix-2/Bluestein vs pocketfft) make _axis_spectrum approximate for the
 *  same kind of reason; see the test's printed bound.
 *
 *  theta = imag(2j*np.pi*p/step) is (2*pi*p) * (1/step): numpy divides a
 *  complex array by a real with a reciprocal multiply (pf-06-linalg.js,
 *  PF.complexDivReal). h * ph is the full complex product h*c - 0*s,
 *  h*s + 0*c, and the sums/abs are PF.complexSum / PF.cabs.
 *
 *  Python float % float and numpy float64 % are floor-mod (sign of the
 *  divisor): pyMod, never JS %.
 *
 *  np.argsort(-x) at estimate_period / _spectral_candidates /
 *  sweep_candidates is numpy's DEFAULT kind, which on the reference machine
 *  runs x86-simd-sort's AVX2 argsort (pf-02-scipy.js argsortNumpy, measured
 *  there permutation-for-permutation); the test compares it with numpy's
 *  permutation at every one of these call sites.
 *
 * ---------------------------------------------------------------------------
 * MEASURED PARITY (tools/test-channels-a.cjs, 2026-09-27; the test is the
 * authority, this is a copy of its run so a reader sees its shape). Inputs
 * come from the reference's own call paths on tiny/small/mid + the four
 * examples (one process per image) plus a synthetic set:
 *   - no transcendental involved (profiles, maps, tiles, normalise, notch,
 *     jpeg z, pooled profiles, comb scores, lattice fits, refine, argsort
 *     permutations, hash / set order / round): BIT-EXACT, 3853 comparisons
 *     over 406492 values.
 *   - transcendental-dependent (Rayleigh, tile, spectral channels, the
 *     channel matrix core.detect reads, _AxisEvidence.score / _ray_quick /
 *     candidate lists, _evidence_refine_step on fit_grid's own calls,
 *     estimate_period, _refine_step): BIT-EXACT, 699 comparisons over 31312
 *     values, once numpy's own cos/sin/atan2/log10/pow outputs are
 *     injected; with the production Math.* the same values differ by at
 *     most 83 ulp (max |diff| 1.4e-14), and every candidate list is
 *     identical.
 *   - the full JS chain from rgba + quantized (PF.rfft and PF.hanning in
 *     the spectrum): power spectra within 4.3e-15 relative, channel values
 *     within 3.6e-15 absolute, and core's fused "fu" step identical on 7/7.
 *   - negative controls: every switch in C._semantics goes red somewhere;
 *     npRoundOnNpScalars only on the synthetic set. The set order is not
 *     academic: of the 422 _evidence_refine_step calls fit_grid makes on
 *     the 7 images, 41 have the two set members scoring EXACTLY alike - all
 *     41 via _spectral_z, which is piecewise constant in the step (nearest
 *     bin) - and in 21 of them the hash order visits the refined step first.
 *
 * ---------------------------------------------------------------------------
 * API - PF.channels.<name>, the reference's names (shared with
 * pf-31-channels-b.js, which adds the second half to the same object):
 *
 *   _flatten_channels(rgba) -> {d: Float32Array, w, h, cn}
 *   axis_profiles(rgba) -> {e1x, e1y, e2x, e2y} (Float64Array)
 *   _normalise(profile) -> Float64Array
 *   _PooledProfile (class): new _PooledProfile(profile); .variants[p] =
 *       [v, mean, std] for p in POOLS; .for_step(step) -> [[v, mean, std]...]
 *   _comb_score(pp, step, phase_res=0.25) -> [score, phase]
 *   _lattice_refine_peaks(peaks, h, s0, n_iters=4) -> number
 *   _lattice_refine(profile, s0, n_iters=4) -> number
 *   _rayleigh_score(profile, step) -> [z, phase]
 *   _refine_step(pp, profile, step, stepIsNp) -> [step, score, phase, isNp]
 *   _spacing_candidates(profile, min_step, max_step) -> number[]
 *   estimate_period(profile, min_step=2, max_step=null, harmonic_tol=0.88)
 *       -> [step|null, score, phase, stepIsNp]
 *   is_jpeg_suspect(step) -> bool;  is_jpeg_lattice(step, phase) -> bool
 *   _jpeg_lattice_strength(profile) -> number
 *   _notch_jpeg(profile, width=1.0) -> Float64Array (the SAME object when
 *       nothing is notched, like the reference)
 *   _grad_maps(rgba, quantized) -> {dqx, dqy, cox, coy}, each
 *       {d: Float32Array, w, h}
 *   _tile_peaks(dmap, axis, offset=1, max_tiles=360)
 *       -> [[positions Float64Array, heights Float64Array, extent], ...]
 *   _tiles_ray_z(tiles, step) -> number
 *   _tile_spacing_modes(tiles, min_step, max_step, top=3) -> number[]
 *   _axis_spectrum(dmaps, axis, row_group=4, max_win=1024) -> [freqs, power]
 *   _spectral_background(power) -> Float64Array
 *   _spectral_z(freqs, power, bg, step) -> number
 *   _spectral_candidates(freqs, power, bg, min_step, max_step, top=4)
 *   _AxisEvidence (class): new _AxisEvidence(profile, bands, tiles,
 *       spectrum, extra_z, extra_candidates); bands is null, a {d, w, h}
 *       matrix (row b = band b, as band_profiles returns) or an array of
 *       Float64Array rows; spectrum is [freqs, power] or null. Methods
 *       score(step) -> [score, phase], candidate_steps(min, max),
 *       _ray_quick(step), sweep_candidates(min, max, top=6), refine(step).
 *       Every candidate_steps() entry is a Python float in the reference.
 *   _evidence_refine_step(ev, step, stepIsNp) -> [step, score, phase, isNp]
 *   Helpers for pf-31 and the tests: pyMod, pyMax, pyMin, round4(x, isNp),
 *   pySetIter, pyHashBits, npLogInt, argsortNeg, _libm, _LIBM_MATH,
 *   _semantics, _latticeRefineEx.
 *
 * Python tuples are JS arrays, None is null, an image is {d, w, h, cn}
 * (interleaved), 2-D float data is {d, w, h}. No imports, no exports,
 * ES2017, browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});
  var C = PF.channels || (PF.channels = {});
  var fr = Math.fround;

  var TWO_PI = 2 * Math.PI;          // 2 * np.pi: doubling is exact
  var JPEG_BASES = [8.0, 4.0, 8.0 / 3.0, 16.0, 24.0];

  function check(cond, msg) { if (!cond) throw new Error('PF.channels: ' + msg); }

  // Negative-control switches for tools/test-channels-a.cjs. Each flips a
  // measured semantic to its "obvious" reading so the test can prove it is
  // able to fail; production leaves every one true.
  var SEM = {
    npRoundOnNpScalars: true,   // round(np.float64, 4) = rint(x*1e4)/1e4
    pySetOrder: true,           // iterate {a, b} in CPython hash order
    logTable: true,             // np.log(k) from the baked numpy table
    thetaReciprocal: true,      // theta = (2*pi*p) * (1/step)
    layoutSumOrder: true        // axis-0 sum of a C array is sequential
  };
  C._semantics = SEM;

  /* ------------------------------------------------------------------ *
   * libm: every transcendental call goes through C._libm so a test can
   * substitute numpy's own outputs (see the header). The default is the
   * platform's Math, which is what runs in production.
   * ------------------------------------------------------------------ */
  function thetaOf(p, inv, step) {
    return SEM.thetaReciprocal ? (TWO_PI * p) * inv : (TWO_PI * p) / step;
  }
  C._theta = function (p, step) { return thetaOf(p, 1.0 / step, step); };

  var LIBM_MATH = {
    name: 'math',
    // np.exp(2j * np.pi * p / step) for a float64 array p -> {c, s}
    phasors: function (p, step) {
      var n = p.length, c = new Float64Array(n), s = new Float64Array(n);
      var inv = 1.0 / step, i, t;
      for (i = 0; i < n; i++) {
        t = thetaOf(p[i], inv, step);
        c[i] = Math.cos(t);
        s[i] = Math.sin(t);
      }
      return { c: c, s: s };
    },
    atan2: function (y, x) { return Math.atan2(y, x); },   // np.angle(z)
    log10: function (x) { return Math.log10(x); },
    pow2: function (x) { return x * x; }                    // np.float64 ** 2
  };
  C._LIBM_MATH = LIBM_MATH;
  C._libm = LIBM_MATH;

  /* np.log(k) for k = 2..512, the reference's own values (numpy 2.5.3 ->
   * UCRT log), little-endian float64 hex. Math.log differs on 11 of them
   * (3, 48, 74, 185, 196, 299, 308, 334, 343, 346, 362). */
  var NP_LOG_HEX =
  'ef39fafe422ee63f0b03ad7aea93f13fef39fafe422ef63f338dedf741c0f93f02202afa0babfc3f575a32ae7222ff3f' +
  '73ab3b3fb2a200400b03ad7aea9301401655b5bbb16b02404c377fb7e32e03407d9ed3bc16e10340518c312b04850440' +
  'a7bbd716ca1c05401f484d3916aa0540ef39fafe422e06407a7ffac16baa064086916b3a7b1f07402cb30406368e0740' +
  '91e3737b42f70740b1ae6f942e5b0840c8c53d7774ba0840f0b3d1fd7d150940f92c927ca76c0940338dedf741c00940' +
  'cd1af0ea94100a40908403b8df5d0a40234a96d65aa80a401ffecdcb38f00a409bd60bf9a6350b405a2b9148ce780b40' +
  '6bc8b8bed3b90b40d1b8d5f4d8f80b40f60db981fc350c40c5f30f535a710c4002202afa0bab0c40bdc73aee28e30c40' +
  'a841c3c5c6190d40d60d8868f94e0d400d72323bd3820d404eac8e4565b50d402d3d2e54bfe60d4011ec1416f0160e40' +
  '4354fc3605460e40a4c9a3760b740e406c4290bd0ea10e40b6f0902f1acd0e4075bb503c38f80e40575a32ae72220f40' +
  'af1bacb7d24b0f40ff0051ff60740f4049a9aeaa259c0f40ab3c226828c30f400c13c27770e90f40f3feba5982071040' +
  '506c2acbf5191040599aada1152c10404d46c6c5e43d10407929c7f9654f10408b3265dc9b6010400d6c12eb88711040' +
  'ebdc27842f8210401b18e3e89192104073ab3b3fb2a210407529949392b21040a6234ada34c210402d1128f19ad11040' +
  '39cebba0c6e01040bb1a949db9ef10402141678975fe1040c9d624f4fb0c11403f57f45c4e1b1140e62f22336e291140' +
  '1dabfcd65c3711405c07a29a1b45114012e8c0c2ab5211403c324c870e601140294e2314456d114073b1af89507a1140' +
  '448078fd318711400b03ad7aea931140659da6027ba0114082e4628de4ac1140d465f60928b911400aa3f85e46c51140' +
  '46bde96a40d11140d23f920417dd114060715dfbcae81140f68aae175df41140102c311bceff1140be5c25c11e0b1240' +
  '7468a7be4f16124070d6f3c26121124099bfa777552c1240e3bcfd802b371240f8a4077ee4411240f84be508814c1240' +
  '6a74f8b6015712402b1d1619676112401655b5bbb16b124031ba1b27e2751240bdc787dff87f1240ec135965f6891240' +
  'e29b3635db931240a53a33c8a79d12409365f0935ca712405b47bf0afab01240c450c09b80ba1240065501b3f0c31240' +
  '31469ab94acd1240a1a4c8158fd612408db3092bbedf12405c83335ad8e8124097e18c01def11240453de47ccffa1240' +
  '8b8da525ad031340ae47ef52770c1340b770a6592e15134053d6898cd21d1340c979443c642613404c377fb7e32e1340' +
  '4bb3f14a51371340e9967241ad3f1340292407e4f7471340e729f27931501340595fc2485a581340422e609472601340' +
  'b1f21a9f7a681340cbb6b5a972701340b37073f35a78134062c822ba33801340e46a293afd8713402cf08eaeb78f1340' +
  '6b580751639713409525fd59009f134077159b008fa613409d80d57a0fae1340f96173fd81b51340120b17bce6bc1340' +
  '5e8846e93dc413401eb973b687cb1340071e0454c4d21340ce6158f1f3d913407d9ed3bc16e113405c62e2e32ce81340' +
  '2477019336ef1340ee6dc4f533f613405af2db3625fd13402de71b800a0414409a4e81fae30a1440530038ceb1111440' +
  '502fa0227418144042c1531e2b1f14407a792be7d6251440faf843a2772c1440679502740d3314405c081a8098391440' +
  'b1f88ee918401440185fbcd28e46144082c7575dfa4c14408e7075aa5b531440484a8cdab25914407bd5790d00601440' +
  'a3e4856243661440b53f66f87c6c1440c02b42edac7214405fd7b55ed378144012add569f07e1440518c312b04851440' +
  '48ead7be0e8b14401cdb5840109114408404c9ca08971440877ac478f89c144010877164dfa21440305d83a7bda81440' +
  '9db83c5b93ae14403b6a729860b4144034d28d7725ba144058488f10e2bf14404e73107b96c514402b8f46ce42cb1440' +
  'fca30421e7d01440d0acbd8983d61440b2af861e18dc14402bc718f5a4e11440ae1dd3222ae7144063dbbcbca7ec1440' +
  'd70687d71df21440de588e878cf714402104dde0f3fc1440ba702cf75302154036ece6ddac071540624e29a8fe0c1540' +
  '3693c46849121540386a3f328d171540a7bbd716ca1c1540c1238428002215406964f5782f27154086cd9719582c1540' +
  '539c941b7a311540f051d38f953615406f01fb86aa3b1540a5957311b9401540fb0e673fc145154074b9c220c34a1540' +
  '2a5b38c5be4f15407d5b3f3cb454154020e31595a35915403cf5c1de8c5e1540e381122870631540fb71a07f4d681540' +
  'd1accff3246d15408c17d092f6711540998e9e6ac276154055d90589887b154002989ffb48801540432cd5cf03851540' +
  '449ce012b9891540a970cdd1688e15406f8d791913931540e50596f6b7971540dfeba775579c1540361a09a3f1a01540' +
  'cbfae88a86a515401f484d3916aa15409aca12baa0ae1540ab11ee1826b31540d5286c61a6b71540c348f39e21bc1540' +
  '8384c3dc97c01540fe72f72509c51540c9d4848575c915405f363d06ddcd1540ec8eceb23fd21540a8dbc3959dd61540' +
  'f5b785b9f6da154036f25a284bdf1540911d69ec9ae315409a20b50fe6e7154007c1239c2cec15407e2c7a9b6ef01540' +
  '8a7e5e17acf41540cd435819e5f8154089fad0aa19fd1540799014d54901164027de51a175051640bf1f9b189d091640' +
  '676be643c00d164044250e2cdf1116402471d1d9f9151640e2a1d455101a164097a6a1a8221e16409e75a8da30221640' +
  '80753ff43a261640cce3a3fd402a1640ef39fafe422e164011904e004132164009fe94093b36164074faa922313a1640' +
  'f1b75253233e164095803da311421640a00f021afc45164081e921bfe249164022b2089ac54d1640a2810cb2a4511640' +
  '6a376e0e80551640b9cb59b657591640a99fe6b02b5d1640b7cb1705fc601640d36cdcb9c864164006f00fd691681640' +
  'b55c7a60576c1640819dd05f19701640dbc7b4dad77316404062b6d79277164036a9525d4a7b16400bd3f471fe7e1640' +
  '5052f61baf82164032179f615c8616409ccf2549068a16403a26b0d8ac8d16405c00531650911640beba1208f0941640' +
  '4565e3b38c981640a6fda81f269c16400ca93751bc9f1640bdec534e4fa31640bbe5b21cdfa616407a7ffac16baa1640' +
  '9aa9c143f5ad1640bb8c90a77bb1164062bee0f2feb4164005741d2b7fb816402cb5a355fcbb1640c68cc27776bf1640' +
  '9839bb96edc21640ee5dc1b761c616406b2efbdfd2c9164021a0811441cd1640d895605aacd016409e0c97b614d41640' +
  '9147172e7ad71640f3fac6c5dcda16408e767f823cde16405acf0d6999e116408008337ef3e41640ac3ba4c64ae81640' +
  'b7c00a479feb1640af540404f1ee16403840230240f21640597dee458cf51640a5dce1d3d5f81640cb296eb01cfc1640' +
  '9a4ff9df60ff1640687bde66a2021740ef3f6e49e10517409cb7ee8b1d09174056a69b32570c1740b59aa6418e0f1740' +
  'c00e37bdc21217401e886aa9f4151740ccb7540a241917405399ffe3501c174086916b3a7b1f1740c28c8f11a3221740' +
  'b91c596dc8251740c995ac51eb281740e12b65c20b2c1740f10e55c3292f1740f386455845321740800ff7845e351740' +
  'fd72214d7538174064e573b4893b17409d1e95be9b3e17407a74236fab41174050f4b4c9b8441740267cd7d1c3471740' +
  '8fd3108bcc4a17401ec4def8d24d17408631b71ed750174053310800d9531740592238a0d8561740c1c3a502d6591740' +
  'c24ba82ad15c1740087e8f1bca5f1740c5c1a3d8c062174075372665b56517404ece50c4a7681740605956f9976b1740' +
  '6da46207866e174070889af171711740dbff1bbb5b7417408c3afe664377174079b151f8287a1740163a20720c7d1740' +
  '72196dd7ed7f17401517352bcd821740968f6e70aa851740ed8609aa858817408cbaefda5e8b17402cb30406368e1740' +
  '69d6252e0b9117400e782a56de9317403aebe380af96174033931db17e9917400df49ce94b9c174013c3212d179f1740' +
  'f0f6657ee0a11740acd71de0a7a41740690ef8546da71740ebb49ddf30aa1740eb64b282f2ac17403947d440b2af1740' +
  'a1229c1c70b21740a96a9d182cb51740154e6637e6b7174038c57f7b9eba17401ca06de754bd17407394ae7d09c01740' +
  '5f4bbc40bcc21740056f0b336dc51740f8b70b571cc8174075fa27afc9ca17407433c63d75cd1740899547051fd01740' +
  'a0950808c7d217408ef760486dd5174074daa3c811d81740fdc41f8bb4da174076b11e9255dd1740b519e6dff4df1740' +
  'e502b77692e217402509ce582ee51740ff6a6388c8e71740c014ab0761ea1740a7abd4d8f7ec1740f2980bfe8cef1740' +
  'c414777920f21740ef303a4db2f4174091e3737b42f717409c113f06d1f917402e99b2ef5dfc1740d55be139e9fe1740' +
  'ad48dae6720118405766a8f8fa031840e3dc52718106184084ffdc52060918403956469f890b18404ba78a580b0e1840' +
  'b200a2808b1018405fc180190a13184068a21725871518400fc053a502181840bba21e9c7c1a1840ce475e0bf51c1840' +
  '5e2af5f46b1f1840d54bc25ae12118407a3ca13e55241840db236aa2c726184021c9f18738291840469b09f1a72b1840' +
  '39b97fdf152e1840e0f91e55823018400ff4ae53ed3218405706f4dc56351840ca5eaff2be371840a3029f96253a1840' +
  'd7d57dca8a3c184091a20390ee3e18409320e5e85041184089fcd3d6b143184040df7e5b11461840c67491786f481840' +
  '8173b42fcc4a18401fa38d82274d184082e3bf72814f18408e33eb01da511840e7b7ac313154184098c19e0387561840' +
  'acd45879db581840b1ae6f942e5b1840234d7556805d1840d0f3f8c0d05f18401d3387d51f62184043eea9956d641840' +
  '7461e802ba661840f027c71e056918400942c8ea4e6b1840191b6b68976d18405d8f2c99de6f1840cdf1867e24721840' +
  'd811f219697418401641e36cac761840e958cd78ee7818400bc0203f2f7b184013704bc16e7d1840e0fab800ad7f1840' +
  '0190d2fee98118400502ffbc25841840c1cba23c608618408315207f998818403cbad685d18a1840984c2452088d1840' +
  '071c64e53d8f1840bc39ef40729118409d7d1c66a5931840228b4056d79518402ad6ad1208981840c3a7b49c379a1840' +
  'e622a3f5659c18401f49c51e939e184032ff6419bfa01840ae11cae6e9a2184074393a8813a518403020f9fe3ba71840' +
  'cf64484c63a91840db9f677189ab1840d867946faead18408c550a48d2af1840450803fcf4b11840072ab68c16b41840' +
  'bc7359fb36b6184050b1204956b81840c8c53d7774ba184045afe08691bc18400b8b3779adbe184070996e4fc8c01840' +
  'c741b00ae2c218403e1625acfac41840b6d7f33412c718408f7941a628c91840652531013ecb1840cc3ee44652cd1840' +
  'fd667a7865cf18407880119777d11840a5b2c5a388d318405f6db19f98d51840826ced8ba7d7184069bb9069b5d91840' +
  '62b8b039c2db1840211861fdcddd184020e9b3b5d8df1840ff96b963e2e11840d5ed8008ebe318407e1d17a5f2e51840' +
  'dcbc873af9e7184014cddcc9fee91840bebc1e5403ec1840126b54da06ee18400a2b835d09f018407cc6aede0af21840' +
  '2d81d95e0bf41840';
  var NP_LOG = (function () {
    var n = NP_LOG_HEX.length / 16, out = new Float64Array(n), dv = new DataView(new ArrayBuffer(8)), i, b;
    for (i = 0; i < n; i++) {
      for (b = 0; b < 8; b++) dv.setUint8(b, parseInt(NP_LOG_HEX.substr(i * 16 + b * 2, 2), 16));
      out[i] = dv.getFloat64(0, true);
    }
    return out;
  })();
  function npLogInt(k) {
    // k >= 2 always (max(len(phases), 2)); beyond 512 (steps > 128 px, which
    // no reference call site asks for) the platform log is the best available
    if (SEM.logTable && k >= 2 && k - 2 < NP_LOG.length) return NP_LOG[k - 2];
    return Math.log(k);
  }
  C.npLogInt = npLogInt;

  /* ------------------------------------------------------------------ *
   * Python scalar semantics
   * ------------------------------------------------------------------ */

  // float % float (CPython float_rem == numpy npy_divmod's mod): fmod, then
  // moved to the divisor's sign; a zero remainder takes the divisor's sign.
  function pyMod(x, y) {
    var m = x % y;
    if (m) {
      if ((y < 0) !== (m < 0)) m += y;
    } else {
      m = (y < 0) ? -0 : 0;
    }
    return m;
  }
  C.pyMod = pyMod;

  // Python's max(a, b) / min(a, b): the FIRST argument is kept unless the
  // second compares strictly greater (less) - which also fixes which signed
  // zero comes back.
  function pyMax(a, b) { return (b > a) ? b : a; }
  function pyMin(a, b) { return (b < a) ? b : a; }
  C.pyMax = pyMax;
  C.pyMin = pyMin;

  function round4(x, isNp) {
    if (isNp && SEM.npRoundOnNpScalars) return PF.rint(x * 10000.0) / 10000.0;
    return PF.pyRound(x, 4);
  }
  C.round4 = round4;

  /* CPython 3.12 hash(float) as the 64 bits (least significant first) of
   * the size_t that set_add_entry masks. _Py_HashDouble reduces |v| modulo
   * the Mersenne prime P = 2^61 - 1; with |v| = M * 2^E (M the integer
   * mantissa, < 2^53) and 2^61 == 1 (mod P), that is M rotated left by
   * (E mod 61) inside 61 bits (M < 2^53 can never rotate to all-ones == P).
   * A negative v negates the hash (two's complement in 64 bits) and a hash
   * of -1 becomes -2. Bits, not BigInt: this file targets ES2017. */
  var hdv = new DataView(new ArrayBuffer(8));
  function pyHashBits(v) {
    var out = new Uint8Array(64), m = new Uint8Array(61), i;
    check(v === v, 'pyHashBits: NaN hashes by identity in CPython; not modelled');
    check(isFinite(v), 'pyHashBits: hash of an infinite float is not modelled');
    if (v === 0) return out;
    hdv.setFloat64(0, Math.abs(v));
    var hi = hdv.getUint32(0), lo = hdv.getUint32(4);
    var be = (hi >>> 20) & 0x7ff, E;
    for (i = 0; i < 32; i++) m[i] = (lo >>> i) & 1;
    for (i = 0; i < 20; i++) m[32 + i] = (hi >>> i) & 1;
    if (be === 0) E = -1074;
    else { m[52] = 1; E = be - 1075; }
    var r = ((E % 61) + 61) % 61;
    for (i = 0; i < 61; i++) out[(i + r) % 61] = m[i];
    if (v < 0) {
      var carry = 1, allOnes = true, b;
      for (i = 0; i < 64; i++) {                      // -x = ~x + 1 in 64 bits
        b = (out[i] ^ 1) + carry;
        out[i] = b & 1;
        carry = b >> 1;
        if (!out[i]) allOnes = false;
      }
      if (allOnes) out[0] = 0;                         // -1 -> -2
    }
    return out;
  }
  C.pyHashBits = pyHashBits;

  /* Iteration order of a Python set built by inserting vals[0], vals[1], ...
   * (a set display or .add() calls). Returns the indices of the entries the
   * set KEEPS (the first of equal values) in the order `for s in set` visits
   * them. CPython setobject.c: an 8-slot table (PySet_MINSIZE), start at
   * hash & 7, and - because i + LINEAR_PROBES(9) > mask - no linear probes:
   * perturb >>= 5; i = (i*5 + 1 + perturb) & mask. Iteration walks the
   * slots in index order. Up to 4 entries (the 5th resizes the table). */
  function pySetIter(vals) {
    var table = [-1, -1, -1, -1, -1, -1, -1, -1], used = 0, i, j, dup;
    for (i = 0; i < vals.length; i++) {
      dup = false;
      for (j = 0; j < 8; j++) if (table[j] >= 0 && vals[table[j]] === vals[i]) { dup = true; break; }
      if (dup) continue;
      check(used < 4, 'pySetIter: more than 4 entries would resize the table; not modelled');
      var hb = pyHashBits(vals[i]);
      var idx = hb[0] | (hb[1] << 1) | (hb[2] << 2), shift = 0;
      while (table[idx] >= 0) {
        shift += 5;                                    // perturb >>= PERTURB_SHIFT
        var pl = 0;                                    // only its low 3 bits survive & 7
        for (var t = 0; t < 3; t++) if (shift + t < 64) pl |= hb[shift + t] << t;
        idx = (idx * 5 + 1 + pl) & 7;
      }
      table[idx] = i;
      used++;
    }
    var out = [];
    for (j = 0; j < 8; j++) if (table[j] >= 0) out.push(table[j]);
    if (!SEM.pySetOrder) out.sort(function (a, b) { return a - b; });   // control: insertion order
    return out;
  }
  C.pySetIter = pySetIter;

  // np.argsort(-x), numpy's default kind (see the header).
  function argsortNeg(x) {
    var n = x.length, neg = new Float64Array(n), i;
    for (i = 0; i < n; i++) neg[i] = -x[i];
    return PF._scipyInternals.argsortNumpy(neg);
  }
  C.argsortNeg = argsortNeg;

  function meanOrNaN(a) { return a.length ? PF.mean(a) : NaN; }
  function stdOrNaN(a) { return a.length ? PF.std(a) : NaN; }

  function sumSq(h) {
    var n = h.length, sq = new Float64Array(n), i;
    for (i = 0; i < n; i++) sq[i] = h[i] * h[i];      // (h ** 2): np.square
    return PF.sum(sq);
  }

  function uniqueCount(vals) {
    if (!vals.length) return 0;
    return PF.unique(Float64Array.from(vals)).values.length;
  }

  // ---------------------------------------------------------------- profiles

  /* float32 (H, W, C) with alpha premultiplied and kept as a channel. */
  function _flatten_channels(rgba) {
    var w = rgba.w | 0, h = rgba.h | 0, cn = rgba.cn || 1, n = w * h, src = rgba.d, i, c;
    check(src && src.length === n * cn, '_flatten_channels: data length ' + (src ? src.length : src) + ' != w*h*cn');
    var out = new Float32Array(n * cn);
    if (cn === 4) {
      for (i = 0; i < n; i++) {
        var a = fr(src[i * 4 + 3] / 255.0);              // img[:, :, 3:4] / 255.0 (float32)
        out[i * 4] = fr(src[i * 4] * a);
        out[i * 4 + 1] = fr(src[i * 4 + 1] * a);
        out[i * 4 + 2] = fr(src[i * 4 + 2] * a);
        out[i * 4 + 3] = src[i * 4 + 3];
      }
    } else {
      for (c = 0; c < n * cn; c++) out[c] = src[c];
    }
    return { d: out, w: w, h: h, cn: cn };
  }

  // sqrt(sum_c (a_c - b_c)^2) in float32, channels summed left to right from 0
  function d1mag(d, p, q, cn) {
    var acc = 0, t, c;
    for (c = 0; c < cn; c++) { t = fr(d[p + c] - d[q + c]); acc = fr(acc + fr(t * t)); }
    return fr(Math.sqrt(acc));
  }
  // sqrt(sum_c (a_c - 2*b_c + c_c)^2) in float32: (a - 2*b) + c
  function d2mag(d, pa, pb, pc, cn) {
    var acc = 0, t, c;
    for (c = 0; c < cn; c++) {
      t = fr(fr(d[pa + c] - fr(2 * d[pb + c])) + d[pc + c]);
      acc = fr(acc + fr(t * t));
    }
    return fr(Math.sqrt(acc));
  }

  /* sum over axis 0 of a C-contiguous (rows, cols) float32 map held as a
   * function of (r, c): numpy accumulates row by row (SEQUENTIAL). The
   * control switch replaces it with a per-column pairwise sum. */
  function colSumsF32(rows, cols, at) {
    var out = new Float64Array(cols), r, c;
    if (SEM.layoutSumOrder) {
      var acc = new Float32Array(cols);
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) acc[c] = fr(acc[c] + at(r, c));
      for (c = 0; c < cols; c++) out[c] = acc[c];
    } else {
      var col = new Float32Array(rows);
      for (c = 0; c < cols; c++) {
        for (r = 0; r < rows; r++) col[r] = at(r, c);
        out[c] = PF.pairwiseSum(col, 0, rows, true);
      }
    }
    return out;
  }

  /* Compute E1 (edge) and E2 (curvature) profiles for both axes.
   *   e1x: (W+1,) energy of a vertical cut at x  (cut positions 0..W)
   *   e1y: (H+1,)
   *   e2x: (W,)   curvature energy at column x   (pixel positions)
   *   e2y: (H,) */
  function axis_profiles(rgba) {
    var img = _flatten_channels(rgba), h = img.h, w = img.w, cn = img.cn, d = img.d;
    var e1x = new Float64Array(w + 1), e1y = new Float64Array(h + 1);
    var e2x = new Float64Array(w), e2y = new Float64Array(h);
    var x, y, i, row;
    if (w > 1) {
      // dx.sum(axis=0)
      var sx = colSumsF32(h, w - 1, function (r, c) { return d1mag(d, (r * w + c + 1) * cn, (r * w + c) * cn, cn); });
      for (x = 0; x < w - 1; x++) e1x[x + 1] = sx[x];
    }
    if (h > 1) {
      // dy.sum(axis=1): pairwise over each row of dy
      row = new Float32Array(w);
      for (y = 0; y < h - 1; y++) {
        for (x = 0; x < w; x++) row[x] = d1mag(d, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
        e1y[y + 1] = PF.pairwiseSum(row, 0, w, true);
      }
    }
    var top = 1.0, mx;
    if (w > 1) { mx = -Infinity; for (i = 1; i < w; i++) if (e1x[i] > mx) mx = e1x[i]; } else mx = 0.0;
    var my;
    if (h > 1) { my = -Infinity; for (i = 1; i < h; i++) if (e1y[i] > my) my = e1y[i]; } else my = 0.0;
    top = Math.max(mx, my, 1.0);
    e1x[0] = e1x[w] = top;   // image borders are always cuts
    e1y[0] = e1y[h] = top;

    if (w > 2) {
      var s2x = colSumsF32(h, w - 2, function (r, c) {
        return d2mag(d, (r * w + c + 2) * cn, (r * w + c + 1) * cn, (r * w + c) * cn, cn);
      });
      for (x = 0; x < w - 2; x++) e2x[x + 1] = s2x[x];
    }
    if (h > 2) {
      row = new Float32Array(w);
      for (y = 0; y < h - 2; y++) {
        for (x = 0; x < w; x++) row[x] = d2mag(d, ((y + 2) * w + x) * cn, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
        e2y[y + 1] = PF.pairwiseSum(row, 0, w, true);
      }
    }
    return { e1x: e1x, e1y: e1y, e2x: e2x, e2y: e2y };
  }

  function _normalise(profile) {
    var n = profile.length;
    if (n - 2 <= 0) return Float64Array.from(profile);           // interior.size == 0
    var interior = (profile instanceof Float64Array ? profile : Float64Array.from(profile)).subarray(1, n - 1);
    var scale = PF.percentile(interior, 95, 'f8');
    if (scale <= 0) {
      var mx = -Infinity, i;
      for (i = 0; i < interior.length; i++) if (interior[i] > mx) mx = interior[i];
      scale = mx > 0 ? mx : 1.0;
    }
    var den = scale + 1e-9, out = new Float64Array(n), j;
    for (j = 0; j < n; j++) out[j] = PF.clipScalar(profile[j] / den, 0.0, 1.5);
    return out;
  }

  // ------------------------------------------------------- period estimation

  /* Pre-pooled/blurred variants of a profile for jitter-tolerant combs. */
  var POOLS = [1, 3, 5, 7];
  function _PooledProfile(profile) {
    var norm = _normalise(profile);
    this.variants = {};
    for (var k = 0; k < POOLS.length; k++) {
      var p = POOLS[k];
      var v = p > 1 ? PF.maximum_filter1d(norm, p) : norm;
      v = PF.gaussian_filter1d(v, 0.6);
      var interior = v.subarray(1, Math.max(1, v.length - 1));
      this.variants[p] = [v, meanOrNaN(interior), stdOrNaN(interior) + 1e-9];
    }
  }
  _PooledProfile.POOLS = POOLS;
  /* All variants applicable to this step (pool must stay < step). */
  _PooledProfile.prototype.for_step = function (step) {
    var limit = step >= 3.5 ? 3 : 1;
    if (step >= 8) limit = 5;
    if (step >= 12) limit = 7;
    var out = [];
    for (var k = 0; k < POOLS.length; k++) if (POOLS[k] <= limit) out.push(this.variants[POOLS[k]]);
    return out;
  };

  /* Best (score, phase) of a regular comb of spacing `step`.
   *
   * Score is a bias-corrected z-score (see module docstring), maximised over
   * the jitter-tolerance pools narrow enough for this step. */
  function _comb_score(pp, step, phase_res) {
    if (phase_res === undefined || phase_res === null) phase_res = 0.25;
    var variants = pp.for_step(step);
    if (!variants.length) return [0.0, 0.0];
    var n = variants[0][0].length - 1;
    if (step < 1.25 || step > n / 4) return [0.0, 0.0];

    var n_cuts = PF.rint(n / step);                  // int(round(n / step))
    var K = n_cuts - 1;                               // len(np.arange(1, n_cuts))
    if (!(K >= 4)) return [0.0, 0.0];

    var phases = PF.arange(0.0, step, phase_res);
    var P = phases.length, lim = n - 0.51, i, j, pos;
    var i0 = new Int32Array(P * K), frac = new Float64Array(P * K), valid = new Uint8Array(P * K);
    var counts = new Int32Array(P), anyOk = false;
    for (i = 0; i < P; i++) {
      var cnt = 0;
      for (j = 0; j < K; j++) {
        pos = phases[i] + (j + 1) * step;               // phases[:, None] + ks[None, :] * step
        var ok = pos < lim;
        if (!ok) pos = 0.0;                              // np.where(valid, pos, 0.0)
        var ip = Math.trunc(pos);                        // pos.astype(np.int64)
        i0[i * K + j] = ip;
        frac[i * K + j] = pos - ip;
        valid[i * K + j] = ok ? 1 : 0;
        if (ok) cnt++;
      }
      counts[i] = cnt;
      if (cnt >= 4) anyOk = true;
    }
    if (!anyOk) return [0.0, 0.0];
    var penalty = Math.sqrt(2.0 * npLogInt(Math.max(P, 2)));

    var best_score = -1e18, best_phase = 0.0;
    var vals = new Float64Array(K), z = new Float64Array(P);
    for (var vi = 0; vi < variants.length; vi++) {
      var blur = variants[vi][0], base_mean = variants[vi][1], base_std = variants[vi][2];
      for (i = 0; i < P; i++) {
        for (j = 0; j < K; j++) {
          var q = i * K + j, f = frac[q], a = i0[q];
          var v = blur[a] * (1 - f) + blur[a + 1] * f;   // blur[i0]*(1-frac) + blur[i0+1]*frac
          vals[j] = v * valid[q];                        // (vals * valid)
        }
        var c1 = Math.max(counts[i], 1);
        var means = counts[i] >= 4 ? PF.pairwiseSum(vals, 0, K, false) / c1 : -Infinity;
        z[i] = (means - base_mean) / (base_std / Math.sqrt(c1) + 1e-9);
      }
      var b = PF.argmax(z);
      var sc = z[b] - penalty;
      if (sc > best_score) { best_score = sc; best_phase = phases[b]; }
    }
    return [best_score, best_phase];
  }

  /* The lattice LSQ loop shared by _lattice_refine and
   * _lattice_refine_peaks. Returns {s, early}: early is true when the
   * reference returns its s0 argument itself (whose Python type then
   * carries through), false when it returns float(coef[1]). */
  function latticeFit(peaks, h, s0, n_iters) {
    if (peaks.length < 4) return { s: s0, early: true };
    var s = s0, m = peaks.length, it, i;
    var phi = pyMod(peaks[PF.argmax(h)], s);
    var k = new Float64Array(m), w = new Float64Array(m);
    var A = new Float64Array(m * 2), bb = new Float64Array(m);
    for (it = 0; it < n_iters; it++) {
      var kk = [];
      for (i = 0; i < m; i++) {
        k[i] = PF.rint((peaks[i] - phi) / s);
        var resid = peaks[i] - (phi + k[i] * s);
        w[i] = h[i] * (Math.abs(resid) < 0.35 * s ? 1 : 0);
        if (w[i] > 0) kk.push(k[i]);
      }
      if (PF.sum(w) <= 0 || uniqueCount(kk) < 3) return { s: s0, early: true };
      for (i = 0; i < m; i++) {
        A[i * 2] = 1.0 * w[i];                           // np.ones_like(k) * w
        A[i * 2 + 1] = k[i] * w[i];
        bb[i] = peaks[i] * w[i];
      }
      var coef = PF.lstsq(A, m, 2, bb).x;
      phi = coef[0];
      s = coef[1];
      if (!isFinite(s) || s < 1.2 || Math.abs(s - s0) > 0.6 * s0) return { s: s0, early: true };
    }
    return { s: s, early: false };
  }

  /* Lattice LSQ fit (see _lattice_refine) on a raw peak list. */
  function _lattice_refine_peaks(peaks, h, s0, n_iters) {
    if (n_iters === undefined || n_iters === null) n_iters = 4;
    return latticeFit(peaks, h, s0, n_iters).s;
  }

  function latticeRefineEx(profile, s0, n_iters) {
    if (n_iters === undefined || n_iters === null) n_iters = 4;
    var norm = _normalise(profile);
    var fp = PF.find_peaks(norm.subarray(1, norm.length - 1),
      { height: 0.12, distance: Math.max(1, Math.trunc(s0 * 0.45)) });
    var peaks = new Float64Array(fp.peaks.length), i;
    for (i = 0; i < peaks.length; i++) peaks[i] = fp.peaks[i] + 1;
    if (peaks.length < 4) return { s: s0, early: true };
    return latticeFit(peaks, fp.properties.peak_heights, s0, n_iters);
  }

  /* Sub-pixel period refinement by lattice fitting.
   *
   * Comb scores are razor-thin in step-space (a 0.02 px error accumulates to
   * a full misalignment across a hundred cuts), so searching the comb score
   * directly is hopeless. Instead: detect profile peaks, assign each to its
   * nearest lattice index k = round((p - phase)/s), and solve p ~ phase + k*s
   * by height-weighted least squares over the inliers. Converges to the true
   * fractional step from a rough integer seed. */
  function _lattice_refine(profile, s0, n_iters) {
    return latticeRefineEx(profile, s0, n_iters).s;
  }

  /* Rayleigh core shared by _rayleigh_score / _tiles_ray_z / _ray_quick:
   * resultant = (h * np.exp(2j*np.pi*p/step)).sum() as {re, im}. */
  function resultantOf(p, h, step) {
    var ph = C._libm.phasors(p, step), n = p.length, i;
    var re = new Float64Array(n), im = new Float64Array(n);
    for (i = 0; i < n; i++) {
      re[i] = h[i] * ph.c[i] - 0 * ph.s[i];              // (h + 0j) * (c + s j)
      im[i] = h[i] * ph.s[i] + 0 * ph.c[i];
    }
    return PF.complexSum(re, im);
  }
  // (np.angle(resultant) / (2 * np.pi) * step) % step
  function phaseOf(res, step) {
    return pyMod(C._libm.atan2(res.im, res.re) / TWO_PI * step, step);
  }
  // len(np.unique(slots[hits]))
  function occupiedSlots(p, phase, step) {
    var hitSlots = [], i, slot;
    for (i = 0; i < p.length; i++) {
      slot = PF.rint((p[i] - phase) / step);
      if (Math.abs(p[i] - (phase + slot * step)) < 0.35 * step) hitSlots.push(slot);
    }
    return uniqueCount(hitSlots);
  }

  /* Phase-coherence score of profile peaks against a lattice of `step`.
   *
   * A Rayleigh-style test: project every peak onto the unit circle at angle
   * 2*pi*position/step. Independent per-boundary jitter only attenuates the
   * resultant vector (a 30% jitter still leaves |R| ~ 0.3) whereas comb
   * sampling collapses entirely, so this channel rescues wobbly grids.
   * Scaled by lattice occupancy so half-period harmonics (every second slot
   * empty) don't tie with the fundamental. Returns (z_like, phase). */
  function _rayleigh_score(profile, step) {
    var norm = _normalise(profile);
    var n = norm.length - 1;
    if (step < 2.0 || step > n / 4) return [0.0, 0.0];
    var fp = PF.find_peaks(norm.subarray(1, norm.length - 1),
      { height: 0.15, distance: Math.max(1, Math.trunc(step * 0.4)) });
    if (fp.peaks.length < 5) return [0.0, 0.0];
    var p = new Float64Array(fp.peaks.length), i;
    for (i = 0; i < p.length; i++) p[i] = fp.peaks[i] + 1;
    var h = fp.properties.peak_heights;

    var res = resultantOf(p, h, step);
    var hs = PF.sum(h);
    var R = PF.cabs(res.re, res.im) / hs;
    var n_eff = C._libm.pow2(hs) / sumSq(h);

    // fraction of lattice slots that actually contain a peak
    var phase = phaseOf(res, step);
    var n_slots = Math.max(1, Math.trunc(n / step) - 1);
    var occupancy = pyMin(1.0, occupiedSlots(p, phase, step) / n_slots);

    var z = Math.sqrt(2.0 * n_eff) * R * occupancy;
    return [z, phase];
  }

  /* Refine a candidate step and rescore it -> (step, score, phase).
   *
   * Tries the raw seed and its lattice-fitted refinement; scores each by the
   * better of comb z (regular grids) and Rayleigh coherence (wobbly grids).
   * stepIsNp: step is an np.float64 in the reference (see the header). */
  function _refine_step(pp, profile, step, stepIsNp) {
    stepIsNp = !!stepIsNp;
    var vals = [round4(step, stepIsNp)], nps = [stepIsNp];
    var lr = latticeRefineEx(profile, step);
    var rNp = lr.early ? stepIsNp : false;
    vals.push(round4(lr.s, rNp));
    nps.push(rNp);
    var best = [step, -1e18, 0.0, stepIsNp];
    var order = pySetIter(vals);
    for (var k = 0; k < order.length; k++) {
      var s = vals[order[k]];
      var cs = _comb_score(pp, s), score = cs[0], phase = cs[1];
      var rr = _rayleigh_score(profile, s);
      if (rr[0] > score) { score = rr[0]; phase = rr[1]; }
      if (score > best[1]) best = [s, score, phase, nps[order[k]]];
    }
    return best;
  }

  /* Candidate periods from spacings between adjacent profile peaks.
   *
   * This is pixeldetector's core idea (median of np.diff(find_peaks(...)))
   * - phase-free and immune to harmonics, so it makes an excellent seed for
   * comb refinement even when the blind scan struggles. */
  function _spacing_candidates(profile, min_step, max_step) {
    var norm = _normalise(profile), cands = [], hts = [0.10, 0.30], t, i;
    var inner = norm.subarray(1, norm.length - 1);
    var lo = pyMax(1.5, min_step * 0.6), hi = max_step * 1.5;
    for (t = 0; t < hts.length; t++) {
      var pk = PF.find_peaks(inner, { height: hts[t], distance: 2 }).peaks;
      if (pk.length < 4) continue;
      var sp = [];
      for (i = 1; i < pk.length; i++) {
        var dd = pk[i] - pk[i - 1];                   // np.diff(peaks).astype(np.float64)
        if (dd >= lo && dd <= hi) sp.push(dd);
      }
      if (sp.length < 3) continue;
      var spa = Float64Array.from(sp);
      cands.push(PF.median(spa, 'f8'));
      var u = PF.unique(spa, { counts: true });
      cands.push(u.values[PF.argmax(u.counts)]);
    }
    return cands;
  }

  function sortStableBy(arr, key) {       // Python list.sort(key=...): stable, '<' on keys
    return arr.map(function (r, i) { return [key(r), i, r]; })
      .sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : a[1] - b[1]); })
      .map(function (t) { return t[2]; });
  }

  /* Estimate the dominant cell size along one axis of one profile.
   *
   * Returns (step, score, phase); step None if nothing periodic. Element [3]
   * says whether the returned step is an np.float64 in the reference. */
  function estimate_period(profile, min_step, max_step, harmonic_tol) {
    if (min_step === undefined || min_step === null) min_step = 2.0;
    if (harmonic_tol === undefined || harmonic_tol === null) harmonic_tol = 0.88;
    var n = profile.length - 1;
    if (max_step === undefined || max_step === null) max_step = pyMin(pyMax(4.0, n / 8.0), 64.0);

    var pp = new _PooledProfile(profile);

    var steps = [], s = min_step;
    while (s <= max_step) {
      steps.push(s);
      s += s < 16 ? 0.5 : 1.0;
    }
    if (!steps.length) return [null, 0.0, 0.0, false];
    var scores = new Float64Array(steps.length), i;
    for (i = 0; i < steps.length; i++) scores[i] = _comb_score(pp, steps[i])[0];
    var order = argsortNeg(scores);

    var refined = [], seen = [];
    function near(s0) { for (var q = 0; q < seen.length; q++) if (Math.abs(s0 - seen[q]) < 0.6) return true; return false; }

    // peak-spacing candidates first: strong, harmonic-free priors
    var sc = _spacing_candidates(profile, min_step, max_step);
    for (i = 0; i < sc.length; i++) {
      var s0 = sc[i];
      if (s0 < min_step || s0 > max_step) continue;
      if (near(s0)) continue;
      seen.push(s0);
      refined.push(_refine_step(pp, profile, s0, false));
    }

    for (i = 0; i < Math.min(6, order.length); i++) {
      var idx = order[i];
      if (scores[idx] <= 0) break;
      var s1 = steps[idx];                             // np.float64 (steps = np.array(...))
      if (near(s1)) continue;
      seen.push(s1);
      refined.push(_refine_step(pp, profile, s1, true));
    }

    if (!refined.length) return [null, 0.0, 0.0, false];
    var best_score = -Infinity;
    for (i = 0; i < refined.length; i++) if (refined[i][1] > best_score) best_score = refined[i][1];
    if (best_score <= 0) return [null, 0.0, 0.0, false];

    // prefer the smallest step among near-best (multiples of the true step
    // also score well; divisors score clearly lower)
    var good = sortStableBy(refined.filter(function (r) { return r[1] >= harmonic_tol * best_score; }),
      function (r) { return r[0]; });
    var step = good[0][0], score = good[0][1], phase = good[0][2], isNp = good[0][3];

    // test integer divisors of the winner - catches a missed fundamental
    // (content structure often repeats at small multiples of the pixel size).
    // The absolute floor keeps this from swapping harmonics of pure noise.
    var improved = true, divs = [2, 3, 4, 5];
    while (improved) {
      improved = false;
      for (var di = 0; di < divs.length; di++) {
        var div = divs[di], sub = step / div;
        if (sub < min_step) continue;
        var r = _refine_step(pp, profile, sub, isNp);
        if (r[1] >= pyMax(harmonic_tol * score, 3.0) && Math.abs(r[0] * div - step) < 0.6 * div) {
          step = r[0]; score = r[1]; phase = r[2]; isNp = r[3];
          improved = true;
          break;
        }
      }
    }

    // jpeg trap: quantization amplifies the 8x8 block lattice (and its 4.0 /
    // 2.67 harmonics), always at phase 0 relative to the image origin. If the
    // winner looks exactly like the jpeg grid but a credible non-jpeg
    // candidate exists, prefer that candidate.
    if (is_jpeg_suspect(step)) {
      var sc0 = score;
      var alts = refined.filter(function (r) { return !is_jpeg_suspect(r[0]) && r[1] >= 0.55 * sc0; });
      if (alts.length) {
        alts = sortStableBy(alts, function (r) { return -r[1]; });
        step = alts[0][0]; score = alts[0][1]; phase = alts[0][2]; isNp = alts[0][3];
      } else {
        // still on the jpeg family: deflate so the sibling channel /
        // axis with a real grid wins downstream comparisons
        score *= 0.5;
      }
    }
    return [step, score, phase, isNp];
  }

  /* True when a step sits exactly on the jpeg block lattice family,
   * regardless of phase (band/Rayleigh channels report drifted phases). */
  function is_jpeg_suspect(step) {
    for (var i = 0; i < JPEG_BASES.length; i++) if (Math.abs(step - JPEG_BASES[i]) < 0.09) return true;
    return false;
  }

  /* True when (step, phase) matches the 8x8 jpeg block grid or one of its
   * integer subdivisions, aligned to the image origin. */
  function is_jpeg_lattice(step, phase) {
    for (var i = 0; i < JPEG_BASES.length; i++) {
      var base = JPEG_BASES[i];
      if (Math.abs(step - base) < 0.09) {
        var m = pyMod(phase, base);
        if (m < 0.6 || m > base - 0.6) return true;
      }
    }
    return false;
  }

  /* Differential z-score of the phase-0 8px lattice (jpeg block edges).
   *
   * A real 4px art grid puts energy on 8k AND 8k+4; jpeg blocks only on 8k.
   * Scoring the difference keeps true 4/8px grids from being mistaken for
   * compression artifacts. */
  function _jpeg_lattice_strength(profile) {
    var norm = PF.gaussian_filter1d(_normalise(profile), 0.6);
    var n = norm.length - 1, on = [], off = [], i;
    for (i = 8; i < n - 7; i += 8) on.push(norm[i]);        // np.arange(8, n - 7, 8)
    for (i = 4; i < n - 3; i += 8) off.push(norm[i]);       // np.arange(4, n - 3, 8)
    if (on.length < 4 || off.length < 4) return 0.0;
    var interior = norm.subarray(1, n);
    var base_mean = PF.mean(interior);
    var base_std = PF.std(interior) + 1e-9;
    var z_on = (PF.mean(Float64Array.from(on)) - base_mean) / (base_std / Math.sqrt(on.length));
    var z_off = (PF.mean(Float64Array.from(off)) - base_mean) / (base_std / Math.sqrt(off.length));
    return z_on - pyMax(z_off, 0.0);
  }

  /* Remove the 8px block lattice: values within `width` of a multiple of 8
   * are replaced by interpolation from unaffected neighbours. */
  function _notch_jpeg(profile, width) {
    if (width === undefined || width === null) width = 1.0;
    var len = profile.length, n = len - 1, i;
    var mask = new Uint8Array(len), nMask = 0;
    for (i = 0; i < len; i++) {
      var r = i % 8;
      mask[i] = Math.min(r, 8 - r) <= width ? 1 : 0;
    }
    if (len > 0) { mask[0] = 0; mask[n] = 0; }
    for (i = 0; i < len; i++) nMask += mask[i];
    if (nMask === 0 || nMask === len) return profile;
    var out = Float64Array.from(profile);
    var xs = [], xp = [], fp = [];
    for (i = 0; i < len; i++) {
      if (mask[i]) xs.push(i); else { xp.push(i); fp.push(out[i]); }
    }
    var v = PF.interp(Float64Array.from(xs), Float64Array.from(xp), Float64Array.from(fp));
    for (i = 0; i < xs.length; i++) out[xs[i]] = v[i];
    return out;
  }

  /* 2D gradient/curvature magnitude maps used for tile evidence.
   *
   * dqx: (H, W-1) first-diff magnitude of the quantized image along x
   * dqy: (H-1, W) along y;  cox/coy: curvature magnitudes of the original. */
  function _grad_maps(rgba, quantized) {
    var q = _flatten_channels(quantized), o = _flatten_channels(rgba);
    var w = q.w, h = q.h, cn = q.cn, x, y;
    check(o.w === w && o.h === h && o.cn === cn, '_grad_maps: rgba and quantized differ in shape');
    var W1 = Math.max(w - 1, 0), H1 = Math.max(h - 1, 0), W2 = Math.max(w - 2, 0), H2 = Math.max(h - 2, 0);
    var dqx = new Float32Array(h * W1), dqy = new Float32Array(H1 * w);
    var cox = new Float32Array(h * W2), coy = new Float32Array(H2 * w);
    for (y = 0; y < h; y++) for (x = 0; x < W1; x++) dqx[y * W1 + x] = d1mag(q.d, (y * w + x + 1) * cn, (y * w + x) * cn, cn);
    for (y = 0; y < H1; y++) for (x = 0; x < w; x++) dqy[y * w + x] = d1mag(q.d, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
    for (y = 0; y < h; y++) for (x = 0; x < W2; x++) cox[y * W2 + x] = d2mag(o.d, (y * w + x + 2) * cn, (y * w + x + 1) * cn, (y * w + x) * cn, cn);
    for (y = 0; y < H2; y++) for (x = 0; x < w; x++) coy[y * w + x] = d2mag(o.d, ((y + 2) * w + x) * cn, ((y + 1) * w + x) * cn, (y * w + x) * cn, cn);
    return {
      dqx: { d: dqx, w: W1, h: h }, dqy: { d: dqy, w: w, h: H1 },
      cox: { d: cox, w: W2, h: h }, coy: { d: coy, w: w, h: H2 }
    };
  }

  /* seg.sum(axis=0) of the (rows y0..y1, cols x0..x1) block of `dmap`
   * (axis=0) or of dmap.T (axis=1), float32. The first is a sequential row
   * accumulation over a C array; the second sums the transposed view's
   * axis 0, which is the base's contiguous axis, so it is pairwise. */
  function segColSums(dmap, axis, y0, y1, x0, x1) {
    var cols = x1 - x0, rows = y1 - y0, out = new Float32Array(cols), c, r;
    if (axis === 1) {
      var bw = dmap.w;
      for (c = 0; c < cols; c++) {
        if (SEM.layoutSumOrder) {
          out[c] = PF.pairwiseSum(dmap.d, (x0 + c) * bw + y0, rows, true);
        } else {
          var acc = 0;
          for (r = 0; r < rows; r++) acc = fr(acc + dmap.d[(x0 + c) * bw + y0 + r]);
          out[c] = acc;
        }
      }
    } else {
      var w = dmap.w;
      var sums = colSumsF32(rows, cols, function (rr, cc) { return dmap.d[(y0 + rr) * w + x0 + cc]; });
      for (c = 0; c < cols; c++) out[c] = sums[c];
    }
    return out;
  }

  /* Peak lists for 2D tiles of a gradient map.
   *
   * axis=0: peaks along x within each tile (dmap rows summed).
   * Returns [(positions, heights, tile_extent), ...] with positions in
   * absolute axis coordinates. Local tiles keep their own grid phase, which
   * is what sprite sheets and heavily warped images need. */
  function _tile_peaks(dmap, axis, offset, max_tiles) {
    if (offset === undefined || offset === null) offset = 1;
    if (max_tiles === undefined || max_tiles === null) max_tiles = 360;
    var H = axis === 1 ? dmap.w : dmap.h, W = axis === 1 ? dmap.h : dmap.w;
    var tw = PF.clipScalar(Math.floor(W / 6), 48, 192), th = PF.clipScalar(Math.floor(H / 6), 48, 192);
    var tiles = [], y0, x0, i;
    var yEnd = Math.max(H - Math.floor(th / 2), 1), xEnd = Math.max(W - Math.floor(tw / 2), 1);
    for (y0 = 0; y0 < yEnd; y0 += th) {
      for (x0 = 0; x0 < xEnd; x0 += tw) {
        var y1 = Math.min(y0 + th, H), x1 = Math.min(x0 + tw, W);
        if (y1 <= y0 || x1 <= x0) continue;                 // seg.size == 0
        var prof = segColSums(dmap, axis, y0, y1, x0, x1);
        var scale = PF.percentile(prof, 95, 'f4');
        if (scale <= 0) continue;
        var norm = new Float32Array(prof.length);
        for (i = 0; i < prof.length; i++) norm[i] = PF.clipScalar(fr(prof[i] / scale), 0, 1.5);
        var fp = PF.find_peaks(norm, { height: 0.2, distance: 2 });
        if (fp.peaks.length < 4) continue;
        var pos = new Float64Array(fp.peaks.length);
        for (i = 0; i < pos.length; i++) pos[i] = fp.peaks[i] + x0 + offset;
        tiles.push([pos, fp.properties.peak_heights, prof.length]);
      }
    }
    if (tiles.length > max_tiles) {
      var li = PF.linspace(0, tiles.length - 1, max_tiles), sel = [];
      for (i = 0; i < li.length; i++) sel.push(tiles[Math.trunc(li[i])]);
      tiles = sel;
    }
    return tiles;
  }

  /* Stouffer-combined per-tile Rayleigh coherence at `step`.
   *
   * Every tile gets its own phase; only tiles with enough peaks vote. */
  function _tiles_ray_z(tiles, step) {
    if (!tiles || !tiles.length || step < 2.0) return 0.0;
    var zs = [];
    for (var t = 0; t < tiles.length; t++) {
      var p = tiles[t][0], h = tiles[t][1], ext = tiles[t][2];
      if (step > ext / 3 || p.length < 4) continue;
      var res = resultantOf(p, h, step);
      var hs = PF.sum(h);
      var R = PF.cabs(res.re, res.im) / (hs + 1e-9);
      var n_eff = C._libm.pow2(hs) / (sumSq(h) + 1e-9);
      var phase = phaseOf(res, step);
      var n_slots = Math.max(1, Math.trunc(ext / step));
      var occ = pyMin(1.0, occupiedSlots(p, phase, step) / n_slots);
      // centre so that noise tiles average to ~0 instead of diluting
      zs.push(Math.sqrt(2.0 * n_eff) * R * occ - 1.0);
    }
    if (zs.length < 2) return 0.0;
    return PF.sum(Float64Array.from(zs)) / Math.sqrt(zs.length);
  }

  /* Candidate steps from the distribution of per-tile peak spacings. */
  function _tile_spacing_modes(tiles, min_step, max_step, top) {
    if (top === undefined || top === null) top = 3;
    var votes = [], t, i;
    for (t = 0; t < (tiles || []).length; t++) {
      var p = tiles[t][0];
      if (p.length < 5) continue;
      var sp = [];
      for (i = 1; i < p.length; i++) {
        var d = p[i] - p[i - 1];
        if (d >= min_step * 0.7 && d <= max_step * 1.4) sp.push(d);
      }
      if (sp.length >= 3) votes.push(PF.median(Float64Array.from(sp), 'f8'));
    }
    if (votes.length < 4) return [];
    var out = [], hist_vals = votes.slice();
    for (var k = 0; k < top; k++) {
      if (hist_vals.length < 3) break;
      var med = PF.median(Float64Array.from(hist_vals), 'f8');
      out.push(med);
      hist_vals = hist_vals.filter(function (v) { return Math.abs(v - med) > 0.75; });
    }
    return out;
  }

  /* Welch-averaged power spectrum of gradient scanline groups.
   *
   * Magnitude spectra are phase-free, so mushy, warped, per-sprite-shifted
   * grids all contribute power at the same frequency comb k/step. Rows are
   * summed in small groups (local phase is coherent over a few rows even
   * under warp), Hann-windowed, and averaged. Returns (freqs, power). */
  function _axis_spectrum(dmaps, axis, row_group, max_win) {
    if (row_group === undefined || row_group === null) row_group = 4;
    if (max_win === undefined || max_win === null) max_win = 1024;
    var specs = null, count = 0, win = 0, i;
    for (var m = 0; m < dmaps.length; m++) {
      var dmap = dmaps[m];
      var H = axis === 1 ? dmap.w : dmap.h, W = axis === 1 ? dmap.h : dmap.w;
      win = Math.trunc(Math.min(W, max_win));
      if (win < 32) continue;
      var window = PF.hanning(win);
      var hop = Math.max(Math.floor(win / 2), 1);
      var seg = new Float64Array(win);
      for (var y0 = 0; y0 < H - row_group + 1; y0 += row_group) {
        var prof = segColSums(dmap, axis, y0, y0 + row_group, 0, W);
        var mu = PF.mean(prof);                            // float32 mean
        for (i = 0; i < prof.length; i++) prof[i] = fr(prof[i] - mu);
        for (var x0 = 0; x0 < W - win + 1; x0 += hop) {
          for (i = 0; i < win; i++) seg[i] = prof[x0 + i] * window[i];
          var F = PF.rfft(seg);
          var sp = new Float64Array(F.length), a;
          for (i = 0; i < F.length; i++) { a = PF.cabs(F.re[i], F.im[i]); sp[i] = a * a; }
          if (specs === null) specs = sp;
          else for (i = 0; i < sp.length; i++) specs[i] = specs[i] + sp[i];   // specs + sp
          count++;
        }
      }
    }
    if (specs === null || count === 0) return [new Float64Array([0.0]), new Float64Array([0.0])];
    var freqs = PF.rfftfreq(win);
    var power = new Float64Array(specs.length);
    for (i = 0; i < specs.length; i++) power[i] = specs[i] / count;
    return [freqs, power];
  }

  /* Smooth local background of a power spectrum (median filter). */
  function _spectral_background(power) {
    var k = Math.max(5, Math.floor(power.length / 24));
    if (k % 2 === 0) k += 1;
    return PF.median_filter(power, k, { mode: 'nearest' });
  }

  /* Prominence (z-like) of the spectral peak at frequency 1/step. */
  function _spectral_z(freqs, power, bg, step) {
    if (step < 2.0 || freqs.length < 8) return 0.0;
    var f = 1.0 / step;
    if (f <= freqs[1] || f >= freqs[freqs.length - 1]) return 0.0;
    // sample peak power with +-1 bin tolerance; log-ratio scale so the
    // score is commensurate with the comb/Rayleigh z channels
    var idx = PF.searchsorted(freqs, f);
    var lo = Math.max(1, idx - 1), hi = Math.min(power.length - 1, idx + 1), i;
    var p = power[lo];
    for (i = lo + 1; i <= hi; i++) if (power[i] > p || power[i] !== power[i]) p = power[i];
    var b = bg[idx] + 1e-12;
    var ratio = pyMax(p / b, 1e-6);
    return 6.0 * C._libm.log10(ratio);
  }

  /* Fundamental-period candidates: strong spectral peaks, preferring the
   * lowest-frequency member of each harmonic comb. */
  function _spectral_candidates(freqs, power, bg, min_step, max_step, top) {
    if (top === undefined || top === null) top = 4;
    if (freqs.length < 8) return [];
    var n = power.length, resid = new Float64Array(n), i;
    for (i = 0; i < n; i++) resid[i] = 6.0 * C._libm.log10(PF.npMaximum(power[i], 1e-12) / (bg[i] + 1e-12));
    var fp = PF.find_peaks(resid, { height: 4.0 });
    if (fp.peaks.length === 0) return [];
    var heights = [], periods = [];
    for (i = 0; i < fp.peaks.length; i++) {
      var fq = freqs[fp.peaks[i]];
      var per = fq > 0 ? 1.0 / PF.npMaximum(fq, 1e-9) : 0.0;
      if (per >= min_step && per <= max_step) { heights.push(fp.properties.peak_heights[i]); periods.push(per); }
    }
    if (!periods.length) return [];
    var order = argsortNeg(Float64Array.from(heights));
    var cands = [];
    for (var oi = 0; oi < order.length; oi++) {
      var s = periods[order[oi]];
      // skip if s is a harmonic (integer divisor) of an already-kept step
      var is_harm = false;
      for (var c = 0; c < cands.length; c++) {
        var ratio = cands[c] / s, rr = PF.rint(ratio);
        if (Math.abs(ratio - rr) < 0.06 && rr >= 2) { is_harm = true; break; }
      }
      if (!is_harm) cands.push(s);
      if (cands.length >= top) break;
    }
    // also offer the *longest* period whose comb members appear: for each
    // kept candidate, check small multiples with spectral support
    var extra = [], mults = [2, 3, 4, 5];
    for (var k = 0; k < cands.length; k++) {
      for (var mi = 0; mi < mults.length; mi++) {
        var sm = cands[k] * mults[mi];
        if (sm > max_step) break;
        if (_spectral_z(freqs, power, bg, sm) > 3.0) extra.push(sm);
      }
    }
    return cands.concat(extra);
  }

  function bandRows(bands) {
    if (bands === null || bands === undefined) return [];
    if (Array.isArray(bands)) return bands.slice();
    check(bands.d && bands.d.length === bands.w * bands.h, '_AxisEvidence: bands must be {d, w, h}, an array of rows, or null');
    var rows = [], b;
    for (b = 0; b < bands.h; b++) rows.push(bands.d.subarray(b * bands.w, (b + 1) * bands.w));
    return rows;
  }

  /* All periodicity evidence for one axis of one signal type.
   *
   * Holds the global profile plus B band-restricted profiles. Scoring a
   * candidate step combines per-band scores (each band free to choose its own
   * phase, via comb or Rayleigh) with a Stouffer sum: warped images stay
   * phase-coherent *within* a band even when global coherence is gone, so
   * this dominates a global comb whenever warp exists, while equalling it on
   * rigid grids. */
  function _AxisEvidence(profile, bands, tiles, spectrum, extra_z, extra_candidates) {
    this.extra_z = (extra_z === undefined) ? null : extra_z;
    this.extra_candidates = (extra_candidates && extra_candidates.length) ? extra_candidates : [];
    this.profile = profile;
    this.pp_global = new _PooledProfile(profile);
    this.bands = bandRows(bands);
    this.pps = this.bands.map(function (b) { return new _PooledProfile(b); });
    this.tiles = (tiles && tiles.length) ? tiles : [];
    if (spectrum !== null && spectrum !== undefined) {
      this.freqs = spectrum[0];
      this.power = spectrum[1];
      this.bg = _spectral_background(this.power);
    } else {
      this.freqs = this.power = this.bg = null;
    }
    // cached peak lists for the cheap fractional sweep
    this._peaks = [];
    var profs = [profile].concat(this.bands);
    for (var i = 0; i < profs.length; i++) {
      var norm = _normalise(profs[i]);
      var fp = PF.find_peaks(norm.subarray(1, norm.length - 1), { height: 0.15, distance: 2 });
      var p = new Float64Array(fp.peaks.length);
      for (var j = 0; j < p.length; j++) p[j] = fp.peaks[j] + 1;
      this._peaks.push([p, fp.properties.peak_heights, norm.length - 1]);
    }
  }

  /* (score, phase) for a candidate step. */
  _AxisEvidence.prototype.score = function (step) {
    var g = _comb_score(this.pp_global, step), gz = g[0], gp = g[1];
    var gr = _rayleigh_score(this.profile, step);
    if (gr[0] > gz) { gz = gr[0]; gp = gr[1]; }

    if (this.pps.length >= 2) {
      var zs = new Float64Array(this.pps.length), phs = [];
      for (var i = 0; i < this.pps.length; i++) {
        var c = _comb_score(this.pps[i], step), cz = c[0], cp = c[1];
        var r = _rayleigh_score(this.bands[i], step);
        if (r[0] > cz) { cz = r[0]; cp = r[1]; }
        zs[i] = cz;
        phs.push(cp);
      }
      var zb = PF.sum(zs) / Math.sqrt(zs.length);
      if (zb > gz) { gz = zb; gp = phs[PF.argmax(zs)]; }
    }
    var tz = _tiles_ray_z(this.tiles, step);
    if (tz > gz) gz = tz;  // tile phases are local; keep the best global phase
    if (this.freqs !== null) {
      var sz = _spectral_z(this.freqs, this.power, this.bg, step);
      if (sz > gz) gz = sz;
    }
    if (this.extra_z !== null) {
      var xz = this.extra_z(step);
      if (xz > gz) gz = xz;
    }
    return [gz, gp];
  };

  _AxisEvidence.prototype.candidate_steps = function (min_step, max_step) {
    var cands = _spacing_candidates(this.profile, min_step, max_step), i;
    for (i = 0; i < this.bands.length; i++) cands = cands.concat(_spacing_candidates(this.bands[i], min_step, max_step));
    cands = cands.concat(_tile_spacing_modes(this.tiles, min_step, max_step));
    if (this.freqs !== null) cands = cands.concat(_spectral_candidates(this.freqs, this.power, this.bg, min_step, max_step));
    cands = cands.concat(this.extra_candidates.filter(function (s) { return min_step <= s && s <= max_step; }));
    cands = cands.concat(this.sweep_candidates(min_step, max_step));
    return cands;
  };

  /* Cheap Rayleigh coherence from cached peaks, Stouffer over bands. */
  _AxisEvidence.prototype._ray_quick = function (step) {
    var zs = [];
    for (var i = 0; i < this._peaks.length; i++) {
      var p = this._peaks[i][0], h = this._peaks[i][1], n = this._peaks[i][2];
      if (p.length < 5 || step > n / 4) { zs.push(0.0); continue; }
      var res = resultantOf(p, h, step);
      var hs = PF.sum(h);
      var R = PF.cabs(res.re, res.im) / (hs + 1e-9);
      var n_eff = C._libm.pow2(hs) / (sumSq(h) + 1e-9);
      var phase = phaseOf(res, step);
      var n_slots = Math.max(1, Math.trunc(n / step) - 1);
      var occ = pyMin(1.0, occupiedSlots(p, phase, step) / n_slots);
      zs.push(Math.sqrt(2.0 * n_eff) * R * occ);
    }
    var band_z = zs.length > 2 ? PF.sum(Float64Array.from(zs.slice(1))) / Math.sqrt(zs.length - 1)
      : (zs.length ? zs[0] : 0.0);
    var tile_z = _tiles_ray_z(this.tiles, step);
    return pyMax(band_z, tile_z);
  };

  /* Dense fractional sweep: integer seeds can't reach steps like 5.6 on
   * heavily degraded grids, so scan a geometric grid with the cheap
   * coherence metric and seed the full scorer from its local maxima. */
  _AxisEvidence.prototype.sweep_candidates = function (min_step, max_step, top) {
    if (top === undefined || top === null) top = 6;
    var steps = [], s = min_step, i;
    while (s <= max_step) {
      steps.push(s);
      s *= 1.02;
    }
    if (steps.length < 5) return [];
    var zs = new Float64Array(steps.length);
    for (i = 0; i < steps.length; i++) zs[i] = this._ray_quick(steps[i]);
    var order = argsortNeg(zs), out = [];
    for (var k = 0; k < order.length; k++) {
      var ix = order[k];
      if (zs[ix] <= 0) break;
      var s0 = steps[ix], dup = false;
      for (var q = 0; q < out.length; q++) if (Math.abs(s0 - out[q]) < pyMax(0.12, 0.04 * s0)) { dup = true; break; }
      if (dup) continue;
      out.push(s0);
      if (out.length >= top) break;
    }
    return out;
  };

  /* Lattice-fit refinement: global + band fits + per-tile fits.
   *
   * Tiles matter most: on sprite sheets and warped art only the local
   * phase is coherent, so per-tile fits (median-combined) recover the
   * fractional step when the global fit cannot move at all. */
  _AxisEvidence.prototype.refine = function (step) {
    var fits = [_lattice_refine(this.profile, step)], i;
    for (i = 0; i < this.bands.length; i++) fits.push(_lattice_refine(this.bands[i], step));
    var tile_fits = [];
    for (i = 0; i < this.tiles.length; i++) {
      var p = this.tiles[i][0], h = this.tiles[i][1];
      if (p.length >= 6) {
        var f = _lattice_refine_peaks(p, h, step);
        if (Math.abs(f - step) > 1e-9) tile_fits.push(f);
      }
    }
    if (tile_fits.length >= 4) fits = tile_fits;          // tiles outvote global when plentiful
    return PF.median(Float64Array.from(fits), 'f8');
  };

  /* (step, score, phase): try seed and lattice refinement, keep better.
   * stepIsNp: step is an np.float64 in the reference (steps[idx], or a
   * divisor of one); ev.refine() always returns a Python float. */
  function _evidence_refine_step(ev, step, stepIsNp) {
    stepIsNp = !!stepIsNp;
    var vals = [round4(step, stepIsNp), round4(ev.refine(step), false)], nps = [stepIsNp, false];
    var best = [step, -1e18, 0.0, stepIsNp];
    var order = pySetIter(vals);
    for (var k = 0; k < order.length; k++) {
      var s = vals[order[k]];
      var r = ev.score(s);
      if (r[0] > best[1]) best = [s, r[0], r[1], nps[order[k]]];
    }
    return best;
  }

  // ----------------------------------------------------------------- export
  C._flatten_channels = _flatten_channels;
  C.axis_profiles = axis_profiles;
  C._normalise = _normalise;
  C._PooledProfile = _PooledProfile;
  C._comb_score = _comb_score;
  C._lattice_refine_peaks = _lattice_refine_peaks;
  C._lattice_refine = _lattice_refine;
  C._rayleigh_score = _rayleigh_score;
  C._refine_step = _refine_step;
  C._spacing_candidates = _spacing_candidates;
  C.estimate_period = estimate_period;
  C.is_jpeg_suspect = is_jpeg_suspect;
  C.is_jpeg_lattice = is_jpeg_lattice;
  C._jpeg_lattice_strength = _jpeg_lattice_strength;
  C._notch_jpeg = _notch_jpeg;
  C._grad_maps = _grad_maps;
  C._tile_peaks = _tile_peaks;
  C._tiles_ray_z = _tiles_ray_z;
  C._tile_spacing_modes = _tile_spacing_modes;
  C._axis_spectrum = _axis_spectrum;
  C._spectral_background = _spectral_background;
  C._spectral_z = _spectral_z;
  C._spectral_candidates = _spectral_candidates;
  C._AxisEvidence = _AxisEvidence;
  C._evidence_refine_step = _evidence_refine_step;
  C._latticeRefineEx = latticeRefineEx;

  PF.versionChannelsA = 'pf-30-channels-a/1';
})();
