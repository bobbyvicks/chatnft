/* PF.process - one call, pixels in, pixel art out.

   The port of python/pixelfixer/api.py's process(), minus the parts that are
   the browser's job. api.py takes PNG bytes and decodes them with Pillow;
   here the caller has already decoded, because a canvas has done it and
   re-implementing PNG in JavaScript to arrive at the same array would be
   work with no product. So this takes the RGBA the browser gives and hands
   back RGBA, and the Fix pixels tab draws it.

   FAST MODE. core.detect refuses mode:"full" and says so - the arbitration
   stage (fusion, varcontrast, channels, reconsearch, about 3,300 lines) is
   not ported yet. Fast mode is the three cheap detectors and their
   agreement, which api.py describes as bounded latency, and which recovers
   the exact native size on every fixture and example image measured here.
   Asking for "full" throws rather than quietly answering with something
   else, because a tab that says it did the thorough thing and did not is
   worse than one that says it cannot.

   PROGRESS IS REPORTED BECAUSE IT HAS TO BE. Detection on a 1448x1086 image
   takes about four seconds in node and no less in a browser; a page that
   sits still that long reads as broken. onProgress(fraction, label) is
   called at the stage boundaries the reference has - the two are not a
   guess at a percentage, they are where the work actually is: detection
   dominates, reconstruction is the rest.
*/
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  /* api.py's caps. The pixel limit is what the reference will accept at
     all; the minimum side is below what any grid detector can say anything
     about. */
  PF.MAX_PIXELS = 4000000;
  PF.MIN_SIDE = 16;

  /* api.py's rule, transcribed. "fast:" is the calibrated early exit, where
     runlengths' comb peak was strong AND autocorr agreed on the size - the
     reference's comment says that combination was always correct on its
     benchmark. A two-detector agreement without that strength is medium. A
     lone detector's answer is low, and says so. */
  function confidenceOf(consensus) {
    consensus = String(consensus || '');
    if (consensus.indexOf('fast:') === 0) return 'high';
    if (consensus === 'arbitrated' || consensus === 'forced') return 'medium';
    if (consensus.indexOf('fastmode:') === 0 && consensus.indexOf('+') >= 0) return 'medium';
    return 'low';
  }

  /**
   * @param {Uint8ClampedArray|Uint8Array} data  interleaved RGBA, w*h*4
   * @param {number} width
   * @param {number} height
   * @param {{mode?:string, forceStep?:number, kColors?:number,
   *          onProgress?:function(number,string)}} [opts]
   * @returns {{cols,rows,stepX,stepY,consensus,confidence,width,height,
   *            data:Uint8ClampedArray, detectMs, reconMs}}
   */
  PF.process = function process(data, width, height, opts) {
    opts = opts || {};
    var mode = opts.mode || 'fast';
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    width = width | 0; height = height | 0;

    if (!data || data.length !== width * height * 4)
      throw new Error('process: data must be RGBA of width*height*4 bytes');
    if (Math.min(width, height) < PF.MIN_SIDE)
      throw new Error('image too small (min side ' + PF.MIN_SIDE + 'px)');
    if (width * height > PF.MAX_PIXELS)
      throw new Error('image too large (' + (width * height / 1e6).toFixed(1) + 'MP > '
        + (PF.MAX_PIXELS / 1e6) + 'MP limit)');

    /* The detectors type-check with `instanceof Uint8Array`, and a
       Uint8ClampedArray - which is what getImageData hands over - is not
       one. Same bytes, different constructor; the view is retyped rather
       than copied. */
    var d = (data instanceof Uint8Array) ? data
      : new Uint8Array(data.buffer, data.byteOffset, data.length);
    var rgba = { d: d, w: width, h: height, cn: 4 };

    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var r;
    if (opts.forceStep > 0) {
      /* api.py's force_step branch: no detection at all, the size follows
         from the step the caller already knows. */
      var fs = +opts.forceStep;
      r = { step_x: fs, step_y: fs,
        cols: Math.max(1, Math.round(width / fs)),
        rows: Math.max(1, Math.round(height / fs)),
        consensus: 'forced' };
      onProgress(0.7, 'using the cell size you gave');
    } else {
      onProgress(0.02, 'looking for the grid');
      r = PF.core.detect(rgba, mode);
      onProgress(0.7, 'found a ' + r.cols + ' by ' + r.rows + ' grid');
    }
    var detectMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    /* two_stage_pack is api.py's default (two_stage=True): quantise only to
       decide which label wins each cell, then colour that cell from the
       ORIGINAL pixels carrying the winning label - crisp edges without
       losing a rare highlight to the quantiser. */
    var low = PF.two_stage_pack(rgba, r.cols, r.rows, opts.kColors || 0);
    var reconMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t1;
    onProgress(1, 'done');

    var out = low.d || low;
    return {
      cols: r.cols | 0, rows: r.rows | 0,
      stepX: Math.round(r.step_x * 1e4) / 1e4,
      stepY: Math.round(r.step_y * 1e4) / 1e4,
      consensus: String(r.consensus || ''),
      confidence: confidenceOf(r.consensus),
      width: low.w || r.cols, height: low.h || r.rows,
      data: (out instanceof Uint8ClampedArray) ? out : new Uint8ClampedArray(out),
      detectMs: Math.round(detectMs), reconMs: Math.round(reconMs),
    };
  };

  PF.versionApi = 1;
})();
