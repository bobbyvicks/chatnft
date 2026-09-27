/* pyRound4 (test-oracle-full.cjs) against Python round(x, 4), bit for bit,
   on tools/oracle/check-round4.json. Then the one-token mutant (drop the tie
   rule, i.e. plain toFixed) must fail. */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'test-oracle-full.cjs'), 'utf8');
const body = src.slice(src.indexOf('function pyRound4'), src.indexOf('/* ------------------------------------------------------------ the worker'));
const hex = h => { const m = /^(-?)0x([01])\.([0-9a-f]+)p([+-]\d+)$/.exec(h); let v = parseInt(m[2]) + parseInt(m[3], 16) / Math.pow(16, m[3].length); return (m[1] ? -1 : 1) * v * Math.pow(2, +m[4]); };
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'check-round4.json'), 'utf8')).map(([a, b]) => [hex(a), hex(b)]);
let bad = 0;
for (const [label, code] of [['pyRound4', body], ['mutant: toFixed only', 'function pyRound4(x) { return Number(x.toFixed(4)); }']]) {
  const f = new Function(code + '; return pyRound4;')();
  let miss = 0, ex = null;
  for (const [x, want] of data) if (!Object.is(f(x), want)) { miss++; ex = ex || [x, f(x), want]; }
  const ok = label === 'pyRound4' ? miss === 0 : miss > 0;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label.padEnd(22) + miss + ' of ' + data.length + ' differ from Python' + (ex ? '  e.g. ' + ex.join(' -> ') : ''));
}
process.exit(bad ? 1 : 0);
