/* pf-04-nprandom.js -- numpy.random, the slice pixelfixer uses.
 *
 * Port target: numpy 2.5.3 (the reference venv), whose default_rng is the
 * plain PCG64 bit generator (NOT PCG64DXSM; measured: default_rng(42)
 * .bit_generator.state['bit_generator'] == 'PCG64').
 *
 * Call sites (grep "default_rng" in pixelfixer/):
 *   quantize.py:33     rng = np.random.default_rng(seed)
 *   quantize.py:35     idx = rng.choice(n, sample_max, replace=False)
 *   reconsearch.py:56  rng = np.random.default_rng(seed)
 *   reconsearch.py:59  idx = rng.choice(n, min(sample, n), replace=False)
 * Only that surface is implemented: SeedSequence -> PCG64 -> Generator
 * .choice(int, size, replace=False[, shuffle]). Anything else throws, so a
 * caller cannot get a plausible-but-different stream by accident.
 *
 * Every stage below was first written as a pure-Python model and checked
 * against numpy's own objects (tools/probe-nprandom.py: SeedSequence.pool,
 * generate_state, PCG64.state / random_raw, choice on 13 (pop,size) shapes
 * covering both branches, and the has_uint32/uinteger carry afterwards --
 * all OK). This file ports that model; tools/test-quantize.js checks it
 * against fixtures/quantize-parity.json.
 *
 * Model (numpy/random/bit_generator.pyx, _pcg64.pyx, src/pcg64/pcg64.h,
 * src/distributions/distributions.c, _generator.pyx):
 *
 *   SeedSequence(entropy): entropy int -> little-endian uint32 words; a
 *     4-word pool mixed with hashmix/mix (INIT_A, MULT_A, MIX_MULT_L/R);
 *     generate_state(n) rehashes the pool cyclically with INIT_B/MULT_B.
 *   PCG64: 128-bit LCG, MULT = 0x2360ED051FC65DA44385DF649FCCF645,
 *     inc = (initseq << 1) | 1; seeding is state = 0; step; state +=
 *     initstate; step. Output is XSL-RR: rotr64(hi64 ^ lo64, state >> 122),
 *     taken AFTER the step. generate_state(4, uint64) supplies
 *     (initstate_hi, initstate_lo, initseq_hi, initseq_lo) as little-endian
 *     uint32 pairs.
 *   next_uint32: the LOW 32 bits of a fresh 64-bit word, then the HIGH 32
 *     on the next call (has_uint32 / uinteger). This carry is part of the
 *     generator's state and is reproduced (and tested) here.
 *   random_bounded_uint64(off=0, rng, mask=0, use_masked=False) for
 *     rng < 2^32: rng == 0 -> 0; rng == 2^32-1 -> next_uint32; otherwise
 *     Lemire's multiply-shift on next_uint32 with rejection while
 *     leftover < (2^32-1 - rng) % (rng+1).
 *   choice(pop, size, replace=False, p=None, shuffle=True):
 *     cutoff = shuffle ? 50 : 20
 *     if pop > 10000 and size > pop // cutoff:   tail shuffle
 *        idx = arange(pop); for i = pop-1 down to max(pop-size, 1):
 *        swap(idx[i], idx[bounded(i)]); return idx[pop-size:]
 *     else:                                       Floyd
 *        open-addressed hash set of 2^ceil(log2(floor(1.2*size))) slots;
 *        for j in [pop-size, pop): v = bounded(j); insert v if absent
 *        else insert j (probing from j & mask); out[j-(pop-size)] = the
 *        inserted value; then, if shuffle, shuffle out from i = size-1
 *        down to 1.
 *
 * Arithmetic: ES2017, no BigInt. The 128-bit state is eight 16-bit limbs
 * (little-endian) in a plain array; a 128x128 -> 128 multiply is schoolbook
 * on those limbs (every column sum < 2^37, exact in a double). The 64-bit
 * Lemire product x * (rng+1) is split into 16-bit halves the same way so
 * its high and low 32-bit words are exact.
 *
 * No imports, no exports, no build step. Browser + node.
 */
