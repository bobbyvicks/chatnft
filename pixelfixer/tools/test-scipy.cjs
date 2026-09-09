/* Node parity test for src/pf-02-scipy.js against fixtures/scipy-parity.json.
 *
 * Comparison is BIT-EXACT: both sides are reduced to the hex of their raw
 * little-endian float64 bytes, so a 1-ulp drift is a failure, not a rounding
 * footnote.  Where a case fails, the max absolute and max ulp difference are
 * reported so the size of the miss is visible instead of just its existence.
 *
 * The gate has three parts, and all three must hold for exit 0:
 *   1. every PRODUCTION tally is exact on every case;
 *   2. every CONTROL tally (a deliberately wrong alternative) FAILS on at
 *      least one case -- a control that passes means the instrument cannot
 *      tell right from wrong on this population;
 *   3. positive preconditions: the tie-ambiguity class and every emulated
 *      argsort path were actually exercised, so an exact tally is not vacuous.
 *
 *   node tools/test-scipy.js
 *   PF02_SRC=<path> node tools/test-scipy.js     # test a mutant copy instead
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SRC = process.env.PF02_SRC || path.join(ROOT, 'src', 'pf-02-scipy.js');
const FIX = path.join(ROOT, 'fixtures', 'scipy-parity.json');

// load the IIFE exactly as a browser <script> would
(0, eval)(fs.readFileSync(SRC, 'utf8'));
const PF = globalThis.PF;
const IN = PF._scipyInternals;

const data = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const meta = data.meta;
console.log('source under test: %s', SRC);
console.log('fixtures: numpy %s / scipy %s / python %s', meta.numpy, meta.scipy, meta.python);
console.log('  numpy cpu dispatch targets %j, baseline %j (cpu has AVX2=%s, AVX512_SKX=%s)',
    meta.cpu_dispatch, meta.cpu_baseline, meta.cpu_has_avx2, meta.cpu_has_avx512_skx);
console.log('  np.argsort fingerprint ties_two: default %j, with X86_V3 disabled %j',
    meta.ties_two_default, meta.ties_two_x86v3_disabled);
console.log('  all-equal n=40 comes back as identity: default %s, with X86_V3 disabled %s',
    meta.const40_identity_default, meta.const40_identity_x86v3_disabled);
console.log('%d cases\n', data.cases.length);

// ------------------------------------------------------------------ helpers
function unhex(hex) {
    const buf = Buffer.from(hex, 'hex');
    const out = new Float64Array(buf.length / 8);
    for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8);
    return out;
}
const u64 = new BigUint64Array(1);
const f64 = new Float64Array(u64.buffer);
function ulpOf(x) { f64[0] = x; let b = u64[0]; return (b & 0x8000000000000000n) ? (0x8000000000000000n - (b & 0x7fffffffffffffffn)) : b; }
function ulpDiff(a, b) { const d = ulpOf(a) - ulpOf(b); return d < 0n ? -d : d; }

function compareF64(got, want) {
    if (got.length !== want.length) {
        return { ok: false, maxAbs: Infinity, maxUlp: -1n, firstIdx: -1, lenMismatch: true };
    }
    let maxAbs = 0, maxUlp = 0n, firstIdx = -1;
    for (let i = 0; i < want.length; i++) {
        if (Object.is(got[i], want[i])) continue;
        if (firstIdx < 0) firstIdx = i;
        const d = Math.abs(got[i] - want[i]);
        if (d > maxAbs) maxAbs = d;
        const u = ulpDiff(got[i], want[i]);
        if (u > maxUlp) maxUlp = u;
    }
    return { ok: firstIdx < 0, maxAbs, maxUlp, firstIdx };
}

function eqInt(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

class Tally {
    constructor(name, role) {
        this.name = name; this.role = role;   // 'production' | 'control' | 'info'
        this.n = 0; this.bad = 0; this.maxAbs = 0; this.maxUlp = 0n; this.examples = [];
    }
    add(ok, res, caseName) {
        this.n++;
        if (!ok) {
            this.bad++;
            if (res) {
                if (res.maxAbs > this.maxAbs) this.maxAbs = res.maxAbs;
                if (res.maxUlp > this.maxUlp) this.maxUlp = res.maxUlp;
            }
            if (this.examples.length < 5) this.examples.push(caseName);
        }
    }
    report() {
        const pass = this.n - this.bad;
        let flag;
        if (this.role === 'control') {
            flag = this.bad > 0 ? 'control FAILS as required' : 'CONTROL PASSED -- instrument cannot tell';
        } else if (this.role === 'info') {
            flag = this.bad === 0 ? 'exact' : 'differs';
        } else {
            flag = this.bad === 0 ? 'BIT-EXACT' : 'MISMATCH';
        }
        let line = `  ${this.name.padEnd(46)} ${String(pass).padStart(5)}/${String(this.n).padEnd(5)} ${flag}`;
        if (this.bad && this.maxAbs > 0) {
            line += `   max|diff|=${this.maxAbs.toExponential(3)}  max ulp=${this.maxUlp}`;
        }
        if (this.bad && this.role !== 'control') {
            line += `\n      e.g. ${this.examples.join(' | ')}`;
        }
        console.log(line);
    }
}

const tallies = {};
function T(name, role) {
    if (!tallies[name]) tallies[name] = new Tally(name, role || 'production');
    return tallies[name];
}
function P(name) { return T(name, 'production'); }
function C(name) { return T(name, 'control'); }

// find_peaks forensics
let fpTotal = 0, fpBad = 0;
const fpBadCases = [];
let fpTieAmbiguous = 0;        // equal priorities sit within `distance`
let fpTieDecisive = 0;         // ...and a different tie rule would change the answer
let fpTieAmbiguousReal = 0;
const fpTags = {};

// ----------------------------------------------------------------- run cases
for (const c of data.cases) {
    switch (c.fn) {

        case 'gaussian_filter1d': {
            const x = unhex(c.input_hex);
            const want = unhex(c.expected_hex);
            const got = PF.gaussian_filter1d(x, c.sigma);
            P('gaussian_filter1d').add(compareF64(got, want).ok, compareF64(got, want), c.name);
            for (const accum of ['fold_in_out', 'flat']) {
                const g2 = PF.gaussian_filter1d(x, c.sigma, { accum });
                const r2 = compareF64(g2, want);
                C('gaussian_filter1d [accum=' + accum + ', control]').add(r2.ok, r2, c.name);
            }
            break;
        }

        case 'maximum_filter1d': {
            const got = PF.maximum_filter1d(unhex(c.input_hex), c.size);
            const r = compareF64(got, unhex(c.expected_hex));
            P('maximum_filter1d').add(r.ok, r, c.name);
            break;
        }

        case 'median_filter': {
            const got = PF.median_filter(unhex(c.input_hex), c.size, { mode: c.mode });
            const r = compareF64(got, unhex(c.expected_hex));
            P('median_filter').add(r.ok, r, c.name);
            break;
        }

        case 'argsort': {
            // np.argsort with the dispatched kernel (what find_peaks sees)
            const v = unhex(c.input_hex);
            const want = Int32Array.from(c.order);
            const gotX = IN.argsortXssAvx2(v);
            P('argsort [x86-simd-sort AVX2 emulation]').add(eqInt(gotX, want), null, c.name);
            const gotP = IN.argsortPortableIntrosort(v);
            C('argsort [portable introsort, control]').add(eqInt(gotP, want), null, c.name);
            for (const [label, got] of [['emulation', gotX], ['portable', gotP]]) {
                let sameValues = got.length === want.length;
                for (let i = 0; sameValues && i < got.length; i++) {
                    if (!(v[got[i]] === v[want[i]])) sameValues = false;
                }
                T('argsort [' + label + ': sorted VALUE order]', 'info').add(sameValues, null, c.name);
            }
            if (c.order_stable !== undefined) {
                T('argsort [np kind=stable == default]', 'info')
                    .add(eqInt(want, Int32Array.from(c.order_stable)), null, c.name);
            }
            break;
        }

        case 'argsort_nodispatch': {
            // np.argsort with NPY_DISABLE_CPU_FEATURES=X86_V3: numpy's portable path
            const v = unhex(c.input_hex);
            const want = Int32Array.from(c.order);
            P('argsort_nodispatch [portable introsort == numpy w/o dispatch]')
                .add(eqInt(IN.argsortPortableIntrosort(v), want), null, c.name);
            C('argsort_nodispatch [AVX2 emulation vs numpy w/o dispatch, control]')
                .add(eqInt(IN.argsortXssAvx2(v), want), null, c.name);
            break;
        }

        case 'find_peaks': {
            fpTotal++;
            const x = unhex(c.input_hex);
            const opts = {};
            if (c.height !== undefined) opts.height = c.height;
            if (c.distance !== undefined) opts.distance = c.distance;
            const res = PF.find_peaks(x, opts);
            const wantPeaks = Int32Array.from(c.peaks);
            const ok = eqInt(res.peaks, wantPeaks);
            let hOk = true;
            if (c.peak_heights_hex !== undefined) {
                hOk = compareF64(res.properties.peak_heights, unhex(c.peak_heights_hex)).ok;
            } else {
                hOk = res.properties.peak_heights === undefined;
            }
            P('find_peaks [peaks]').add(ok, null, c.name);
            P('find_peaks [peak_heights]').add(hOk, null, c.name);
            P(c.real ? 'find_peaks [peaks: real-image profiles]'
                     : 'find_peaks [peaks: synthetic]').add(ok, null, c.name);
            if (c.tag) {
                P('find_peaks [peaks: ' + c.tag + ']').add(ok, null, c.name);
                fpTags[c.tag] = (fpTags[c.tag] || 0) + 1;
            }

            let ambiguous = false, decisive = false;
            if (c.kept_peaks !== undefined) {
                // _local_maxima_1d + the height filter, in isolation from the sort
                const lm0 = IN.localMaxima1d(x);
                const mine = [];
                for (let i = 0; i < lm0.count; i++) {
                    const p = lm0.midpoints[i];
                    if (c.height === undefined || c.height <= x[p]) mine.push(p);
                }
                P('find_peaks [maxima+height, sort excluded]')
                    .add(eqInt(Int32Array.from(mine), Int32Array.from(c.kept_peaks)), null, c.name);

                // drive the distance filter with numpy's OWN permutation:
                // proves every line other than the sort, in isolation
                const kept = Int32Array.from(c.kept_peaks);
                const prio = new Float64Array(kept.length);
                for (let i = 0; i < kept.length; i++) prio[i] = x[kept[i]];
                const run = (ord) => {
                    const keep = IN.selectByPeakDistance(kept, prio, c.distance, ord);
                    const out = [];
                    for (let i = 0; i < kept.length; i++) if (keep[i]) out.push(kept[i]);
                    return Int32Array.from(out);
                };
                P('find_peaks [distance filter given numpy\'s own argsort]')
                    .add(eqInt(run(Int32Array.from(c.argsort_order)), wantPeaks), null, c.name);
                // and the emulated argsort must reproduce that permutation itself
                P('find_peaks [argsort of the surviving priorities]')
                    .add(eqInt(IN.argsortXssAvx2(prio), Int32Array.from(c.argsort_order)), null, c.name);

                // alternative tie rules, as controls
                const idx = Array.from(kept.keys());
                const stableAsc = Int32Array.from(idx.slice().sort((a, b) => (prio[a] - prio[b]) || (a - b)));
                const stableDesc = Int32Array.from(idx.slice().sort((a, b) => (prio[a] - prio[b]) || (b - a)));
                const okAsc = eqInt(run(stableAsc), wantPeaks);
                const okDesc = eqInt(run(stableDesc), wantPeaks);
                C('find_peaks [tie rule: stable ascending, control]').add(okAsc, null, c.name);
                C('find_peaks [tie rule: stable descending, control]').add(okDesc, null, c.name);
                C('find_peaks [tie rule: portable introsort, control]')
                    .add(eqInt(run(IN.argsortPortableIntrosort(prio)), wantPeaks), null, c.name);

                // is this case even capable of being ambiguous?  exactly when two
                // surviving peaks with EQUAL height sit closer than `distance`
                const d = Math.ceil(c.distance);
                for (let i = 0; i < kept.length && !ambiguous; i++) {
                    for (let j = i + 1; j < kept.length; j++) {
                        if (kept[j] - kept[i] >= d) break;
                        if (x[kept[i]] === x[kept[j]]) { ambiguous = true; break; }
                    }
                }
                decisive = ambiguous && (!okAsc || !okDesc);
                if (ambiguous) { fpTieAmbiguous++; if (c.real) fpTieAmbiguousReal++; }
                if (decisive) fpTieDecisive++;
            }
            if (!ok || !hOk) {
                fpBad++;
                fpBadCases.push(c.name + (ambiguous ? ' [TIE-AMBIGUOUS]' : ' [NO TIES]'));
            }
            break;
        }

        default:
            throw new Error('unknown fixture fn: ' + c.fn);
    }
}

// ------------------------------------------------- browser-context contract
// The file is going to be pasted into a single self-contained index.html, so
// prove it runs with no module system at all: a bare context with no require,
// no module, no process, no Buffer.
console.log('--- browser-context contract ---');
let browserOk = false;
{
    const vm = require('vm');
    const ctx = vm.createContext(Object.create(null));
    vm.runInContext('var globalThis = this;', ctx);
    vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
    const probe = vm.runInContext(
        'var r = PF.find_peaks(PF.gaussian_filter1d([0,1,0,2,0,1,0], 0.6), ' +
        '{height: 0.1, distance: 2}); [typeof PF, Array.from(r.peaks).join(",")]',
        ctx);
    const noNode = vm.runInContext(
        '[typeof require, typeof module, typeof process, typeof Buffer].join(",")',
        ctx);
    browserOk = probe[0] === 'object' && probe[1] === '1,3,5' &&
        noNode === 'undefined,undefined,undefined,undefined';
    console.log('  loaded in a bare context: PF is %s, peaks=[%s]', probe[0], probe[1]);
    console.log('  node globals visible in that context: %s  -> %s\n', noNode, browserOk ? 'ok' : 'FAIL');
}

// ---------------------------------------------------------- refusal contract
console.log('--- loud-refusal contract (unported scipy arguments) ---');
const refusals = [
    ['find_peaks prominence', () => PF.find_peaks(new Float64Array(9), { prominence: 1 })],
    ['find_peaks width', () => PF.find_peaks(new Float64Array(9), { width: 3 })],
    ['find_peaks threshold', () => PF.find_peaks(new Float64Array(9), { threshold: 0.1 })],
    ['find_peaks wlen', () => PF.find_peaks(new Float64Array(9), { wlen: 5 })],
    ['find_peaks rel_height', () => PF.find_peaks(new Float64Array(9), { rel_height: 0.5 })],
    ['find_peaks plateau_size', () => PF.find_peaks(new Float64Array(9), { plateau_size: 2 })],
    ['find_peaks typo option', () => PF.find_peaks(new Float64Array(9), { hieght: 1 })],
    ['find_peaks height tuple', () => PF.find_peaks(new Float64Array(9), { height: [1, 2] })],
    ['find_peaks distance<1', () => PF.find_peaks(new Float64Array(9), { distance: 0.5 })],
    // A NaN in the SIGNAL never becomes a peak (every comparison against it is
    // false, in scipy and here alike), so find_peaks must NOT throw on it; the
    // unported paths are a NaN or infinite PRIORITY reaching the argsort.
    ['argsort NaN priority', () => IN.argsortXssAvx2(new Float64Array([1, NaN, 0]))],
    ['argsort +inf priority', () => IN.argsortXssAvx2(new Float64Array([1, Infinity, 0]))],
    ['gaussian mode=nearest', () => PF.gaussian_filter1d(new Float64Array(9), 0.6, { mode: 'nearest' })],
    ['gaussian order=1', () => PF.gaussian_filter1d(new Float64Array(9), 0.6, { order: 1 })],
    ['maximum mode=nearest', () => PF.maximum_filter1d(new Float64Array(9), 3, { mode: 'nearest' })],
    ['maximum origin=1', () => PF.maximum_filter1d(new Float64Array(9), 3, { origin: 1 })],
    ['median no mode given', () => PF.median_filter(new Float64Array(9), 5)],
    ['median mode=reflect', () => PF.median_filter(new Float64Array(9), 5, { mode: 'reflect' })],
    ['median even size', () => PF.median_filter(new Float64Array(9), 4, { mode: 'nearest' })],
];
let refusalsOk = 0;
for (const [label, fn] of refusals) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (threw) refusalsOk++;
    else console.log('  NOT REFUSED: ' + label);
}
console.log('  %d/%d unported arguments refused loudly', refusalsOk, refusals.length);
try { PF.find_peaks(new Float64Array(9), { distance: 0 }); }
catch (e) { console.log('  distance=0 message: %s\n', e.message); }

// ------------------------------------------------------------------- report
console.log('--- tallies (every float comparison is on raw float64 bytes) ---');
const names = Object.keys(tallies);
const order = ['production', 'control', 'info'];
names.sort((a, b) => (order.indexOf(tallies[a].role) - order.indexOf(tallies[b].role)) || a.localeCompare(b));
for (const k of names) tallies[k].report();

console.log('\n--- find_peaks tie forensics ---');
console.log('  find_peaks cases                              : %d', fpTotal);
console.log('  tagged populations                            : %j', fpTags);
console.log('  cases where equal heights sit within distance : %d  (%d of them from real images)', fpTieAmbiguous, fpTieAmbiguousReal);
console.log('  ...where a different tie rule changes the peaks: %d', fpTieDecisive);
console.log('  mismatched cases                              : %d', fpBad);
if (fpBadCases.length) console.log('  first mismatches: %s', fpBadCases.slice(0, 8).join(' | '));

const st = IN.argsortXssStats;
console.log('\n--- argsort emulation: paths exercised by this run ---');
console.log('  is_sorted early exits      : %d', st.earlyExits);
console.log('  bitonic network calls      : %d  by numVecs %j', st.networkCalls, st.networkByNumVecs);
console.log('  AVX2 partitions (n > 256)  : %d', st.partitions);
console.log('  std::sort fallbacks        : %d  (largest range %d)', st.stdSortCalls, st.stdSortMaxRange);
console.log('  std::sort quick partitions : %d', st.stdPartitions);
console.log('  std::sort heapsort branch  : %d  %s', st.heapSorts,
    st.heapSorts === 0 ? '<-- NOT exercised: that transcription is unverified' : '');

// ------------------------------------------------------------------- gate
const failures = [];
for (const k of names) {
    const t = tallies[k];
    if (t.role === 'production' && t.bad !== 0) failures.push('production tally not exact: ' + k);
    if (t.role === 'control' && t.bad === 0) failures.push('control never failed: ' + k);
}
if (!browserOk) failures.push('browser-context contract');
if (refusalsOk !== refusals.length) failures.push('refusal contract');
// positive preconditions -- an exact tally on an unexercised path is vacuous
if (fpTieAmbiguous < 100) failures.push('precondition: fewer than 100 tie-ambiguous find_peaks cases (' + fpTieAmbiguous + ')');
if (fpTieDecisive < 50) failures.push('precondition: fewer than 50 cases where the tie rule decides the answer (' + fpTieDecisive + ')');
for (const nv of [1, 2, 4, 8, 16, 32, 64]) {
    if (!st.networkByNumVecs[nv]) failures.push('precondition: bitonic network with numVecs=' + nv + ' never ran');
}
if (st.partitions < 10) failures.push('precondition: AVX2 partition path ran ' + st.partitions + ' times');
if (st.stdSortCalls < 10) failures.push('precondition: std::sort fallback ran ' + st.stdSortCalls + ' times');
if (st.earlyExits < 1) failures.push('precondition: is_sorted early exit never ran');

console.log('\n--- verdict ---');
if (failures.length === 0) {
    console.log('  PASS: every production tally bit-exact, every control failed, every path exercised');
    console.log('  (heapsort branch of the std::sort fallback: %s)',
        st.heapSorts ? 'exercised ' + st.heapSorts + 'x' : 'not reached by any fixture; unverified');
} else {
    for (const f of failures) console.log('  GATE FAILED: ' + f);
}
process.exit(failures.length === 0 ? 0 : 1);
