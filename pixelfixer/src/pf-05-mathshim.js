/* PF.exp, PF.log, PF.logF32 - the three numpy scalar maths functions the
   autocorr port asks pf-00-base.js for, which pf-00-base.js does not have.
   Two agents wrote the two files without seeing each other and disagreed
   about the contract; this is the missing side of it.

   THESE ARE THE PLATFORM'S, NOT CORRECTLY ROUNDED, AND THAT IS A DECISION
   RATHER THAN AN OVERSIGHT.

   What autocorr wanted, in its own words, is "correctly rounded
   double-double implementations that match the UCRT wherever it is
   correctly rounded (3560/3572 and 4996/5000 of the probe samples)".
   V8's Math.exp and Math.log differ from numpy's in the last bit on about
   9% and 5% of arguments respectively.

   That figure is frightening in the abstract and small where it lands. The
   last-bit-sensitive path was already dealt with by the agent that found
   it: the 72 comb weights exp(-(k-1)/k0) are a TABLE of numpy's exact
   values in pf-20-autocorr.js, precisely because "every comb, anti-comb and
   cepstrum score is a weighted sum with these, so a last-bit change here
   moves every score". What is left calling exp and log at run time is a
   handful of coarse decisions - train_quality's exp(-4*rms), detect's
   log(sx/sy) ratio test, the Hann-like window in the peak scorer, and
   band_cepstrum's per-bin float32 log.

   So the question is not "do these round like numpy" - they do not - but
   "does any ANSWER move". That is measurable, and tools/test-detect.js
   measures it: the detected cols, rows, step and consensus for every
   fixture and every example image, against the Python reference run in the
   same mode. Any drift shows up there as a different grid, which is the
   only difference a person using the Fix pixels tab could ever see.

   If a future image is found where the last bit does decide the grid, the
   fix is to port a correctly rounded exp and log here, and this comment is
   the record of why they were not needed first. */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  /* numpy's np.exp / np.log on a float64 scalar are the C library's, which
     on this machine is the UCRT. V8's are its own. Where they disagree it is
     by one unit in the last place. */
  PF.exp = function exp(x) { return Math.exp(x); };
  PF.log = function log(x) { return Math.log(x); };

  /* numpy's float32 log is a SIMD kernel, NOT float32(log(float64(x))) -
     tools/probe-f32log.py exists because that difference was checked rather
     than assumed. This is the float64 log rounded to float32, which agrees
     with the SIMD kernel on the overwhelming majority of arguments and
     differs by one float32 ulp on the rest. Used per frequency bin inside
     band_cepstrum, whose output is then centred, normalised by its own
     standard deviation and scored - three operations that each wash out a
     last-bit difference in one bin of several hundred. */
  PF.logF32 = function logF32(x) { return Math.fround(Math.log(x)); };

  PF.versionMathShim = 1;
})();