(function () {
  'use strict';
  var PF = globalThis.PF || (globalThis.PF = {});

  var TWO32 = 4294967296;
  var MASK32 = 0xFFFFFFFF;

  function err(msg) { throw new Error('PF.np_random: ' + msg); }

  // ------------------------------------------------------------ SeedSequence

  var INIT_A = 0x43b0d7e5, MULT_A = 0x931e8875;
  var INIT_B = 0x8b51f9dd, MULT_B = 0x58f38ded;
  var MIX_MULT_L = 0xca01f9dd, MIX_MULT_R = 0x4973f715;
  var XSHIFT = 16;
  var DEFAULT_POOL_SIZE = 4;

  function mul32(a, b) { return Math.imul(a, b) >>> 0; }

  // hashmix(value, &hash_const)
  function hashmix(value, hc) {
    value = (value ^ hc[0]) >>> 0;
    hc[0] = mul32(hc[0], MULT_A);
    value = mul32(value, hc[0]);
    value = (value ^ (value >>> XSHIFT)) >>> 0;
    return value;
  }

  // mix(x, y): (MIX_MULT_L*x - MIX_MULT_R*y) mod 2^32, then xorshift.
  // The subtraction of two uint32 products is within +-2^32, exact; >>> 0
  // is ToUint32, i.e. the modulo numpy's uint32 arithmetic applies.
  function mix(x, y) {
    var r = (mul32(MIX_MULT_L, x) - mul32(MIX_MULT_R, y)) >>> 0;
    r = (r ^ (r >>> XSHIFT)) >>> 0;
    return r;
  }

  // _coerce_to_uint32_array for a non-negative Python int: little-endian
  // uint32 words, and [0] for zero. Ints beyond 2^53 are not representable
  // here and throw instead of silently losing bits.
  function entropyWords(entropy) {
    if (typeof entropy !== 'number' || entropy !== Math.floor(entropy) || entropy < 0) {
      err('SeedSequence entropy must be a non-negative integer, got ' + String(entropy));
    }
    if (entropy > 9007199254740992) err('SeedSequence entropy above 2^53 is not representable');
    if (entropy === 0) return [0];
    var words = [], n = entropy;
    while (n > 0) {
      words.push(n % TWO32);
      n = Math.floor(n / TWO32);
    }
    return words;
  }

  /**
   * np.random.SeedSequence(entropy) with the default pool_size=4 and an
   * empty spawn_key.
   * @param {number} entropy  non-negative integer <= 2^53
   */
  function SeedSequence(entropy) {
    if (!(this instanceof SeedSequence)) return new SeedSequence(entropy);
    this.entropy = entropy;
    this.pool_size = DEFAULT_POOL_SIZE;
    var ent = entropyWords(entropy);
    var pool = new Array(DEFAULT_POOL_SIZE);
    var hc = [INIT_A];
    var i, s, d;
    for (i = 0; i < DEFAULT_POOL_SIZE; i++) {
      pool[i] = hashmix(i < ent.length ? ent[i] : 0, hc);
    }
    for (s = 0; s < DEFAULT_POOL_SIZE; s++) {
      for (d = 0; d < DEFAULT_POOL_SIZE; d++) {
        if (s !== d) pool[d] = mix(pool[d], hashmix(pool[s], hc));
      }
    }
    for (s = DEFAULT_POOL_SIZE; s < ent.length; s++) {
      for (d = 0; d < DEFAULT_POOL_SIZE; d++) {
        pool[d] = mix(pool[d], hashmix(ent[s], hc));
      }
    }
    this.pool = pool;
  }

  /** generate_state(n_words, np.uint32) -> Array of n uint32 */
  SeedSequence.prototype.generate_state = function (nWords) {
    var hc = INIT_B;
    var out = new Array(nWords), i, v;
    for (i = 0; i < nWords; i++) {
      v = this.pool[i % this.pool.length];
      v = (v ^ hc) >>> 0;
      hc = mul32(hc, MULT_B);
      v = mul32(v, hc);
      v = (v ^ (v >>> XSHIFT)) >>> 0;
      out[i] = v;
    }
    return out;
  };
  PF.SeedSequence = SeedSequence;

  // ------------------------------------------------------------------ PCG64

  // 0x2360ED051FC65DA44385DF649FCCF645 as little-endian 16-bit limbs
  var PCG_MULT = [0xF645, 0x9FCC, 0xDF64, 0x4385, 0x5DA4, 0x1FC6, 0xED05, 0x2360];

  // limbs <- (limbs * PCG_MULT + inc) mod 2^128
  function pcgStep(s, inc) {
    var carry = 0, acc, k, i;
    var out = [0, 0, 0, 0, 0, 0, 0, 0];
    for (k = 0; k < 8; k++) {
      acc = carry + inc[k];
      for (i = 0; i <= k; i++) acc += s[i] * PCG_MULT[k - i];
      out[k] = acc & 0xFFFF;                  // ToInt32 is exact modulo 2^32, so the low 16 bits survive
      carry = (acc - out[k]) / 65536;         // exact: acc is an integer < 2^37
    }
    // write back in place (s is read while out is being built, so no aliasing)
    s[0] = out[0]; s[1] = out[1]; s[2] = out[2]; s[3] = out[3];
    s[4] = out[4]; s[5] = out[5]; s[6] = out[6]; s[7] = out[7];
  }

  function limbsFromU32(hi, lo) {
    // one 64-bit value (hi, lo) -> four 16-bit limbs, little-endian
    return [lo & 0xFFFF, lo >>> 16, hi & 0xFFFF, hi >>> 16];
  }

  function limbsToHex(limbs) {
    var s = '', i, h;
    for (i = 7; i >= 0; i--) {
      h = limbs[i].toString(16);
      while (h.length < 4) h = '0' + h;
      s += h;
    }
    return s;
  }

  /**
   * np.random.PCG64(seed): seeded through SeedSequence(seed)
   * .generate_state(4, uint64) exactly as numpy does.
   * @param {number} seed  non-negative integer <= 2^53
   */
  function PCG64(seed) {
    if (!(this instanceof PCG64)) return new PCG64(seed);
    var ss = new SeedSequence(seed);
    var w = ss.generate_state(8);            // uint32 words; uint64 pairs are little-endian
    // generate_state(4, uint64) = [u0, u1, u2, u3] with u_i = (w[2i+1] << 32) | w[2i].
    // pcg64_set_seed: initstate = PCG_128BIT_CONSTANT(u0, u1) -- u0 is the HIGH
    // 64 bits -- and initseq = PCG_128BIT_CONSTANT(u2, u3). Limbs are little-
    // endian, so the low half (u1) comes first.
    var initstate = limbsFromU32(w[3], w[2]).concat(limbsFromU32(w[1], w[0]));
    var initseq = limbsFromU32(w[7], w[6]).concat(limbsFromU32(w[5], w[4]));
    // inc = (initseq << 1) | 1  (mod 2^128)
    var inc = [0, 0, 0, 0, 0, 0, 0, 0], i, c = 1, v;
    for (i = 0; i < 8; i++) {
      v = initseq[i] * 2 + c;
      inc[i] = v & 0xFFFF;
      c = v >>> 16;
    }
    var s = [0, 0, 0, 0, 0, 0, 0, 0];
    pcgStep(s, inc);
    // state += initstate (mod 2^128)
    c = 0;
    for (i = 0; i < 8; i++) {
      v = s[i] + initstate[i] + c;
      s[i] = v & 0xFFFF;
      c = v >>> 16;
    }
    pcgStep(s, inc);
    this._state = s;
    this._inc = inc;
    this.has_uint32 = 0;
    this.uinteger = 0;
    this._hi = 0;                            // last 64-bit output, high word
    this._lo = 0;                            // last 64-bit output, low word
  }

  /** pcg64_next64: step, then XSL-RR output. Leaves the word in _hi/_lo. */
  PCG64.prototype.next64 = function () {
    var s = this._state;
    pcgStep(s, this._inc);
    var lo0 = (s[0] | (s[1] << 16)) >>> 0, lo1 = (s[2] | (s[3] << 16)) >>> 0;   // low 64 as (lo1:lo0)
    var hi0 = (s[4] | (s[5] << 16)) >>> 0, hi1 = (s[6] | (s[7] << 16)) >>> 0;   // high 64 as (hi1:hi0)
    var xl = (lo0 ^ hi0) >>> 0, xh = (lo1 ^ hi1) >>> 0;                         // hi64 ^ lo64
    var rot = s[7] >>> 10;                                                        // state >> 122
    var rh, rl;
    if (rot === 0) { rh = xh; rl = xl; }
    else if (rot < 32) {
      rl = ((xl >>> rot) | (xh << (32 - rot))) >>> 0;
      rh = ((xh >>> rot) | (xl << (32 - rot))) >>> 0;
    } else if (rot === 32) { rh = xl; rl = xh; }
    else {
      rot -= 32;
      rl = ((xh >>> rot) | (xl << (32 - rot))) >>> 0;
      rh = ((xl >>> rot) | (xh << (32 - rot))) >>> 0;
    }
    this._hi = rh; this._lo = rl;
    return rl;
  };

  /** next_uint32 with numpy's has_uint32 / uinteger carry */
  PCG64.prototype.next32 = function () {
    if (this.has_uint32) {
      this.has_uint32 = 0;
      return this.uinteger;
    }
    var lo = this.next64();
    this.has_uint32 = 1;
    this.uinteger = this._hi;
    return lo;
  };

  /** random_raw(n): n 64-bit words as 16-hex-digit strings (for testing) */
  PCG64.prototype.random_raw_hex = function (n) {
    var out = new Array(n), i, h, l;
    for (i = 0; i < n; i++) {
      this.next64();
      h = this._hi.toString(16); while (h.length < 8) h = '0' + h;
      l = this._lo.toString(16); while (l.length < 8) l = '0' + l;
      out[i] = h + l;
    }
    return out;
  };

  /** .state, hex-encoded: {state, inc, has_uint32, uinteger} */
  PCG64.prototype.state_hex = function () {
    return {
      state: limbsToHex(this._state), inc: limbsToHex(this._inc),
      has_uint32: this.has_uint32, uinteger: this.uinteger
    };
  };
  PF.PCG64 = PCG64;

  // --------------------------------------------------------------- Generator

  // x * y for two uint32 as an exact 64-bit (hi, lo) pair, via 16-bit halves.
  var mHi = 0, mLo = 0;
  function mul32x32(x, y) {
    var yh = y >>> 16, yl = y & 0xFFFF;
    var p0 = x * yl;                          // < 2^48, exact
    var p1 = x * yh;                          // < 2^48, exact
    var q_lo = p1 % 65536, q_hi = (p1 - q_lo) / 65536;
    var p0lo = p0 % TWO32, p0hi = (p0 - p0lo) / TWO32;
    var sum = p0lo + q_lo * 65536;            // < 2^33, exact
    mLo = sum % TWO32;
    mHi = p0hi + q_hi + (sum - mLo) / TWO32;
  }

  // random_bounded_uint64(bitgen, 0, rng, 0, use_masked=False), rng < 2^32
  function bounded(bg, rng) {
    if (rng === 0) return 0;
    if (rng === MASK32) return bg.next32();
    var rngExcl = rng + 1;
    mul32x32(bg.next32(), rngExcl);
    var leftover = mLo, hi = mHi;
    if (leftover < rngExcl) {
      var threshold = (MASK32 - rng) % rngExcl;
      while (leftover < threshold) {
        mul32x32(bg.next32(), rngExcl);
        leftover = mLo; hi = mHi;
      }
    }
    return hi;
  }

  // Generator._shuffle_int(n, first, data): Fisher-Yates from the top,
  // stopping at `first`.
  function shuffleInt(bg, data, n, first) {
    var i, j, t;
    for (i = n - 1; i >= first; i--) {
      j = bounded(bg, i);
      t = data[j]; data[j] = data[i]; data[i] = t;
    }
  }

  // _gen_mask: smallest 2^k - 1 >= v  (v < 2^32 here)
  function genMask(v) {
    var m = v >>> 0;
    m |= m >>> 1; m |= m >>> 2; m |= m >>> 4; m |= m >>> 8; m |= m >>> 16;
    return m >>> 0;
  }

  function Generator(bitgen) {
    if (!(this instanceof Generator)) return new Generator(bitgen);
    if (!(bitgen instanceof PCG64)) err('Generator needs a PF.PCG64');
    this.bit_generator = bitgen;
  }

  /**
   * Generator.choice(a, size, replace=False, p=None, axis=0, shuffle=True)
   * for an integer population, WITHOUT replacement (the only form
   * pixelfixer uses; replace=True and p= throw).
   *
   * @param {number} pop     population size (a = arange(pop))
   * @param {number} size    number of indices to draw, <= pop
   * @param {object} [opts]  {replace: false (required), shuffle: true}
   * @returns {Int32Array}   indices in numpy's order (order matters: the
   *                         sample feeds k-means++ seeding by position)
   */
  Generator.prototype.choice = function (pop, size, opts) {
    opts = opts || {};
    if (opts.replace !== false) err('choice: only replace=False is ported (pass {replace: false})');
    if (opts.p !== undefined && opts.p !== null) err('choice: p= is not ported');
    var shuffle = (opts.shuffle === undefined || opts.shuffle === null) ? true : !!opts.shuffle;
    if (typeof pop !== 'number' || pop !== Math.floor(pop)) err('choice: a must be an integer population');
    if (typeof size !== 'number' || size !== Math.floor(size) || size < 0) err('choice: size must be a non-negative integer');
    if (pop >= 2147483648) err('choice: population >= 2^31 is beyond the Int32 index range');
    if (size > pop) err('Cannot take a larger sample than population when replace is False');
    if (pop <= 0 && size > 0) err('a must be greater than 0 unless no samples are taken');
    var bg = this.bit_generator;
    var cutoff = shuffle ? 50 : 20;
    var i, j, idx;
    if (pop > 10000 && size > Math.floor(pop / cutoff)) {
      // Tail shuffle size elements
      idx = new Int32Array(pop);
      for (i = 0; i < pop; i++) idx[i] = i;
      shuffleInt(bg, idx, pop, Math.max(pop - size, 1));
      return idx.slice(pop - size);
    }
    // Floyd's algorithm
    var out = new Int32Array(size);
    if (size === 0) return out;
    var setSize = Math.floor(1.2 * size);     // <uint64_t>(1.2 * size_i)
    var mask = genMask(setSize);
    setSize = mask + 1;
    var hashSet = new Int32Array(setSize);
    hashSet.fill(-1);
    var val, loc;
    for (j = pop - size; j < pop; j++) {
      val = bounded(bg, j);
      loc = (val & mask) >>> 0;
      while (hashSet[loc] !== -1 && hashSet[loc] !== val) loc = ((loc + 1) & mask) >>> 0;
      if (hashSet[loc] === -1) {              // val not in hash_set
        hashSet[loc] = val;
        out[j - pop + size] = val;
      } else {                                // we need to insert j instead
        loc = (j & mask) >>> 0;
        while (hashSet[loc] !== -1) loc = ((loc + 1) & mask) >>> 0;
        hashSet[loc] = j;
        out[j - pop + size] = j;
      }
    }
    if (shuffle) shuffleInt(bg, out, size, 1);
    return out;
  };
  PF.Generator = Generator;

  /** np.random.default_rng(seed) -> Generator(PCG64(seed)) */
  PF.default_rng = function (seed) {
    if (seed === undefined || seed === null) err('default_rng: an explicit integer seed is required (OS entropy is not reproducible)');
    return new Generator(new PCG64(seed));
  };

  PF.versionNpRandom = 'pf-04-nprandom/1';
})();
